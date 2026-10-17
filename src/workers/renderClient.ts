import { assessQuality, renderFrame } from '@/core/renderer';
import { getSpecimen } from '@/data/specimens';
import type { MicroscopeState } from '@/core/types';
import type { RenderRequest, RenderResponse, RenderResult } from './protocol';
import RenderWorker from './render.worker.ts?worker&inline';

/**
 * Off-main-thread rendering. Two channels:
 *  - `live`: latest-request-wins; intermediate states while a slider is
 *    dragged are dropped so the view never lags behind the controls.
 *  - `render`: every request is served (captures, frame reloads).
 * Falls back to the main thread where workers are unavailable.
 */
type Pending = { resolve: (r: RenderResult) => void; reject: (e: Error) => void };

class RenderClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private liveBusy = false;
  private liveQueued: { state: MicroscopeState; scale: number; seed: number; cb: (r: RenderResult) => void } | null = null;

  private ensure(): Worker | null {
    if (this.worker || typeof Worker === 'undefined') return this.worker;
    try {
      this.worker = new RenderWorker();
      this.worker.onmessage = (ev: MessageEvent<RenderResponse>) => {
        const res = ev.data;
        const p = this.pending.get(res.id);
        if (!p) return;
        this.pending.delete(res.id);
        if (res.ok) p.resolve({ width: res.width, height: res.height, rgba: new Uint8ClampedArray(res.buffer), quality: res.quality });
        else p.reject(new Error(res.error));
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  render(state: MicroscopeState, scale: number, noiseSeed: number): Promise<RenderResult> {
    const w = this.ensure();
    if (!w) {
      const sp = getSpecimen(state.specimenId);
      const f = renderFrame(state, sp, { scale, noiseSeed });
      return Promise.resolve({ width: f.width, height: f.height, rgba: f.rgba, quality: assessQuality(f, state, sp) });
    }
    const id = this.nextId++;
    const req: RenderRequest = { id, state, scale, noiseSeed };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage(req);
    });
  }

  live(state: MicroscopeState, scale: number, seed: number, cb: (r: RenderResult) => void): void {
    if (this.liveBusy) {
      this.liveQueued = { state, scale, seed, cb };
      return;
    }
    this.liveBusy = true;
    this.render(state, scale, seed)
      .then(cb)
      .catch(() => undefined)
      .finally(() => {
        this.liveBusy = false;
        const q = this.liveQueued;
        this.liveQueued = null;
        if (q) this.live(q.state, q.scale, q.seed, q.cb);
      });
  }
}

export const renderClient = new RenderClient();

/** Draw an RGBA result into a canvas, resizing it to the image. */
export function paint(canvas: HTMLCanvasElement, r: { width: number; height: number; rgba: Uint8ClampedArray }): void {
  if (canvas.width !== r.width) canvas.width = r.width;
  if (canvas.height !== r.height) canvas.height = r.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), r.width, r.height), 0, 0);
}

/// <reference lib="webworker" />
import { assessQuality, renderFrame } from '@/core/renderer';
import { getSpecimen } from '@/data/specimens';
import type { RenderRequest, RenderResponse } from './protocol';

self.onmessage = (ev: MessageEvent<RenderRequest>) => {
  const req = ev.data;
  try {
    const sp = getSpecimen(req.state.specimenId);
    const frame = renderFrame(req.state, sp, { scale: req.scale, noiseSeed: req.noiseSeed });
    const quality = assessQuality(frame, req.state, sp);
    const res: RenderResponse = { id: req.id, ok: true, width: frame.width, height: frame.height, buffer: frame.rgba.buffer as ArrayBuffer, quality };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [res.buffer]);
  } catch (e) {
    const res: RenderResponse = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(res);
  }
};

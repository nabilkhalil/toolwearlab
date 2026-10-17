import { useEffect, useState } from 'react';
import { lumaFromRgba } from '@/core/imaging';
import type { CapturedFrame } from '@/core/types';
import { paint, renderClient } from '@/workers/renderClient';

/**
 * Pixels of a captured frame. Simulated frames are regenerated at full
 * sensor resolution from their stored acquisition state (deterministic),
 * imported frames are decoded from their data URL. Cached per frame id.
 */
export interface FrameImage {
  canvas: HTMLCanvasElement;
  grey: Float32Array;
  width: number;
  height: number;
}

const cache = new Map<string, Promise<FrameImage>>();

function loadImported(frame: CapturedFrame): Promise<FrameImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      resolve({ canvas, grey: lumaFromRgba(data, canvas.width, canvas.height), width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error('Could not decode the imported image.'));
    img.src = frame.importedDataUrl ?? '';
  });
}

async function loadSimulated(frame: CapturedFrame): Promise<FrameImage> {
  const r = await renderClient.render(frame.microscope, 1, frame.noiseSeed);
  const canvas = document.createElement('canvas');
  paint(canvas, r);
  return { canvas, grey: lumaFromRgba(r.rgba, r.width, r.height), width: r.width, height: r.height };
}

export function getFrameImage(frame: CapturedFrame): Promise<FrameImage> {
  let p = cache.get(frame.id);
  if (!p) {
    p = frame.source === 'imported' ? loadImported(frame) : loadSimulated(frame);
    cache.set(frame.id, p);
    p.catch(() => cache.delete(frame.id));
  }
  return p;
}

export function useFrameImage(frame: CapturedFrame | null): { image: FrameImage | null; error: string | null } {
  const [state, setState] = useState<{ id: string | null; image: FrameImage | null; error: string | null }>({ id: null, image: null, error: null });
  useEffect(() => {
    if (!frame) return;
    let alive = true;
    getFrameImage(frame)
      .then((image) => alive && setState({ id: frame.id, image, error: null }))
      .catch((e: Error) => alive && setState({ id: frame.id, image: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [frame]);
  if (!frame || state.id !== frame.id) return { image: null, error: null };
  return { image: state.image, error: state.error };
}

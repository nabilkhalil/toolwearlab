import { describe, expect, it } from 'vitest';
import { distance } from './geometry';
import { MAX_DIGITAL_ZOOM, fitToViewport, imageToScreen, screenToImage, zoomAt, type ViewTransform } from './viewTransform';

describe('digital zoom preserves original image coordinates', () => {
  const v0: ViewTransform = { scale: 0.5, offsetX: 20, offsetY: -10 };

  it('screen ↔ image round trip', () => {
    const p = { x: 812.25, y: 409.75 };
    const s = imageToScreen(p, v0);
    const back = screenToImage(s, v0);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('keeps the image point under the cursor fixed while zooming', () => {
    const anchor = { x: 300, y: 220 };
    const before = screenToImage(anchor, v0);
    let v = v0;
    for (const f of [2, 1.5, 3, 0.25]) {
      v = zoomAt(v, anchor, f);
      const after = screenToImage(anchor, v);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('a measurement stored in image px is invariant to any zoom/pan sequence', () => {
    const a = { x: 100.5, y: 200.5 };
    const b = { x: 900.5, y: 260.5 };
    const dImage = distance(a, b);
    let v = v0;
    for (const f of [4, 0.3, 8]) {
      v = zoomAt(v, { x: 123, y: 456 }, f);
      // Points round-trip through the screen frame without change.
      const a2 = screenToImage(imageToScreen(a, v), v);
      const b2 = screenToImage(imageToScreen(b, v), v);
      expect(distance(a2, b2)).toBeCloseTo(dImage, 9);
      // On screen the apparent length scales with digital zoom only.
      expect(distance(imageToScreen(a, v), imageToScreen(b, v))).toBeCloseTo(dImage * v.scale, 6);
    }
  });

  it('clamps zoom and fits the image to a viewport', () => {
    const v = zoomAt({ scale: 10, offsetX: 0, offsetY: 0 }, { x: 0, y: 0 }, 100);
    expect(v.scale).toBe(MAX_DIGITAL_ZOOM);
    const fit = fitToViewport(1600, 1200, 800, 800);
    expect(fit.scale).toBeCloseTo(0.5, 9);
    expect(fit.offsetY).toBeCloseTo(100, 9);
  });
});

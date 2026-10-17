import { describe, expect, it } from 'vitest';
import { boxesForGauss, exposureStats, gaussianBlur, laplacianVariance } from './imaging';
import { findLineCentresAlongRow } from './lineDetection';

function stepImage(w: number, h: number): Float32Array {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = x < w / 2 ? 50 : 200;
  return a;
}

describe('image primitives', () => {
  it('box sizes approximate the requested Gaussian variance', () => {
    // Three-box approximation is only coarse for sigma < 2 px.
    for (const sigma of [2, 2.5, 7, 20]) {
      const boxes = boxesForGauss(sigma);
      const variance = boxes.reduce((s, b) => s + (b * b - 1) / 12, 0);
      expect(Math.sqrt(variance)).toBeGreaterThan(sigma * 0.85);
      expect(Math.sqrt(variance)).toBeLessThan(sigma * 1.15);
    }
  });

  it('blur conserves mean intensity and reduces sharpness', () => {
    const w = 64;
    const h = 48;
    const img = stepImage(w, h);
    const mean0 = img.reduce((s, v) => s + v, 0) / img.length;
    const sharp0 = laplacianVariance(img, w, h);
    gaussianBlur(img, w, h, 3);
    const mean1 = img.reduce((s, v) => s + v, 0) / img.length;
    expect(mean1).toBeCloseTo(mean0, 3);
    expect(laplacianVariance(img, w, h)).toBeLessThan(sharp0 / 10);
  });

  it('blur of a uniform field is a no-op', () => {
    const img = new Float32Array(32 * 32).fill(0.4);
    gaussianBlur(img, 32, 32, 5);
    for (const v of img) expect(v).toBeCloseTo(0.4, 6);
  });

  it('exposure statistics count clipped pixels', () => {
    const g = new Float32Array([0, 3, 100, 252, 255, 128, 128, 128, 128, 128]);
    const s = exposureStats(g);
    expect(s.saturatedFraction).toBeCloseTo(0.2, 12);
    expect(s.darkFraction).toBeCloseTo(0.2, 12);
  });

  it('locates synthetic dark lines with sub-pixel accuracy', () => {
    const w = 200;
    const h = 5;
    const g = new Float32Array(w * h).fill(200);
    // Two-pixel line centred at x = 50.0 and an asymmetric one centred near 120.3.
    for (let y = 0; y < h; y++) {
      g[y * w + 49] = 20;
      g[y * w + 50] = 20;
      g[y * w + 119] = 80;
      g[y * w + 120] = 20;
      g[y * w + 121] = 20;
    }
    const lines = findLineCentresAlongRow(g, w, h, 2, { dark: true, band: 1 });
    expect(lines).toHaveLength(2);
    expect(lines[0]!.x).toBeCloseTo(50, 6);
    expect(lines[1]!.x).toBeCloseTo(120.625, 6);
  });
});

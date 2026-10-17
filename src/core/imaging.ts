/**
 * Pure image-processing primitives (no DOM), used by the renderer and the
 * image-quality gate. All run in Node for unit testing.
 */

/** Box sizes whose successive application approximates a Gaussian of std. dev. sigma. */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const iarr = 1 / (r + r + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(last, Math.max(0, k))]!;
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * iarr;
      acc += src[row + Math.min(last, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
}

function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const iarr = 1 / (r + r + 1);
  const last = h - 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[Math.min(last, Math.max(0, k)) * w + x]!;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * iarr;
      acc += src[Math.min(last, y + r + 1) * w + x]! - src[Math.max(0, y - r) * w + x]!;
    }
  }
}

/**
 * In-place Gaussian blur approximation (three box passes per axis) with
 * clamp-to-edge boundary handling. O(n) regardless of sigma.
 */
export function gaussianBlur(channel: Float32Array, w: number, h: number, sigma: number): void {
  if (sigma < 0.35) return;
  const tmp = new Float32Array(channel.length);
  for (const size of boxesForGauss(sigma)) {
    const r = Math.floor((size - 1) / 2);
    if (r < 1) continue;
    boxBlurH(channel, tmp, w, h, r);
    boxBlurV(tmp, channel, w, h, r);
  }
}

/** Rec. 601 luma of an RGBA buffer. */
export function lumaFromRgba(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = 0.299 * rgba[j]! + 0.587 * rgba[j + 1]! + 0.114 * rgba[j + 2]!;
  }
  return out;
}

/** Variance of the 4-neighbour Laplacian: a standard focus (sharpness) measure. */
export function laplacianVariance(grey: Float32Array, w: number, h: number, step = 1): number {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const i = y * w + x;
      const l = grey[i - step]! + grey[i + step]! + grey[i - step * w]! + grey[i + step * w]! - 4 * grey[i]!;
      sum += l;
      sum2 += l * l;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

export interface ExposureStats {
  mean: number;
  saturatedFraction: number;
  darkFraction: number;
  histogram: Uint32Array;
}

export function exposureStats(grey: Float32Array): ExposureStats {
  const histogram = new Uint32Array(256);
  let sum = 0;
  let sat = 0;
  let dark = 0;
  for (let i = 0; i < grey.length; i++) {
    const v = grey[i]!;
    sum += v;
    if (v >= 250) sat++;
    if (v <= 5) dark++;
    histogram[Math.max(0, Math.min(255, Math.round(v)))]!++;
  }
  const n = Math.max(1, grey.length);
  return { mean: sum / n, saturatedFraction: sat / n, darkFraction: dark / n, histogram };
}

/** 2×2 binning: halves resolution and quarters the variance of uncorrelated sensor noise. */
export function bin2(grey: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const bw = Math.floor(w / 2);
  const bh = Math.floor(h / 2);
  const out = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = 2 * y * w + 2 * x;
      out[y * bw + x] = (grey[i]! + grey[i + 1]! + grey[i + w]! + grey[i + w + 1]!) / 4;
    }
  }
  return { data: out, w: bw, h: bh };
}

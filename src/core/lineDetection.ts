/**
 * Sub-pixel localisation of graduation lines along an image row.
 * Used for (1) the optional "snap to graduation" aid during calibration
 * and (2) automated validation of the calibration chain in unit tests.
 */
export interface LineCentre {
  x: number;
  depth: number;
}

/**
 * Finds dark (or bright) line centres along row `y`, averaging `band` rows
 * for noise reduction. Each centre is the intensity-weighted centroid of a
 * contiguous run of pixels beyond a threshold midway between the local
 * background and the extreme value.
 */
export function findLineCentresAlongRow(
  grey: Float32Array,
  w: number,
  h: number,
  y: number,
  opts: { dark: boolean; band?: number; x0?: number; x1?: number } = { dark: true },
): LineCentre[] {
  const band = opts.band ?? 3;
  const x0 = Math.max(0, Math.floor(opts.x0 ?? 0));
  const x1 = Math.min(w, Math.ceil(opts.x1 ?? w));
  const yc = Math.round(y);
  const prof = new Float32Array(x1 - x0);
  for (let x = x0; x < x1; x++) {
    let s = 0;
    let n = 0;
    for (let dy = -band; dy <= band; dy++) {
      const yy = yc + dy;
      if (yy < 0 || yy >= h) continue;
      s += grey[yy * w + x]!;
      n++;
    }
    prof[x - x0] = n ? s / n : 0;
  }
  // Signal: positive where a line is present.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of prof) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const bg = opts.dark ? hi : lo;
  const ext = opts.dark ? lo : hi;
  const thr = (bg + ext) / 2;
  const sig = (v: number): number => (opts.dark ? thr - v : v - thr);
  const out: LineCentre[] = [];
  let i = 0;
  while (i < prof.length) {
    if (sig(prof[i]!) > 0) {
      let sw = 0;
      let sx = 0;
      let peak = 0;
      while (i < prof.length && sig(prof[i]!) > 0) {
        const wgt = Math.abs(bg - prof[i]!);
        sw += wgt;
        sx += wgt * (x0 + i + 0.5);
        peak = Math.max(peak, wgt);
        i++;
      }
      if (sw > 0) out.push({ x: sx / sw, depth: peak });
    } else i++;
  }
  return out;
}

/** Nearest line centre to `xHint` within ±window px, or null. */
export function snapToLine(grey: Float32Array, w: number, h: number, xHint: number, y: number, dark: boolean, window = 12): number | null {
  const lines = findLineCentresAlongRow(grey, w, h, y, { dark, band: 2, x0: xHint - window, x1: xHint + window });
  if (!lines.length) return null;
  let best = lines[0]!;
  for (const l of lines) if (Math.abs(l.x - xHint) < Math.abs(best.x - xHint)) best = l;
  return best.x;
}

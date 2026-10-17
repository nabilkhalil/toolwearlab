import { valueNoise1, valueNoise2 } from './noise';
import { flankWearAt } from './wearProfile';
import type {
  IlluminationMode,
  InsertFlankGeometry,
  InsertRakeGeometry,
  SpecimenDef,
  StageMicrometerGeometry,
} from './types';

/**
 * Procedural reflectance model. Returns linear RGB reflectance (0..1) of the
 * specimen at a world point, as seen under the selected illumination.
 *
 * Qualitative optics encoded here (for teaching, not radiometry):
 *  - Coaxial bright-field returns specular light from surfaces normal to the
 *    axis: the flat, abraded flank wear land appears bright; sloped surfaces
 *    (crater walls, curved corner) appear darker.
 *  - Ring (oblique) light favours scattering surfaces: coatings and crater
 *    walls brighten, the polished wear land loses contrast.
 */
export type RGB = [number, number, number];

const COATING_RGB: Record<InsertFlankGeometry['coating'], RGB> = {
  TiAlN: [0.27, 0.25, 0.31],
  TiN: [0.78, 0.62, 0.26],
  uncoated: [0.46, 0.46, 0.48],
};

const HOLDER_RGB: RGB = [0.035, 0.035, 0.04];

/**
 * VB(x) is evaluated per pixel, so it is tabulated once per specimen
 * (0.25 µm step, linear interpolation). The table is a cache of
 * flankWearAt, not a separate source of truth.
 */
const LUT_STEP_UM = 0.25;
const wearLut = new WeakMap<InsertFlankGeometry, Float32Array>();

function wearAt(x: number, g: InsertFlankGeometry, seed: number): number {
  let lut = wearLut.get(g);
  if (!lut) {
    lut = new Float32Array(Math.ceil(g.edgeLengthUm / LUT_STEP_UM) + 2);
    for (let i = 0; i < lut.length; i++) lut[i] = flankWearAt(i * LUT_STEP_UM, g, seed);
    wearLut.set(g, lut);
  }
  if (x < 0 || x > g.edgeLengthUm) return 0;
  const f = x / LUT_STEP_UM;
  const i = Math.floor(f);
  const t = f - i;
  return lut[i]! * (1 - t) + lut[i + 1]! * t;
}

function set(out: RGB, r: number, g: number, b: number): RGB {
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return out;
}

/** Anti-aliased coverage of a band |d| ≤ halfWidth by a pixel of size px (µm). */
function bandCoverage(d: number, halfWidth: number, px: number): number {
  const c = (halfWidth + px / 2 - Math.abs(d)) / px;
  return Math.max(0, Math.min(c, Math.min(1, (2 * halfWidth) / px)));
}

/* ------------------------------------------------------------ micrometer */

// Seven-segment digit masks (a b c d e f g).
const SEG: Record<string, number> = {
  '0': 0b1111110, '1': 0b0110000, '2': 0b1101101, '3': 0b1111001, '4': 0b0110011,
  '5': 0b1011011, '6': 0b1011111, '7': 0b1110000, '8': 0b1111111, '9': 0b1111011,
};

function digitInk(ch: string, x: number, y: number, w: number, h: number, stroke: number): boolean {
  const m = SEG[ch];
  if (m === undefined) return false;
  const half = h / 2;
  const on = (bit: number): boolean => ((m >> (6 - bit)) & 1) === 1;
  const hseg = (yy: number): boolean => Math.abs(y - yy) <= stroke / 2 && x >= 0 && x <= w;
  const vseg = (xx: number, y0: number, y1: number): boolean => Math.abs(x - xx) <= stroke / 2 && y >= y0 && y <= y1;
  return (
    (on(0) && hseg(0)) ||
    (on(1) && vseg(w, 0, half)) ||
    (on(2) && vseg(w, half, h)) ||
    (on(3) && hseg(h)) ||
    (on(4) && vseg(0, half, h)) ||
    (on(5) && vseg(0, 0, half)) ||
    (on(6) && hseg(half))
  );
}

function shadeMicrometer(x: number, y: number, g: StageMicrometerGeometry, mode: IlluminationMode, px: number, seed: number, out: RGB): RGB {
  const half = g.lineWidthUm / 2;
  let ink = 0;
  // Baseline.
  if (x >= -half && x <= g.lengthUm + half) ink = Math.max(ink, bandCoverage(y, half, px));
  // Graduations hang below the baseline.
  if (x >= -half - px && x <= g.lengthUm + half + px) {
    const k = Math.round(x / g.divisionUm);
    if (k >= 0 && k * g.divisionUm <= g.lengthUm + 1e-6) {
      const pos = k * g.divisionUm;
      const major = Math.round(pos) % 100 === 0;
      const mid = Math.round(pos) % 50 === 0;
      const len = major ? 130 : mid ? 90 : 60;
      if (y >= 0 && y <= len) ink = Math.max(ink, bandCoverage(x - pos, half, px));
    }
    // Numbers under the 100 µm ticks, in units of 0.1 mm.
    const k100 = Math.round(x / 100);
    if (k100 >= 0 && k100 <= g.lengthUm / 100) {
      const label = String(k100);
      const w = 16;
      const h = 26;
      const gap = 6;
      const total = label.length * w + (label.length - 1) * gap;
      const lx = x - (k100 * 100 - total / 2);
      const ly = y - 145;
      if (ly >= -2 && ly <= h + 2 && lx >= -2 && lx <= total + 2) {
        const idx = Math.floor(lx / (w + gap));
        const ch = label[Math.max(0, Math.min(label.length - 1, idx))] ?? '';
        if (digitInk(ch, lx - idx * (w + gap), ly, w, h, 3)) ink = Math.max(ink, 1);
      }
    }
  }
  const grain = (valueNoise2(x / 8, y / 8, seed) - 0.5) * 0.03;
  if (mode === 'coaxial') {
    const bg = 0.72 + grain;
    const line = 0.07;
    const v = bg * (1 - ink) + line * ink;
    return set(out, v * 0.98, v, v * 1.02);
  }
  const bg = 0.09 + grain * 0.5;
  const line = 0.5;
  const v = bg * (1 - ink) + line * ink;
  return set(out, v, v, v * 1.03);
}

/* ------------------------------------------------------------ flank view */

function shadeFlank(x: number, y: number, g: InsertFlankGeometry, mode: IlluminationMode, px: number, seed: number, out: RGB): RGB {
  const coax = mode === 'coaxial';
  // Outside the insert: holder / background (out of the focal plane, dark).
  if (x < 0 || x > g.edgeLengthUm || y < 0 || y > g.thicknessUm) {
    const n = valueNoise2(x / 120, y / 120, seed + 9) * 0.02;
    return set(out, HOLDER_RGB[0] + n, HOLDER_RGB[1] + n, HOLDER_RGB[2] + n);
  }
  const base = COATING_RGB[g.coating];
  // Curved corner: surface normal tilts away from the axis towards x = 0.
  const r = g.noseRadiusUm;
  const tilt = x < r ? Math.sqrt(Math.max(0, 1 - ((r - x) / r) ** 2)) : 1;
  const corner = coax ? 0.35 + 0.65 * tilt : 0.75 + 0.25 * (1 - tilt);

  // Ground flank texture: grinding marks parallel to the cutting edge.
  const grind = (valueNoise2(x / 400, y / 2.2, seed) - 0.5) * 0.16 + (valueNoise2(x / 3, y / 3, seed + 3) - 0.5) * 0.08;
  let r0 = base[0] * (1 + grind);
  let g0 = base[1] * (1 + grind);
  let b0 = base[2] * (1 + grind);
  if (!coax) {
    r0 *= 1.25;
    g0 *= 1.25;
    b0 *= 1.25;
  }

  // Wear land: abraded substrate with striations along the chip/cutting direction (y).
  const vb = wearAt(x, g, seed);
  if (vb > 0) {
    const edgeSoft = Math.min(px, 3);
    const inLand = Math.max(0, Math.min(1, (vb - y) / edgeSoft + 0.5));
    if (inLand > 0) {
      const stri = (valueNoise1(x / 2.4, seed + 17) - 0.5) * 0.22 + (valueNoise2(x / 6, y / 40, seed + 23) - 0.5) * 0.12;
      // Darker transition band at the land boundary (worn coating edge).
      const nearBoundary = Math.exp(-(((vb - y) / 9) ** 2));
      let land = coax ? 0.86 + stri : 0.42 + stri * 0.6;
      land *= 1 - 0.35 * nearBoundary;
      const lr = land * 0.97;
      const lg = land * 0.98;
      const lb = land * 1.0;
      r0 = r0 * (1 - inLand) + lr * inLand;
      g0 = g0 * (1 - inLand) + lg * inLand;
      b0 = b0 * (1 - inLand) + lb * inLand;
      // Adhered workpiece material inside the notch (zone N).
      if (g.wear.notchUm > 0 && x > g.depthOfCutUm) {
        const adh = valueNoise2(x / 25, y / 25, seed + 31);
        if (adh > 0.62 && y < vb * 0.9) {
          const a = (adh - 0.62) * 2.2;
          r0 = r0 * (1 - a) + 0.45 * a;
          g0 = g0 * (1 - a) + 0.37 * a;
          b0 = b0 * (1 - a) + 0.29 * a;
        }
      }
    }
  }
  // Slight edge rounding highlight along the cutting edge itself.
  const edgeHi = coax ? 0.25 * Math.exp(-((y / 6) ** 2)) : 0;
  return set(out, (r0 + edgeHi) * corner, (g0 + edgeHi) * corner, (b0 + edgeHi) * corner);
}

/* ------------------------------------------------------------- rake view */

function shadeRake(x: number, y: number, g: InsertRakeGeometry, mode: IlluminationMode, px: number, seed: number, out: RGB): RGB {
  const coax = mode === 'coaxial';
  const r = g.noseRadiusUm;
  let inside = x >= 0 && x <= g.edgeLengthUm && y >= 0 && y <= 6000;
  if (inside && x < r && y < r) inside = Math.hypot(x - r, y - r) <= r;
  if (!inside) {
    const n = valueNoise2(x / 120, y / 120, seed + 9) * 0.02;
    return set(out, HOLDER_RGB[0] + n, HOLDER_RGB[1] + n, HOLDER_RGB[2] + n);
  }
  const base = COATING_RGB[g.coating];
  const tex = (valueNoise2(x / 5, y / 5, seed) - 0.5) * 0.1 + (valueNoise2(x / 60, y / 60, seed + 1) - 0.5) * 0.08;
  let r0 = base[0] * (1 + tex);
  let g0 = base[1] * (1 + tex);
  let b0 = base[2] * (1 + tex);
  if (!coax) {
    r0 *= 0.85;
    g0 *= 0.85;
    b0 *= 0.85;
  }
  // Edge band: flank wear / edge rounding seen from the rake side.
  if (g.edgeBandUm > 0 && x > 0 && x < g.depthOfCutUm + 100) {
    const t = Math.max(0, Math.min(1, (g.edgeBandUm - y) / Math.min(px, 3) + 0.5));
    const v = coax ? 0.8 : 0.45;
    r0 = r0 * (1 - t) + v * t;
    g0 = g0 * (1 - t) + v * t;
    b0 = b0 * (1 - t) + v * t;
  }
  // Crater: elliptical depression between KF and KB.
  const c = g.crater;
  const cx = (c.xStartUm + c.xEndUm) / 2;
  const cy = (c.kfUm + c.kbUm) / 2;
  const ax = (c.xEndUm - c.xStartUm) / 2;
  const ay = (c.kbUm - c.kfUm) / 2;
  const wobble = 1 + 0.05 * (valueNoise1(Math.atan2(y - cy, x - cx) * 6, seed + 41) - 0.5);
  const rho = Math.hypot((x - cx) / ax, (y - cy) / ay) / wobble;
  if (rho < 1.04) {
    const t = Math.max(0, Math.min(1, (1.0 - rho) / 0.04 + 0.5));
    const slope = Math.min(1, rho * 1.1);
    const flow = (valueNoise1((x - cx) / 4 + (y - cy) / 30, seed + 51) - 0.5) * 0.15;
    // Exposed substrate with chip-flow marks; brightness depends on surface slope.
    const v = coax ? 0.62 * (1 - 0.75 * slope) + 0.1 + flow : 0.2 + 0.45 * slope + flow;
    const rim = Math.exp(-(((rho - 1) / 0.035) ** 2)) * (coax ? -0.08 : 0.12);
    r0 = r0 * (1 - t) + (v + rim) * 0.98 * t;
    g0 = g0 * (1 - t) + (v + rim) * 0.95 * t;
    b0 = b0 * (1 - t) + (v + rim) * 0.9 * t;
  }
  return set(out, r0, g0, b0);
}

/** Entry point: reflectance of `specimen` at (x, y) µm for a pixel footprint of `pixelUm`. */
export function shade(specimen: SpecimenDef, x: number, y: number, mode: IlluminationMode, pixelUm: number, out: RGB): RGB {
  const g = specimen.geometry;
  switch (g.kind) {
    case 'stage-micrometer':
      return shadeMicrometer(x, y, g, mode, pixelUm, specimen.seed, out);
    case 'insert-flank':
      return shadeFlank(x, y, g, mode, pixelUm, specimen.seed, out);
    case 'insert-rake':
      return shadeRake(x, y, g, mode, pixelUm, specimen.seed, out);
  }
}

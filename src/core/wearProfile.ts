import { fbm1 } from './noise';
import type { InsertFlankGeometry, WearZone } from './types';

/**
 * Wear-land geometry for flank-view specimens and ISO 3685 zone allocation.
 *
 * Zone convention (ISO 3685, schematic of flank wear on the major cutting
 * edge, simplified for an edge viewed normal to the flank face):
 *   Zone C  curved corner region, 0 ≤ x ≤ r_ε
 *   Zone B  straight edge between zone C and the depth-of-cut line, r_ε < x < a_p
 *   Zone N  beyond the depth-of-cut line, a_p ≤ x ≤ a_p + 1 mm (notch region)
 * The simplification (edge-projected a_p, no lead-angle correction) is
 * documented in docs/ARCHITECTURE.md and the iso3685 skill.
 */
export const ZONE_N_EXTENT_UM = 1000;

export function zoneLimits(g: InsertFlankGeometry): { cEnd: number; bEnd: number; nEnd: number } {
  return { cEnd: g.noseRadiusUm, bEnd: g.depthOfCutUm, nEnd: g.depthOfCutUm + ZONE_N_EXTENT_UM };
}

export function zoneAt(xUm: number, g: InsertFlankGeometry): WearZone {
  const z = zoneLimits(g);
  if (xUm < 0) return 'outside';
  if (xUm <= z.cEnd) return 'C';
  if (xUm < z.bEnd) return 'B';
  if (xUm <= z.nEnd) return 'N';
  return 'outside';
}

/**
 * Flank wear land width VB(x) in µm, measured perpendicular to the original
 * cutting edge (which lies on y = 0 in the specimen frame).
 */
export function flankWearAt(xUm: number, g: InsertFlankGeometry, seed: number): number {
  const w = g.wear;
  if (xUm < 0 || xUm > g.edgeLengthUm) return 0;
  if (w.vbMeanUm <= 0 && w.vbCornerUm <= 0 && w.notchUm <= 0) return 0;

  const zoneB = (x: number): number => {
    let v = w.vbMeanUm;
    v += w.undulationUm * Math.sin((2 * Math.PI * x) / 900 + (seed % 7));
    v += w.roughnessUm * fbm1(x / 45, seed, 4);
    for (const p of w.peaks) {
      const d = (x - p.xUm) / p.widthUm;
      v += p.heightUm * Math.exp(-d * d);
    }
    return v;
  };

  let vb: number;
  const r = g.noseRadiusUm;
  const ap = g.depthOfCutUm;
  if (xUm <= r) {
    const t = xUm / r;
    const blend = t * t * (3 - 2 * t);
    vb = w.vbCornerUm * (1 - blend) + zoneB(xUm) * blend;
  } else {
    vb = zoneB(xUm);
  }

  // Contact ends at the depth-of-cut line: wear tapers off beyond it.
  if (xUm > ap) vb *= Math.exp(-(xUm - ap) / 120);

  // Notch wear centred just outside the depth-of-cut line (zone N).
  // The notch rises from zero at the depth-of-cut line so it stays in zone N.
  if (w.notchUm > 0 && xUm > ap) {
    const rise = Math.min(1, (xUm - ap) / (0.35 * w.notchWidthUm));
    const ramp = rise * rise * (3 - 2 * rise);
    const d = (xUm - ap - 0.7 * w.notchWidthUm) / w.notchWidthUm;
    vb += w.notchUm * ramp * Math.exp(-d * d * d * d) * (1 + 0.08 * fbm1(xUm / 15, seed + 5, 2));
  }
  return Math.max(0, vb);
}

export interface ReferenceWear {
  /** Mean of VB over zone B (µm). */
  vbBMeanUm: number;
  /** Maximum of VB over zone B (µm). */
  vbBMaxUm: number;
  /** Maximum in zone C (µm). */
  vbCMaxUm: number;
  /** Maximum in zone N (µm). */
  vbNMaxUm: number;
  samplingStepUm: number;
}

/**
 * Design reference values of a synthetic specimen, computed by dense
 * numerical sampling of its wear profile. These are properties of the
 * synthetic geometry, not experimental ground truth.
 */
export function referenceWear(g: InsertFlankGeometry, seed: number, stepUm = 2): ReferenceWear {
  const z = zoneLimits(g);
  let sumB = 0;
  let nB = 0;
  let maxB = 0;
  let maxC = 0;
  let maxN = 0;
  for (let x = 0; x <= Math.min(z.nEnd, g.edgeLengthUm); x += stepUm) {
    const v = flankWearAt(x, g, seed);
    const zone = zoneAt(x, g);
    if (zone === 'B') {
      sumB += v;
      nB++;
      maxB = Math.max(maxB, v);
    } else if (zone === 'C') maxC = Math.max(maxC, v);
    else if (zone === 'N') maxN = Math.max(maxN, v);
  }
  return { vbBMeanUm: nB ? sumB / nB : 0, vbBMaxUm: maxB, vbCMaxUm: maxC, vbNMaxUm: maxN, samplingStepUm: stepUm };
}

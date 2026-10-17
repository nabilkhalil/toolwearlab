import type { CriterionAssessment, WearMode, WearSummary } from './types';

/**
 * Tool-life criteria of ISO 3685:1993 for sintered carbide tools
 * (single-point turning):
 *   (a) VB_B     = 0.3 mm  average flank wear when zone B is regularly worn
 *   (b) VB_B max = 0.6 mm  maximum flank wear when zone B is irregularly worn
 *   (c) KT       = 0.06 + 0.3·f mm  crater depth (f = feed, mm/rev)
 * Other tool materials (HSS, ceramics) have their own criteria in the standard.
 *
 * Conformance decisions use the expanded uncertainty U: a result within
 * ±U of the limit is reported as "indeterminate" rather than forced into
 * pass/fail, following the decision-rule principle of ISO 14253-1.
 */
export const VB_B_LIMIT_UM = 300;
export const VB_B_MAX_LIMIT_UM = 600;

export function craterDepthLimitMm(feedMmPerRev: number): number {
  return 0.06 + 0.3 * feedMmPerRev;
}

function decide(value: number | null, u: number | null, k: number, limit: number): boolean | null {
  if (value === null) return null;
  const U = (u ?? 0) * k;
  if (value - U >= limit) return true;
  if (value + U < limit) return false;
  return null;
}

export function assessFlankCriteria(summary: WearSummary): CriterionAssessment[] {
  const k = summary.coverageFactor;
  return [
    {
      criterion: 'VB_B (average, regular wear)',
      limitUm: VB_B_LIMIT_UM,
      valueUm: summary.vbMeanUm,
      reached: decide(summary.vbMeanUm, summary.uMeanUm, k, VB_B_LIMIT_UM),
      note: 'Applies when zone B is regularly worn.',
    },
    {
      criterion: 'VB_B max (maximum, irregular wear)',
      limitUm: VB_B_MAX_LIMIT_UM,
      valueUm: summary.vbMaxUm,
      reached: decide(summary.vbMaxUm, summary.uMaxUm, k, VB_B_MAX_LIMIT_UM),
      note: 'Applies when zone B is irregularly worn, scratched or chipped.',
    },
  ];
}

/**
 * Simple regularity indicator for teaching: the land is treated as
 * irregular when the largest reading exceeds the mean by more than 40 %.
 * This is a didactic heuristic, not a clause of ISO 3685; the student is
 * expected to judge regularity visually and justify the choice.
 */
export function irregularityIndex(summary: WearSummary): number | null {
  if (summary.vbMeanUm === null || summary.vbMaxUm === null || summary.vbMeanUm === 0) return null;
  return (summary.vbMaxUm - summary.vbMeanUm) / summary.vbMeanUm;
}
export const IRREGULARITY_THRESHOLD = 0.4;

export const WEAR_MODE_INFO: Record<Exclude<WearMode, 'none'>, { name: string; location: string; parameters: string; mechanism: string; howToSee: string }> = {
  flank: {
    name: 'Flank wear',
    location: 'Flank (clearance) face, as a land running along the cutting edge.',
    parameters: 'VB_B, VB_B max, VB_C (corner), VB_N (notch zone); measured perpendicular to the original cutting edge.',
    mechanism: 'Predominantly abrasion against the machined surface; grows with cutting time and speed.',
    howToSee: 'Flank-face view under coaxial bright-field: the flat abraded land is bright against the coating.',
  },
  crater: {
    name: 'Crater wear',
    location: 'Rake face, a depression behind the cutting edge where the chip slides.',
    parameters: 'KT (depth), KB (crater width from original edge), KM (crater centre distance), KF (crater front distance).',
    mechanism: 'Diffusion and chemical dissolution at high chip–tool interface temperature, plus abrasion.',
    howToSee: 'Rake-face view; ring light reveals the sloped crater walls. KT needs a depth method (focus variation, profilometer).',
  },
  notch: {
    name: 'Notch wear',
    location: 'Localised groove on the flank at the depth-of-cut line (zone N), sometimes at the minor edge.',
    parameters: 'VB_N, the maximum wear-land width in zone N.',
    mechanism: 'Work-hardened layer, oxidation and burr formation at the boundary of the contact zone.',
    howToSee: 'Flank-face view at the depth-of-cut line: a sharp local increase of land width, often with adhered material.',
  },
};

import { COVERAGE_FACTOR, pxToUm, relativeScaleUncertainty } from './calibration';
import { distance, pointLineDistance } from './geometry';
import { imageToWorld } from './optics';
import { zoneAt } from './wearProfile';
import type {
  CalibrationRecord,
  CapturedFrame,
  EdgeReference,
  LineMeasurement,
  MeasurementSession,
  SpecimenDef,
  Vec2,
  WearPoint,
  WearSummary,
  WearZone,
} from './types';

/**
 * Flank wear measurement following ISO 3685 principles:
 *  - VB is the width of the flank wear land, measured in the flank face
 *    plane, perpendicular to the ORIGINAL cutting edge. The student marks
 *    the original edge with a two-point reference line, then picks points
 *    on the lower boundary of the wear land.
 *  - Readings are allocated to zones C, B and N. The average VB_B and the
 *    maximum VB_B max are computed from zone-B readings only; zone C and
 *    zone N maxima (VB_C, VB_N) are reported separately.
 */
export const MIN_ZONE_B_POINTS = 5;
export const MIN_EDGE_REFERENCE_PX = 150;

export function validateEdgeReference(edge: EdgeReference): string | null {
  const d = distance(edge.a, edge.b);
  if (d < MIN_EDGE_REFERENCE_PX) return `Edge reference is too short (${d.toFixed(0)} px). Span at least ${MIN_EDGE_REFERENCE_PX} px of the unworn edge.`;
  return null;
}

/** Zone of an image point, from the acquisition geometry stored with the frame. */
export function zoneOfImagePoint(p: Vec2, frame: CapturedFrame, specimen: SpecimenDef | null): WearZone {
  if (!specimen || specimen.geometry.kind !== 'insert-flank') return 'B';
  const w = imageToWorld(p, frame.microscope, specimen);
  return zoneAt(w.x, specimen.geometry);
}

export function makeWearPoint(id: string, p: Vec2, edge: EdgeReference, cal: CalibrationRecord, zone: WearZone): WearPoint {
  const dPx = pointLineDistance(p, edge.a, edge.b);
  // Two independent localisation errors: the boundary pick and the edge line position.
  const m = pxToUm(dPx, cal, 2);
  return { id, p, zone, distancePx: dPx, vbUm: m.valueUm, uUm: m.uUm };
}

/** Recompute all readings, e.g. after the edge reference has been moved. */
export function recomputePoints(points: WearPoint[], edge: EdgeReference, cal: CalibrationRecord): WearPoint[] {
  return points.map((pt) => makeWearPoint(pt.id, pt.p, edge, cal, pt.zone));
}

export function makeLineMeasurement(
  id: string,
  kind: LineMeasurement['kind'],
  a: Vec2,
  b: Vec2,
  cal: CalibrationRecord,
  label: string,
): LineMeasurement {
  const lengthPx = distance(a, b);
  const m = pxToUm(lengthPx, cal, 2);
  return { id, kind, a, b, lengthPx, lengthUm: m.valueUm, uUm: m.uUm, label };
}

/**
 * Summary statistics. Uncertainty model:
 *  - random part per reading:  u_r = √2 · u_pick · s   (independent between readings)
 *  - systematic part:          u_s = value · u(s)/s     (fully correlated, from calibration)
 *  u(mean) = √(u_r²/n + (mean·u_rel)²),  u(max) = √(u_r² + (max·u_rel)²)
 * Expanded uncertainty U = k·u with k = 2 (≈ 95 % coverage).
 * The spread of VB along the edge is a property of the wear land, not a
 * measurement error, so the standard deviation is reported but not folded
 * into u(mean).
 */
export function summarise(points: WearPoint[], cal: CalibrationRecord | null): WearSummary {
  const b = points.filter((p) => p.zone === 'B').map((p) => p.vbUm);
  const c = points.filter((p) => p.zone === 'C').map((p) => p.vbUm);
  const nz = points.filter((p) => p.zone === 'N').map((p) => p.vbUm);
  const n = b.length;
  const empty: WearSummary = {
    n,
    vbMeanUm: null,
    vbMaxUm: null,
    vbMinUm: null,
    stdDevUm: null,
    uMeanUm: null,
    uMaxUm: null,
    coverageFactor: COVERAGE_FACTOR,
    vbcMaxUm: c.length ? Math.max(...c) : null,
    vbnMaxUm: nz.length ? Math.max(...nz) : null,
  };
  if (n === 0 || !cal) return empty;
  const mean = b.reduce((s, v) => s + v, 0) / n;
  const max = Math.max(...b);
  const min = Math.min(...b);
  const sd = n > 1 ? Math.sqrt(b.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const ur = Math.SQRT2 * cal.pickUncertaintyPx * cal.umPerPx;
  const rel = relativeScaleUncertainty(cal);
  return {
    ...empty,
    vbMeanUm: mean,
    vbMaxUm: max,
    vbMinUm: min,
    stdDevUm: sd,
    uMeanUm: Math.sqrt((ur * ur) / n + (mean * rel) ** 2),
    uMaxUm: Math.hypot(ur, max * rel),
  };
}

/**
 * Derive calibrated readings from a session's raw picks. Returns empty
 * readings when the edge reference or a usable calibration is missing.
 */
export function deriveReadings(
  session: MeasurementSession,
  frame: CapturedFrame,
  cal: CalibrationRecord | null,
  specimen: SpecimenDef | null,
): { points: WearPoint[]; lines: LineMeasurement[] } {
  if (!cal) return { points: [], lines: [] };
  const lines = session.lines.map((l) => makeLineMeasurement(l.id, l.kind, l.a, l.b, cal, l.label));
  if (!session.edge) return { points: [], lines };
  const points = session.points.map((rp) => makeWearPoint(rp.id, rp.p, session.edge!, cal, zoneOfImagePoint(rp.p, frame, specimen)));
  return { points, lines };
}

import { distance } from './geometry';
import type { CalibrationRecord, CalibrationStatus, CalibrationVerification, ObjectiveId, Vec2 } from './types';

/**
 * Spatial calibration against a stage micrometer.
 *
 * Scale:            s = L_ref / d_px                        (µm/px)
 * Relative std. u:  u(s)/s = √[ (u(L_ref)/L_ref)² + (√2·u_pick/d_px)² ]
 *
 * u_pick is the standard uncertainty of locating one graduation centre
 * (default 0.5 px). The √2 accounts for the two independent picks. The
 * expression shows students why long reference spans give better scales.
 */
export const DEFAULT_PICK_UNCERTAINTY_PX = 0.5;
export const MIN_CALIBRATION_SPAN_PX = 100;
export const RECOMMENDED_CALIBRATION_SPAN_PX = 600;
export const COVERAGE_FACTOR = 2;

export interface CalibrationInput {
  objectiveId: ObjectiveId | 'imported';
  p1: Vec2;
  p2: Vec2;
  referenceLengthUm: number;
  referenceUncertaintyUm: number;
  pickUncertaintyPx?: number;
  id?: string;
  now?: Date;
}

export class CalibrationError extends Error {}

export function createCalibration(input: CalibrationInput): CalibrationRecord {
  const pick = input.pickUncertaintyPx ?? DEFAULT_PICK_UNCERTAINTY_PX;
  if (!(input.referenceLengthUm > 0)) throw new CalibrationError('Reference length must be positive.');
  if (input.referenceUncertaintyUm < 0) throw new CalibrationError('Reference uncertainty cannot be negative.');
  const d = distance(input.p1, input.p2);
  if (d < MIN_CALIBRATION_SPAN_PX)
    throw new CalibrationError(
      `Calibration span is only ${d.toFixed(1)} px. Use at least ${MIN_CALIBRATION_SPAN_PX} px (ideally > ${RECOMMENDED_CALIBRATION_SPAN_PX} px) of the micrometer scale.`,
    );
  const s = input.referenceLengthUm / d;
  const relRef = input.referenceUncertaintyUm / input.referenceLengthUm;
  const relPick = (Math.SQRT2 * pick) / d;
  const uRel = Math.hypot(relRef, relPick);
  return {
    id: input.id ?? `cal-${Date.now().toString(36)}`,
    createdAt: (input.now ?? new Date()).toISOString(),
    objectiveId: input.objectiveId,
    p1: input.p1,
    p2: input.p2,
    referenceLengthUm: input.referenceLengthUm,
    referenceUncertaintyUm: input.referenceUncertaintyUm,
    pickUncertaintyPx: pick,
    distancePx: d,
    umPerPx: s,
    umPerPxStdUncertainty: s * uRel,
    status: 'calibrated',
  };
}

/**
 * Calibration entered directly, e.g. the certified scale of an imported
 * micrograph. The pick uncertainty still applies to later measurements.
 */
export function createManualCalibration(umPerPx: number, uUmPerPx: number, opts: { id?: string; now?: Date; pickUncertaintyPx?: number } = {}): CalibrationRecord {
  if (!(umPerPx > 0)) throw new CalibrationError('Scale must be positive.');
  if (!(uUmPerPx >= 0)) throw new CalibrationError('Scale uncertainty cannot be negative.');
  return {
    id: opts.id ?? `cal-${Date.now().toString(36)}`,
    createdAt: (opts.now ?? new Date()).toISOString(),
    objectiveId: 'imported',
    p1: { x: 0, y: 0 },
    p2: { x: 0, y: 0 },
    referenceLengthUm: 0,
    referenceUncertaintyUm: 0,
    pickUncertaintyPx: opts.pickUncertaintyPx ?? DEFAULT_PICK_UNCERTAINTY_PX,
    distancePx: 0,
    umPerPx,
    umPerPxStdUncertainty: uUmPerPx,
    status: 'calibrated',
  };
}

/** Relative standard uncertainty u(s)/s. */
export function relativeScaleUncertainty(cal: CalibrationRecord): number {
  return cal.umPerPxStdUncertainty / cal.umPerPx;
}

/** Convert an image distance to µm with its standard uncertainty. */
export function pxToUm(lengthPx: number, cal: CalibrationRecord, picks = 2): { valueUm: number; uUm: number } {
  const value = lengthPx * cal.umPerPx;
  const uPick = Math.sqrt(picks) * cal.pickUncertaintyPx * cal.umPerPx;
  const uScale = lengthPx * cal.umPerPxStdUncertainty;
  return { valueUm: value, uUm: Math.hypot(uPick, uScale) };
}

/**
 * Verify a calibration by measuring a second, independent reference interval.
 * Passes when |error| ≤ U, the expanded (k = 2) uncertainty of the check,
 * which combines the measurement and the reference uncertainty (E_n ≤ 1).
 */
export function verifyCalibration(
  cal: CalibrationRecord,
  q1: Vec2,
  q2: Vec2,
  referenceLengthUm: number,
  referenceUncertaintyUm: number = cal.referenceUncertaintyUm,
): CalibrationVerification {
  const d = distance(q1, q2);
  const m = pxToUm(d, cal);
  const err = m.valueUm - referenceLengthUm;
  const U = COVERAGE_FACTOR * Math.hypot(m.uUm, referenceUncertaintyUm);
  return {
    referenceLengthUm,
    measuredLengthUm: m.valueUm,
    errorUm: err,
    expandedUncertaintyUm: U,
    passed: Math.abs(err) <= U,
  };
}

export function applyVerification(cal: CalibrationRecord, v: CalibrationVerification): CalibrationRecord {
  return { ...cal, verification: v, status: v.passed ? 'verified' : 'invalid' };
}

/** A calibration is valid only for the objective it was made with. Digital zoom never invalidates it. */
export function calibrationStatusFor(cal: CalibrationRecord | null | undefined, objectiveId: ObjectiveId | 'imported'): CalibrationStatus {
  if (!cal) return 'none';
  if (cal.objectiveId !== objectiveId) return 'none';
  return cal.status;
}

/** Storage key of the calibration that governs a frame. */
export function calibrationKey(frame: { source: 'simulated' | 'imported'; id: string; microscope: { objectiveId: ObjectiveId } }): string {
  return frame.source === 'imported' ? `imported:${frame.id}` : frame.microscope.objectiveId;
}

export function isUsable(status: CalibrationStatus): boolean {
  return status === 'calibrated' || status === 'verified';
}

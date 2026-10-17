import { describe, expect, it } from 'vitest';
import {
  CalibrationError,
  applyVerification,
  calibrationStatusFor,
  createCalibration,
  isUsable,
  pxToUm,
  relativeScaleUncertainty,
  verifyCalibration,
} from './calibration';

const base = {
  objectiveId: '5x' as const,
  p1: { x: 100, y: 500 },
  p2: { x: 1549.275362, y: 500 }, // 1000 µm at 0.69 µm/px = 1449.275362 px
  referenceLengthUm: 1000,
  referenceUncertaintyUm: 0.5,
  pickUncertaintyPx: 0.5,
  id: 'cal-test',
  now: new Date('2026-10-16T00:00:00Z'),
};

describe('stage-micrometer calibration', () => {
  it('computes µm/px from a known reference distance', () => {
    const c = createCalibration(base);
    expect(c.umPerPx).toBeCloseTo(0.69, 6);
    expect(c.distancePx).toBeCloseTo(1449.275362, 5);
    expect(c.status).toBe('calibrated');
  });

  it('is independent of the direction of the reference line', () => {
    const d = 1449.275362;
    const t = (35 * Math.PI) / 180;
    const c = createCalibration({ ...base, p2: { x: 100 + d * Math.cos(t), y: 500 + d * Math.sin(t) } });
    expect(c.umPerPx).toBeCloseTo(0.69, 6);
  });

  it('propagates reference and pick uncertainty', () => {
    const c = createCalibration(base);
    const expected = Math.hypot(0.5 / 1000, (Math.SQRT2 * 0.5) / 1449.275362);
    expect(relativeScaleUncertainty(c)).toBeCloseTo(expected, 12);
  });

  it('gives a smaller relative uncertainty for a longer span', () => {
    const short = createCalibration({ ...base, referenceLengthUm: 100, p2: { x: 100 + 144.9275362, y: 500 }, referenceUncertaintyUm: 0.5 });
    const long = createCalibration(base);
    expect(relativeScaleUncertainty(long)).toBeLessThan(relativeScaleUncertainty(short));
  });

  it('rejects degenerate or too-short spans and invalid references', () => {
    expect(() => createCalibration({ ...base, p2: { x: 150, y: 500 } })).toThrow(CalibrationError);
    expect(() => createCalibration({ ...base, referenceLengthUm: 0 })).toThrow(CalibrationError);
    expect(() => createCalibration({ ...base, referenceUncertaintyUm: -1 })).toThrow(CalibrationError);
  });

  it('converts pixel lengths to µm with combined uncertainty', () => {
    const c = createCalibration(base);
    const m = pxToUm(434.7826, c);
    expect(m.valueUm).toBeCloseTo(300, 3);
    const expected = Math.hypot(Math.SQRT2 * 0.5 * c.umPerPx, 434.7826 * c.umPerPxStdUncertainty);
    expect(m.uUm).toBeCloseTo(expected, 9);
  });

  it('verification passes for an exact independent interval and fails for a wrong scale', () => {
    const c = createCalibration(base);
    const ok = verifyCalibration(c, { x: 200, y: 300 }, { x: 200 + 724.637681, y: 300 }, 500);
    expect(ok.passed).toBe(true);
    expect(applyVerification(c, ok).status).toBe('verified');

    // A student who mis-entered 900 µm for the 1000 µm span has a 10 % scale error.
    const wrong = createCalibration({ ...base, referenceLengthUm: 900 });
    const bad = verifyCalibration(wrong, { x: 200, y: 300 }, { x: 200 + 724.637681, y: 300 }, 500);
    expect(bad.passed).toBe(false);
    expect(applyVerification(wrong, bad).status).toBe('invalid');
  });

  it('is valid only for the objective it was made with', () => {
    const c = createCalibration(base);
    expect(calibrationStatusFor(c, '5x')).toBe('calibrated');
    expect(calibrationStatusFor(c, '10x')).toBe('none');
    expect(calibrationStatusFor(null, '5x')).toBe('none');
    expect(isUsable('calibrated')).toBe(true);
    expect(isUsable('verified')).toBe(true);
    expect(isUsable('invalid')).toBe(false);
  });
});

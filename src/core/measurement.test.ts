import { describe, expect, it } from 'vitest';
import { createCalibration } from './calibration';
import { pointLineDistance, projectOntoLine } from './geometry';
import { MIN_EDGE_REFERENCE_PX, makeLineMeasurement, makeWearPoint, recomputePoints, summarise, validateEdgeReference } from './measurement';
import { IRREGULARITY_THRESHOLD, assessFlankCriteria, craterDepthLimitMm, irregularityIndex } from './wearCriteria';
import type { EdgeReference, WearPoint } from './types';

// Exact 1.0 µm/px calibration keeps the arithmetic transparent.
const cal = createCalibration({
  objectiveId: '5x',
  p1: { x: 0, y: 0 },
  p2: { x: 1000, y: 0 },
  referenceLengthUm: 1000,
  referenceUncertaintyUm: 0.5,
  pickUncertaintyPx: 0.5,
  id: 'c',
});

describe('geometry', () => {
  it('perpendicular distance to a tilted line', () => {
    // Line y = x; point (0, 10): distance 10/√2.
    expect(pointLineDistance({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeCloseTo(10 / Math.SQRT2, 12);
    const f = projectOntoLine({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(f.x).toBeCloseTo(5, 12);
    expect(f.y).toBeCloseTo(5, 12);
  });
  it('rejects a degenerate reference line', () => {
    expect(() => pointLineDistance({ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toThrow();
  });
});

describe('VB readings', () => {
  it('measures perpendicular to the original edge even when the edge is tilted', () => {
    const t = (4 * Math.PI) / 180;
    const edge: EdgeReference = { a: { x: 100, y: 100 }, b: { x: 100 + 800 * Math.cos(t), y: 100 + 800 * Math.sin(t) } };
    // Point 250 px along the edge, then 300 px along the inward normal.
    const along = { x: 100 + 250 * Math.cos(t), y: 100 + 250 * Math.sin(t) };
    const p = { x: along.x - 300 * Math.sin(t), y: along.y + 300 * Math.cos(t) };
    const r = makeWearPoint('p1', p, edge, cal, 'B');
    expect(r.vbUm).toBeCloseTo(300, 9);
    // A naive vertical (Δy) reading would be wrong by ~0.24 %; the perpendicular method is not.
    expect(Math.abs(p.y - along.y - 300 / Math.cos(t))).toBeGreaterThan(0.5);
  });

  it('edge reference must span enough of the edge', () => {
    expect(validateEdgeReference({ a: { x: 0, y: 0 }, b: { x: MIN_EDGE_REFERENCE_PX - 1, y: 0 } })).not.toBeNull();
    expect(validateEdgeReference({ a: { x: 0, y: 0 }, b: { x: 900, y: 0 } })).toBeNull();
  });

  it('recomputes readings when the edge reference moves', () => {
    const edge: EdgeReference = { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } };
    const pts = [makeWearPoint('a', { x: 300, y: 200 }, edge, cal, 'B')];
    const moved = recomputePoints(pts, { a: { x: 0, y: 10 }, b: { x: 1000, y: 10 } }, cal);
    expect(moved[0]!.vbUm).toBeCloseTo(190, 9);
  });

  it('line measurements (KB, KF) carry uncertainty', () => {
    const l = makeLineMeasurement('l', 'crater-kb', { x: 0, y: 0 }, { x: 0, y: 640 }, cal, 'KB');
    expect(l.lengthUm).toBeCloseTo(640, 9);
    expect(l.uUm).toBeGreaterThan(0);
  });
});

function pts(values: [number, WearPoint['zone']][]): WearPoint[] {
  const edge: EdgeReference = { a: { x: 0, y: 0 }, b: { x: 2000, y: 0 } };
  return values.map(([v, z], i) => makeWearPoint(`p${i}`, { x: 100 + i * 100, y: v }, edge, cal, z));
}

describe('VB_B statistics and ISO 3685 criteria', () => {
  it('averages and maxima use zone B only', () => {
    const s = summarise(
      pts([
        [400, 'C'],
        [200, 'B'],
        [220, 'B'],
        [210, 'B'],
        [190, 'B'],
        [230, 'B'],
        [700, 'N'],
      ]),
      cal,
    );
    expect(s.n).toBe(5);
    expect(s.vbMeanUm).toBeCloseTo(210, 9);
    expect(s.vbMaxUm).toBeCloseTo(230, 9);
    expect(s.vbMinUm).toBeCloseTo(190, 9);
    expect(s.stdDevUm).toBeCloseTo(Math.sqrt(250), 9);
    expect(s.vbcMaxUm).toBeCloseTo(400, 9);
    expect(s.vbnMaxUm).toBeCloseTo(700, 9);
  });

  it('uncertainty of the mean separates random and calibration components', () => {
    const s = summarise(pts([[200, 'B'], [200, 'B'], [200, 'B'], [200, 'B']]), cal);
    const ur = Math.SQRT2 * 0.5 * cal.umPerPx;
    const rel = cal.umPerPxStdUncertainty / cal.umPerPx;
    expect(s.uMeanUm!).toBeCloseTo(Math.sqrt((ur * ur) / 4 + (200 * rel) ** 2), 12);
    expect(s.uMaxUm!).toBeCloseTo(Math.hypot(ur, 200 * rel), 12);
  });

  it('returns nulls without zone B readings or calibration', () => {
    expect(summarise([], cal).vbMeanUm).toBeNull();
    expect(summarise(pts([[200, 'B']]), null).vbMeanUm).toBeNull();
  });

  it('applies the decision rule with an indeterminate band of ±U', () => {
    const clearlyBelow = assessFlankCriteria(summarise(pts([[200, 'B'], [210, 'B'], [190, 'B'], [205, 'B'], [195, 'B']]), cal));
    expect(clearlyBelow[0]!.reached).toBe(false);
    const clearlyAbove = assessFlankCriteria(summarise(pts([[350, 'B'], [340, 'B'], [360, 'B'], [345, 'B'], [355, 'B']]), cal));
    expect(clearlyAbove[0]!.reached).toBe(true);
    const atLimit = assessFlankCriteria(summarise(pts([[300, 'B'], [300, 'B'], [300, 'B'], [300, 'B'], [300, 'B']]), cal));
    expect(atLimit[0]!.reached).toBeNull();
  });

  it('crater depth criterion KT = 0.06 + 0.3 f', () => {
    expect(craterDepthLimitMm(0.25)).toBeCloseTo(0.135, 12);
  });

  it('irregularity heuristic', () => {
    const regular = summarise(pts([[200, 'B'], [210, 'B'], [205, 'B']]), cal);
    const irregular = summarise(pts([[200, 'B'], [210, 'B'], [420, 'B']]), cal);
    expect(irregularityIndex(regular)!).toBeLessThan(IRREGULARITY_THRESHOLD);
    expect(irregularityIndex(irregular)!).toBeGreaterThan(IRREGULARITY_THRESHOLD);
  });
});

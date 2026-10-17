import { describe, expect, it } from 'vitest';
import { createCalibration } from '@/core/calibration';
import { nominalUmPerPx, OBJECTIVES } from '@/core/optics';
import { referenceWear } from '@/core/wearProfile';
import { SPECIMENS, getSpecimen } from '@/data/specimens';
import type { InsertFlankGeometry, WearSummary } from '@/core/types';
import { expectedRegularity, gradeCalibration, gradeCrater, gradeFlank, gradeWearModes } from './grading';

function summary(mean: number, max: number, n = 10): WearSummary {
  return { n, vbMeanUm: mean, vbMaxUm: max, vbMinUm: mean - 10, stdDevUm: 5, uMeanUm: 1, uMaxUm: 2, coverageFactor: 2, vbcMaxUm: null, vbnMaxUm: null };
}

describe('assessment grading', () => {
  it('passes an accurate, long-span calibration and flags a wrong one', () => {
    const s = nominalUmPerPx(OBJECTIVES['5x']);
    const good = createCalibration({ objectiveId: '5x', p1: { x: 0, y: 0 }, p2: { x: 800 / s, y: 0 }, referenceLengthUm: 800, referenceUncertaintyUm: 0.5 });
    expect(gradeCalibration(good, '5x').items[0]!.verdict).toBe('pass');
    const wrong = createCalibration({ objectiveId: '5x', p1: { x: 0, y: 0 }, p2: { x: 800 / s, y: 0 }, referenceLengthUm: 900, referenceUncertaintyUm: 0.5 });
    expect(gradeCalibration(wrong, '5x').items[0]!.verdict).toBe('fail');
    expect(gradeCalibration(good, '10x').score).toBe(0);
  });

  it('classifies specimen regularity from design values', () => {
    expect(expectedRegularity(getSpecimen('FW-01'))).toBe('regular');
    expect(expectedRegularity(getSpecimen('FW-02'))).toBe('irregular');
  });

  it('grades a correct FW-02 answer fully and penalises a missed peak', () => {
    const sp = getSpecimen('FW-02');
    const ref = referenceWear(sp.geometry as InsertFlankGeometry, sp.seed);
    const ok = gradeFlank({ summary: summary(ref.vbBMeanUm + 5, ref.vbBMaxUm - 10), regularity: 'irregular', toolLifeReached: 'yes' }, sp);
    expect(ok.score).toBe(ok.maxScore);
    const missed = gradeFlank({ summary: summary(ref.vbBMeanUm - 20, 330), regularity: 'regular', toolLifeReached: 'no' }, sp);
    expect(missed.items.find((i) => i.title === 'VB_B max')!.verdict).toBe('fail');
    expect(missed.items.find((i) => i.title === 'Tool-life decision')!.verdict).toBe('fail');
  });

  it('grades wear-mode identification', () => {
    const sps = SPECIMENS.filter((s) => ['FW-00', 'NW-01', 'CR-01'].includes(s.id));
    const r = gradeWearModes({ 'FW-00': ['none'], 'NW-01': ['flank', 'notch'], 'CR-01': ['crater'] }, sps);
    expect(r.items.map((i) => i.verdict)).toEqual(['pass', 'pass', 'partial']);
  });

  it('grades crater KB and KF against design geometry', () => {
    const sp = getSpecimen('CR-01');
    const r = gradeCrater(645, 150, sp);
    expect(r.score).toBe(2);
    expect(gradeCrater(null, 400, sp).score).toBe(0);
  });
});

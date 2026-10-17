import { OBJECTIVES, nominalUmPerPx } from '@/core/optics';
import { RECOMMENDED_CALIBRATION_SPAN_PX, relativeScaleUncertainty } from '@/core/calibration';
import { VB_B_LIMIT_UM, VB_B_MAX_LIMIT_UM } from '@/core/wearCriteria';
import { referenceWear } from '@/core/wearProfile';
import type { CalibrationRecord, ObjectiveId, SpecimenDef, WearMode, WearSummary } from '@/core/types';

/**
 * Grading compares student results with the DESIGN values of synthetic
 * specimens (exact by construction) and with the simulator's true optical
 * scale. Tolerances combine the student's own stated uncertainty with a
 * floor that reflects realistic manual-picking performance.
 */
export type Verdict = 'pass' | 'partial' | 'fail';

export interface FeedbackItem {
  verdict: Verdict;
  title: string;
  detail: string;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  items: FeedbackItem[];
}

function item(ok: boolean | 'partial', title: string, detail: string): FeedbackItem {
  return { verdict: ok === 'partial' ? 'partial' : ok ? 'pass' : 'fail', title, detail };
}

function total(items: FeedbackItem[]): GradeResult {
  const score = items.reduce((s, i) => s + (i.verdict === 'pass' ? 1 : i.verdict === 'partial' ? 0.5 : 0), 0);
  return { score, maxScore: items.length, items };
}

/* ------------------------------------------------------------ calibration */

export const CALIBRATION_REL_TOLERANCE_FLOOR = 0.005;

export function gradeCalibration(cal: CalibrationRecord | null, objectiveId: ObjectiveId): GradeResult {
  if (!cal || cal.objectiveId !== objectiveId)
    return total([item(false, 'Calibration present', `No calibration found for the ${objectiveId} objective. Capture the stage micrometer at ${objectiveId} and calibrate.`)]);
  const truth = nominalUmPerPx(OBJECTIVES[objectiveId]);
  const relErr = (cal.umPerPx - truth) / truth;
  const tol = Math.max(2 * relativeScaleUncertainty(cal), CALIBRATION_REL_TOLERANCE_FLOOR);
  const items: FeedbackItem[] = [
    item(
      Math.abs(relErr) <= tol,
      'Scale accuracy',
      `Your scale differs from the instrument's true scale by ${(relErr * 100).toFixed(2)} % (tolerance ±${(tol * 100).toFixed(2)} %).` +
        (Math.abs(relErr) > tol ? ' Check the number of divisions you entered and that both picks sit on line centres.' : ''),
    ),
    item(
      cal.distancePx >= RECOMMENDED_CALIBRATION_SPAN_PX ? true : cal.distancePx >= RECOMMENDED_CALIBRATION_SPAN_PX / 2 ? 'partial' : false,
      'Reference span',
      `You used ${cal.distancePx.toFixed(0)} px of scale. Spans above ${RECOMMENDED_CALIBRATION_SPAN_PX} px reduce the pick contribution to u(s)/s.`,
    ),
    item(
      cal.status === 'verified',
      'Independent verification',
      cal.status === 'verified'
        ? 'Calibration verified against a second interval (E_n ≤ 1).'
        : 'Verify the calibration on a second, independent micrometer interval before measuring.',
    ),
  ];
  return total(items);
}

/* ----------------------------------------------------------- flank wear */

export interface FlankAnswer {
  summary: WearSummary;
  regularity: 'regular' | 'irregular' | null;
  toolLifeReached: 'yes' | 'no' | null;
}

export function expectedRegularity(specimen: SpecimenDef): 'regular' | 'irregular' {
  if (specimen.geometry.kind !== 'insert-flank') return 'regular';
  const r = referenceWear(specimen.geometry, specimen.seed);
  return r.vbBMeanUm > 0 && r.vbBMaxUm / r.vbBMeanUm > 1.4 ? 'irregular' : 'regular';
}

export function gradeFlank(answer: FlankAnswer, specimen: SpecimenDef): GradeResult {
  if (specimen.geometry.kind !== 'insert-flank') throw new Error('Flank grading needs a flank-view specimen.');
  const ref = referenceWear(specimen.geometry, specimen.seed);
  const s = answer.summary;
  const items: FeedbackItem[] = [];
  items.push(
    item(
      s.n >= 8 ? true : s.n >= 5 ? 'partial' : false,
      'Sampling of zone B',
      `${s.n} readings in zone B. Spread at least 8 readings along zone B, avoiding zone C (corner) and zone N (notch).`,
    ),
  );
  const k = s.coverageFactor;
  if (s.vbMeanUm !== null) {
    const tol = Math.max(15, 0.06 * ref.vbBMeanUm, k * (s.uMeanUm ?? 0));
    const err = s.vbMeanUm - ref.vbBMeanUm;
    items.push(item(Math.abs(err) <= tol ? true : Math.abs(err) <= 2 * tol ? 'partial' : false, 'VB_B (average)', `Design value ${ref.vbBMeanUm.toFixed(0)} µm; yours ${s.vbMeanUm.toFixed(0)} µm (difference ${err.toFixed(0)} µm, tolerance ±${tol.toFixed(0)} µm).`));
  } else items.push(item(false, 'VB_B (average)', 'No zone-B readings yet.'));
  if (s.vbMaxUm !== null) {
    const tol = Math.max(25, 0.05 * ref.vbBMaxUm, k * (s.uMaxUm ?? 0));
    const err = s.vbMaxUm - ref.vbBMaxUm;
    items.push(
      item(
        Math.abs(err) <= tol ? true : Math.abs(err) <= 2 * tol ? 'partial' : false,
        'VB_B max',
        `Design value ${ref.vbBMaxUm.toFixed(0)} µm; yours ${s.vbMaxUm.toFixed(0)} µm. ` +
          (err < -tol ? 'You probably missed the widest part of the land: scan the whole of zone B and place a reading at the deepest point.' : ''),
      ),
    );
  } else items.push(item(false, 'VB_B max', 'No zone-B readings yet.'));
  const reg = expectedRegularity(specimen);
  items.push(
    item(
      answer.regularity === reg,
      'Regularity judgement',
      reg === 'irregular'
        ? 'Zone B is irregularly worn (a local peak well above the mean): ISO 3685 uses VB_B max = 0.6 mm as the criterion.'
        : 'Zone B is regularly worn: ISO 3685 uses the average VB_B = 0.3 mm as the criterion.',
    ),
  );
  const reached = reg === 'irregular' ? ref.vbBMaxUm >= VB_B_MAX_LIMIT_UM : ref.vbBMeanUm >= VB_B_LIMIT_UM;
  items.push(
    item(
      answer.toolLifeReached === (reached ? 'yes' : 'no'),
      'Tool-life decision',
      `With the governing criterion (${reg === 'irregular' ? 'VB_B max = 600 µm' : 'VB_B = 300 µm'}), the tool-life criterion is ${reached ? '' : 'not '}reached.`,
    ),
  );
  return total(items);
}

/* ------------------------------------------------------ wear-mode quiz */

export function gradeWearModes(answers: Record<string, WearMode[]>, specimens: SpecimenDef[]): GradeResult {
  const items = specimens.map((sp) => {
    const expected = new Set(sp.wearModes);
    const given = new Set(answers[sp.id] ?? []);
    const correct = expected.size === given.size && [...expected].every((m) => given.has(m));
    const missing = [...expected].filter((m) => !given.has(m));
    const extra = [...given].filter((m) => !expected.has(m));
    const detail = correct
      ? `Correct: ${[...expected].join(', ')}.`
      : `Expected ${[...expected].join(', ')}.` + (missing.length ? ` Missed: ${missing.join(', ')}.` : '') + (extra.length ? ` Not present: ${extra.join(', ')}.` : '');
    return item(correct ? true : missing.length + extra.length === 1 && given.size > 0 ? 'partial' : false, `${sp.id} ${sp.title}`, detail);
  });
  return total(items);
}

/* -------------------------------------------------------- crater task */

export function gradeCrater(kbUm: number | null, kfUm: number | null, specimen: SpecimenDef): GradeResult {
  if (specimen.geometry.kind !== 'insert-rake') throw new Error('Crater grading needs a rake-view specimen.');
  const c = specimen.geometry.crater;
  const one = (v: number | null, ref: number, name: string): FeedbackItem => {
    if (v === null) return item(false, name, `No ${name} measurement yet.`);
    const tol = Math.max(20, 0.06 * ref);
    const err = v - ref;
    return item(Math.abs(err) <= tol ? true : Math.abs(err) <= 2 * tol ? 'partial' : false, name, `Design value ${ref.toFixed(0)} µm; yours ${v.toFixed(0)} µm (tolerance ±${tol.toFixed(0)} µm). Measure perpendicular to the original cutting edge.`);
  };
  return total([one(kbUm, c.kbUm, 'KB (crater width)'), one(kfUm, c.kfUm, 'KF (crater front distance)')]);
}

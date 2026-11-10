import { describe, expect, it } from 'vitest';
import { getSpecimen } from '@/data/specimens';
import type { AppState } from '@/state/store';
import { PHASES, TOUR, brokenStep, inFocus, nextOpenStep, workflowStatus } from './tour';

/** Minimal app state as a brand-new student sees it. */
function fresh(over: Partial<AppState> = {}): AppState {
  const mic = getSpecimen('MIC-01');
  return {
    microscope: {
      specimenId: 'MIC-01',
      objectiveId: '2x',
      stage: { ...mic.homeStage },
      focusZUm: mic.surfaceZUm + 900,
      illumination: { mode: 'coaxial', intensity: 0.7 },
      camera: { brightness: 0, contrast: 1, exposure: 1 },
    },
    workspace: 'live',
    frames: [],
    activeFrameId: null,
    sessions: {},
    calibrations: {},
    tool: 'pan',
    pendingPoint: null,
    pendingPair: null,
    liveQuality: null,
    showZones: false,
    panelTab: 'measure',
    exported: false,
    ...over,
  } as unknown as AppState;
}

describe('guided tour definition', () => {
  it('has unique step ids and phases in workflow order', () => {
    expect(new Set(TOUR.map((s) => s.id)).size).toBe(TOUR.length);
    const order = TOUR.map((s) => PHASES.indexOf(s.phase));
    expect(order.every((p, i) => i === 0 || p >= order[i - 1]!)).toBe(true);
    expect(order.at(-1)).toBe(PHASES.length - 1);
  });

  it('every step resolves to a concrete instruction for a new student', () => {
    const s = fresh();
    for (const step of TOUR) {
      const v = step.view(s);
      expect(v.title.length, step.id).toBeGreaterThan(3);
      expect(v.body.length, step.id).toBeGreaterThan(10);
      if (v.action !== 'look') expect(Boolean(v.target) || Boolean(v.point), step.id).toBe(true);
      if (v.action === 'choose' || v.action === 'type') expect(v.value, step.id).toBeTruthy();
    }
  });

  it('skips steps that are already done but never skips information steps', () => {
    const s = fresh();
    // MIC-01 is loaded by default, so after the three overview steps the tour goes to the objective.
    expect(TOUR[nextOpenStep(s, 0)]!.id).toBe('intro-controls');
    expect(TOUR[nextOpenStep(s, 3)]!.id).toBe('objective');
    const at5x = fresh({ microscope: { ...fresh().microscope, objectiveId: '5x' } });
    expect(TOUR[nextOpenStep(at5x, 3)]!.id).toBe('focus-mic');
  });

  it('points at the correct focus button and switches from coarse to fine', () => {
    const base = fresh().microscope;
    const mic = getSpecimen('MIC-01');
    const focus = TOUR.find((t) => t.id === 'focus-mic')!;
    const at = (dz: number) => focus.view(fresh({ microscope: { ...base, objectiveId: '5x', focusZUm: mic.surfaceZUm + dz } }));
    expect(at(900).target).toContain('focus-coarse-down');
    expect(at(-400).target).toContain('focus-coarse-up');
    expect(at(40).target).toContain('focus-fine-down');
    expect(at(-30).target).toContain('focus-fine-up');
    expect(inFocus(fresh({ microscope: { ...base, objectiveId: '5x', focusZUm: mic.surfaceZUm + 10 } }))).toBe(true);
    expect(inFocus(fresh({ microscope: { ...base, objectiveId: '5x', focusZUm: mic.surfaceZUm + 40 } }))).toBe(false);
  });

  it('returns to a sticky step whose result has disappeared', () => {
    const idx = TOUR.findIndex((t) => t.id === 'cal-enter');
    expect(TOUR[brokenStep(fresh(), idx)]!.id).toBe('capture-mic');
    expect(brokenStep(fresh(), 3)).toBe(-1);
  });

  it('workflow strip starts with nothing done and names the next action', () => {
    const st = workflowStatus(fresh());
    expect(st.map((x) => x.done)).toEqual([false, false, false, false, false]);
    expect(st[0]!.hint).toContain('MIC-01');
  });
});

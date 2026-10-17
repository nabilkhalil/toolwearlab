import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { calibrationKey } from '@/core/calibration';
import { OBJECTIVES } from '@/core/optics';
import type {
  CalibrationRecord,
  CapturedFrame,
  EdgeReference,
  ImageQualityReport,
  MeasurementSession,
  MicroscopeState,
  ObjectiveId,
  RawLine,
  Vec2,
  WearMode,
} from '@/core/types';
import { getSpecimen } from '@/data/specimens';
import { uid } from '@/lib/utils';

export type Tool = 'pan' | 'edge' | 'vb' | 'distance' | 'crater-kb' | 'crater-kf' | 'calibrate' | 'verify';
export type Workspace = 'live' | 'frame';

export interface AssessmentState {
  flank: { regularity: 'regular' | 'irregular' | null; toolLifeReached: 'yes' | 'no' | null; submitted: boolean };
  modes: { answers: Record<string, WearMode[]>; submitted: boolean };
  crater: { submitted: boolean };
  calibration: { submitted: boolean };
}

export interface AppState {
  microscope: MicroscopeState;
  workspace: Workspace;
  liveDigitalZoom: 1 | 2 | 4;
  showCrosshair: boolean;
  showZones: boolean;
  snapToLines: boolean;
  frames: CapturedFrame[];
  activeFrameId: string | null;
  sessions: Record<string, MeasurementSession>;
  /** Keyed by objective id, or `imported:<frameId>` for imported micrographs. */
  calibrations: Record<string, CalibrationRecord>;
  tool: Tool;
  /** First click of a two-click tool, in image px. */
  pendingPoint: Vec2 | null;
  /** Completed two-point pick awaiting confirmation (calibration / verification). */
  pendingPair: { tool: 'calibrate' | 'verify'; a: Vec2; b: Vec2 } | null;
  liveQuality: ImageQualityReport | null;
  student: { name: string; id: string };
  tutorial: { lessonId: string | null; dismissed: Record<string, boolean> };
  assessment: AssessmentState;
  /** Best sharpness seen per specimen+objective, drives the focus-peaking bar. */
  peakSharpness: Record<string, number>;

  setMicroscope: (patch: Partial<MicroscopeState>) => void;
  moveStage: (dxUm: number, dyUm: number) => void;
  setStage: (patch: Partial<MicroscopeState['stage']>) => void;
  focusBy: (dzUm: number) => void;
  setObjective: (id: ObjectiveId) => void;
  loadSpecimen: (id: string) => void;
  setWorkspace: (w: Workspace) => void;
  setLiveDigitalZoom: (z: 1 | 2 | 4) => void;
  toggle: (key: 'showCrosshair' | 'showZones' | 'snapToLines') => void;
  setLiveQuality: (q: ImageQualityReport) => void;
  addFrame: (f: CapturedFrame) => void;
  removeFrame: (id: string) => void;
  setActiveFrame: (id: string | null) => void;
  setTool: (t: Tool) => void;
  setPendingPoint: (p: Vec2 | null) => void;
  setPendingPair: (p: AppState['pendingPair']) => void;
  setEdge: (frameId: string, edge: EdgeReference | null) => void;
  addPoint: (frameId: string, p: Vec2) => void;
  movePoint: (frameId: string, pointId: string, p: Vec2) => void;
  removePoint: (frameId: string, pointId: string) => void;
  addLine: (frameId: string, line: Omit<RawLine, 'id'>) => void;
  removeLine: (frameId: string, lineId: string) => void;
  clearSession: (frameId: string) => void;
  setCalibration: (key: string, cal: CalibrationRecord | null) => void;
  setStudent: (s: Partial<AppState['student']>) => void;
  setTutorial: (lessonId: string | null) => void;
  setAssessment: (patch: Partial<AssessmentState>) => void;
  notePeakSharpness: (key: string, value: number) => void;
  resetAll: () => void;
}

const FOCUS_MIN_UM = 0;
const FOCUS_MAX_UM = 12000;

function initialMicroscope(): MicroscopeState {
  const sp = getSpecimen('MIC-01');
  return {
    specimenId: sp.id,
    objectiveId: '2x',
    stage: { ...sp.homeStage },
    // Deliberately out of focus: students must find focus.
    focusZUm: sp.surfaceZUm + 900,
    illumination: { mode: 'coaxial', intensity: 0.7 },
    camera: { brightness: 0, contrast: 1, exposure: 1 },
  };
}

const initialAssessment: AssessmentState = {
  flank: { regularity: null, toolLifeReached: null, submitted: false },
  modes: { answers: {}, submitted: false },
  crater: { submitted: false },
  calibration: { submitted: false },
};

function sessionFor(state: AppState, frameId: string): MeasurementSession {
  return state.sessions[frameId] ?? { id: uid('ses'), createdAt: new Date().toISOString(), frameId, edge: null, points: [], lines: [] };
}

/** localStorage wrapper that never throws (private mode, quota exceeded, blocked storage). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota or privacy mode: practice data stays in memory for this tab */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      microscope: initialMicroscope(),
      workspace: 'live',
      liveDigitalZoom: 1,
      showCrosshair: true,
      showZones: false,
      snapToLines: true,
      frames: [],
      activeFrameId: null,
      sessions: {},
      calibrations: {},
      tool: 'pan',
      pendingPoint: null,
      pendingPair: null,
      liveQuality: null,
      student: { name: '', id: '' },
      tutorial: { lessonId: null, dismissed: {} },
      assessment: initialAssessment,
      peakSharpness: {},

      setMicroscope: (patch) => set((s) => ({ microscope: { ...s.microscope, ...patch } })),
      moveStage: (dx, dy) =>
        set((s) => ({
          microscope: {
            ...s.microscope,
            stage: {
              ...s.microscope.stage,
              xUm: Math.max(-3000, Math.min(12000, s.microscope.stage.xUm + dx)),
              yUm: Math.max(-3000, Math.min(8000, s.microscope.stage.yUm + dy)),
            },
          },
        })),
      setStage: (patch) => set((s) => ({ microscope: { ...s.microscope, stage: { ...s.microscope.stage, ...patch } } })),
      focusBy: (dz) =>
        set((s) => ({ microscope: { ...s.microscope, focusZUm: Math.max(FOCUS_MIN_UM, Math.min(FOCUS_MAX_UM, s.microscope.focusZUm + dz)) } })),
      setObjective: (id) => {
        if (!OBJECTIVES[id]) return;
        // Parfocal objectives: focus is retained when the turret rotates.
        set((s) => ({ microscope: { ...s.microscope, objectiveId: id } }));
      },
      loadSpecimen: (id) => {
        const sp = getSpecimen(id);
        set((s) => ({
          microscope: {
            ...s.microscope,
            specimenId: id,
            stage: { ...sp.homeStage },
            // A new specimen sits at a different height: focus is lost.
            focusZUm: s.microscope.focusZUm,
          },
          workspace: 'live',
        }));
      },
      setWorkspace: (w) => set({ workspace: w, pendingPoint: null }),
      setLiveDigitalZoom: (z) => set({ liveDigitalZoom: z }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<AppState>),
      setLiveQuality: (q) => set({ liveQuality: q }),
      addFrame: (f) => set((s) => ({ frames: [...s.frames, f], activeFrameId: f.id, workspace: 'frame', tool: 'pan', pendingPoint: null })),
      removeFrame: (id) =>
        set((s) => {
          const sessions = { ...s.sessions };
          delete sessions[id];
          const calibrations = { ...s.calibrations };
          delete calibrations[`imported:${id}`];
          const frames = s.frames.filter((f) => f.id !== id);
          return { frames, sessions, calibrations, activeFrameId: s.activeFrameId === id ? (frames.at(-1)?.id ?? null) : s.activeFrameId };
        }),
      setActiveFrame: (id) => set({ activeFrameId: id, workspace: id ? 'frame' : 'live', pendingPoint: null, pendingPair: null }),
      setTool: (t) => set({ tool: t, pendingPoint: null }),
      setPendingPoint: (p) => set({ pendingPoint: p }),
      setPendingPair: (p) => set({ pendingPair: p }),
      setEdge: (frameId, edge) => set((s) => ({ sessions: { ...s.sessions, [frameId]: { ...sessionFor(s, frameId), edge } } })),
      addPoint: (frameId, p) =>
        set((s) => {
          const ses = sessionFor(s, frameId);
          return { sessions: { ...s.sessions, [frameId]: { ...ses, points: [...ses.points, { id: uid('pt'), p }] } } };
        }),
      movePoint: (frameId, pointId, p) =>
        set((s) => {
          const ses = sessionFor(s, frameId);
          return { sessions: { ...s.sessions, [frameId]: { ...ses, points: ses.points.map((x) => (x.id === pointId ? { ...x, p } : x)) } } };
        }),
      removePoint: (frameId, pointId) =>
        set((s) => {
          const ses = sessionFor(s, frameId);
          return { sessions: { ...s.sessions, [frameId]: { ...ses, points: ses.points.filter((x) => x.id !== pointId) } } };
        }),
      addLine: (frameId, line) =>
        set((s) => {
          const ses = sessionFor(s, frameId);
          return { sessions: { ...s.sessions, [frameId]: { ...ses, lines: [...ses.lines, { ...line, id: uid('ln') }] } } };
        }),
      removeLine: (frameId, lineId) =>
        set((s) => {
          const ses = sessionFor(s, frameId);
          return { sessions: { ...s.sessions, [frameId]: { ...ses, lines: ses.lines.filter((x) => x.id !== lineId) } } };
        }),
      clearSession: (frameId) =>
        set((s) => {
          const sessions = { ...s.sessions };
          delete sessions[frameId];
          return { sessions };
        }),
      setCalibration: (key, cal) =>
        set((s) => {
          const calibrations = { ...s.calibrations };
          if (cal) calibrations[key] = cal;
          else delete calibrations[key];
          return { calibrations, pendingPair: null };
        }),
      setStudent: (st) => set((s) => ({ student: { ...s.student, ...st } })),
      setTutorial: (lessonId) => set((s) => ({ tutorial: { ...s.tutorial, lessonId } })),
      setAssessment: (patch) => set((s) => ({ assessment: { ...s.assessment, ...patch } })),
      notePeakSharpness: (key, value) =>
        set((s) => ((s.peakSharpness[key] ?? 0) >= value ? s : { peakSharpness: { ...s.peakSharpness, [key]: value } })),
      resetAll: () =>
        set({
          microscope: initialMicroscope(),
          workspace: 'live',
          frames: [],
          activeFrameId: null,
          sessions: {},
          calibrations: {},
          tool: 'pan',
          pendingPoint: null,
          pendingPair: null,
          assessment: initialAssessment,
          peakSharpness: {},
          tutorial: { lessonId: null, dismissed: {} },
        }),
    }),
    {
      name: 'toolwearlab:v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        microscope: s.microscope,
        liveDigitalZoom: s.liveDigitalZoom,
        showCrosshair: s.showCrosshair,
        showZones: s.showZones,
        snapToLines: s.snapToLines,
        frames: s.frames,
        activeFrameId: s.activeFrameId,
        sessions: s.sessions,
        calibrations: s.calibrations,
        student: s.student,
        tutorial: s.tutorial,
        assessment: s.assessment,
      }),
    },
  ),
);

/* ---------------------------------------------------------------- selectors */

export function useActiveFrame(): CapturedFrame | null {
  return useApp((s) => s.frames.find((f) => f.id === s.activeFrameId) ?? null);
}

export function calibrationForFrame(state: Pick<AppState, 'calibrations'>, frame: CapturedFrame | null): CalibrationRecord | null {
  if (!frame) return null;
  return state.calibrations[calibrationKey(frame)] ?? null;
}

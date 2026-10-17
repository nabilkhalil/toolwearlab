import { getSpecimen } from '@/data/specimens';
import type { AppState } from '@/state/store';

/**
 * Guided lessons. Each step can carry a `check` predicate on the app state so
 * progress is detected from what the student actually does, not from
 * "next" clicks.
 */
export interface LessonStep {
  id: string;
  title: string;
  body: string;
  check?: (s: AppState) => boolean;
}

export interface Lesson {
  id: string;
  title: string;
  outcome: string;
  minutes: number;
  steps: LessonStep[];
}

const frames = (s: AppState, specimenId: string, objectiveId?: string) =>
  s.frames.filter((f) => f.specimenId === specimenId && (!objectiveId || f.microscope.objectiveId === objectiveId));

const activeSession = (s: AppState) => (s.activeFrameId ? s.sessions[s.activeFrameId] : undefined);

export const LESSONS: Lesson[] = [
  {
    id: 'setup',
    title: '1 · Set up the microscope',
    outcome: 'Position, focus and illuminate a specimen so that the image is fit for measurement.',
    minutes: 10,
    steps: [
      { id: 'load', title: 'Load the stage micrometer', body: 'Choose MIC-01 in the specimen holder. A stage micrometer is a certified scale used to calibrate the image.', check: (s) => s.microscope.specimenId === 'MIC-01' },
      { id: 'obj', title: 'Select the 5× objective', body: 'Rotate the turret to 5×. Higher magnification gives finer sampling but a smaller field and shallower depth of field.', check: (s) => s.microscope.objectiveId === '5x' },
      {
        id: 'focus',
        title: 'Find focus: coarse, then fine',
        body: 'Use coarse focus (100 µm steps) until the graduations appear, then fine focus (2 µm) to maximise sharpness. The focus window is ±half the depth of field shown in the objective panel.',
        check: (s) => s.microscope.specimenId === 'MIC-01' && Boolean(s.liveQuality?.focusOk),
      },
      {
        id: 'light',
        title: 'Set illumination and exposure',
        body: 'Adjust lamp intensity and exposure so the histogram does not clip at either end (red = saturated, blue = black). Clipped pixels destroy edge information.',
        check: (s) => Boolean(s.liveQuality?.exposureOk),
      },
      {
        id: 'align',
        title: 'Align the scale with the image axes',
        body: 'The micrometer sits slightly rotated in its holder. Rotate the specimen until the graduations are vertical (within about 0.3°). Alignment is not needed for accuracy (the software measures true distances) but makes picking easier.',
        check: (s) => s.microscope.specimenId === 'MIC-01' && Math.abs(s.microscope.stage.rotationDeg + getSpecimen('MIC-01').loadRotationDeg) < 0.3,
      },
      { id: 'capture', title: 'Capture a frame', body: 'Press Capture. The frame is accepted only if focus and exposure meet the quality limits.', check: (s) => frames(s, 'MIC-01', '5x').length > 0 },
    ],
  },
  {
    id: 'calibrate',
    title: '2 · Calibrate with the stage micrometer',
    outcome: 'Establish µm/px for an objective with a stated uncertainty and verify it independently.',
    minutes: 10,
    steps: [
      { id: 'open', title: 'Open the micrometer frame', body: 'Select the MIC-01 frame you captured at 5×.', check: (s) => s.frames.find((f) => f.id === s.activeFrameId)?.specimenId === 'MIC-01' },
      {
        id: 'pick',
        title: 'Pick two graduations far apart',
        body: 'Use the Calibrate tool. Click the centre of one graduation line, then another as far away as the field allows (aim for > 600 px). Snap places each pick on the line centre. Count the 0.01 mm divisions between them and enter the number.',
        check: (s) => Boolean(s.calibrations['5x']),
      },
      {
        id: 'verify',
        title: 'Verify on an independent interval',
        body: 'Use Verify on a different pair of graduations. The calibration passes when |error| ≤ U (k = 2), i.e. E_n ≤ 1.',
        check: (s) => s.calibrations['5x']?.status === 'verified',
      },
      {
        id: 'why',
        title: 'Understand the uncertainty',
        body: 'u(s)/s = √[(u_ref/L)² + (√2·u_pick/d)²]. Doubling the span d halves the pick term. Digital zoom never changes µm/px; a different objective always does.',
      },
    ],
  },
  {
    id: 'flank',
    title: '3 · Measure flank wear (ISO 3685)',
    outcome: 'Measure VB_B and VB_B max perpendicular to the original cutting edge and apply the tool-life criterion.',
    minutes: 20,
    steps: [
      { id: 'cap', title: 'Capture the worn insert', body: 'Load FW-01, keep the 5× objective (it is calibrated), refocus (the insert is at a different height), check exposure and capture.', check: (s) => frames(s, 'FW-01', '5x').length > 0 },
      {
        id: 'zones',
        title: 'Identify zones C, B and N',
        body: 'Turn on Zones. Zone C is the curved corner (r_ε), zone N lies beyond the depth-of-cut line, zone B is the straight part between them. VB_B is evaluated in zone B only.',
        check: (s) => s.showZones,
      },
      {
        id: 'edge',
        title: 'Reference the original cutting edge',
        body: 'With Edge ref., click two points on the original cutting edge (the top boundary of the flank face), far apart. VB is measured perpendicular to this line, so a tilted insert does not bias the result.',
        check: (s) => Boolean(activeSession(s)?.edge),
      },
      {
        id: 'points',
        title: 'Take readings along zone B',
        body: 'With VB point, click the lower boundary of the bright wear land at 8 or more positions spread along zone B, including the widest point. Zoom in (mouse wheel) for precise picks: zoom does not change the stored coordinates.',
        check: (s) => (activeSession(s)?.points.length ?? 0) >= 8,
      },
      {
        id: 'review',
        title: 'Review and report',
        body: 'Open Results: compare VB_B with 0.3 mm (regular wear) or VB_B max with 0.6 mm (irregular wear). If the limit lies within ±U the decision is indeterminate. Export CSV/PDF.',
      },
    ],
  },
  {
    id: 'modes',
    title: '4 · Distinguish flank, crater and notch wear',
    outcome: 'Recognise wear modes by location and appearance, and choose the right view and illumination.',
    minutes: 10,
    steps: [
      { id: 'new', title: 'Look at an unworn edge', body: 'Load FW-00. Note the uniform ground flank and the sharp original edge: this is the reference for every wear measurement.', check: (s) => s.microscope.specimenId === 'FW-00' },
      {
        id: 'notch',
        title: 'Find notch wear at the depth-of-cut line',
        body: 'Load NW-01 and move along the edge to x ≈ 1.6 mm. Notch wear is a local deep groove in zone N, often with adhered workpiece material. It is reported as VB_N, not in VB_B.',
        check: (s) => s.microscope.specimenId === 'NW-01' && s.microscope.stage.xUm > 1300 && s.microscope.stage.xUm < 2100,
      },
      {
        id: 'crater',
        title: 'Inspect crater wear on the rake face',
        body: 'Load CR-01 (rake-face view) and switch between coaxial and ring light. The crater lies behind the edge; ring light shows its sloped walls. KB and KF can be measured in the image; depth KT needs a 3D method (focus variation or profilometry).',
        check: (s) => s.microscope.specimenId === 'CR-01' && s.microscope.illumination.mode === 'ring',
      },
    ],
  },
];

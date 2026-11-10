import { OBJECTIVES, depthOfFieldUm, imageToWorld, worldToImage } from '@/core/optics';
import { flankWearAt, zoneAt } from '@/core/wearProfile';
import type { CapturedFrame, Vec2 } from '@/core/types';
import { getSpecimen } from '@/data/specimens';
import type { AppState } from '@/state/store';

/**
 * Interactive tour ("Show me where to click").
 *
 * Every step resolves, from the live app state, to ONE concrete action:
 * a control to click (CSS selector), or a point on the captured image.
 * The overlay highlights it with a ring and an animated mouse pointer and
 * moves on by itself when the student has actually done it.
 *
 * The tour is a training aid on the practice specimens (MIC-01, FW-01 at
 * 5×). It uses the simulator's design geometry to place its markers, which
 * is why the graded activity uses a different specimen (FW-02).
 */
export type CoachAction = 'click' | 'hold' | 'type' | 'choose' | 'look';

export interface CoachView {
  title: string;
  body: string;
  action: CoachAction;
  /** Short instruction shown next to the highlighted control, e.g. "Type 100". */
  chip?: string;
  /** CSS selector of the control to highlight. */
  target?: string;
  /** Point on the captured image (image px) to click. */
  point?: Vec2;
  /** Value to type or option value to choose. */
  value?: string;
  /** Preferred card position relative to the target. */
  place?: 'above' | 'below' | 'panel';
}

export interface CoachStep {
  id: string;
  phase: Phase;
  /** Info steps wait for the Next button. */
  info?: boolean;
  /** Detected from the app state: the step is complete when this is true. */
  done?: (s: AppState) => boolean;
  /** If a completed sticky step becomes undone (e.g. a frame is deleted) the tour returns to it. */
  sticky?: boolean;
  view: (s: AppState) => CoachView;
}

export const PHASES = ['Set up', 'Calibrate', 'Capture insert', 'Measure VB', 'Report'] as const;
export type Phase = (typeof PHASES)[number];

const OBJ = '5x' as const;
const MIC_ID = 'MIC-01';
const INSERT_ID = 'FW-01';
export const TOUR_VB_POINTS = 8;
const GUIDED_VB_POINTS = 3;

export const T = (name: string): string => `[data-coach="${name}"]`;

/* ------------------------------------------------------------- state helpers */

const lastFrame = (s: AppState, specimenId: string): CapturedFrame | null =>
  s.frames.filter((f) => f.source === 'simulated' && f.specimenId === specimenId && f.microscope.objectiveId === OBJ).at(-1) ?? null;
const micFrame = (s: AppState) => lastFrame(s, MIC_ID);
const insertFrame = (s: AppState) => lastFrame(s, INSERT_ID);
const cal = (s: AppState) => s.calibrations[OBJ] ?? null;
const calGood = (s: AppState) => Boolean(cal(s)) && cal(s)!.status !== 'invalid';
const insertSession = (s: AppState) => {
  const f = insertFrame(s);
  return f ? (s.sessions[f.id] ?? null) : null;
};

function defocusUm(s: AppState): number {
  return s.microscope.focusZUm - getSpecimen(s.microscope.specimenId).surfaceZUm;
}
export function inFocus(s: AppState): boolean {
  return Math.abs(defocusUm(s)) <= depthOfFieldUm(OBJECTIVES[s.microscope.objectiveId]) / 2;
}
function totalRotation(s: AppState): number {
  return s.microscope.stage.rotationDeg + getSpecimen(s.microscope.specimenId).loadRotationDeg;
}

function inImage(p: Vec2, f: CapturedFrame, mx = 0.05, my = 0.04): boolean {
  return p.x > f.widthPx * mx && p.x < f.widthPx * (1 - mx) && p.y > f.heightPx * my && p.y < f.heightPx * (1 - my);
}

/* -------------------------------------------------------- shared sub-views */

function toLive(s: AppState): CoachView | null {
  if (s.workspace === 'live') return null;
  return { title: 'Go back to the live camera', body: 'The microscope controls act on the live view.', action: 'click', chip: 'Click', target: T('ws-live'), place: 'below' };
}

function toObjective(s: AppState): CoachView | null {
  if (s.microscope.objectiveId === OBJ) return null;
  return {
    title: 'Select the 5× objective',
    body: 'This tour measures at 5×. Each objective has its own scale, so stay on the one you calibrate.',
    action: 'click',
    chip: 'Click 5×',
    target: T('objective-5x'),
    place: 'below',
  };
}

function toFrame(s: AppState, frame: CapturedFrame | null): CoachView | null {
  if (!frame || (s.workspace === 'frame' && s.activeFrameId === frame.id)) return null;
  return {
    title: 'Open the captured frame',
    body: `Measurements are made on a frozen frame, not on the live camera. Choose “${frame.label}” in the frame list.`,
    action: 'choose',
    chip: `Choose ${frame.label}`,
    value: frame.id,
    target: T('frame-select'),
    place: 'below',
  };
}

function toTab(s: AppState, tab: AppState['panelTab'], why: string): CoachView | null {
  if (s.panelTab === tab) return null;
  const name = tab.charAt(0).toUpperCase() + tab.slice(1);
  return { title: `Open the ${name} tab`, body: why, action: 'click', chip: 'Click', target: T(`tab-${tab}`), place: 'below' };
}

function focusView(s: AppState): CoachView {
  const dz = defocusUm(s);
  const coarse = Math.abs(dz) > 50;
  const down = dz > 0;
  const arrow = down ? '▼' : '▲';
  if (coarse) {
    const n = Math.max(1, Math.round(Math.abs(dz) / 100));
    return {
      title: 'Find focus: coarse first',
      body: `The image is blurred because the lens is too ${down ? 'high' : 'low'}. Press and hold the coarse ${arrow} button (about ${n} step${n > 1 ? 's' : ''}) until the detail starts to appear. Watch the picture while you hold.`,
      action: 'hold',
      chip: `Press and hold ${arrow}`,
      target: T(down ? 'focus-coarse-down' : 'focus-coarse-up'),
      place: 'above',
    };
  }
  return {
    title: 'Now sharpen with fine focus',
    body: `Almost there. Click the fine ${arrow} button until the badge on the picture turns green and says “In focus”. The sharpness bar should be near 100 %.`,
    action: 'hold',
    chip: `Click fine ${arrow}`,
    target: T(down ? 'focus-fine-down' : 'focus-fine-up'),
    place: 'above',
  };
}

/** Numbered graduations (every 0.1 mm) that are visible in a micrometer frame. */
function visibleTicks(f: CapturedFrame): number[] {
  const mic = getSpecimen(MIC_ID);
  const out: number[] = [];
  for (let k = 0; k <= 10; k++) if (inImage(worldToImage({ x: k * 100, y: 30 }, f.microscope, mic), f, 0.02, 0.02)) out.push(k);
  return out;
}

function tickPoint(f: CapturedFrame, k: number): Vec2 {
  return worldToImage({ x: k * 100, y: 30 }, f.microscope, getSpecimen(MIC_ID));
}

/** Calibration and verification share one flow; the view follows the actual app state. */
function calFlow(s: AppState): CoachView {
  const f = micFrame(s);
  const pre = toFrame(s, f) ?? toTab(s, 'calibrate', 'The Calibrate tab holds the calibration form and the register of all objectives.');
  if (pre) return pre;
  const c = cal(s);
  const mode: 'calibrate' | 'verify' = c && c.status !== 'invalid' ? 'verify' : 'calibrate';
  const ticks = f ? visibleTicks(f) : [];
  const lo = ticks[0];
  const hi = ticks.at(-1);
  const usable = f && lo !== undefined && hi !== undefined && hi - lo >= 5;
  const [ka, kb] = usable ? (mode === 'calibrate' ? [lo, hi] : [lo + 2, hi - 3]) : [null, null];
  const failed = c?.status === 'invalid' ? 'The last check failed, so calibrate again. ' : '';

  if (s.pendingPair && f) {
    const mic = getSpecimen(MIC_ID);
    const n = Math.abs(Math.round(imageToWorld(s.pendingPair.b, f.microscope, mic).x / 10) - Math.round(imageToWorld(s.pendingPair.a, f.microscope, mic).x / 10));
    const typed = typeof document !== 'undefined' ? ((document.querySelector(T('cal-divisions')) as HTMLInputElement | null)?.value ?? '') : '';
    const what = s.pendingPair.tool === 'calibrate' ? 'Create calibration' : 'Verify';
    if (typed.trim() !== String(n))
      return {
        title: 'Count the divisions',
        body: `Each small division is 0.01 mm, and each numbered line is 10 divisions. Between the two lines you clicked there are ${n} divisions (${(n / 100).toFixed(2)} mm). Type ${n}.`,
        action: 'type',
        chip: `Type ${n}`,
        value: String(n),
        target: T('cal-divisions'),
        place: 'above',
      };
    return {
      title: s.pendingPair.tool === 'calibrate' ? 'Create the calibration' : 'Run the check',
      body:
        s.pendingPair.tool === 'calibrate'
          ? 'The app divides the known length by the pixel distance to get µm per pixel, with its uncertainty.'
          : 'The app measures this second interval with your scale and compares it with the true length.',
      action: 'click',
      chip: `Click ${what}`,
      target: T('cal-submit'),
      place: 'below',
    };
  }
  if (s.tool !== mode)
    return mode === 'calibrate'
      ? {
          title: 'Start the calibration',
          body: `${failed}You will tell the software how many micrometres one pixel represents, using the known spacing of the micrometer lines.`,
          action: 'click',
          chip: 'Click',
          target: T('start-calibrate'),
          place: 'below',
        }
      : {
          title: 'Verify on a second interval',
          body: 'A good metrologist never trusts a calibration without an independent check. Start the Verify tool.',
          action: 'click',
          chip: 'Click',
          target: T('start-verify'),
          place: 'below',
        };
  const second = Boolean(s.pendingPoint);
  const k = second ? kb : ka;
  const purpose = mode === 'calibrate' ? 'Use lines far apart: a long span gives a more accurate scale.' : 'Use a different pair of lines from the calibration.';
  return {
    title: `${mode === 'calibrate' ? 'Calibrate' : 'Verify'}: click the ${second ? 'second' : 'first'} line`,
    body:
      k === null
        ? `Click the centre of a graduation line${second ? ' far from the first' : ''}. ${purpose}`
        : `Click on the line numbered ${k}, where the marker is. Snap puts your click exactly on the line centre. ${second ? '' : purpose}`,
    action: 'click',
    chip: k === null ? 'Click a line' : `Click line ${k}`,
    point: k === null || !f ? undefined : tickPoint(f, k),
    target: k === null ? T('frame-view') : undefined,
    place: 'panel',
  };
}

function edgeHints(f: CapturedFrame): [Vec2, Vec2] | null {
  const sp = getSpecimen(f.specimenId);
  if (sp.geometry.kind !== 'insert-flank') return null;
  const pts: Vec2[] = [];
  for (let x = 50; x <= sp.geometry.edgeLengthUm; x += 25) {
    const p = worldToImage({ x, y: 0 }, f.microscope, sp);
    if (inImage(p, f, 0.08, 0.03)) pts.push(p);
  }
  const a = pts[0];
  const b = pts.at(-1);
  return a && b && Math.hypot(b.x - a.x, b.y - a.y) > 400 ? [a, b] : null;
}

function vbHints(f: CapturedFrame): Vec2[] {
  const sp = getSpecimen(f.specimenId);
  const g = sp.geometry;
  if (g.kind !== 'insert-flank') return [];
  const xs: number[] = [];
  for (let x = 0; x <= g.edgeLengthUm; x += 10) {
    if (zoneAt(x, g) !== 'B' || x < g.noseRadiusUm + 40 || x > g.depthOfCutUm - 40) continue;
    if (inImage(worldToImage({ x, y: flankWearAt(x, g, sp.seed) }, f.microscope, sp), f, 0.07, 0.04)) xs.push(x);
  }
  if (xs.length < TOUR_VB_POINTS) return [];
  const out: Vec2[] = [];
  for (let i = 0; i < TOUR_VB_POINTS; i++) {
    const x = xs[Math.round((i * (xs.length - 1)) / (TOUR_VB_POINTS - 1))]!;
    out.push(worldToImage({ x, y: flankWearAt(x, g, sp.seed) }, f.microscope, sp));
  }
  return out;
}

const MEASURE_TAB_WHY = 'The Measure tab shows a checklist and lists every reading as you click.';

function edgeFlow(s: AppState): CoachView {
  const f = insertFrame(s);
  const pre = toFrame(s, f) ?? toTab(s, 'measure', MEASURE_TAB_WHY);
  if (pre) return pre;
  if (s.tool !== 'edge')
    return {
      title: 'Pick the Edge reference tool',
      body: 'Flank wear VB is measured from the ORIGINAL cutting edge. First you mark where that edge is.',
      action: 'click',
      chip: 'Click',
      target: T('tool-edge'),
      place: 'below',
    };
  const h = f ? edgeHints(f) : null;
  const second = Boolean(s.pendingPoint);
  return {
    title: `Mark the original edge: ${second ? 'second' : 'first'} point`,
    body: second
      ? 'Click a second point on the same edge, far from the first. A long line fixes the edge direction accurately.'
      : 'The original cutting edge is the sharp top boundary of the bright band. Click on it where the marker is.',
    action: 'click',
    chip: second ? 'Click point 2' : 'Click point 1',
    point: h ? h[second ? 1 : 0] : undefined,
    target: h ? undefined : T('frame-view'),
    place: 'panel',
  };
}

function vbFlow(s: AppState): CoachView {
  const f = insertFrame(s);
  const pre = toFrame(s, f) ?? toTab(s, 'measure', MEASURE_TAB_WHY);
  if (pre) return pre;
  if (s.tool !== 'vb')
    return {
      title: 'Pick the VB point tool',
      body: 'Each click on the lower boundary of the wear land gives one VB reading, measured at right angles to your edge line.',
      action: 'click',
      chip: 'Click',
      target: T('tool-vb'),
      place: 'below',
    };
  const n = insertSession(s)?.points.length ?? 0;
  const hints = f ? vbHints(f) : [];
  if (n < GUIDED_VB_POINTS && hints[n])
    return {
      title: `VB reading ${n + 1} of ${TOUR_VB_POINTS}`,
      body: 'Click where the bright wear land ends and the darker coating begins, at the marker. An orange line shows the measured width.',
      action: 'click',
      chip: `Click reading ${n + 1}`,
      point: hints[n],
      place: 'panel',
    };
  return {
    title: `Your turn: ${TOUR_VB_POINTS - n} more reading${TOUR_VB_POINTS - n === 1 ? '' : 's'}`,
    body: `Keep clicking along the lower boundary of the bright band, spread across zone B (between the “C | B” and “B | N” lines). Scroll the mouse wheel to zoom in. Drag a point to correct it. ${n} of ${TOUR_VB_POINTS} done.`,
    action: 'look',
    chip: `${n} / ${TOUR_VB_POINTS}`,
    target: T('frame-view'),
    place: 'panel',
  };
}

/* -------------------------------------------------------------------- steps */

export const TOUR: CoachStep[] = [
  {
    id: 'intro-controls',
    phase: 'Set up',
    info: true,
    view: () => ({
      title: 'The microscope controls',
      body: 'This column is the microscope itself, in the order you use it: specimen, objective lens, focus, stage movement and lighting.',
      action: 'look',
      target: T('controls'),
    }),
  },
  {
    id: 'intro-view',
    phase: 'Set up',
    info: true,
    view: () => ({
      title: 'The camera view',
      body: 'This is what the camera sees. Tip: drag the picture to move the stage, and scroll the mouse wheel over it for fine focus.',
      action: 'look',
      target: T('viewport'),
    }),
  },
  {
    id: 'intro-panels',
    phase: 'Set up',
    info: true,
    view: () => ({
      title: 'Your work panels',
      body: 'Calibrate, measure, read results, learn and assess yourself here. The strip at the top always shows which stage you have reached.',
      action: 'look',
      target: T('panels'),
    }),
  },
  {
    id: 'load-mic',
    phase: 'Set up',
    done: (s) => s.microscope.specimenId === MIC_ID,
    view: (s) =>
      toLive(s) ?? {
        title: 'Load the stage micrometer',
        body: 'A stage micrometer is a tiny certified ruler: 1 mm long with a line every 0.01 mm. You always start with it.',
        action: 'choose',
        chip: 'Choose MIC-01',
        value: MIC_ID,
        target: T('specimen-select'),
        place: 'below',
      },
  },
  {
    id: 'objective',
    phase: 'Set up',
    done: (s) => s.microscope.objectiveId === OBJ,
    view: (s) =>
      toLive(s) ??
      toObjective(s) ?? { title: '5× objective selected', body: 'Higher magnification shows finer detail but a smaller area and a thinner focus range.', action: 'look', target: T('objective-5x'), place: 'below' },
  },
  {
    id: 'focus-mic',
    phase: 'Set up',
    done: (s) => s.microscope.specimenId === MIC_ID && s.microscope.objectiveId === OBJ && inFocus(s),
    view: (s) => toLive(s) ?? toObjective(s) ?? focusView(s),
  },
  {
    id: 'exposure',
    phase: 'Set up',
    info: true,
    view: (s) =>
      toLive(s) ??
      (s.liveQuality && !s.liveQuality.exposureOk
        ? {
            title: 'Fix the exposure',
            body: 'The picture is too bright or too dark. Drag Lamp intensity until the “Exposure OK” badge is green, then press Next.',
            action: 'look',
            chip: 'Adjust the lamp',
            target: T('illumination'),
            place: 'above',
          }
        : {
            title: 'Check the histogram',
            body: 'This graph shows the brightness of all pixels. It must not pile up at the left (too dark, blue) or the right (too bright, red). Yours is fine.',
            action: 'look',
            target: T('live-histogram'),
            place: 'above',
          }),
  },
  {
    id: 'align',
    phase: 'Set up',
    done: (s) => s.microscope.specimenId === MIC_ID && Math.abs(totalRotation(s)) < 0.25,
    view: (s) => {
      const pre = toLive(s);
      if (pre) return pre;
      const t = totalRotation(s);
      const n = Math.max(1, Math.round(Math.abs(t) / 0.1));
      return {
        title: 'Straighten the scale',
        body: `The micrometer sits slightly tilted in its holder. Click this button ${n} time${n > 1 ? 's' : ''} until the lines stand upright.`,
        action: 'hold',
        chip: `Click ${n}×`,
        target: T(t > 0 ? 'rotate-ccw' : 'rotate-cw'),
        place: 'above',
      };
    },
  },
  {
    id: 'capture-mic',
    phase: 'Set up',
    sticky: true,
    done: (s) => Boolean(micFrame(s)),
    view: (s) =>
      toLive(s) ??
      toObjective(s) ??
      (s.microscope.specimenId !== MIC_ID
        ? { title: 'Load the stage micrometer', body: 'The calibration frame must show the micrometer.', action: 'choose', chip: 'Choose MIC-01', value: MIC_ID, target: T('specimen-select'), place: 'below' }
        : !inFocus(s)
          ? focusView(s)
          : {
              title: 'Capture the frame',
              body: 'Capture freezes the picture for measuring. The app refuses a blurred or badly exposed picture, just as a careful operator would.',
              action: 'click',
              chip: 'Click Capture',
              target: T('capture'),
              place: 'above',
            }),
  },
  { id: 'cal-start', phase: 'Calibrate', done: (s) => s.tool === 'calibrate' || s.pendingPair?.tool === 'calibrate' || calGood(s), view: calFlow },
  { id: 'cal-pick-1', phase: 'Calibrate', done: (s) => (s.tool === 'calibrate' && Boolean(s.pendingPoint)) || s.pendingPair?.tool === 'calibrate' || calGood(s), view: calFlow },
  { id: 'cal-pick-2', phase: 'Calibrate', done: (s) => s.pendingPair?.tool === 'calibrate' || calGood(s), view: calFlow },
  { id: 'cal-enter', phase: 'Calibrate', sticky: true, done: calGood, view: calFlow },
  { id: 'ver-pick-1', phase: 'Calibrate', done: (s) => (s.tool === 'verify' && Boolean(s.pendingPoint)) || s.pendingPair?.tool === 'verify' || cal(s)?.status === 'verified', view: calFlow },
  { id: 'ver-pick-2', phase: 'Calibrate', done: (s) => s.pendingPair?.tool === 'verify' || cal(s)?.status === 'verified', view: calFlow },
  { id: 'ver-enter', phase: 'Calibrate', sticky: true, done: (s) => cal(s)?.status === 'verified', view: calFlow },
  {
    id: 'cal-done',
    phase: 'Calibrate',
    info: true,
    view: (s) =>
      toTab(s, 'calibrate', 'Look at the calibration register.') ?? {
        title: 'The 5× objective is calibrated',
        body: 'The register shows your scale in µm per pixel and its uncertainty. It is valid for 5× only. Zooming the picture does not change it; changing the objective does.',
        action: 'look',
        target: T('cal-register'),
        place: 'below',
      },
  },
  {
    id: 'load-insert',
    phase: 'Capture insert',
    done: (s) => (s.workspace === 'live' && s.microscope.specimenId === INSERT_ID) || Boolean(insertFrame(s)),
    view: (s) =>
      toLive(s) ?? {
        title: 'Load the worn insert',
        body: 'Swap the micrometer for a cutting insert. FW-01 shows regular flank wear on the flank face.',
        action: 'choose',
        chip: 'Choose FW-01',
        value: INSERT_ID,
        target: T('specimen-select'),
        place: 'below',
      },
  },
  {
    id: 'focus-insert',
    phase: 'Capture insert',
    done: (s) => (s.microscope.specimenId === INSERT_ID && s.microscope.objectiveId === OBJ && inFocus(s)) || Boolean(insertFrame(s)),
    view: (s) => {
      const pre = toLive(s) ?? toObjective(s);
      if (pre) return pre;
      const v = focusView(s);
      return Math.abs(defocusUm(s)) > 50 ? { ...v, title: 'Refocus on the insert', body: `The insert is much thicker than the micrometer, so the picture is blurred again. ${v.body}` } : v;
    },
  },
  {
    id: 'capture-insert',
    phase: 'Capture insert',
    sticky: true,
    done: (s) => Boolean(insertFrame(s)),
    view: (s) =>
      toLive(s) ??
      toObjective(s) ??
      (s.microscope.specimenId !== INSERT_ID
        ? { title: 'Load the worn insert', body: 'Choose FW-01 in the specimen holder.', action: 'choose', chip: 'Choose FW-01', value: INSERT_ID, target: T('specimen-select'), place: 'below' }
        : !inFocus(s)
          ? focusView(s)
          : {
              title: 'Capture the insert',
              body: 'The bright band along the top is the flank wear land. Capture it for measurement.',
              action: 'click',
              chip: 'Click Capture',
              target: T('capture'),
              place: 'above',
            }),
  },
  {
    id: 'zones',
    phase: 'Measure VB',
    done: (s) => s.showZones,
    view: (s) =>
      toFrame(s, insertFrame(s)) ?? {
        title: 'Show the ISO 3685 zones',
        body: 'Zone C is the rounded corner, zone N is beyond the depth of cut. The average flank wear VB_B uses readings in zone B only.',
        action: 'click',
        chip: 'Click Zones',
        target: T('zones'),
        place: 'below',
      },
  },
  { id: 'edge-tool', phase: 'Measure VB', done: (s) => s.tool === 'edge' || Boolean(insertSession(s)?.edge), view: edgeFlow },
  { id: 'edge-1', phase: 'Measure VB', done: (s) => (s.tool === 'edge' && Boolean(s.pendingPoint)) || Boolean(insertSession(s)?.edge), view: edgeFlow },
  { id: 'edge-2', phase: 'Measure VB', sticky: true, done: (s) => Boolean(insertSession(s)?.edge), view: edgeFlow },
  { id: 'vb-tool', phase: 'Measure VB', done: (s) => s.tool === 'vb' || (insertSession(s)?.points.length ?? 0) >= TOUR_VB_POINTS, view: vbFlow },
  { id: 'vb-points', phase: 'Measure VB', done: (s) => (insertSession(s)?.points.length ?? 0) >= TOUR_VB_POINTS, view: vbFlow },
  {
    id: 'results-tab',
    phase: 'Report',
    done: (s) => s.panelTab === 'results',
    view: (s) =>
      toFrame(s, insertFrame(s)) ??
      toTab(s, 'results', 'Your readings are combined into the ISO 3685 result here.') ?? { title: 'Results', body: 'Your readings are combined into the ISO 3685 result here.', action: 'look', target: T('result-card'), place: 'below' },
  },
  {
    id: 'read-results',
    phase: 'Report',
    info: true,
    view: (s) =>
      toFrame(s, insertFrame(s)) ??
      toTab(s, 'results', 'Open the Results tab.') ?? {
        title: 'Read your result',
        body: 'VB_B is the average of your zone B readings and VB_B max the largest. “± U” is the measurement uncertainty. Below, they are compared with the tool-life limits 0.3 mm and 0.6 mm.',
        action: 'look',
        target: T('result-card'),
        place: 'above',
      },
  },
  {
    id: 'export',
    phase: 'Report',
    info: true,
    view: (s) =>
      toTab(s, 'results', 'Open the Results tab.') ?? {
        title: 'Export your report',
        body: 'Fill in your name and matric number at the top, then export a PDF report or a CSV file to submit. That completes the tour. Next, try the Assess tab on your own.',
        action: 'look',
        chip: 'Export when ready',
        target: T('export-row'),
        place: 'above',
      },
  },
];

/** Index of the first step from `from` that still needs the student (skips steps already done). */
export function nextOpenStep(s: AppState, from: number): number {
  let i = from;
  while (i < TOUR.length) {
    const st = TOUR[i]!;
    if (st.info || !st.done || !st.done(s)) return i;
    i++;
  }
  return TOUR.length;
}

/** A sticky step before `idx` that has become undone, or -1. */
export function brokenStep(s: AppState, idx: number): number {
  for (let i = 0; i < Math.min(idx, TOUR.length); i++) {
    const st = TOUR[i]!;
    if (st.sticky && st.done && !st.done(s)) return i;
  }
  return -1;
}

/* --------------------------------------------------------- workflow strip */

export interface StageStatus {
  phase: Phase;
  done: boolean;
  hint: string;
}

/** Progress of the general workflow for the objective currently on the turret (independent of the tour). */
export function workflowStatus(s: AppState): StageStatus[] {
  const o = s.microscope.objectiveId;
  const c = s.calibrations[o];
  const calUsable = Boolean(c) && c!.status !== 'invalid';
  const inserts = s.frames.filter((f) => f.specimenId !== MIC_ID && (f.source === 'imported' || Boolean(s.calibrations[f.microscope.objectiveId])));
  const measured = s.frames.some((f) => Boolean(s.sessions[f.id]?.edge) && (s.sessions[f.id]?.points.length ?? 0) >= 5);
  const micCaptured = s.frames.some((f) => f.specimenId === MIC_ID && f.microscope.objectiveId === o);
  return [
    { phase: 'Set up', done: micCaptured || calUsable, hint: `Focus on the micrometer (MIC-01) at ${o.replace('x', '×')} and capture a frame.` },
    { phase: 'Calibrate', done: c?.status === 'verified', hint: calUsable ? 'Verify the calibration on a second interval.' : `Calibrate the ${o.replace('x', '×')} objective on the micrometer frame.` },
    { phase: 'Capture insert', done: inserts.length > 0, hint: 'Load a worn insert, refocus and capture a frame.' },
    { phase: 'Measure VB', done: measured, hint: 'Mark the original edge, then click at least 5 VB points in zone B.' },
    { phase: 'Report', done: measured && s.exported, hint: 'Open Results and export your CSV or PDF report.' },
  ];
}

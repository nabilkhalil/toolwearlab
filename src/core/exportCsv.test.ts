import { describe, expect, it } from 'vitest';
import { createCalibration } from './calibration';
import { buildCsv, csvEscape } from './exportCsv';
import { deriveReadings, summarise } from './measurement';
import type { CapturedFrame, MeasurementSession } from './types';

describe('CSV export', () => {
  it('escapes delimiters, quotes and newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('x\ny')).toBe('"x\ny"');
    expect(csvEscape(1.23456)).toBe('1.235');
    expect(csvEscape(null)).toBe('');
  });

  it('exports readings, summary and criteria', () => {
    const cal = createCalibration({ objectiveId: '5x', p1: { x: 0, y: 0 }, p2: { x: 1000, y: 0 }, referenceLengthUm: 690, referenceUncertaintyUm: 0.5, id: 'c1' });
    const frame: CapturedFrame = {
      id: 'f1',
      source: 'simulated',
      label: 'FW-01 @ 5x',
      capturedAt: '2026-10-16T00:00:00Z',
      specimenId: 'FW-01',
      microscope: {
        specimenId: 'FW-01',
        objectiveId: '5x',
        stage: { xUm: 0, yUm: 0, rotationDeg: 0 },
        focusZUm: 0,
        illumination: { mode: 'coaxial', intensity: 0.7 },
        camera: { brightness: 0, contrast: 1, exposure: 1 },
      },
      widthPx: 1600,
      heightPx: 1200,
      noiseSeed: 1,
      quality: { defocusBlurPx: 1, sharpness: 10, meanGrey: 100, saturatedFraction: 0, darkFraction: 0, focusOk: true, exposureOk: true, acceptable: true, messages: [] },
    };
    const session: MeasurementSession = {
      id: 's1',
      createdAt: '2026-10-16T00:00:00Z',
      frameId: 'f1',
      edge: { a: { x: 0, y: 100 }, b: { x: 1600, y: 100 } },
      points: [100, 200, 300, 400, 500].map((x, i) => ({ id: `p${i}`, p: { x, y: 100 + 250 + i * 10 } })),
      lines: [],
    };
    const r = deriveReadings(session, frame, cal, null);
    const summary = summarise(r.points, cal);
    const csv = buildCsv({ session, frame, calibration: cal, summary, readings: r.points, lineReadings: r.lines, student: { name: 'Ali, Bin "A"', id: 'S123' }, specimenTitle: 'Uniform flank wear', appVersion: '0.1.0' });
    expect(csv).toContain('"Ali, Bin ""A"""');
    expect(csv).toContain('point,zone,x_px,y_px,distance_px,VB_um,u_um_k1');
    expect(csv.split('\r\n').filter((l) => /^\d+,B,/.test(l))).toHaveLength(5);
    // 250..290 px at 0.69 µm/px → mean 270 px = 186.3 µm
    expect(summary.vbMeanUm!).toBeCloseTo(270 * 0.69, 6);
    expect(csv).toMatch(/VB_B_mean,186\.3,/);
    expect(csv).toContain('"VB_B (average, regular wear)",300,186.3,no');
  });
});

/**
 * End-to-end validation of the measurement chain against KNOWN REFERENCE
 * DISTANCES. The renderer is the "instrument"; the stage micrometer and
 * the synthetic wear profile supply reference values that are exact by
 * construction. These tests prove that (1) calibration recovers the true
 * object-space scale, (2) a calibrated scale reproduces an independent
 * reference interval within its expanded uncertainty, and (3) VB readings
 * taken on rendered images agree with the specimen's design profile.
 */
import { describe, expect, it } from 'vitest';
import { getSpecimen } from '@/data/specimens';
import { focusedState } from '@/test/fixtures';
import { createCalibration, verifyCalibration } from './calibration';
import { lumaFromRgba } from './imaging';
import { findLineCentresAlongRow } from './lineDetection';
import { makeWearPoint, summarise } from './measurement';
import { OBJECTIVES, depthOfFieldUm, nominalUmPerPx, worldToImage } from './optics';
import { assessQuality, renderFrame } from './renderer';
import { flankWearAt, referenceWear, zoneAt } from './wearProfile';
import type { InsertFlankGeometry, ObjectiveId } from './types';

const mic = getSpecimen('MIC-01');

function micrometerLines(objectiveId: ObjectiveId) {
  const st = focusedState('MIC-01', objectiveId, { stage: { xUm: 500, yUm: 40, rotationDeg: 0 } });
  const frame = renderFrame(st, mic, { scale: 1, noiseSeed: 7 });
  const grey = lumaFromRgba(frame.rgba, frame.width, frame.height);
  // Row 20 µm below the baseline crosses every graduation.
  const row = worldToImage({ x: 500, y: 20 }, st, mic).y;
  const lines = findLineCentresAlongRow(grey, frame.width, frame.height, row, { dark: true, band: 2 });
  return { st, frame, lines, row };
}

describe('validation against stage-micrometer reference distances', () => {
  for (const objectiveId of ['5x', '10x'] as ObjectiveId[]) {
    it(`calibration at ${objectiveId} recovers the true scale within its uncertainty`, () => {
      const { lines, row } = micrometerLines(objectiveId);
      expect(lines.length).toBeGreaterThan(20);
      // Neighbouring graduations are 10 µm apart.
      const spacings = lines.slice(1).map((l, i) => l.x - lines[i]!.x);
      const median = [...spacings].sort((a, b) => a - b)[Math.floor(spacings.length / 2)]!;
      const truePx = 10 / nominalUmPerPx(OBJECTIVES[objectiveId]);
      expect(median).toBeCloseTo(truePx, 0);

      // Calibrate over the longest whole-division span available.
      const first = lines[1]!;
      const nDiv = lines.length - 3;
      const last = lines[1 + nDiv]!;
      const cal = createCalibration({
        objectiveId,
        p1: { x: first.x, y: row },
        p2: { x: last.x, y: row },
        referenceLengthUm: nDiv * 10,
        referenceUncertaintyUm: mic.geometry.kind === 'stage-micrometer' ? mic.geometry.certificateUncertaintyUm : 0,
      });
      const truth = nominalUmPerPx(OBJECTIVES[objectiveId]);
      const relErr = Math.abs(cal.umPerPx - truth) / truth;
      expect(relErr).toBeLessThan(2 * (cal.umPerPxStdUncertainty / cal.umPerPx) + 1e-4);

      // Independent check on a different interval (half the span).
      const half = Math.floor(nDiv / 2);
      const v = verifyCalibration(cal, { x: lines[2]!.x, y: row }, { x: lines[2 + half]!.x, y: row }, half * 10);
      expect(v.passed).toBe(true);
    });
  }
});

describe('validation of VB readings against the synthetic design profile', () => {
  it('VB_B mean and max from rendered-image picks agree with design values', () => {
    const sp = getSpecimen('FW-01');
    const g = sp.geometry as InsertFlankGeometry;
    const st = focusedState('FW-01', '5x', { stage: { xUm: 1300, yUm: 250, rotationDeg: -sp.loadRotationDeg } });
    const s = nominalUmPerPx(OBJECTIVES['5x']);
    // Perfect calibration for this test (scale uncertainty from a typical micrometer).
    const cal = createCalibration({ objectiveId: '5x', p1: { x: 0, y: 0 }, p2: { x: 1000 / s, y: 0 }, referenceLengthUm: 1000, referenceUncertaintyUm: 0.5 });
    const edge = { a: worldToImage({ x: 900, y: 0 }, st, sp), b: worldToImage({ x: 1800, y: 0 }, st, sp) };
    const xs: number[] = [];
    for (let x = 900; x <= 1850; x += 50) if (zoneAt(x, g) === 'B') xs.push(x);
    const points = xs.map((x, i) => makeWearPoint(`p${i}`, worldToImage({ x, y: flankWearAt(x, g, sp.seed) }, st, sp), edge, cal, 'B'));
    for (const [i, p] of points.entries()) expect(p.vbUm).toBeCloseTo(flankWearAt(xs[i]!, g, sp.seed), 6);
    const sum = summarise(points, cal);
    // Sampled readings estimate the dense design mean; tolerance reflects sampling, not the software.
    const ref = referenceWear(g, sp.seed);
    expect(Math.abs(sum.vbMeanUm! - ref.vbBMeanUm)).toBeLessThan(10);
    expect(sum.vbMaxUm!).toBeLessThanOrEqual(ref.vbBMaxUm + 1e-6);
  });

  it('the rendered wear-land boundary lies where the design profile says', () => {
    const sp = getSpecimen('FW-01');
    const g = sp.geometry as InsertFlankGeometry;
    const st = focusedState('FW-01', '10x', { stage: { xUm: 1300, yUm: 150, rotationDeg: -sp.loadRotationDeg } });
    const frame = renderFrame(st, sp, { scale: 1, noiseSeed: 3 });
    const grey = lumaFromRgba(frame.rgba, frame.width, frame.height);
    const s = nominalUmPerPx(OBJECTIVES['10x']);
    for (const x of [1150, 1300, 1450]) {
      const top = worldToImage({ x, y: 20 }, st, sp);
      // Scan down the column: the bright land ends at the boundary (largest negative gradient).
      const col = Math.round(top.x);
      let best = 0;
      let bestY = 0;
      for (let y = Math.round(top.y); y < frame.height - 3; y++) {
        const gdrop = grey[(y - 2) * frame.width + col]! - grey[(y + 2) * frame.width + col]!;
        if (gdrop > best) {
          best = gdrop;
          bestY = y;
        }
      }
      const expectedY = worldToImage({ x, y: flankWearAt(x, g, sp.seed) }, st, sp).y;
      // Boundary located to within ~6 µm at 0.345 µm/px; the darker coating-edge band biases it slightly.
      expect(Math.abs(bestY - expectedY) * s).toBeLessThan(6);
    }
  });
});

describe('image-quality gate', () => {
  it('accepts a focused, well-exposed frame', () => {
    const st = focusedState('FW-01', '5x');
    const sp = getSpecimen('FW-01');
    const q = assessQuality(renderFrame(st, sp, { scale: 0.5, noiseSeed: 1 }), st, sp);
    expect(q.focusOk).toBe(true);
    expect(q.exposureOk).toBe(true);
    expect(q.acceptable).toBe(true);
  });

  it('rejects a frame defocused beyond half the depth of field', () => {
    const sp = getSpecimen('FW-01');
    const dof = depthOfFieldUm(OBJECTIVES['10x']);
    const st = focusedState('FW-01', '10x', { focusZUm: sp.surfaceZUm + dof });
    const q = assessQuality(renderFrame(st, sp, { scale: 0.5, noiseSeed: 1 }), st, sp);
    expect(q.focusOk).toBe(false);
    expect(q.acceptable).toBe(false);
  });

  it('defocus lowers the measured sharpness', () => {
    const sp = getSpecimen('MIC-01');
    const a = focusedState('MIC-01', '5x');
    const b = focusedState('MIC-01', '5x', { focusZUm: sp.surfaceZUm + 100 });
    const qa = assessQuality(renderFrame(a, sp, { scale: 0.5, noiseSeed: 1 }), a, sp);
    const qb = assessQuality(renderFrame(b, sp, { scale: 0.5, noiseSeed: 1 }), b, sp);
    expect(qb.sharpness).toBeLessThan(qa.sharpness / 3);
  });

  it('rejects an over-exposed frame', () => {
    const sp = getSpecimen('FW-01');
    const st = focusedState('FW-01', '5x', { illumination: { mode: 'coaxial', intensity: 1 }, camera: { brightness: 0.2, contrast: 1.4, exposure: 2.5 } });
    const q = assessQuality(renderFrame(st, sp, { scale: 0.5, noiseSeed: 1 }), st, sp);
    expect(q.exposureOk).toBe(false);
  });

  it('renders deterministically for a given state and seed', () => {
    const sp = getSpecimen('NW-01');
    const st = focusedState('NW-01', '2x');
    const a = renderFrame(st, sp, { scale: 0.25, noiseSeed: 42 });
    const b = renderFrame(st, sp, { scale: 0.25, noiseSeed: 42 });
    expect(a.rgba.every((v, i) => v === b.rgba[i])).toBe(true);
  });
});

describe('specimen design values', () => {
  it('notch wear is confined to zone N and VB_N exceeds VB_B max', () => {
    const sp = getSpecimen('NW-01');
    const g = sp.geometry as InsertFlankGeometry;
    const r = referenceWear(g, sp.seed);
    expect(r.vbNMaxUm).toBeGreaterThan(r.vbBMaxUm * 2);
    expect(flankWearAt(g.depthOfCutUm - 1, g, sp.seed)).toBeLessThan(r.vbBMaxUm + 1);
  });
  it('FW-02 is irregular: VB_B max well above VB_B mean', () => {
    const sp = getSpecimen('FW-02');
    const r = referenceWear(sp.geometry as InsertFlankGeometry, sp.seed);
    expect(r.vbBMaxUm / r.vbBMeanUm).toBeGreaterThan(1.4);
  });
  it('the unworn reference insert has no wear land', () => {
    const sp = getSpecimen('FW-00');
    expect(referenceWear(sp.geometry as InsertFlankGeometry, sp.seed).vbBMaxUm).toBe(0);
  });
});

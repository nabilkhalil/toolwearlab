import { describe, expect, it } from 'vitest';
import { getSpecimen } from '@/data/specimens';
import { focusedState } from '@/test/fixtures';
import {
  CAMERA,
  OBJECTIVES,
  blurSigmaPx,
  depthOfFieldUm,
  fieldOfViewUm,
  imageToWorld,
  nominalUmPerPx,
  worldToImage,
} from './optics';

describe('optics model', () => {
  it('derives object-space sampling from pixel pitch and magnification', () => {
    expect(nominalUmPerPx(OBJECTIVES['2x'])).toBeCloseTo(1.725, 6);
    expect(nominalUmPerPx(OBJECTIVES['5x'])).toBeCloseTo(0.69, 6);
    expect(nominalUmPerPx(OBJECTIVES['10x'])).toBeCloseTo(0.345, 6);
    expect(nominalUmPerPx(OBJECTIVES['20x'])).toBeCloseTo(0.1725, 6);
  });

  it('field of view shrinks in proportion to magnification', () => {
    const f2 = fieldOfViewUm(OBJECTIVES['2x']);
    const f10 = fieldOfViewUm(OBJECTIVES['10x']);
    expect(f2.width / f10.width).toBeCloseTo(5, 6);
    expect(f2.width).toBeCloseTo(CAMERA.widthPx * 1.725, 6);
  });

  it('depth of field decreases with numerical aperture', () => {
    const d = (['2x', '5x', '10x', '20x'] as const).map((id) => depthOfFieldUm(OBJECTIVES[id]));
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeLessThan(d[i - 1]!);
    // λ/NA² + e/(M·NA) for 10x / 0.28
    expect(d[2]!).toBeCloseTo(0.55 / 0.28 ** 2 + 3.45 / (10 * 0.28), 6);
  });

  it('blur is diffraction limited inside the depth of field and grows outside it', () => {
    const o = OBJECTIVES['10x'];
    const inFocus = blurSigmaPx(0, o);
    // Diffraction σ = 0.21·λ/NA = 0.41 µm ≈ 1.2 px at 10×.
    expect(inFocus).toBeCloseTo((0.21 * 0.55) / 0.28 / 0.345, 9);
    expect(blurSigmaPx(depthOfFieldUm(o) / 2 - 0.01, o)).toBeCloseTo(inFocus, 6);
    expect(blurSigmaPx(50, o)).toBeGreaterThan(10);
    expect(blurSigmaPx(-50, o)).toBeCloseTo(blurSigmaPx(50, o), 9);
  });

  it('world ↔ image mapping round-trips with stage offset and rotation', () => {
    const sp = getSpecimen('FW-02'); // has a non-zero load rotation
    const st = focusedState('FW-02', '5x', { stage: { xUm: 1234, yUm: 321, rotationDeg: 7.5 } });
    for (const p of [{ x: 0, y: 0 }, { x: 1500, y: 260 }, { x: 900, y: -40 }]) {
      const img = worldToImage(p, st, sp);
      const back = imageToWorld(img, st, sp);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
    // Stage position maps to the image centre.
    const c = worldToImage({ x: 1234, y: 321 }, st, sp);
    expect(c.x).toBeCloseTo(CAMERA.widthPx / 2, 9);
    expect(c.y).toBeCloseTo(CAMERA.heightPx / 2, 9);
  });

  it('distances are preserved by rotation and scaled by µm/px', () => {
    const sp = getSpecimen('FW-01');
    const st = focusedState('FW-01', '10x', { stage: { xUm: 1000, yUm: 200, rotationDeg: 33 } });
    const a = worldToImage({ x: 1000, y: 200 }, st, sp);
    const b = worldToImage({ x: 1100, y: 200 }, st, sp);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(100 / 0.345, 6);
  });
});

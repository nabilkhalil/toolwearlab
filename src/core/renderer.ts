import { bin2, exposureStats, gaussianBlur, laplacianVariance, lumaFromRgba } from './imaging';
import { gaussian, mulberry32 } from './noise';
import { CAMERA, OBJECTIVES, blurSigmaPx, defocusUm, depthOfFieldUm, imageToWorld, nominalUmPerPx } from './optics';
import { shade, type RGB } from './shading';
import type { CameraSpec, ImageQualityReport, MicroscopeState, SpecimenDef } from './types';

/**
 * Deterministic image-formation pipeline:
 *   specimen reflectance → illumination & vignetting → defocus PSF
 *   → photon/read noise → exposure, brightness, contrast → 8-bit clip.
 *
 * `scale` renders a down-sampled preview (e.g. 0.5) for the live view;
 * captures always render at scale 1 so image px equal sensor px.
 */
export interface RenderOptions {
  scale: number;
  /** Seed for sensor noise. Captures use a seed derived from the frame id. */
  noiseSeed: number;
  camera?: CameraSpec;
}

export interface RenderedFrame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Gaussian sigma of the optical blur, in sensor px. */
  blurSigmaSensorPx: number;
}

const MODE_EFFICIENCY = { coaxial: 1.0, ring: 1.35 } as const;

export function renderFrame(state: MicroscopeState, specimen: SpecimenDef, opts: RenderOptions): RenderedFrame {
  const camera = opts.camera ?? CAMERA;
  const objective = OBJECTIVES[state.objectiveId];
  const scale = opts.scale;
  const w = Math.round(camera.widthPx * scale);
  const h = Math.round(camera.heightPx * scale);
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);

  const pixelUm = nominalUmPerPx(objective, camera) / scale;
  // World coordinates are affine in pixel indices: compute origin and steps once.
  const o = imageToWorld({ x: 0.5 / scale, y: 0.5 / scale }, state, specimen, camera);
  const ox = imageToWorld({ x: 1.5 / scale, y: 0.5 / scale }, state, specimen, camera);
  const oy = imageToWorld({ x: 0.5 / scale, y: 1.5 / scale }, state, specimen, camera);
  const dxi = ox.x - o.x;
  const dyi = ox.y - o.y;
  const dxj = oy.x - o.x;
  const dyj = oy.y - o.y;

  const lamp = state.illumination.intensity * MODE_EFFICIENCY[state.illumination.mode] * state.camera.exposure;
  const cx = w / 2;
  const cy = h / 2;
  const rmax2 = cx * cx + cy * cy;
  const rgb: RGB = [0, 0, 0];
  const mode = state.illumination.mode;

  for (let j = 0; j < h; j++) {
    let wx = o.x + dxj * j;
    let wy = o.y + dyj * j;
    const ry = (j + 0.5 - cy) * (j + 0.5 - cy);
    for (let i = 0; i < w; i++) {
      shade(specimen, wx, wy, mode, pixelUm, rgb);
      const r2 = ((i + 0.5 - cx) * (i + 0.5 - cx) + ry) / rmax2;
      const vig = lamp * (1 - 0.22 * r2);
      const k = j * w + i;
      R[k] = rgb[0] * vig;
      G[k] = rgb[1] * vig;
      B[k] = rgb[2] * vig;
      wx += dxi;
      wy += dyi;
    }
  }

  const sigmaSensor = blurSigmaPx(defocusUm(state, specimen), objective, camera);
  const sigma = sigmaSensor * scale;
  gaussianBlur(R, w, h, sigma);
  gaussianBlur(G, w, h, sigma);
  gaussianBlur(B, w, h, sigma);

  const rand = mulberry32(opts.noiseSeed);
  const rgba = new Uint8ClampedArray(n * 4);
  const { brightness, contrast } = state.camera;
  const read = camera.readNoiseDn;
  for (let k = 0, p = 0; k < n; k++, p += 4) {
    const chans = [R[k]!, G[k]!, B[k]!];
    // One noise draw per pixel keeps the grain monochromatic, as on a Bayer-demosaiced sensor.
    const z = gaussian(rand);
    for (let c = 0; c < 3; c++) {
      let dn = chans[c]! * 255;
      dn += z * Math.sqrt(read * read + 0.06 * Math.max(0, dn));
      dn = (dn - 127.5) * contrast + 127.5 + brightness * 255;
      rgba[p + c] = dn; // Uint8ClampedArray rounds and clips
    }
    rgba[p + 3] = 255;
  }
  return { width: w, height: h, rgba, blurSigmaSensorPx: sigmaSensor };
}

/** Thresholds for accepting a frame for measurement. */
export const QUALITY_LIMITS = {
  minMeanGrey: 35,
  maxMeanGrey: 215,
  maxSaturatedFraction: 0.01,
  maxDarkFraction: 0.35,
} as const;

/**
 * Image-quality gate. Focus acceptance is model based (defocus within ±DOF/2),
 * because sharpness metrics are scene dependent; the measured
 * variance-of-Laplacian is reported alongside for teaching.
 */
export function assessQuality(frame: RenderedFrame, state: MicroscopeState, specimen: SpecimenDef, camera: CameraSpec = CAMERA): ImageQualityReport {
  const objective = OBJECTIVES[state.objectiveId];
  const dz = defocusUm(state, specimen);
  const dof = depthOfFieldUm(objective, camera);
  const focusOk = Math.abs(dz) <= dof / 2;
  const grey = lumaFromRgba(frame.rgba, frame.width, frame.height);
  const stats = exposureStats(grey);
  // Bin 2×2 first so sensor noise does not dominate the Laplacian.
  const binned = bin2(grey, frame.width, frame.height);
  const sharpness = laplacianVariance(binned.data, binned.w, binned.h, 1);
  const messages: string[] = [];
  if (!focusOk) messages.push(`Out of focus: defocus ${dz.toFixed(1)} µm exceeds ±${(dof / 2).toFixed(1)} µm (half the depth of field).`);
  if (stats.saturatedFraction > QUALITY_LIMITS.maxSaturatedFraction)
    messages.push(`Over-exposed: ${(stats.saturatedFraction * 100).toFixed(1)} % of pixels saturated. Reduce intensity, exposure or brightness.`);
  if (stats.mean < QUALITY_LIMITS.minMeanGrey) messages.push('Under-exposed: mean grey level too low. Increase intensity or exposure.');
  if (stats.mean > QUALITY_LIMITS.maxMeanGrey) messages.push('Image too bright overall.');
  if (stats.darkFraction > QUALITY_LIMITS.maxDarkFraction) messages.push('Large black-clipped area: check stage position or brightness.');
  const exposureOk =
    stats.saturatedFraction <= QUALITY_LIMITS.maxSaturatedFraction &&
    stats.mean >= QUALITY_LIMITS.minMeanGrey &&
    stats.mean <= QUALITY_LIMITS.maxMeanGrey &&
    stats.darkFraction <= QUALITY_LIMITS.maxDarkFraction;
  return {
    defocusBlurPx: frame.blurSigmaSensorPx * 2.355,
    sharpness,
    meanGrey: stats.mean,
    saturatedFraction: stats.saturatedFraction,
    darkFraction: stats.darkFraction,
    focusOk,
    exposureOk,
    acceptable: focusOk && exposureOk,
    messages,
  };
}

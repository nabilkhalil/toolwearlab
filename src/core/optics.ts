import type { CameraSpec, MicroscopeState, Objective, ObjectiveId, SpecimenDef, Vec2 } from './types';

/**
 * Optical train model.
 *
 * Objective parameters are modelled on infinity-corrected plan-apochromat
 * objectives used with a matched 200 mm tube lens (published catalogue
 * values for this objective class: 2x/0.055, 5x/0.14, 10x/0.28, 20x/0.42).
 * The simulator uses them only to derive scale, resolution and depth of
 * field; it does not claim to reproduce any specific instrument.
 */
export const OBJECTIVES: Record<ObjectiveId, Objective> = {
  '2x': { id: '2x', label: '2× / NA 0.055', magnification: 2, numericalAperture: 0.055, workingDistanceMm: 34 },
  '5x': { id: '5x', label: '5× / NA 0.14', magnification: 5, numericalAperture: 0.14, workingDistanceMm: 34 },
  '10x': { id: '10x', label: '10× / NA 0.28', magnification: 10, numericalAperture: 0.28, workingDistanceMm: 33.5 },
  '20x': { id: '20x', label: '20× / NA 0.42', magnification: 20, numericalAperture: 0.42, workingDistanceMm: 20 },
};

export const OBJECTIVE_ORDER: ObjectiveId[] = ['2x', '5x', '10x', '20x'];

/** Generic 2 MP monochrome-class CMOS camera (colour rendered for realism). */
export const CAMERA: CameraSpec = {
  widthPx: 1600,
  heightPx: 1200,
  pixelPitchUm: 3.45,
  readNoiseDn: 1.2,
};

/** Mean wavelength of white LED illumination used for diffraction estimates (µm). */
export const WAVELENGTH_UM = 0.55;

/** True object-space sampling (µm per sensor pixel). Hidden from the student: they must calibrate. */
export function nominalUmPerPx(objective: Objective, camera: CameraSpec = CAMERA): number {
  return camera.pixelPitchUm / objective.magnification;
}

export function fieldOfViewUm(objective: Objective, camera: CameraSpec = CAMERA): { width: number; height: number } {
  const s = nominalUmPerPx(objective, camera);
  return { width: camera.widthPx * s, height: camera.heightPx * s };
}

/** Rayleigh lateral resolution (µm). */
export function rayleighResolutionUm(objective: Objective): number {
  return (0.61 * WAVELENGTH_UM) / objective.numericalAperture;
}

/**
 * Total depth of field (µm): wave-optical term λ/NA² plus the geometric term
 * e/(M·NA) where e is the detector pixel pitch (refractive index n = 1, air).
 */
export function depthOfFieldUm(objective: Objective, camera: CameraSpec = CAMERA): number {
  const na = objective.numericalAperture;
  return WAVELENGTH_UM / (na * na) + camera.pixelPitchUm / (objective.magnification * na);
}

/**
 * Point-spread width on the sensor, expressed as a Gaussian standard
 * deviation in sensor pixels. Combines the geometric defocus blur circle
 * (diameter ≈ 2·NA·|Δz| in object space, ignoring the in-focus tolerance
 * band of ±DOF/2) with diffraction (σ ≈ 0.21 λ/NA).
 */
export function blurSigmaPx(defocusUm: number, objective: Objective, camera: CameraSpec = CAMERA): number {
  const s = nominalUmPerPx(objective, camera);
  const dof = depthOfFieldUm(objective, camera);
  const excess = Math.max(0, Math.abs(defocusUm) - dof / 2);
  const geometricDiameterUm = 2 * objective.numericalAperture * excess;
  const geometricSigmaUm = geometricDiameterUm / 4;
  const diffractionSigmaUm = (0.21 * WAVELENGTH_UM) / objective.numericalAperture;
  return Math.hypot(geometricSigmaUm, diffractionSigmaUm) / s;
}

/** Signed defocus: positive when the focal plane is above the specimen surface (µm). */
export function defocusUm(state: MicroscopeState, specimen: SpecimenDef): number {
  return state.focusZUm - specimen.surfaceZUm;
}

export function totalRotationRad(state: MicroscopeState, specimen: SpecimenDef): number {
  return ((state.stage.rotationDeg + specimen.loadRotationDeg) * Math.PI) / 180;
}

/**
 * Forward mapping specimen (µm) → sensor image (px).
 * The stage position (xUm, yUm) is placed on the optical axis (image centre).
 */
export function worldToImage(
  world: Vec2,
  state: MicroscopeState,
  specimen: SpecimenDef,
  camera: CameraSpec = CAMERA,
): Vec2 {
  const s = nominalUmPerPx(OBJECTIVES[state.objectiveId], camera);
  const t = totalRotationRad(state, specimen);
  const dx = world.x - state.stage.xUm;
  const dy = world.y - state.stage.yUm;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return {
    x: (c * dx - sn * dy) / s + camera.widthPx / 2,
    y: (sn * dx + c * dy) / s + camera.heightPx / 2,
  };
}

/** Inverse mapping sensor image (px) → specimen (µm). */
export function imageToWorld(
  img: Vec2,
  state: MicroscopeState,
  specimen: SpecimenDef,
  camera: CameraSpec = CAMERA,
): Vec2 {
  const s = nominalUmPerPx(OBJECTIVES[state.objectiveId], camera);
  const t = totalRotationRad(state, specimen);
  const u = (img.x - camera.widthPx / 2) * s;
  const v = (img.y - camera.heightPx / 2) * s;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return { x: c * u + sn * v + state.stage.xUm, y: -sn * u + c * v + state.stage.yUm };
}

/**
 * ToolWearLab core data model.
 *
 * Coordinate frames (never mix them):
 *  - World / specimen frame  (µm)  : fixed to the specimen. x runs along the
 *    cutting edge from the tool corner, y runs away from the cutting edge
 *    (into the flank face for flank views, into the rake face for rake views).
 *  - Sensor / image frame    (px)  : pixel coordinates of the camera sensor,
 *    origin at the top-left pixel corner. All measurement points are stored
 *    in this frame, on a frozen (captured) image.
 *  - View / screen frame     (px)  : what the student sees after digital zoom
 *    and pan. Never persisted; always converted back to image px.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ optics */

export type ObjectiveId = '2x' | '5x' | '10x' | '20x';

export interface Objective {
  id: ObjectiveId;
  label: string;
  /** Lateral optical magnification at the camera sensor (with the matched tube lens). */
  magnification: number;
  /** Numerical aperture, used for resolution and depth-of-field estimates. */
  numericalAperture: number;
  workingDistanceMm: number;
}

export interface CameraSpec {
  widthPx: number;
  heightPx: number;
  /** Physical pixel pitch on the sensor (µm). */
  pixelPitchUm: number;
  /** Read-noise standard deviation in 8-bit grey levels. */
  readNoiseDn: number;
}

export type IlluminationMode = 'coaxial' | 'ring';

export interface IlluminationState {
  mode: IlluminationMode;
  /** Lamp intensity, 0 to 1. */
  intensity: number;
}

export interface CameraAdjust {
  /** Additive brightness offset applied after exposure, -1 to 1 (fraction of full scale). */
  brightness: number;
  /** Multiplicative contrast about mid-grey, 0.5 to 2. */
  contrast: number;
  /** Exposure gain applied to the optical signal, 0.25 to 4. */
  exposure: number;
}

export interface StageState {
  /** Stage position (µm, specimen frame) that sits on the optical axis. */
  xUm: number;
  yUm: number;
  /** Specimen-holder rotation about the optical axis (degrees, CCW positive). */
  rotationDeg: number;
}

export interface MicroscopeState {
  specimenId: string;
  objectiveId: ObjectiveId;
  stage: StageState;
  /** Height of the focal plane above the stage datum (µm). */
  focusZUm: number;
  illumination: IlluminationState;
  camera: CameraAdjust;
}

/* --------------------------------------------------------------- specimens */

export type SpecimenKind = 'stage-micrometer' | 'insert-flank' | 'insert-rake';

export type WearMode = 'none' | 'flank' | 'crater' | 'notch';

export interface Provenance {
  /** 'synthetic' specimens are procedurally rendered from documented parameters. */
  type: 'synthetic' | 'imported';
  note: string;
}

export interface StageMicrometerGeometry {
  kind: 'stage-micrometer';
  /** Total scale length (µm). */
  lengthUm: number;
  /** Graduation interval (µm). */
  divisionUm: number;
  /** Rendered graduation line width (µm). */
  lineWidthUm: number;
  /**
   * Nominal certificate uncertainty of the graduation positions (µm, k = 1).
   * Illustrative only; real stage micrometers carry their own certificate.
   */
  certificateUncertaintyUm: number;
}

export interface FlankWearProfile {
  /** Corner (zone C) wear at x = 0 (µm). */
  vbCornerUm: number;
  /** Mean flank wear land width in zone B (µm). */
  vbMeanUm: number;
  /** Amplitude of slow undulation in zone B (µm). */
  undulationUm: number;
  /** Amplitude of fine land-boundary irregularity (µm). */
  roughnessUm: number;
  /** Localised peaks in zone B (chipping, adhered material). */
  peaks: { xUm: number; heightUm: number; widthUm: number }[];
  /** Notch wear peak height at the depth-of-cut line (µm); 0 for none. */
  notchUm: number;
  notchWidthUm: number;
}

export interface InsertFlankGeometry {
  kind: 'insert-flank';
  /** Visible cutting edge length in the field (µm). */
  edgeLengthUm: number;
  /** Insert thickness: flank face height (µm). */
  thicknessUm: number;
  /** Corner (nose) radius r_ε (µm). Defines zone C. */
  noseRadiusUm: number;
  /** Depth of cut a_p projected on the edge (µm). Notch forms here. */
  depthOfCutUm: number;
  coating: 'TiAlN' | 'TiN' | 'uncoated';
  wear: FlankWearProfile;
}

export interface InsertRakeGeometry {
  kind: 'insert-rake';
  edgeLengthUm: number;
  noseRadiusUm: number;
  depthOfCutUm: number;
  coating: 'TiAlN' | 'TiN' | 'uncoated';
  crater: {
    /** Crater front distance KF from the original cutting edge (µm). */
    kfUm: number;
    /** Crater width KB from the original cutting edge to the back of the crater (µm). */
    kbUm: number;
    /** Crater extent along the edge, start and end (µm). */
    xStartUm: number;
    xEndUm: number;
  };
  /** Narrow flank-wear band visible at the edge in rake view (µm), 0 for none. */
  edgeBandUm: number;
}

export type SpecimenGeometry = StageMicrometerGeometry | InsertFlankGeometry | InsertRakeGeometry;

export interface SpecimenDef {
  id: string;
  title: string;
  description: string;
  geometry: SpecimenGeometry;
  /** Wear modes actually present: used by the classification activity. */
  wearModes: WearMode[];
  /** Height of the specimen surface above the stage datum (µm). */
  surfaceZUm: number;
  /** Stage position that roughly centres the region of interest. */
  homeStage: StageState;
  /** Rotation offset of the specimen as loaded in the holder (degrees). */
  loadRotationDeg: number;
  seed: number;
  provenance: Provenance;
  workpiece?: string;
  cuttingConditions?: string;
}

/* ------------------------------------------------------------- calibration */

export type CalibrationStatus = 'none' | 'calibrated' | 'verified' | 'invalid';

export interface CalibrationRecord {
  id: string;
  createdAt: string;
  objectiveId: ObjectiveId | 'imported';
  /** Picked graduation positions in image px. */
  p1: Vec2;
  p2: Vec2;
  referenceLengthUm: number;
  referenceUncertaintyUm: number;
  /** Assumed standard uncertainty of a single point pick (px). */
  pickUncertaintyPx: number;
  distancePx: number;
  /** Calibrated object-space scale (µm/px). */
  umPerPx: number;
  /** Standard uncertainty of the scale (µm/px, k = 1). */
  umPerPxStdUncertainty: number;
  status: CalibrationStatus;
  verification?: CalibrationVerification;
}

export interface CalibrationVerification {
  referenceLengthUm: number;
  measuredLengthUm: number;
  errorUm: number;
  expandedUncertaintyUm: number;
  passed: boolean;
}

/* ----------------------------------------------------------- image quality */

export interface ImageQualityReport {
  /** Model-based defocus blur diameter on the sensor (px). */
  defocusBlurPx: number;
  /** Variance-of-Laplacian sharpness of the actual pixels. */
  sharpness: number;
  meanGrey: number;
  /** Fraction of saturated pixels (>= 250). */
  saturatedFraction: number;
  /** Fraction of black-clipped pixels (<= 5). */
  darkFraction: number;
  focusOk: boolean;
  exposureOk: boolean;
  acceptable: boolean;
  messages: string[];
}

/* ------------------------------------------------------------- acquisition */

/**
 * A captured frame stores the full acquisition state instead of pixels:
 * the renderer is deterministic, so the frame is regenerated exactly from
 * this record. This keeps local storage small and the data auditable.
 */
export interface CapturedFrame {
  id: string;
  source: 'simulated' | 'imported';
  /** Label shown in the frame list. */
  label: string;
  capturedAt: string;
  specimenId: string;
  microscope: MicroscopeState;
  widthPx: number;
  heightPx: number;
  quality: ImageQualityReport;
  /** Seed of the simulated sensor noise for this exposure. */
  noiseSeed: number;
  /** Imported image data URL, only for user-imported micrographs. */
  importedDataUrl?: string;
}

/* ------------------------------------------------------------- measurement */

export type WearZone = 'C' | 'B' | 'N' | 'outside';

export type MeasurementKind = 'vb' | 'distance' | 'crater-kb' | 'crater-kf';

export interface EdgeReference {
  /** Two image-px points on the original (unworn) cutting edge line. */
  a: Vec2;
  b: Vec2;
}

export interface WearPoint {
  id: string;
  /** Point on the wear-land boundary (image px). */
  p: Vec2;
  zone: WearZone;
  /** Perpendicular distance to the edge reference line (px). */
  distancePx: number;
  /** Calibrated wear-land width (µm). */
  vbUm: number;
  /** Standard uncertainty of this reading (µm, k = 1). */
  uUm: number;
}

export interface LineMeasurement {
  id: string;
  kind: Exclude<MeasurementKind, 'vb'>;
  a: Vec2;
  b: Vec2;
  lengthPx: number;
  lengthUm: number;
  uUm: number;
  label: string;
}

export interface WearSummary {
  n: number;
  vbMeanUm: number | null;
  vbMaxUm: number | null;
  vbMinUm: number | null;
  stdDevUm: number | null;
  /** Combined standard uncertainty of the mean (µm). */
  uMeanUm: number | null;
  /** Combined standard uncertainty of the maximum reading (µm). */
  uMaxUm: number | null;
  coverageFactor: number;
  vbcMaxUm: number | null;
  vbnMaxUm: number | null;
}

export interface CriterionAssessment {
  criterion: string;
  limitUm: number;
  valueUm: number | null;
  reached: boolean | null;
  note: string;
}

/** Raw student input: only image coordinates are stored; readings are derived. */
export interface RawPoint {
  id: string;
  p: Vec2;
}

export interface RawLine {
  id: string;
  kind: Exclude<MeasurementKind, 'vb'>;
  a: Vec2;
  b: Vec2;
  label: string;
}

/**
 * Measurement session bound to one captured frame. Readings (µm values and
 * uncertainties) are recomputed from these raw picks and the calibration in
 * force, so a corrected calibration propagates automatically and nothing
 * derived can go stale in storage.
 */
export interface MeasurementSession {
  id: string;
  createdAt: string;
  frameId: string;
  edge: EdgeReference | null;
  points: RawPoint[];
  lines: RawLine[];
}

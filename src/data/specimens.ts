import type { SpecimenDef } from '@/core/types';

/**
 * Specimen library.
 *
 * Every specimen here is SYNTHETIC: procedurally rendered from the
 * documented parameters below. The "design values" derived from these
 * parameters (see core/wearProfile.referenceWear) are properties of the
 * synthetic geometry. They are suitable for training measurement
 * technique and for validating the software, and must not be cited as
 * experimental tool-wear data.
 *
 * Geometry is modelled on a common turning insert class (80° rhombic,
 * 12.7 mm inscribed circle, 4.76 mm thick, 0.8 mm corner radius).
 * Wear magnitudes are chosen to span the ISO 3685 tool-life criteria
 * (VB = 0.3 mm, VBmax = 0.6 mm) for teaching purposes.
 */

const SYNTHETIC_NOTE =
  'Synthetic specimen rendered from documented parameters. Design values are properties of the synthetic geometry, not experimental measurements.';

export const SPECIMENS: SpecimenDef[] = [
  {
    id: 'MIC-01',
    title: 'Stage micrometer 1 mm / 0.01 mm',
    description:
      'Reflected-light stage micrometer: 1 mm scale with 10 µm graduations, 50 µm and 100 µm major ticks. Use it to calibrate each objective before measuring wear.',
    geometry: { kind: 'stage-micrometer', lengthUm: 1000, divisionUm: 10, lineWidthUm: 2.5, certificateUncertaintyUm: 0.5 },
    wearModes: ['none'],
    surfaceZUm: 1180,
    homeStage: { xUm: 500, yUm: 60, rotationDeg: 0 },
    loadRotationDeg: 0.6,
    seed: 11,
    provenance: {
      type: 'synthetic',
      note: 'Synthetic micrometer. The certificate uncertainty (0.5 µm, k = 1) is illustrative; use the value on your own micrometer certificate in the laboratory.',
    },
  },
  {
    id: 'FW-00',
    title: 'Unworn insert (reference)',
    description: 'New TiAlN-coated carbide insert, flank face view. Use it to recognise the original cutting edge and the unworn flank texture.',
    geometry: {
      kind: 'insert-flank',
      edgeLengthUm: 9000,
      thicknessUm: 4760,
      noseRadiusUm: 800,
      depthOfCutUm: 2000,
      coating: 'TiAlN',
      wear: { vbCornerUm: 0, vbMeanUm: 0, undulationUm: 0, roughnessUm: 0, peaks: [], notchUm: 0, notchWidthUm: 1 },
    },
    wearModes: ['none'],
    surfaceZUm: 4930,
    homeStage: { xUm: 1300, yUm: 300, rotationDeg: 0 },
    loadRotationDeg: -1.2,
    seed: 21,
    provenance: { type: 'synthetic', note: SYNTHETIC_NOTE },
  },
  {
    id: 'FW-01',
    title: 'Uniform flank wear',
    description: 'TiAlN-coated carbide insert after a moderate turning interval. Regular abrasive flank wear in zone B.',
    geometry: {
      kind: 'insert-flank',
      edgeLengthUm: 9000,
      thicknessUm: 4760,
      noseRadiusUm: 800,
      depthOfCutUm: 2000,
      coating: 'TiAlN',
      wear: { vbCornerUm: 210, vbMeanUm: 165, undulationUm: 8, roughnessUm: 10, peaks: [], notchUm: 0, notchWidthUm: 1 },
    },
    wearModes: ['flank'],
    surfaceZUm: 4870,
    homeStage: { xUm: 1300, yUm: 300, rotationDeg: 0 },
    loadRotationDeg: 1.8,
    seed: 31,
    provenance: { type: 'synthetic', note: SYNTHETIC_NOTE },
    workpiece: 'Scenario: AISI 1045 steel (illustrative context only)',
    cuttingConditions: 'Scenario: dry longitudinal turning, a_p = 2 mm (illustrative context only)',
  },
  {
    id: 'FW-02',
    title: 'Irregular flank wear near tool-life criterion',
    description:
      'TiAlN-coated carbide insert with irregular flank wear and a local wear peak. Decide which ISO 3685 flank-wear criterion applies.',
    geometry: {
      kind: 'insert-flank',
      edgeLengthUm: 9000,
      thicknessUm: 4760,
      noseRadiusUm: 800,
      depthOfCutUm: 2000,
      coating: 'TiAlN',
      wear: {
        vbCornerUm: 360,
        vbMeanUm: 270,
        undulationUm: 30,
        roughnessUm: 22,
        peaks: [{ xUm: 1380, heightUm: 360, widthUm: 60 }],
        notchUm: 0,
        notchWidthUm: 1,
      },
    },
    wearModes: ['flank'],
    surfaceZUm: 5010,
    homeStage: { xUm: 1400, yUm: 350, rotationDeg: 0 },
    loadRotationDeg: -2.4,
    seed: 47,
    provenance: { type: 'synthetic', note: SYNTHETIC_NOTE },
    workpiece: 'Scenario: AISI 4140 steel (illustrative context only)',
    cuttingConditions: 'Scenario: wet longitudinal turning, a_p = 2 mm (illustrative context only)',
  },
  {
    id: 'NW-01',
    title: 'Notch wear at depth-of-cut line',
    description:
      'Uncoated carbide insert with moderate flank wear and pronounced notch wear at the depth-of-cut line, typical of work-hardening alloys.',
    geometry: {
      kind: 'insert-flank',
      edgeLengthUm: 9000,
      thicknessUm: 4760,
      noseRadiusUm: 800,
      depthOfCutUm: 1500,
      coating: 'uncoated',
      wear: { vbCornerUm: 190, vbMeanUm: 140, undulationUm: 10, roughnessUm: 12, peaks: [], notchUm: 520, notchWidthUm: 180 },
    },
    wearModes: ['flank', 'notch'],
    surfaceZUm: 4820,
    homeStage: { xUm: 1500, yUm: 380, rotationDeg: 0 },
    loadRotationDeg: 0.9,
    seed: 59,
    provenance: { type: 'synthetic', note: SYNTHETIC_NOTE },
    workpiece: 'Scenario: nickel-base superalloy (illustrative context only)',
    cuttingConditions: 'Scenario: flood-cooled turning, a_p = 1.5 mm (illustrative context only)',
  },
  {
    id: 'CR-01',
    title: 'Crater wear on rake face',
    description:
      'TiN-coated carbide insert viewed normal to the rake face, showing a crater behind the cutting edge. Crater width KB and front distance KF can be measured optically; crater depth KT cannot.',
    geometry: {
      kind: 'insert-rake',
      edgeLengthUm: 9000,
      noseRadiusUm: 800,
      depthOfCutUm: 2000,
      coating: 'TiN',
      crater: { kfUm: 140, kbUm: 640, xStartUm: 450, xEndUm: 2050 },
      edgeBandUm: 60,
    },
    wearModes: ['crater', 'flank'],
    surfaceZUm: 4950,
    homeStage: { xUm: 1250, yUm: 400, rotationDeg: 0 },
    loadRotationDeg: -0.7,
    seed: 73,
    provenance: { type: 'synthetic', note: SYNTHETIC_NOTE },
    workpiece: 'Scenario: plain carbon steel at high cutting speed (illustrative context only)',
  },
];

export function getSpecimen(id: string): SpecimenDef {
  const s = SPECIMENS.find((sp) => sp.id === id);
  if (!s) throw new Error(`Unknown specimen ${id}`);
  return s;
}

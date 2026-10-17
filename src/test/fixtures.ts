import { getSpecimen } from '@/data/specimens';
import type { MicroscopeState, ObjectiveId } from '@/core/types';

/** A well-adjusted microscope state, in focus on the given specimen. */
export function focusedState(specimenId: string, objectiveId: ObjectiveId, overrides: Partial<MicroscopeState> = {}): MicroscopeState {
  const sp = getSpecimen(specimenId);
  return {
    specimenId,
    objectiveId,
    stage: { ...sp.homeStage },
    focusZUm: sp.surfaceZUm,
    illumination: { mode: 'coaxial', intensity: 0.75 },
    camera: { brightness: 0, contrast: 1, exposure: 1 },
    ...overrides,
  };
}

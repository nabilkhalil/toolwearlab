import { useMemo } from 'react';
import { calibrationKey, calibrationStatusFor, isUsable } from '@/core/calibration';
import { deriveReadings, summarise } from '@/core/measurement';
import type { CalibrationRecord, CalibrationStatus, CapturedFrame, LineMeasurement, MeasurementSession, SpecimenDef, WearPoint, WearSummary } from '@/core/types';
import { SPECIMENS } from '@/data/specimens';
import { useActiveFrame, useApp } from '@/state/store';

export interface MeasurementContext {
  frame: CapturedFrame | null;
  specimen: SpecimenDef | null;
  session: MeasurementSession | null;
  calKey: string | null;
  cal: CalibrationRecord | null;
  calStatus: CalibrationStatus;
  points: WearPoint[];
  lines: LineMeasurement[];
  summary: WearSummary;
}

export function computeContext(frame: CapturedFrame | null, session: MeasurementSession | null, calibrations: Record<string, CalibrationRecord>): MeasurementContext {
  const specimen = frame ? (SPECIMENS.find((s) => s.id === frame.specimenId) ?? null) : null;
  const calKey = frame ? calibrationKey(frame) : null;
  const cal = calKey ? (calibrations[calKey] ?? null) : null;
  const calStatus = frame ? calibrationStatusFor(cal, frame.source === 'imported' ? 'imported' : frame.microscope.objectiveId) : 'none';
  const usable = isUsable(calStatus) ? cal : null;
  const r = frame && session ? deriveReadings(session, frame, usable, specimen) : { points: [], lines: [] };
  return { frame, specimen, session, calKey, cal, calStatus, points: r.points, lines: r.lines, summary: summarise(r.points, usable) };
}

export function useMeasurement(): MeasurementContext {
  const frame = useActiveFrame();
  const session = useApp((s) => (frame ? (s.sessions[frame.id] ?? null) : null));
  const calibrations = useApp((s) => s.calibrations);
  return useMemo(() => computeContext(frame, session, calibrations), [frame, session, calibrations]);
}

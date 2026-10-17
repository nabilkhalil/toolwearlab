import { OBJECTIVES } from './optics';
import { assessFlankCriteria } from './wearCriteria';
import type { CalibrationRecord, CapturedFrame, LineMeasurement, MeasurementSession, WearPoint, WearSummary } from './types';

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells: unknown[]): string {
  return cells.map(csvEscape).join(',');
}

export interface ExportContext {
  session: MeasurementSession;
  frame: CapturedFrame;
  calibration: CalibrationRecord | null;
  summary: WearSummary;
  readings: WearPoint[];
  lineReadings: LineMeasurement[];
  student: { name: string; id: string };
  specimenTitle: string;
  appVersion: string;
}

/**
 * CSV layout: a metadata block (key,value), a blank line, the per-point
 * table, a blank line, and the summary/criteria table. All lengths in µm.
 */
export function buildCsv(ctx: ExportContext): string {
  const { session, frame, calibration: cal, summary } = ctx;
  const lines: string[] = [];
  const objective = frame.microscope.objectiveId;
  lines.push(row(['ToolWearLab measurement export', ctx.appVersion]));
  lines.push(row(['student_name', ctx.student.name]));
  lines.push(row(['student_id', ctx.student.id]));
  lines.push(row(['session_id', session.id]));
  lines.push(row(['exported_at', new Date().toISOString()]));
  lines.push(row(['specimen', `${frame.specimenId} ${ctx.specimenTitle}`]));
  lines.push(row(['objective', OBJECTIVES[objective]?.label ?? objective]));
  lines.push(row(['frame_id', frame.id]));
  lines.push(row(['frame_source', frame.source]));
  lines.push(row(['image_size_px', `${frame.widthPx}x${frame.heightPx}`]));
  lines.push(row(['image_quality_acceptable', frame.quality.acceptable]));
  lines.push(row(['calibration_status', cal?.status ?? 'none']));
  lines.push(row(['scale_um_per_px', cal?.umPerPx]));
  lines.push(row(['scale_std_uncertainty_um_per_px', cal?.umPerPxStdUncertainty]));
  lines.push(row(['calibration_reference_um', cal?.referenceLengthUm]));
  lines.push(row(['coverage_factor_k', summary.coverageFactor]));
  lines.push('');
  lines.push(row(['point', 'zone', 'x_px', 'y_px', 'distance_px', 'VB_um', 'u_um_k1']));
  ctx.readings.forEach((p, i) => lines.push(row([i + 1, p.zone, p.p.x, p.p.y, p.distancePx, p.vbUm, p.uUm])));
  if (ctx.lineReadings.length) {
    lines.push('');
    lines.push(row(['line', 'kind', 'label', 'length_px', 'length_um', 'u_um_k1']));
    ctx.lineReadings.forEach((l, i) => lines.push(row([i + 1, l.kind, l.label, l.lengthPx, l.lengthUm, l.uUm])));
  }
  lines.push('');
  lines.push(row(['quantity', 'value_um', 'expanded_uncertainty_um']));
  const k = summary.coverageFactor;
  lines.push(row(['VB_B_mean', summary.vbMeanUm, summary.uMeanUm !== null ? summary.uMeanUm * k : null]));
  lines.push(row(['VB_B_max', summary.vbMaxUm, summary.uMaxUm !== null ? summary.uMaxUm * k : null]));
  lines.push(row(['VB_B_min', summary.vbMinUm, null]));
  lines.push(row(['VB_B_std_dev', summary.stdDevUm, null]));
  lines.push(row(['VB_C_max', summary.vbcMaxUm, null]));
  lines.push(row(['VB_N_max', summary.vbnMaxUm, null]));
  lines.push(row(['n_zone_B', summary.n, null]));
  lines.push('');
  lines.push(row(['criterion', 'limit_um', 'value_um', 'reached']));
  for (const c of assessFlankCriteria(summary))
    lines.push(row([c.criterion, c.limitUm, c.valueUm, c.valueUm === null ? 'n/a' : c.reached === null ? 'indeterminate' : c.reached ? 'yes' : 'no']));
  return lines.join('\r\n') + '\r\n';
}

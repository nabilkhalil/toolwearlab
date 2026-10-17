import type { jsPDF as JsPDF } from 'jspdf';
import { OBJECTIVES } from '@/core/optics';
import { relativeScaleUncertainty } from '@/core/calibration';
import { assessFlankCriteria, irregularityIndex } from '@/core/wearCriteria';
import type { MeasurementContext } from '@/hooks/useMeasurement';
import type { GradeResult } from '@/features/assessment/grading';
import { APP_VERSION } from '@/version';

export interface PdfInput {
  ctx: MeasurementContext;
  student: { name: string; id: string };
  annotated: HTMLCanvasElement | null;
  assessment?: { title: string; result: GradeResult }[];
}

function fmt(v: number | null | undefined, d = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d);
}

/** Measurement report (A4 portrait). jsPDF is loaded on demand. */
export async function buildPdf(input: PdfInput): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { ctx, student } = input;
  const doc: JsPDF = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = M;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('ToolWearLab: Tool Wear Measurement Report', M, y + 2);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`MMT15603 Assessment of Machinability · ToolWearLab ${APP_VERSION} · generated ${new Date().toLocaleString()}`, M, y);
  y += 5;
  doc.text('Measurements on SYNTHETIC specimens train technique; design values are not experimental data.', M, y);
  doc.setTextColor(0);
  y += 4;

  const f = ctx.frame;
  const cal = ctx.cal;
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 0.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } },
    body: [
      ['Student', `${student.name || '—'} (${student.id || '—'})`],
      ['Specimen', f ? `${f.specimenId}${ctx.specimen ? ` · ${ctx.specimen.title}` : ''}` : '—'],
      ['Frame', f ? `${f.label} · ${f.widthPx}×${f.heightPx} px · ${new Date(f.capturedAt).toLocaleString()}` : '—'],
      ['Optics', f && f.source === 'simulated' ? `${OBJECTIVES[f.microscope.objectiveId].label}, ${f.microscope.illumination.mode} illumination` : 'Imported micrograph'],
      ['Image quality', f ? (f.quality.acceptable ? 'Accepted (focus and exposure within limits)' : 'Rejected') : '—'],
      ['Calibration', cal ? `${ctx.calStatus}: ${cal.umPerPx.toFixed(5)} µm/px, u_rel = ${(relativeScaleUncertainty(cal) * 100).toFixed(3)} % (k=1)` : 'none'],
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  if (input.annotated) {
    const img = input.annotated.toDataURL('image/jpeg', 0.88);
    const w = W - 2 * M;
    const h = (w * input.annotated.height) / input.annotated.width;
    doc.addImage(img, 'JPEG', M, y, w, h);
    y += h + 4;
  }

  const s = ctx.summary;
  const k = s.coverageFactor;
  autoTable(doc, {
    startY: y,
    head: [['Quantity', 'Value (µm)', `Expanded U (k=${k}) (µm)`]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
    body: [
      ['VB_B (average, zone B)', fmt(s.vbMeanUm), s.uMeanUm !== null ? `±${fmt(s.uMeanUm * k)}` : '—'],
      ['VB_B max', fmt(s.vbMaxUm), s.uMaxUm !== null ? `±${fmt(s.uMaxUm * k)}` : '—'],
      ['VB_B min / std. dev.', `${fmt(s.vbMinUm)} / ${fmt(s.stdDevUm)}`, ''],
      ['VB_C max (corner)', fmt(s.vbcMaxUm), ''],
      ['VB_N max (notch zone)', fmt(s.vbnMaxUm), ''],
      ['Readings in zone B', String(s.n), ''],
      ['Irregularity (max − mean)/mean', fmt(irregularityIndex(s), 2), ''],
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;

  autoTable(doc, {
    startY: y,
    head: [['ISO 3685 criterion (sintered carbide)', 'Limit (µm)', 'Value (µm)', 'Reached?']],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
    body: assessFlankCriteria(s).map((c) => [c.criterion, String(c.limitUm), fmt(c.valueUm), c.valueUm === null ? 'n/a' : c.reached === null ? 'indeterminate (within ±U)' : c.reached ? 'yes' : 'no']),
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;

  if (ctx.points.length) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Zone', 'x (px)', 'y (px)', 'VB (µm)', `U (k=${k}) (µm)`]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
      body: ctx.points.map((p, i) => [String(i + 1), p.zone, p.p.x.toFixed(1), p.p.y.toFixed(1), p.vbUm.toFixed(1), `±${(p.uUm * k).toFixed(1)}`]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }
  if (ctx.lines.length) {
    autoTable(doc, {
      startY: y,
      head: [['Label', 'Kind', 'Length (µm)', `U (k=${k}) (µm)`]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
      body: ctx.lines.map((l) => [l.label, l.kind, l.lengthUm.toFixed(1), `±${(l.uUm * k).toFixed(1)}`]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  for (const a of input.assessment ?? []) {
    autoTable(doc, {
      startY: y,
      head: [[`${a.title}: ${a.result.score}/${a.result.maxScore}`, 'Result', 'Feedback']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [8, 145, 178] },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 16 } },
      body: a.result.items.map((i) => [i.title, i.verdict, i.detail]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${p} of ${pages}`, W - M, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }
  return doc.output('blob');
}

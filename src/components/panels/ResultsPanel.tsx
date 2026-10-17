import { useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { buildCsv } from '@/core/exportCsv';
import { MIN_ZONE_B_POINTS } from '@/core/measurement';
import { IRREGULARITY_THRESHOLD, assessFlankCriteria, irregularityIndex } from '@/core/wearCriteria';
import { annotateFrame } from '@/features/export/annotate';
import { buildPdf } from '@/features/export/pdf';
import { getFrameImage } from '@/hooks/useFrameImage';
import { useMeasurement } from '@/hooks/useMeasurement';
import { downloadBlob, fmtUm } from '@/lib/utils';
import { useApp } from '@/state/store';
import { APP_VERSION } from '@/version';

function Row({ label, value, u, emphasis }: { label: string; value: string; u?: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t py-1 first:border-t-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={emphasis ? 'readout text-base font-semibold text-accent' : 'readout text-sm'}>
        {value}
        {u && <span className="ml-1 text-xs font-normal text-muted-foreground">{u}</span>}
      </span>
    </div>
  );
}

export function StudentFields() {
  const student = useApp((s) => s.student);
  const setStudent = useApp((s) => s.setStudent);
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label htmlFor="st-name">Student name</Label>
        <Input id="st-name" value={student.name} onChange={(e) => setStudent({ name: e.target.value })} autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="st-id">Matric no.</Label>
        <Input id="st-id" value={student.id} onChange={(e) => setStudent({ id: e.target.value })} />
      </div>
    </div>
  );
}

export function ResultsPanel() {
  const ctx = useMeasurement();
  const student = useApp((s) => s.student);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { frame, summary: s, session, cal } = ctx;
  const k = s.coverageFactor;
  const irr = irregularityIndex(s);
  const criteria = assessFlankCriteria(s);

  const fileBase = `toolwearlab_${frame?.specimenId ?? 'frame'}_${(student.id || 'student').replace(/[^\w-]+/g, '')}`;

  const exportCsv = () => {
    if (!frame || !session) return;
    const csv = buildCsv({
      session,
      frame,
      calibration: cal,
      summary: s,
      readings: ctx.points,
      lineReadings: ctx.lines,
      student,
      specimenTitle: ctx.specimen?.title ?? 'Imported micrograph',
      appVersion: APP_VERSION,
    });
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
  };

  const exportPdf = async () => {
    if (!frame) return;
    setBusy(true);
    setErr(null);
    try {
      const img = await getFrameImage(frame);
      const annotated = annotateFrame(img.canvas, session?.edge ?? null, ctx.points, ctx.lines);
      const blob = await buildPdf({ ctx, student, annotated });
      downloadBlob(blob, `${fileBase}.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Student</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentFields />
        </CardContent>
      </Card>
      {!frame ? (
        <p className="p-2 text-sm text-muted-foreground">Results appear here for the selected frame.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Flank wear result</CardTitle>
              <Badge variant="muted">{frame.label}</Badge>
            </CardHeader>
            <CardContent>
              <Row label="VB_B (average)" value={fmtUm(s.vbMeanUm)} u={s.uMeanUm !== null ? `± ${(s.uMeanUm * k).toFixed(1)} (k=${k})` : undefined} emphasis />
              <Row label="VB_B max" value={fmtUm(s.vbMaxUm)} u={s.uMaxUm !== null ? `± ${(s.uMaxUm * k).toFixed(1)} (k=${k})` : undefined} emphasis />
              <Row label="VB_B min · std. dev." value={`${fmtUm(s.vbMinUm)} · ${fmtUm(s.stdDevUm)}`} />
              <Row label="VB_C max (corner)" value={fmtUm(s.vbcMaxUm)} />
              <Row label="VB_N max (notch zone)" value={fmtUm(s.vbnMaxUm)} />
              <Row label="Readings in zone B" value={String(s.n)} />
              <Row label="Irregularity (max − mean)/mean" value={irr === null ? '—' : irr.toFixed(2)} />
              {s.n > 0 && s.n < MIN_ZONE_B_POINTS && (
                <Alert variant="warning" className="mt-2">
                  <TriangleAlert />
                  <div>Only {s.n} zone-B readings. Take at least {MIN_ZONE_B_POINTS}, spread along the whole of zone B.</div>
                </Alert>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                U includes the calibration and the pick resolution only. Interpreting where the wear-land boundary lies is usually the larger contribution; estimate it by
                repeating the measurement on the same frame and comparing.
              </p>
              {irr !== null && irr > IRREGULARITY_THRESHOLD && (
                <p className="mt-2 text-[11px] leading-relaxed text-warning">The land looks irregular: judge visually whether VB_B max governs. (Heuristic only.)</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ISO 3685 tool-life criteria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {criteria.map((c) => (
                <div key={c.criterion} className="flex items-start justify-between gap-2 text-xs">
                  <div>
                    <div className="font-medium">{c.criterion}</div>
                    <div className="text-muted-foreground">
                      limit {c.limitUm} µm · {c.note}
                    </div>
                  </div>
                  <Badge variant={c.valueUm === null ? 'muted' : c.reached === null ? 'warning' : c.reached ? 'destructive' : 'success'}>
                    {c.valueUm === null ? 'n/a' : c.reached === null ? 'indeterminate' : c.reached ? 'reached' : 'not reached'}
                  </Badge>
                </div>
              ))}
              <p className="text-[11px] leading-relaxed text-muted-foreground">“Indeterminate” means the limit lies within the expanded uncertainty of your result: take more readings or improve calibration before deciding.</p>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!session} data-testid="export-csv">
              <FileSpreadsheet /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => void exportPdf()} disabled={busy} data-testid="export-pdf">
              {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Export PDF report
            </Button>
          </div>
          {err && <Alert variant="error">{err}</Alert>}
        </>
      )}
    </div>
  );
}

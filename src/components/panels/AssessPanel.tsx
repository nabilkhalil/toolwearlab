import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, FileDown, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import type { CapturedFrame, WearMode } from '@/core/types';
import { SPECIMENS, getSpecimen } from '@/data/specimens';
import { gradeCalibration, gradeCrater, gradeFlank, gradeWearModes, type GradeResult } from '@/features/assessment/grading';
import { annotateFrame } from '@/features/export/annotate';
import { buildPdf } from '@/features/export/pdf';
import { getFrameImage } from '@/hooks/useFrameImage';
import { computeContext } from '@/hooks/useMeasurement';
import { downloadBlob } from '@/lib/utils';
import { useApp } from '@/state/store';
import { StudentFields } from './ResultsPanel';
import { cn } from '@/lib/utils';

const FLANK_TASK = 'FW-02';
const CRATER_TASK = 'CR-01';
const MODE_TASK = ['FW-00', 'FW-01', 'NW-01', 'CR-01'];
const MODES: WearMode[] = ['none', 'flank', 'crater', 'notch'];

function Feedback({ result }: { result: GradeResult }) {
  return (
    <div className="space-y-1.5 border-t pt-2" data-testid="feedback">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Feedback</span>
        <Badge variant={result.score === result.maxScore ? 'success' : result.score >= result.maxScore / 2 ? 'warning' : 'destructive'}>
          {result.score} / {result.maxScore}
        </Badge>
      </div>
      {result.items.map((i) => (
        <div key={i.title} className="flex gap-1.5 text-xs leading-relaxed">
          {i.verdict === 'pass' ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> : i.verdict === 'partial' ? <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
          <span>
            <b>{i.title}.</b> {i.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T | null; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn('flex-1 cursor-pointer rounded-md border px-2 py-1 text-xs', value === o.v ? 'border-primary bg-primary/15 text-primary' : 'hover:bg-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Frame of a specimen with the most readings (the student's working frame). */
function bestFrame(frames: CapturedFrame[], sessions: ReturnType<typeof useApp.getState>['sessions'], specimenId: string): CapturedFrame | null {
  const cands = frames.filter((f) => f.specimenId === specimenId);
  if (!cands.length) return null;
  return cands.reduce((a, b) => ((sessions[b.id]?.points.length ?? 0) + (sessions[b.id]?.lines.length ?? 0) > (sessions[a.id]?.points.length ?? 0) + (sessions[a.id]?.lines.length ?? 0) ? b : a));
}

export function AssessPanel() {
  const frames = useApp((s) => s.frames);
  const sessions = useApp((s) => s.sessions);
  const calibrations = useApp((s) => s.calibrations);
  const assessment = useApp((s) => s.assessment);
  const setAssessment = useApp((s) => s.setAssessment);
  const student = useApp((s) => s.student);
  const [busy, setBusy] = useState(false);

  const flankFrame = bestFrame(frames, sessions, FLANK_TASK);
  const flankCtx = useMemo(() => computeContext(flankFrame, flankFrame ? (sessions[flankFrame.id] ?? null) : null, calibrations), [flankFrame, sessions, calibrations]);
  const craterFrame = bestFrame(frames, sessions, CRATER_TASK);
  const craterCtx = useMemo(() => computeContext(craterFrame, craterFrame ? (sessions[craterFrame.id] ?? null) : null, calibrations), [craterFrame, sessions, calibrations]);
  const kb = craterCtx.lines.filter((l) => l.kind === 'crater-kb').at(-1)?.lengthUm ?? null;
  const kf = craterCtx.lines.filter((l) => l.kind === 'crater-kf').at(-1)?.lengthUm ?? null;

  const results = {
    calibration: assessment.calibration.submitted ? gradeCalibration(calibrations['5x'] ?? null, '5x') : null,
    flank: assessment.flank.submitted ? gradeFlank({ summary: flankCtx.summary, regularity: assessment.flank.regularity, toolLifeReached: assessment.flank.toolLifeReached }, getSpecimen(FLANK_TASK)) : null,
    modes: assessment.modes.submitted ? gradeWearModes(assessment.modes.answers, SPECIMENS.filter((s) => MODE_TASK.includes(s.id))) : null,
    crater: assessment.crater.submitted ? gradeCrater(kb, kf, getSpecimen(CRATER_TASK)) : null,
  };
  const graded = [
    results.calibration && { title: 'A1 Calibration (5×)', result: results.calibration },
    results.flank && { title: 'A2 Flank wear FW-02', result: results.flank },
    results.modes && { title: 'A3 Wear modes', result: results.modes },
    results.crater && { title: 'A4 Crater CR-01', result: results.crater },
  ].filter(Boolean) as { title: string; result: GradeResult }[];
  const score = graded.reduce((s, g) => s + g.result.score, 0);
  const max = graded.reduce((s, g) => s + g.result.maxScore, 0);

  const exportPdf = async () => {
    setBusy(true);
    try {
      let annotated: HTMLCanvasElement | null = null;
      if (flankFrame) {
        const img = await getFrameImage(flankFrame);
        annotated = annotateFrame(img.canvas, flankCtx.session?.edge ?? null, flankCtx.points, flankCtx.lines);
      }
      const blob = await buildPdf({ ctx: flankCtx, student, annotated, assessment: graded });
      downloadBlob(blob, `toolwearlab_assessment_${(student.id || 'student').replace(/[^\w-]+/g, '')}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Alert variant="info">
        <div>
          Practice assessment. Your results are compared with the <b>design values</b> of the synthetic specimens and the simulator's true optical scale. Feedback is formative; resubmit as often as you like.
        </div>
      </Alert>
      <Card>
        <CardContent className="pt-3">
          <StudentFields />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>A1 · Calibrate the 5× objective</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Calibrate and verify 5× on MIC-01 (Calibrate tab), then submit.</p>
          <Button size="sm" onClick={() => setAssessment({ calibration: { submitted: true } })} data-testid="submit-a1">
            Submit calibration
          </Button>
          {results.calibration && <Feedback result={results.calibration} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>A2 · Flank wear on FW-02</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Capture FW-02, measure VB in zone B, then judge regularity and the tool-life decision.
            {flankFrame ? ` Using frame ${flankFrame.label}: ${flankCtx.summary.n} zone-B readings.` : ' No FW-02 frame yet.'}
          </p>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Zone B wear is…</div>
            <Choice
              label="Regularity"
              value={assessment.flank.regularity}
              options={[
                { v: 'regular', label: 'Regular' },
                { v: 'irregular', label: 'Irregular' },
              ]}
              onChange={(v) => setAssessment({ flank: { ...assessment.flank, regularity: v } })}
            />
            <div className="pt-1 text-xs text-muted-foreground">Has the ISO 3685 flank-wear tool-life criterion been reached?</div>
            <Choice
              label="Tool-life decision"
              value={assessment.flank.toolLifeReached}
              options={[
                { v: 'yes', label: 'Yes' },
                { v: 'no', label: 'No' },
              ]}
              onChange={(v) => setAssessment({ flank: { ...assessment.flank, toolLifeReached: v } })}
            />
          </div>
          <Button size="sm" onClick={() => setAssessment({ flank: { ...assessment.flank, submitted: true } })} disabled={!flankFrame} data-testid="submit-a2">
            Submit flank wear answer
          </Button>
          {results.flank && <Feedback result={results.flank} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>A3 · Identify wear modes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Inspect each specimen and tick every wear mode present.</p>
          {MODE_TASK.map((id) => {
            const sel = assessment.modes.answers[id] ?? [];
            return (
              <div key={id} className="space-y-1">
                <div className="text-xs font-medium">{id}</div>
                <div className="flex flex-wrap gap-1">
                  {MODES.map((m) => {
                    const on = sel.includes(m);
                    return (
                      <button
                        key={m}
                        aria-pressed={on}
                        onClick={() => {
                          const next = on ? sel.filter((x) => x !== m) : m === 'none' ? ['none' as WearMode] : [...sel.filter((x) => x !== 'none'), m];
                          setAssessment({ modes: { ...assessment.modes, answers: { ...assessment.modes.answers, [id]: next } } });
                        }}
                        className={cn('cursor-pointer rounded border px-2 py-0.5 text-xs capitalize', on ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted')}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <Button size="sm" onClick={() => setAssessment({ modes: { ...assessment.modes, submitted: true } })}>
            Submit identification
          </Button>
          {results.modes && <Feedback result={results.modes} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>A4 · Crater geometry on CR-01</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Calibrate the objective you use, capture CR-01 and measure KB and KF with their tools.{' '}
            <span className="readout">
              KB {kb === null ? '—' : `${kb.toFixed(0)} µm`} · KF {kf === null ? '—' : `${kf.toFixed(0)} µm`}
            </span>
          </p>
          <Button size="sm" onClick={() => setAssessment({ crater: { submitted: true } })} disabled={!craterFrame}>
            Submit crater measurements
          </Button>
          {results.crater && <Feedback result={results.crater} />}
        </CardContent>
      </Card>

      {graded.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            Total <span className="readout font-semibold">{score}</span> / <span className="readout">{max}</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => void exportPdf()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Assessment PDF
          </Button>
        </div>
      )}
    </div>
  );
}

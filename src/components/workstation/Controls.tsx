import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsDown, ChevronsUp, ChevronDown, ChevronUp, Home, Lightbulb, RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { OBJECTIVES, OBJECTIVE_ORDER, depthOfFieldUm, rayleighResolutionUm } from '@/core/optics';
import { calibrationStatusFor } from '@/core/calibration';
import { SPECIMENS } from '@/data/specimens';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';

/** Button that repeats its action while held (like a focus knob). */
function HoldButton({ onStep, children, label, className }: { onStep: () => void; children: React.ReactNode; label: string; className?: string }) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    onStep();
    let delay = 350;
    const tick = () => {
      onStep();
      delay = Math.max(45, delay * 0.8);
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, delay);
  };
  useEffect(() => stop, []);
  return (
    <Button
      type="button"
      variant="secondary"
      size="iconSm"
      aria-label={label}
      title={label}
      className={className}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStep();
        }
      }}
    >
      {children}
    </Button>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="readout text-foreground">
        {value}
        {unit && <span className="ml-0.5 text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

export function SpecimenCard() {
  const specimenId = useApp((s) => s.microscope.specimenId);
  const loadSpecimen = useApp((s) => s.loadSpecimen);
  const sp = SPECIMENS.find((s) => s.id === specimenId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Specimen holder</CardTitle>
        <Badge variant="muted">{sp?.provenance.type}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <select
          aria-label="Load specimen"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={specimenId}
          onChange={(e) => loadSpecimen(e.target.value)}
        >
          {SPECIMENS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.title}
            </option>
          ))}
        </select>
        {sp && <p className="text-xs leading-relaxed text-muted-foreground">{sp.description}</p>}
      </CardContent>
    </Card>
  );
}

const STEPS = [1, 10, 100, 1000] as const;

export function StageCard() {
  const stage = useApp((s) => s.microscope.stage);
  const moveStage = useApp((s) => s.moveStage);
  const setStage = useApp((s) => s.setStage);
  const specimenId = useApp((s) => s.microscope.specimenId);
  const [step, setStep] = useState<number>(100);
  const home = () => {
    const sp = SPECIMENS.find((s) => s.id === specimenId);
    if (sp) setStage({ ...sp.homeStage });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>XY stage & rotation</CardTitle>
        <Button variant="ghost" size="sm" onClick={home} title="Return to the specimen home position">
          <Home /> Home
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Move view over specimen">
            <span />
            <HoldButton label="Move view up" onStep={() => moveStage(0, -step)}>
              <ArrowUp />
            </HoldButton>
            <span />
            <HoldButton label="Move view left" onStep={() => moveStage(-step, 0)}>
              <ArrowLeft />
            </HoldButton>
            <div className="grid size-8 place-items-center rounded-md border border-dashed text-[10px] text-muted-foreground">XY</div>
            <HoldButton label="Move view right" onStep={() => moveStage(step, 0)}>
              <ArrowRight />
            </HoldButton>
            <span />
            <HoldButton label="Move view down" onStep={() => moveStage(0, step)}>
              <ArrowDown />
            </HoldButton>
            <span />
          </div>
          <div className="flex-1 space-y-1">
            <Readout label="X" value={stage.xUm.toFixed(0)} unit="µm" />
            <Readout label="Y" value={stage.yUm.toFixed(0)} unit="µm" />
            <div className="flex gap-1 pt-1" role="radiogroup" aria-label="Stage step">
              {STEPS.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={step === s}
                  onClick={() => setStep(s)}
                  className={cn('readout flex-1 cursor-pointer rounded border px-1 py-0.5 text-[10px]', step === s ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground')}
                >
                  {s >= 1000 ? `${s / 1000}mm` : `${s}µm`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Insert rotation</span>
            <span className="readout">{stage.rotationDeg.toFixed(1)}°</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HoldButton label="Rotate −0.1°" onStep={() => setStage({ rotationDeg: Math.max(-15, +(useApp.getState().microscope.stage.rotationDeg - 0.1).toFixed(1)) })}>
              <RotateCcw />
            </HoldButton>
            <Slider aria-label="Insert rotation" min={-15} max={15} step={0.1} value={[stage.rotationDeg]} onValueChange={([v]) => setStage({ rotationDeg: v ?? 0 })} />
            <HoldButton label="Rotate +0.1°" onStep={() => setStage({ rotationDeg: Math.min(15, +(useApp.getState().microscope.stage.rotationDeg + 0.1).toFixed(1)) })}>
              <RotateCw />
            </HoldButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FocusCard() {
  const z = useApp((s) => s.microscope.focusZUm);
  const focusBy = useApp((s) => s.focusBy);
  const q = useApp((s) => s.liveQuality);
  const key = useApp((s) => `${s.microscope.specimenId}|${s.microscope.objectiveId}`);
  const peak = useApp((s) => s.peakSharpness[key] ?? 0);
  const rel = q && peak > 0 ? Math.min(1, q.sharpness / peak) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus (Z)</CardTitle>
        <span className="readout text-xs">{z.toFixed(0)} µm</span>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Coarse · 100 µm</div>
            <div className="flex gap-1">
              <HoldButton label="Coarse focus up" onStep={() => focusBy(100)}>
                <ChevronsUp />
              </HoldButton>
              <HoldButton label="Coarse focus down" onStep={() => focusBy(-100)}>
                <ChevronsDown />
              </HoldButton>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Fine · 2 µm</div>
            <div className="flex gap-1">
              <HoldButton label="Fine focus up" onStep={() => focusBy(2)}>
                <ChevronUp />
              </HoldButton>
              <HoldButton label="Fine focus down" onStep={() => focusBy(-2)}>
                <ChevronDown />
              </HoldButton>
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Sharpness (relative to best seen)</span>
            <span className="readout">{(rel * 100).toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Relative sharpness" aria-valuenow={Math.round(rel * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full transition-[width] duration-150', q?.focusOk ? 'bg-success' : 'bg-primary/70')} style={{ width: `${rel * 100}%` }} />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Keys: Q/A coarse, W/S fine, arrows move the stage.</p>
      </CardContent>
    </Card>
  );
}

export function OpticsCard() {
  const objectiveId = useApp((s) => s.microscope.objectiveId);
  const setObjective = useApp((s) => s.setObjective);
  const calibrations = useApp((s) => s.calibrations);
  const o = OBJECTIVES[objectiveId];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Objective turret</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Objective">
          {OBJECTIVE_ORDER.map((id) => {
            const st = calibrationStatusFor(calibrations[id], id);
            return (
              <button
                key={id}
                role="radio"
                aria-checked={objectiveId === id}
                onClick={() => setObjective(id)}
                className={cn(
                  'relative cursor-pointer rounded-md border py-1.5 text-sm font-semibold transition-colors',
                  objectiveId === id ? 'border-primary bg-primary/15 text-primary' : 'hover:bg-muted',
                )}
              >
                {id.replace('x', '×')}
                <span
                  className={cn('absolute right-1 top-1 size-1.5 rounded-full', st === 'verified' ? 'bg-success' : st === 'calibrated' ? 'bg-warning' : st === 'invalid' ? 'bg-destructive' : 'bg-muted-foreground/40')}
                  title={`Calibration: ${st}`}
                />
              </button>
            );
          })}
        </div>
        <Readout label="Numerical aperture" value={o.numericalAperture.toFixed(3)} />
        <Readout label="Depth of field" value={depthOfFieldUm(o).toFixed(1)} unit="µm" />
        <Readout label="Rayleigh resolution" value={rayleighResolutionUm(o).toFixed(2)} unit="µm" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">Changing objective changes µm/px: each objective needs its own calibration (dot: grey none, amber calibrated, green verified).</p>
      </CardContent>
    </Card>
  );
}

function LabeledSlider(props: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-muted-foreground">{props.label}</span>
        <span className="readout">{props.format(props.value)}</span>
      </div>
      <Slider aria-label={props.label} min={props.min} max={props.max} step={props.step} value={[props.value]} onValueChange={([v]) => props.onChange(v ?? props.value)} />
    </div>
  );
}

export function IlluminationCard() {
  const ill = useApp((s) => s.microscope.illumination);
  const cam = useApp((s) => s.microscope.camera);
  const setMicroscope = useApp((s) => s.setMicroscope);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Illumination & camera</CardTitle>
        <Lightbulb className="size-3.5 text-accent" />
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Illumination mode">
          {(['coaxial', 'ring'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={ill.mode === m}
              onClick={() => setMicroscope({ illumination: { ...ill, mode: m } })}
              className={cn('cursor-pointer rounded-md border py-1 text-xs font-medium', ill.mode === m ? 'border-primary bg-primary/15 text-primary' : 'hover:bg-muted')}
            >
              {m === 'coaxial' ? 'Coaxial bright-field' : 'Ring light (oblique)'}
            </button>
          ))}
        </div>
        <LabeledSlider label="Lamp intensity" value={ill.intensity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setMicroscope({ illumination: { ...ill, intensity: v } })} />
        <LabeledSlider
          label="Exposure"
          value={Math.log2(cam.exposure)}
          min={-2}
          max={2}
          step={0.05}
          format={(v) => `×${Math.pow(2, v).toFixed(2)}`}
          onChange={(v) => setMicroscope({ camera: { ...cam, exposure: Math.pow(2, v) } })}
        />
        <LabeledSlider label="Brightness" value={cam.brightness} min={-0.5} max={0.5} step={0.01} format={(v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}`} onChange={(v) => setMicroscope({ camera: { ...cam, brightness: v } })} />
        <LabeledSlider label="Contrast" value={cam.contrast} min={0.5} max={2} step={0.01} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => setMicroscope({ camera: { ...cam, contrast: v } })} />
      </CardContent>
    </Card>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { CAMERA, OBJECTIVES } from '@/core/optics';
import { calibrationStatusFor, isUsable } from '@/core/calibration';
import { exposureStats, lumaFromRgba } from '@/core/imaging';
import { getSpecimen } from '@/data/specimens';
import { useApp } from '@/state/store';
import { cn, uid } from '@/lib/utils';
import { paint, renderClient } from '@/workers/renderClient';
import type { ImageQualityReport } from '@/core/types';

/** Live preview is rendered at half sensor resolution to stay interactive. */
export const LIVE_SCALE = 0.5;

/** A "nice" scale-bar length (1, 2, 5 × 10ⁿ µm) near a target. */
function niceLength(target: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}

function Histogram({ hist }: { hist: Uint32Array | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !hist) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    let max = 1;
    for (let i = 1; i < 255; i++) max = Math.max(max, hist[i]!);
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    for (let i = 0; i < 256; i++) {
      const h = Math.min(1, hist[i]! / max) * c.height;
      ctx.fillStyle = i >= 250 ? 'rgba(248,113,113,0.95)' : i <= 5 ? 'rgba(96,165,250,0.95)' : 'rgba(148,163,184,0.85)';
      ctx.fillRect(i, c.height - h, 1, h);
    }
  }, [hist]);
  return <canvas ref={ref} width={256} height={48} className="h-12 w-40 rounded bg-black/50" aria-label="Grey-level histogram" role="img" />;
}

export function LiveView() {
  const microscope = useApp((s) => s.microscope);
  const zoom = useApp((s) => s.liveDigitalZoom);
  const setZoom = useApp((s) => s.setLiveDigitalZoom);
  const showCrosshair = useApp((s) => s.showCrosshair);
  const toggle = useApp((s) => s.toggle);
  const quality = useApp((s) => s.liveQuality);
  const setLiveQuality = useApp((s) => s.setLiveQuality);
  const notePeak = useApp((s) => s.notePeakSharpness);
  const addFrame = useApp((s) => s.addFrame);
  const frames = useApp((s) => s.frames);
  const cal = useApp((s) => s.calibrations[s.microscope.objectiveId] ?? null);

  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hist, setHist] = useState<Uint32Array | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<ImageQualityReport | null>(null);
  const [frameReady, setFrameReady] = useState(0);

  if (!sourceRef.current && typeof document !== 'undefined') sourceRef.current = document.createElement('canvas');

  // Fit a 4:3 sensor view into the available area.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(200, Math.min(r.width, (r.height * CAMERA.widthPx) / CAMERA.heightPx));
      setSize({ w: Math.floor(w), h: Math.floor((w * CAMERA.heightPx) / CAMERA.widthPx) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-render whenever the optical state changes (latest request wins).
  useEffect(() => {
    renderClient.live(microscope, LIVE_SCALE, 1, (r) => {
      if (!sourceRef.current) return;
      paint(sourceRef.current, r);
      setLiveQuality(r.quality);
      notePeak(`${microscope.specimenId}|${microscope.objectiveId}`, r.quality.sharpness);
      setHist(exposureStats(lumaFromRgba(r.rgba, r.width, r.height)).histogram);
      setFrameReady((n) => n + 1);
    });
  }, [microscope, setLiveQuality, notePeak]);

  // Compose: digital zoom crops the centre of the sensor image (no new detail).
  useEffect(() => {
    const src = sourceRef.current;
    const dst = viewRef.current;
    if (!src || !dst || src.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    dst.width = Math.round(size.w * dpr);
    dst.height = Math.round(size.h * dpr);
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = zoom === 1;
    const cw = src.width / zoom;
    const ch = src.height / zoom;
    ctx.drawImage(src, (src.width - cw) / 2, (src.height - ch) / 2, cw, ch, 0, 0, dst.width, dst.height);
  }, [frameReady, size, zoom]);

  const capture = useCallback(async () => {
    setCapturing(true);
    setCaptureMsg(null);
    try {
      const st = useApp.getState().microscope;
      const seed = (Math.random() * 2 ** 31) >>> 0;
      const r = await renderClient.render(st, 1, seed);
      if (!r.quality.acceptable) {
        setCaptureMsg(r.quality);
        return;
      }
      const sp = getSpecimen(st.specimenId);
      const n = frames.filter((f) => f.specimenId === st.specimenId).length + 1;
      addFrame({
        id: uid('frm'),
        source: 'simulated',
        label: `${sp.id} · ${st.objectiveId.replace('x', '×')} · #${n}`,
        capturedAt: new Date().toISOString(),
        specimenId: st.specimenId,
        microscope: structuredClone(st),
        widthPx: r.width,
        heightPx: r.height,
        quality: r.quality,
        noiseSeed: seed,
      });
    } finally {
      setCapturing(false);
    }
  }, [addFrame, frames]);

  // Keyboard: stage and focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (t?.getAttribute('role') === 'slider') return;
      const s = useApp.getState();
      const step = e.shiftKey ? 500 : 50;
      const map: Record<string, () => void> = {
        ArrowLeft: () => s.moveStage(-step, 0),
        ArrowRight: () => s.moveStage(step, 0),
        ArrowUp: () => s.moveStage(0, -step),
        ArrowDown: () => s.moveStage(0, step),
        q: () => s.focusBy(100),
        a: () => s.focusBy(-100),
        w: () => s.focusBy(2),
        s: () => s.focusBy(-2),
        c: () => void capture(),
      };
      const fn = map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture]);

  const calStatus = calibrationStatusFor(cal, microscope.objectiveId);
  // Scale bar from the STUDENT's calibration (µm per sensor px), never from the hidden true scale.
  let bar: { px: number; um: number } | null = null;
  if (cal && isUsable(calStatus)) {
    const displayPxPerSensorPx = (size.w / CAMERA.widthPx) * zoom;
    const um = niceLength((size.w * 0.18 * cal.umPerPx) / displayPxPerSensorPx);
    bar = { um, px: (um / cal.umPerPx) * displayPxPerSensorPx };
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative overflow-hidden rounded-md bg-black shadow-[0_0_0_1px_var(--border)]" style={{ width: size.w, height: size.h }}>
          <canvas ref={viewRef} style={{ width: size.w, height: size.h }} data-testid="live-canvas" aria-label="Live microscope camera view" role="img" />
          {showCrosshair && (
            <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden>
              <line x1={size.w / 2} y1={0} x2={size.w / 2} y2={size.h} stroke="rgba(56,189,248,0.55)" strokeWidth={1} />
              <line x1={0} y1={size.h / 2} x2={size.w} y2={size.h / 2} stroke="rgba(56,189,248,0.55)" strokeWidth={1} />
              <circle cx={size.w / 2} cy={size.h / 2} r={Math.min(size.w, size.h) * 0.08} fill="none" stroke="rgba(56,189,248,0.55)" />
            </svg>
          )}
          <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
            <Badge variant="muted" className="bg-black/60">{OBJECTIVES[microscope.objectiveId].label}</Badge>
            <Badge variant="muted" className="bg-black/60">digital ×{zoom}</Badge>
            <Badge variant={quality?.focusOk ? 'success' : 'warning'} className="bg-black/60">
              {quality?.focusOk ? 'In focus' : 'Defocused'}
            </Badge>
            <Badge variant={quality?.exposureOk ? 'success' : 'warning'} className="bg-black/60">
              {quality?.exposureOk ? 'Exposure OK' : 'Check exposure'}
            </Badge>
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2">
            {bar ? (
              <div className="rounded bg-black/55 px-2 py-1">
                <div className="h-1 bg-white" style={{ width: bar.px }} />
                <div className="readout mt-0.5 text-[11px] text-white">{bar.um >= 1000 ? `${bar.um / 1000} mm` : `${bar.um} µm`}</div>
              </div>
            ) : (
              <Badge variant="warning" className="bg-black/60">Uncalibrated: no scale bar</Badge>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-2 right-2">
            <Histogram hist={hist} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void capture()} disabled={capturing} variant="accent" data-testid="capture">
          {capturing ? <Loader2 className="animate-spin" /> : <Camera />} Capture frame
        </Button>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Digital zoom">
          {([1, 2, 4] as const).map((z) => (
            <Button key={z} size="sm" variant={zoom === z ? 'default' : 'outline'} role="radio" aria-checked={zoom === z} onClick={() => setZoom(z)}>
              ×{z}
            </Button>
          ))}
        </div>
        <Button size="sm" variant={showCrosshair ? 'secondary' : 'outline'} onClick={() => toggle('showCrosshair')} aria-pressed={showCrosshair}>
          <Crosshair /> Crosshair
        </Button>
        <span className={cn('ml-auto text-xs', calStatus === 'none' ? 'text-warning' : 'text-muted-foreground')}>
          Calibration ({microscope.objectiveId}): <span className="font-semibold">{calStatus}</span>
        </span>
      </div>
      {captureMsg && (
        <Alert variant="error">
          <div>
            <div className="font-semibold">Frame rejected: image quality is not suitable for measurement.</div>
            <ul className="mt-1 list-disc pl-4">
              {captureMsg.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </Alert>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { Expand, Hand, Loader2, Maximize, MoveVertical, Ruler, ScanLine, SplineIcon, Target, CircleDot, BadgeCheck, Magnet, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { calibrationStatusFor, isUsable, calibrationKey } from '@/core/calibration';
import { projectOntoLine } from '@/core/geometry';
import { snapToLine } from '@/core/lineDetection';
import { deriveReadings, validateEdgeReference } from '@/core/measurement';
import { worldToImage } from '@/core/optics';
import { zoneLimits } from '@/core/wearProfile';
import { fitToViewport, screenToImage, zoomAt, type ViewTransform } from '@/core/viewTransform';
import type { CapturedFrame, SpecimenDef, Vec2 } from '@/core/types';
import { SPECIMENS } from '@/data/specimens';
import { useFrameImage } from '@/hooks/useFrameImage';
import { useApp, type Tool } from '@/state/store';
import { cn } from '@/lib/utils';

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'pan', label: 'Pan', icon: <Hand />, hint: 'Drag to pan, wheel to zoom about the cursor.' },
  { id: 'edge', label: 'Edge ref.', icon: <ScanLine />, hint: 'Click two points on the ORIGINAL (unworn) cutting edge, far apart.' },
  { id: 'vb', label: 'VB point', icon: <MoveVertical />, hint: 'Click on the lower boundary of the flank wear land. VB is measured perpendicular to the edge reference.' },
  { id: 'distance', label: 'Distance', icon: <Ruler />, hint: 'Click two points to measure a distance.' },
  { id: 'crater-kb', label: 'KB', icon: <SplineIcon />, hint: 'Crater width KB: from the original cutting edge to the back edge of the crater, perpendicular to the edge.' },
  { id: 'crater-kf', label: 'KF', icon: <CircleDot />, hint: 'Crater front distance KF: from the original cutting edge to the front edge of the crater.' },
  { id: 'calibrate', label: 'Calibrate', icon: <Target />, hint: 'Click the centres of two graduation lines far apart on the stage micrometer.' },
  { id: 'verify', label: 'Verify', icon: <BadgeCheck />, hint: 'Click two different graduation lines to verify the calibration independently.' },
];

const COLORS = { edge: '#38bdf8', vb: '#f59e0b', line: '#e879f9', cal: '#22d3ee', zone: 'rgba(255,255,255,0.55)', pending: '#a3e635' };

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function FrameView({ frame }: { frame: CapturedFrame }) {
  const { image, error } = useFrameImage(frame);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const [view, setView] = useState<ViewTransform | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const panRef = useRef<{ x: number; y: number; v: ViewTransform } | null>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  const pendingPoint = useApp((s) => s.pendingPoint);
  const setPendingPoint = useApp((s) => s.setPendingPoint);
  const pendingPair = useApp((s) => s.pendingPair);
  const setPendingPair = useApp((s) => s.setPendingPair);
  const showZones = useApp((s) => s.showZones);
  const snapOn = useApp((s) => s.snapToLines);
  const toggle = useApp((s) => s.toggle);
  const session = useApp((s) => s.sessions[frame.id] ?? null);
  const cal = useApp((s) => s.calibrations[calibrationKey(frame)] ?? null);
  const setEdge = useApp((s) => s.setEdge);
  const addPoint = useApp((s) => s.addPoint);
  const movePoint = useApp((s) => s.movePoint);
  const addLine = useApp((s) => s.addLine);

  const specimen: SpecimenDef | null = useMemo(() => SPECIMENS.find((s) => s.id === frame.specimenId) ?? null, [frame.specimenId]);
  const calStatus = calibrationStatusFor(cal, frame.source === 'imported' ? 'imported' : frame.microscope.objectiveId);
  const calOk = isUsable(calStatus);
  const readings = useMemo(
    () => (session ? deriveReadings(session, frame, calOk ? cal : null, specimen) : { points: [], lines: [] }),
    [session, frame, cal, calOk, specimen],
  );

  // Fit on first load and when the frame changes.
  useEffect(() => {
    if (image) setView(fitToViewport(image.width, image.height, size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, frame.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingPoint(null);
        setPendingPair(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPendingPoint, setPendingPair]);

  if (error) return <div className="grid h-full place-items-center text-sm text-destructive">{error}</div>;

  const v = view ?? { scale: 1, offsetX: 0, offsetY: 0 };
  const inv = 1 / v.scale;

  const pointerImage = (): Vec2 | null => {
    const st = stageRef.current;
    const p = st?.getPointerPosition();
    if (!p || !image) return null;
    const ip = screenToImage(p, v);
    return { x: Math.max(0, Math.min(image.width, ip.x)), y: Math.max(0, Math.min(image.height, ip.y)) };
  };

  const snap = (p: Vec2): Vec2 => {
    if (!snapOn || !image) return p;
    const dark = frame.microscope.illumination.mode === 'coaxial';
    const x = snapToLine(image.grey, image.width, image.height, p.x, p.y, dark, Math.max(6, 6 / v.scale));
    return x === null ? p : { x, y: p.y };
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4500);
  };

  const onClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool === 'pan') return;
    if ('button' in e.evt && e.evt.button !== 0) return;
    const p = pointerImage();
    if (!p) return;
    if (tool === 'vb') {
      if (!calOk) return flash('Calibrate this objective (or the imported image) before measuring.');
      if (!session?.edge) return flash('Define the edge reference first (Edge ref. tool).');
      addPoint(frame.id, p);
      return;
    }
    const twoClick = tool === 'calibrate' || tool === 'verify' ? snap(p) : p;
    if (!pendingPoint) {
      setPendingPoint(twoClick);
      return;
    }
    const a = pendingPoint;
    const b = twoClick;
    setPendingPoint(null);
    if (tool === 'edge') {
      const err = validateEdgeReference({ a, b });
      if (err) return flash(err);
      setEdge(frame.id, { a, b });
    } else if (tool === 'calibrate' || tool === 'verify') {
      setPendingPair({ tool, a, b });
    } else {
      if (!calOk) return flash('Calibrate before measuring distances.');
      const label = tool === 'crater-kb' ? 'KB' : tool === 'crater-kf' ? 'KF' : `D${(session?.lines.length ?? 0) + 1}`;
      addLine(frame.id, { kind: tool, a, b, label });
    }
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    const factor = Math.exp(-e.evt.deltaY * 0.0015);
    setView(zoomAt(v, p, factor));
  };

  const onDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const isMiddle = 'button' in e.evt && e.evt.button === 1;
    if (tool !== 'pan' && !isMiddle) return;
    if (e.target.draggable()) return;
    const p = stageRef.current?.getPointerPosition();
    if (p) panRef.current = { x: p.x, y: p.y, v };
  };
  const onMove = () => {
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    setCursor(screenToImage(p, v));
    const pan = panRef.current;
    if (pan) setView({ ...pan.v, offsetX: pan.v.offsetX + p.x - pan.x, offsetY: pan.v.offsetY + p.y - pan.y });
  };
  const onUp = () => {
    panRef.current = null;
  };

  // Zone boundaries for flank specimens (teaching aid).
  const zoneLines: { pts: number[]; label: string; at: Vec2 }[] = [];
  if (showZones && specimen?.geometry.kind === 'insert-flank' && frame.source === 'simulated') {
    const z = zoneLimits(specimen.geometry);
    const t = specimen.geometry.thicknessUm;
    for (const [x, label] of [[0, ''], [z.cEnd, 'C | B'], [z.bEnd, 'B | N'], [z.nEnd, 'N |']] as [number, string][]) {
      const a = worldToImage({ x, y: -150 }, frame.microscope, specimen);
      const b = worldToImage({ x, y: t }, frame.microscope, specimen);
      zoneLines.push({ pts: [a.x, a.y, b.x, b.y], label, at: a });
    }
  }

  const edge = session?.edge ?? null;
  let edgeLine: number[] | null = null;
  if (edge && image) {
    const dx = edge.b.x - edge.a.x;
    const dy = edge.b.y - edge.a.y;
    const len = Math.hypot(dx, dy);
    const ext = (image.width + image.height) / len;
    edgeLine = [edge.a.x - dx * ext, edge.a.y - dy * ext, edge.b.x + dx * ext, edge.b.y + dy * ext];
  }

  const activeHint = TOOLS.find((t) => t.id === tool)?.hint ?? '';
  const textSize = 13 * inv;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Measurement tools">
        {TOOLS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tool === t.id ? 'default' : 'outline'}
            onClick={() => setTool(t.id)}
            aria-pressed={tool === t.id}
            title={t.hint}
            data-testid={`tool-${t.id}`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </Button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => image && setView(fitToViewport(image.width, image.height, size.w, size.h))} title="Fit image to view">
          <Maximize /> Fit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setView(zoomAt(v, { x: size.w / 2, y: size.h / 2 }, 1 / v.scale))}
          title="One image pixel per screen pixel"
        >
          <Expand /> 1:1
        </Button>
        <Button size="sm" variant={showZones ? 'secondary' : 'ghost'} onClick={() => toggle('showZones')} aria-pressed={showZones} title="Show ISO 3685 zones C, B, N (training aid)">
          <Layers /> Zones
        </Button>
        <Button size="sm" variant={snapOn ? 'secondary' : 'ghost'} onClick={() => toggle('snapToLines')} aria-pressed={snapOn} title="Snap calibration picks to graduation line centres">
          <Magnet /> Snap
        </Button>
      </div>
      <div ref={wrapRef} className={cn('relative min-h-0 flex-1 overflow-hidden rounded-md bg-black', tool === 'pan' ? 'cursor-grab' : 'cursor-crosshair')} data-testid="frame-view">
        {!image && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Reconstructing frame at full sensor resolution…
            </span>
          </div>
        )}
        {image && (
          <Stage
            ref={stageRef}
            width={size.w}
            height={size.h}
            onWheel={onWheel}
            onMouseDown={onDown}
            onTouchStart={onDown}
            onMouseMove={onMove}
            onTouchMove={onMove}
            onMouseUp={onUp}
            onTouchEnd={onUp}
            onMouseLeave={() => {
              onUp();
              setCursor(null);
            }}
            onClick={onClick}
            onTap={onClick}
          >
            <Layer>
              <Group x={v.offsetX} y={v.offsetY} scaleX={v.scale} scaleY={v.scale}>
                <KImage image={image.canvas} width={image.width} height={image.height} imageSmoothingEnabled={v.scale < 2} />
                {zoneLines.map((z, i) => (
                  <Group key={i} listening={false}>
                    <Line points={z.pts} stroke={COLORS.zone} strokeWidth={1} dash={[8, 6]} strokeScaleEnabled={false} />
                    {z.label && <Text x={z.at.x + 4 * inv} y={Math.max(4 * inv, z.at.y)} text={z.label} fontSize={textSize} fill="white" />}
                  </Group>
                ))}
                {edgeLine && <Line points={edgeLine} stroke={COLORS.edge} strokeWidth={1.25} dash={[10, 5]} strokeScaleEnabled={false} listening={false} />}
                {edge &&
                  ([edge.a, edge.b] as Vec2[]).map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={5 * inv}
                      stroke={COLORS.edge}
                      strokeWidth={1.5}
                      strokeScaleEnabled={false}
                      draggable
                      onDragEnd={(ev) => {
                        const np = { x: ev.target.x(), y: ev.target.y() };
                        const next = i === 0 ? { a: np, b: edge.b } : { a: edge.a, b: np };
                        if (!validateEdgeReference(next)) setEdge(frame.id, next);
                        else ev.target.position(p);
                      }}
                    />
                  ))}
                {readings.points.map((pt, i) => {
                  const foot = edge ? projectOntoLine(pt.p, edge.a, edge.b) : pt.p;
                  return (
                    <Group key={pt.id}>
                      <Line points={[foot.x, foot.y, pt.p.x, pt.p.y]} stroke={COLORS.vb} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                      <Circle
                        x={pt.p.x}
                        y={pt.p.y}
                        radius={4 * inv}
                        fill={pt.zone === 'B' ? COLORS.vb : 'rgba(245,158,11,0.35)'}
                        stroke="black"
                        strokeWidth={0.75}
                        strokeScaleEnabled={false}
                        draggable={tool === 'vb' || tool === 'pan'}
                        onDragEnd={(ev) => movePoint(frame.id, pt.id, { x: ev.target.x(), y: ev.target.y() })}
                      />
                      <Text x={pt.p.x + 6 * inv} y={pt.p.y + 2 * inv} text={`${i + 1}: ${pt.vbUm.toFixed(0)} µm${pt.zone !== 'B' ? ` (${pt.zone})` : ''}`} fontSize={textSize} fill={COLORS.vb} listening={false} />
                    </Group>
                  );
                })}
                {/* Raw points without derived readings (no edge/calibration yet). */}
                {readings.points.length === 0 &&
                  session?.points.map((rp) => <Circle key={rp.id} x={rp.p.x} y={rp.p.y} radius={4 * inv} fill="rgba(245,158,11,0.5)" listening={false} />)}
                {readings.lines.map((l) => (
                  <Group key={l.id} listening={false}>
                    <Line points={[l.a.x, l.a.y, l.b.x, l.b.y]} stroke={COLORS.line} strokeWidth={1.25} strokeScaleEnabled={false} />
                    <Circle x={l.a.x} y={l.a.y} radius={3 * inv} fill={COLORS.line} />
                    <Circle x={l.b.x} y={l.b.y} radius={3 * inv} fill={COLORS.line} />
                    <Text x={(l.a.x + l.b.x) / 2 + 6 * inv} y={(l.a.y + l.b.y) / 2} text={`${l.label} ${l.lengthUm.toFixed(0)} µm`} fontSize={textSize} fill={COLORS.line} />
                  </Group>
                ))}
                {cal && cal.distancePx > 0 && frame.specimenId === 'MIC-01' && (
                  <Line points={[cal.p1.x, cal.p1.y, cal.p2.x, cal.p2.y]} stroke={COLORS.cal} strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} listening={false} opacity={0.6} />
                )}
                {pendingPair && (
                  <Group listening={false}>
                    <Line points={[pendingPair.a.x, pendingPair.a.y, pendingPair.b.x, pendingPair.b.y]} stroke={COLORS.cal} strokeWidth={1.5} strokeScaleEnabled={false} />
                    {[pendingPair.a, pendingPair.b].map((p, i) => (
                      <Line key={i} points={[p.x, p.y - 12 * inv, p.x, p.y + 12 * inv]} stroke={COLORS.cal} strokeWidth={1.5} strokeScaleEnabled={false} />
                    ))}
                  </Group>
                )}
                {pendingPoint && <Circle x={pendingPoint.x} y={pendingPoint.y} radius={5 * inv} stroke={COLORS.pending} strokeWidth={2} strokeScaleEnabled={false} listening={false} />}
                {pendingPoint && cursor && (
                  <Line points={[pendingPoint.x, pendingPoint.y, cursor.x, cursor.y]} stroke={COLORS.pending} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />
                )}
              </Group>
            </Layer>
          </Stage>
        )}
        {notice && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-warning/40 bg-black/80 px-3 py-1.5 text-xs text-warning" role="status">
            {notice}
          </div>
        )}
      </div>
      {/* Single line on purpose: if this bar wrapped as the cursor readout grows, the frame view
          would change height under the pointer and shift the image mid-measurement. */}
      <div className="flex items-center gap-x-4 overflow-hidden whitespace-nowrap text-xs text-muted-foreground [&>*]:shrink-0">
        <span className="readout">
          {cursor ? `x ${cursor.x.toFixed(1)}  y ${cursor.y.toFixed(1)} px` : 'x —  y — px'}
          {cursor && cal && calOk ? `  (${(cursor.x * cal.umPerPx).toFixed(1)}, ${(cursor.y * cal.umPerPx).toFixed(1)} µm)` : ''}
        </span>
        <span className="readout">digital zoom {(v.scale * 100).toFixed(0)} %</span>
        <Badge variant={frame.quality.acceptable ? 'success' : 'destructive'}>{frame.quality.acceptable ? 'image quality accepted' : 'quality rejected'}</Badge>
        <Badge variant={calStatus === 'verified' ? 'success' : calStatus === 'calibrated' ? 'warning' : 'destructive'}>calibration: {calStatus}</Badge>
        <span className="min-w-0 flex-1 !shrink truncate" title={activeHint}>
          {activeHint}
        </span>
      </div>
    </div>
  );
}

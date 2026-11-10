import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, MousePointer2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';
import { frameViewBridge } from './bridge';
import { PHASES, TOUR, brokenStep, nextOpenStep, type CoachView } from './tour';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CARD_W = 320;
const GAP = 18;
const NARROW = 1024;

/** Where the highlighted control (or image point) currently is on screen. */
function locate(view: CoachView): Box | null {
  if (view.point) {
    const p = frameViewBridge.toClient?.(view.point);
    return p ? { x: p.x - 16, y: p.y - 16, w: 32, h: 32 } : null;
  }
  if (!view.target) return null;
  const el = document.querySelector(view.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function placeCard(box: Box | null, view: CoachView, cardH: number): { left: number; top: number } | 'dock' | 'panel' {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < NARROW) return 'dock';
  if (view.place === 'panel') return 'panel';
  if (!box) return { left: (vw - CARD_W) / 2, top: Math.max(16, vh * 0.3) };
  const clampX = (x: number) => Math.max(12, Math.min(vw - CARD_W - 12, x));
  const clampY = (y: number) => Math.max(12, Math.min(vh - cardH - 12, y));
  // Large regions (the overview steps): sit inside the region.
  if (box.h > vh * 0.5) return { left: clampX(box.x + box.w / 2 - CARD_W / 2), top: clampY(box.y + Math.min(box.h * 0.3, 200)) };
  const cx = clampX(box.x + box.w / 2 - CARD_W / 2);
  const below = { left: cx, top: box.y + box.h + GAP };
  const above = { left: cx, top: box.y - GAP - cardH };
  const fits = (p: { top: number }) => p.top >= 8 && p.top + cardH <= vh - 8;
  const order = view.place === 'above' ? [above, below] : [below, above];
  for (const p of order) if (fits(p)) return p;
  const right = { left: box.x + box.w + GAP, top: clampY(box.y + box.h / 2 - cardH / 2) };
  if (right.left + CARD_W <= vw - 8) return right;
  return { left: clampX(box.x - GAP - CARD_W), top: clampY(box.y + box.h / 2 - cardH / 2) };
}

export function CoachOverlay() {
  const state = useApp();
  const { coach, setCoach } = state;
  const [, setTick] = useState(0);
  const [cardH, setCardH] = useState(200);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string>('');

  const idx = Math.min(coach.step, TOUR.length - 1);
  const step = TOUR[idx]!;
  const active = coach.active;
  const done = active && Boolean(step.done?.(state));
  const view = active ? step.view(state) : null;
  const last = idx === TOUR.length - 1;

  // Follow layout changes (scrolling panels, zooming the image, typing in the form).
  useEffect(() => {
    if (!active) return;
    const bump = () => setTick((n) => (n + 1) % 1_000_000);
    const id = window.setInterval(bump, 150);
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
    };
  }, [active]);

  // Move on by itself once the student has done the step.
  useEffect(() => {
    if (!active || coach.hold || step.info || !done) return;
    const t = window.setTimeout(() => {
      const s = useApp.getState();
      const next = nextOpenStep(s, idx + 1);
      if (next >= TOUR.length) s.setCoach({ active: false, completed: true, step: 0 });
      else s.setCoach({ step: next });
    }, 650);
    return () => window.clearTimeout(t);
  }, [active, coach.hold, step.info, done, idx]);

  // If earlier work disappears (a frame or calibration is deleted), return to that step.
  const broken = active && !coach.hold ? brokenStep(state, idx) : -1;
  useEffect(() => {
    if (broken >= 0) setCoach({ step: broken });
  }, [broken, setCoach]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  // Bring an off-screen control into view once per step target.
  const targetKey = view ? `${step.id}|${view.target ?? ''}|${view.point ? 'pt' : ''}` : '';
  useEffect(() => {
    if (!view?.target || scrolledFor.current === targetKey) return;
    const el = document.querySelector(view.target);
    if (!el) return;
    scrolledFor.current = targetKey;
    const r = el.getBoundingClientRect();
    if (r.height < window.innerHeight * 0.5 && (r.top < 60 || r.bottom > window.innerHeight - 60)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  if (!active || !view) return null;

  const box = locate(view);
  const pos = placeCard(box, view, cardH);
  const phaseIdx = PHASES.indexOf(step.phase);
  const isPoint = Boolean(view.point);
  const showCursor = view.action !== 'look' && box;
  const pad = isPoint ? 0 : 5;
  // Keep the instruction chip on the side of the control that the card does not cover.
  const chipBelow = box ? (typeof pos === 'object' ? pos.top < box.y : box.y <= 44) : false;

  const goNext = () => {
    const s = useApp.getState();
    if (last) return s.setCoach({ active: false, completed: true, step: 0, hold: false });
    s.setCoach({ step: Math.min(TOUR.length - 1, nextOpenStep(s, idx + 1)), hold: false });
  };
  const goBack = () => setCoach({ step: Math.max(0, idx - 1), hold: true });

  const cardStyle: React.CSSProperties =
    pos === 'dock'
      ? { left: 8, right: 8, bottom: 8 }
      : pos === 'panel'
        ? { right: 16, bottom: 16, width: CARD_W + 22 }
        : { left: pos.left, top: pos.top, width: CARD_W };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60]"
      data-testid="coach"
      data-step={step.id}
      data-action={view.action}
      data-target={isPoint ? 'point' : (view.target ?? '')}
      data-value={view.value ?? ''}
      data-done={done}
    >
      {box && (
        <div
          className={cn('coach-ring absolute', isPoint ? 'rounded-full' : 'rounded-lg', view.action === 'look' && 'coach-ring-soft')}
          style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }}
          data-testid={isPoint ? 'coach-point' : 'coach-ring'}
        >
          {isPoint && (
            <svg className="absolute inset-0" viewBox="0 0 32 32" aria-hidden>
              <path d="M16 3v9M16 20v9M3 16h9M20 16h9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
          {view.chip && (
            <span
              className={cn(
                'coach-chip absolute whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-lg',
                isPoint ? 'left-1/2 top-full mt-2 -translate-x-1/2' : box.h > 300 ? 'left-2 top-2' : chipBelow ? 'left-0 top-full mt-1.5' : 'bottom-full left-0 mb-1.5',
              )}
            >
              {view.chip}
            </span>
          )}
        </div>
      )}
      {showCursor && box && (
        <div className="absolute" style={{ left: box.x + box.w / 2, top: box.y + box.h / 2 }} aria-hidden>
          <span className={cn('coach-ripple', view.action === 'hold' && 'coach-ripple-hold')} />
          <MousePointer2 className={cn('coach-cursor size-7', view.action === 'hold' && 'coach-cursor-hold')} />
        </div>
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-label="Guided tour"
        aria-live="polite"
        className="coach-card pointer-events-auto absolute rounded-xl border p-3.5 shadow-2xl"
        style={cardStyle}
        data-testid="coach-card"
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="flex gap-1" aria-label={`Stage ${phaseIdx + 1} of ${PHASES.length}: ${step.phase}`}>
            {PHASES.map((p, i) => (
              <span key={p} className={cn('h-1.5 w-5 rounded-full', i < phaseIdx ? 'bg-success' : i === phaseIdx ? 'bg-accent' : 'bg-muted')} />
            ))}
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">{step.phase}</span>
          <span className="readout ml-auto text-[11px] text-muted-foreground">
            {idx + 1} / {TOUR.length}
          </span>
          <button onClick={() => setCoach({ active: false, hold: false })} aria-label="Close the tour" className="-mr-1 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="coach-exit">
            <X className="size-4" />
          </button>
        </div>
        <h2 className="flex items-start gap-1.5 text-[15px] font-semibold leading-snug">
          {done && !step.info && <Check className="mt-0.5 size-4 shrink-0 text-success" />}
          <span>{done && !step.info && coach.hold ? `Done: ${view.title}` : view.title}</span>
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{view.body}</p>
        {!box && (view.target || view.point) && <p className="mt-1.5 text-xs text-warning">The highlighted control is not visible. Scroll to it or resize the window.</p>}
        <div className="mt-3 flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={goBack} disabled={idx === 0} data-testid="coach-back">
            <ChevronLeft /> Back
          </Button>
          {step.info || (done && coach.hold) ? (
            <Button size="sm" variant="accent" className="ml-auto" onClick={goNext} data-testid="coach-next">
              {last ? 'Finish tour' : 'Next'} {!last && <ChevronRight />}
            </Button>
          ) : (
            <>
              <span className="ml-auto text-[11px] text-muted-foreground">{done ? 'Done' : 'Waiting for you…'}</span>
              {!step.sticky && (
                <Button size="sm" variant="outline" onClick={goNext} title="Skip this step without doing it" data-testid="coach-skip">
                  Skip
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

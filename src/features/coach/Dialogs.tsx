import { useEffect } from 'react';
import { Crosshair, MousePointerClick, PlayCircle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CHANGELOG } from '@/data/changelog';
import { useApp } from '@/state/store';
import { APP_VERSION } from '@/version';
import { TOUR, nextOpenStep } from './tour';

function Modal({ label, onClose, children, testId }: { label: string; onClose: () => void; children: React.ReactNode; testId: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/65 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid={testId}>
      <div role="dialog" aria-modal="true" aria-label={label} className="relative w-full max-w-lg rounded-xl border bg-card p-5 shadow-2xl">
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

/** Start the tour from the beginning, or from the first step that is still open. */
export function startTour(restart = false): void {
  const s = useApp.getState();
  const from = restart || s.coach.completed ? 0 : s.coach.step;
  s.setCoach({ active: true, hold: false, seenWelcome: true, completed: false, step: from === 0 ? 0 : Math.min(nextOpenStep(s, from), TOUR.length - 1) });
}

export function WelcomeDialog() {
  const seen = useApp((s) => s.coach.seenWelcome);
  const setCoach = useApp((s) => s.setCoach);
  const setSeenVersion = useApp((s) => s.setSeenVersion);
  if (seen) return null;
  const close = () => {
    setCoach({ seenWelcome: true });
    setSeenVersion(APP_VERSION);
  };
  return (
    <Modal label="Welcome to ToolWearLab" onClose={close} testId="welcome">
      <div className="flex items-center gap-2.5">
        <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <Crosshair className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold leading-tight">Welcome to ToolWearLab</h2>
          <p className="text-xs text-muted-foreground">A virtual tool microscope for measuring cutting-tool wear</p>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        {[
          ['1', 'Set up', 'Focus the microscope on a tiny ruler and capture a picture.'],
          ['2', 'Calibrate', 'Teach the software how many micrometres one pixel is.'],
          ['3', 'Measure', 'Click along the worn edge to get flank wear VB.'],
        ].map(([n, t, d]) => (
          <li key={n} className="rounded-lg border bg-background/50 p-2.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="readout grid size-5 place-items-center rounded-full bg-accent text-[11px] text-accent-foreground">{n}</span>
              {t}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
        <MousePointerClick className="mt-0.5 size-5 shrink-0 text-accent" />
        <p>
          <b>New here? Take the guided tour.</b> It points at every button you need, one click at a time, and waits for you. About 10 minutes.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={close} data-testid="welcome-skip">
          Explore on my own
        </Button>
        <Button
          variant="accent"
          onClick={() => {
            setSeenVersion(APP_VERSION);
            startTour(true);
          }}
          data-testid="welcome-start"
        >
          <PlayCircle /> Start the guided tour
        </Button>
      </div>
    </Modal>
  );
}

export function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="What's new" onClose={onClose} testId="whats-new">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="size-5 text-accent" /> What’s new
      </h2>
      <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {CHANGELOG.map((r, i) => (
          <section key={r.version}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={i === 0 ? 'accent' : 'muted'}>v{r.version}</Badge>
              <h3 className="text-sm font-semibold">{r.title}</h3>
              <span className="readout ml-auto text-[11px] text-muted-foreground">{r.date}</span>
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-foreground/85">
              {r.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="accent"
          onClick={() => {
            onClose();
            startTour(true);
          }}
        >
          <PlayCircle /> Start the guided tour
        </Button>
      </div>
    </Modal>
  );
}

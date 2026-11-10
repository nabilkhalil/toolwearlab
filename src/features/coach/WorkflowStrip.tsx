import { Check, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';
import { startTour } from './Dialogs';
import { workflowStatus } from './tour';

/** Five-stage progress strip: where the student is and what to do next. */
export function WorkflowStrip() {
  const state = useApp();
  const stages = workflowStatus(state);
  const current = stages.findIndex((s) => !s.done);
  const coach = state.coach;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-card/30 px-4 py-1.5" data-coach="workflow" data-testid="workflow-strip">
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Workflow progress">
        {stages.map((s, i) => (
          <li key={s.phase} className="flex shrink-0 items-center gap-1" aria-current={i === current ? 'step' : undefined}>
            {i > 0 && <span className={cn('h-px w-3 sm:w-5', stages[i - 1]!.done ? 'bg-success/70' : 'bg-border')} />}
            <span
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                s.done ? 'border-success/40 bg-success/10 text-success' : i === current ? 'border-accent/60 bg-accent/15 text-accent' : 'text-muted-foreground',
              )}
              data-done={s.done}
            >
              {s.done ? <Check className="size-3" /> : <span className="readout">{i + 1}</span>}
              {s.phase}
            </span>
          </li>
        ))}
      </ol>
      <p className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground" data-testid="next-hint">
        {current === -1 ? (
          'All stages complete. Try the Assess tab, or another specimen.'
        ) : (
          <>
            <b className="text-foreground">Next:</b> {stages[current]!.hint}
          </>
        )}
      </p>
      {!coach.active && (
        <Button size="sm" variant="accent" onClick={() => startTour()} data-testid="tour-start">
          <MousePointerClick /> {coach.step > 0 && !coach.completed ? 'Resume guided tour' : 'Show me how'}
        </Button>
      )}
    </div>
  );
}

import { CheckCircle2, ChevronLeft, Circle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WEAR_MODE_INFO } from '@/core/wearCriteria';
import { LESSONS } from '@/features/tutorials/lessons';
import { useApp } from '@/state/store';
import { cn } from '@/lib/utils';

export function LearnPanel() {
  const state = useApp();
  const lessonId = state.tutorial.lessonId;
  const setTutorial = state.setTutorial;
  const lesson = LESSONS.find((l) => l.id === lessonId);

  if (!lesson) {
    return (
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Guided lessons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {LESSONS.map((l) => {
              const done = l.steps.filter((s) => s.check?.(state)).length;
              const total = l.steps.filter((s) => s.check).length;
              return (
                <button
                  key={l.id}
                  onClick={() => setTutorial(l.id)}
                  className="w-full cursor-pointer rounded-md border p-2 text-left transition-colors hover:bg-muted"
                  data-testid={`lesson-${l.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{l.title}</span>
                    <Badge variant={done === total ? 'success' : 'muted'}>
                      {done}/{total}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{l.outcome}</div>
                </button>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Wear-mode reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {Object.entries(WEAR_MODE_INFO).map(([k, m]) => (
              <div key={k} className="text-xs leading-relaxed">
                <div className="font-semibold text-foreground">{m.name}</div>
                <div className="text-muted-foreground">
                  <b className="text-foreground/80">Where:</b> {m.location} <b className="text-foreground/80">Measure:</b> {m.parameters} <b className="text-foreground/80">Cause:</b> {m.mechanism}{' '}
                  <b className="text-foreground/80">Inspect:</b> {m.howToSee}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const firstOpen = lesson.steps.findIndex((s) => s.check && !s.check(state));
  return (
    <Card>
      <CardHeader>
        <Button size="sm" variant="ghost" onClick={() => setTutorial(null)}>
          <ChevronLeft /> Lessons
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" /> ~{lesson.minutes} min
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">{lesson.title}</h3>
          <p className="text-xs text-muted-foreground">{lesson.outcome}</p>
        </div>
        <ol className="space-y-1.5">
          {lesson.steps.map((st, i) => {
            const done = st.check ? st.check(state) : false;
            const current = i === firstOpen;
            return (
              <li key={st.id} className={cn('rounded-md border p-2', current ? 'border-primary/50 bg-primary/5' : 'border-transparent')} data-testid={`step-${lesson.id}-${st.id}`} data-done={done}>
                <div className="flex items-start gap-2">
                  {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className={cn('mt-0.5 size-4 shrink-0', st.check ? 'text-muted-foreground' : 'text-primary/60')} />}
                  <div>
                    <div className={cn('text-sm font-medium', done && 'text-muted-foreground line-through decoration-1')}>{st.title}</div>
                    {(current || !st.check || !done) && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{st.body}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

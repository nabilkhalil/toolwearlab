import { CheckCircle2, Circle, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isUsable } from '@/core/calibration';
import { MIN_ZONE_B_POINTS } from '@/core/measurement';
import { useMeasurement } from '@/hooks/useMeasurement';
import { useApp } from '@/state/store';

function Check({ ok, pending, children }: { ok: boolean; pending?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5 text-xs">
      {ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> : pending ? <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
      <span>{children}</span>
    </li>
  );
}

export function MeasurePanel() {
  const { frame, session, calStatus, points, lines, summary } = useMeasurement();
  const removePoint = useApp((s) => s.removePoint);
  const removeLine = useApp((s) => s.removeLine);
  const clearSession = useApp((s) => s.clearSession);
  const setTool = useApp((s) => s.setTool);

  if (!frame) {
    return <p className="p-2 text-sm text-muted-foreground">Capture a frame in the live view (or import a micrograph) to start measuring.</p>;
  }
  const k = summary.coverageFactor;
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Pre-measurement checks</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            <Check ok={frame.quality.acceptable}>Image quality accepted (focus within ±DOF/2, no clipping)</Check>
            <Check ok={isUsable(calStatus)}>
              Calibration for this {frame.source === 'imported' ? 'image' : 'objective'}: <b>{calStatus}</b>
              {calStatus === 'calibrated' && ' (verify it for full credit)'}
            </Check>
            <Check ok={Boolean(session?.edge)} pending>
              Original cutting edge referenced{' '}
              {!session?.edge && (
                <button className="cursor-pointer text-primary underline" onClick={() => setTool('edge')}>
                  set now
                </button>
              )}
            </Check>
            <Check ok={summary.n >= MIN_ZONE_B_POINTS} pending>
              At least {MIN_ZONE_B_POINTS} readings in zone B ({summary.n} so far)
            </Check>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VB readings</CardTitle>
          {session && (session.points.length > 0 || session.lines.length > 0 || session.edge) && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => clearSession(frame.id)}>
              <Trash2 /> Clear
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {points.length === 0 ? (
            <p className="text-xs text-muted-foreground">No readings yet. Select <b>VB point</b> and click along the lower boundary of the wear land.</p>
          ) : (
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-xs" data-testid="vb-table">
                <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">#</th>
                    <th className="font-medium">Zone</th>
                    <th className="text-right font-medium">VB (µm)</th>
                    <th className="text-right font-medium">U (k={k})</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="readout">
                  {points.map((p, i) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-0.5">{i + 1}</td>
                      <td>
                        <Badge variant={p.zone === 'B' ? 'accent' : 'muted'}>{p.zone}</Badge>
                      </td>
                      <td className="text-right">{p.vbUm.toFixed(1)}</td>
                      <td className="text-right text-muted-foreground">±{(p.uUm * k).toFixed(1)}</td>
                      <td className="text-right">
                        <button aria-label={`Delete reading ${i + 1}`} className="cursor-pointer p-1 text-muted-foreground hover:text-destructive" onClick={() => removePoint(frame.id, p.id)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Only zone B readings enter VB_B and VB_B max. Zone C and N maxima are reported separately (VB_C, VB_N).</p>
        </CardContent>
      </Card>

      {lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distances</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <tbody className="readout">
                {lines.map((l) => (
                  <tr key={l.id} className="border-t first:border-t-0">
                    <td className="py-0.5">{l.label}</td>
                    <td className="text-right">{l.lengthUm.toFixed(1)} µm</td>
                    <td className="text-right text-muted-foreground">±{(l.uUm * k).toFixed(1)}</td>
                    <td className="text-right">
                      <button aria-label={`Delete ${l.label}`} className="cursor-pointer p-1 text-muted-foreground hover:text-destructive" onClick={() => removeLine(frame.id, l.id)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState } from 'react';
import { CheckCircle2, Info, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  CalibrationError,
  DEFAULT_PICK_UNCERTAINTY_PX,
  RECOMMENDED_CALIBRATION_SPAN_PX,
  applyVerification,
  createCalibration,
  createManualCalibration,
  relativeScaleUncertainty,
  verifyCalibration,
} from '@/core/calibration';
import { distance } from '@/core/geometry';
import { OBJECTIVE_ORDER } from '@/core/optics';
import type { CalibrationStatus } from '@/core/types';
import { getSpecimen } from '@/data/specimens';
import { useMeasurement } from '@/hooks/useMeasurement';
import { useApp } from '@/state/store';

const MIC = getSpecimen('MIC-01');
const DIVISION_UM = MIC.geometry.kind === 'stage-micrometer' ? MIC.geometry.divisionUm : 10;
const CERT_U = MIC.geometry.kind === 'stage-micrometer' ? MIC.geometry.certificateUncertaintyUm : 0.5;

function statusVariant(s: CalibrationStatus) {
  return s === 'verified' ? 'success' : s === 'calibrated' ? 'warning' : s === 'invalid' ? 'destructive' : 'muted';
}

export function CalibratePanel() {
  const { frame, cal, calKey } = useMeasurement();
  const calibrations = useApp((s) => s.calibrations);
  const pendingPair = useApp((s) => s.pendingPair);
  const setCalibration = useApp((s) => s.setCalibration);
  const setPendingPair = useApp((s) => s.setPendingPair);
  const setTool = useApp((s) => s.setTool);
  const [divisions, setDivisions] = useState('');
  const [certU, setCertU] = useState(String(CERT_U));
  const [pickU, setPickU] = useState(String(DEFAULT_PICK_UNCERTAINTY_PX));
  const [manualScale, setManualScale] = useState('');
  const [manualU, setManualU] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isMicrometerFrame = frame?.source === 'simulated' && frame.specimenId === 'MIC-01';
  const isImported = frame?.source === 'imported';
  const canCalibrate = Boolean(frame && calKey && (isMicrometerFrame || isImported));

  const submit = () => {
    setError(null);
    if (!frame || !calKey || !pendingPair) return;
    const n = Number(divisions);
    const lengthUm = isImported ? n : n * DIVISION_UM;
    try {
      if (!(n > 0)) throw new CalibrationError(isImported ? 'Enter the known length in µm.' : 'Enter the number of divisions between the two lines.');
      if (pendingPair.tool === 'calibrate') {
        const rec = createCalibration({
          objectiveId: isImported ? 'imported' : frame.microscope.objectiveId,
          p1: pendingPair.a,
          p2: pendingPair.b,
          referenceLengthUm: lengthUm,
          referenceUncertaintyUm: Number(certU) || 0,
          pickUncertaintyPx: Number(pickU) || DEFAULT_PICK_UNCERTAINTY_PX,
        });
        setCalibration(calKey, rec);
        setTool('verify');
      } else {
        if (!cal) throw new CalibrationError('Create a calibration first.');
        const v = verifyCalibration(cal, pendingPair.a, pendingPair.b, lengthUm, Number(certU) || 0);
        setCalibration(calKey, applyVerification(cal, v));
        setTool('pan');
      }
      setDivisions('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitManual = () => {
    setError(null);
    if (!calKey) return;
    try {
      setCalibration(calKey, createManualCalibration(Number(manualScale), Number(manualU) || 0, { pickUncertaintyPx: Number(pickU) || DEFAULT_PICK_UNCERTAINTY_PX }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const span = pendingPair ? distance(pendingPair.a, pendingPair.b) : 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Calibration register</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Obj.</th>
                <th className="font-medium">Status</th>
                <th className="text-right font-medium">µm/px</th>
                <th className="text-right font-medium">u_rel (k=1)</th>
              </tr>
            </thead>
            <tbody className="readout">
              {OBJECTIVE_ORDER.map((id) => {
                const c = calibrations[id];
                return (
                  <tr key={id} className="border-t">
                    <td className="py-1">{id.replace('x', '×')}</td>
                    <td>
                      <Badge variant={statusVariant(c?.status ?? 'none')}>{c?.status ?? 'none'}</Badge>
                    </td>
                    <td className="text-right">{c ? c.umPerPx.toFixed(4) : '—'}</td>
                    <td className="text-right">{c ? `${(relativeScaleUncertainty(c) * 100).toFixed(3)} %` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            u(s)/s = √[(u_ref/L)² + (√2·u_pick/d)²]. Long reference spans (d &gt; {RECOMMENDED_CALIBRATION_SPAN_PX} px) shrink the pick term. Digital zoom never changes µm/px; changing objective does.
          </p>
        </CardContent>
      </Card>

      {!canCalibrate && (
        <Alert variant="info">
          <Info />
          <div>
            Calibrate with the stage micrometer: load <b>MIC-01</b>, select the objective you will measure with, focus, capture a frame, then use the <b>Calibrate</b> tool on it. For an imported micrograph, calibrate on its own frame.
          </div>
        </Alert>
      )}

      {canCalibrate && (
        <Card>
          <CardHeader>
            <CardTitle>{isImported ? 'Imported image scale' : `Calibrate ${frame?.microscope.objectiveId.replace('x', '×')} objective`}</CardTitle>
            {cal && <Badge variant={statusVariant(cal.status)}>{cal.status}</Badge>}
          </CardHeader>
          <CardContent className="space-y-2.5">
            {!pendingPair && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => setTool('calibrate')} data-testid="start-calibrate">
                  1 · Pick two graduations
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTool('verify')} disabled={!cal}>
                  2 · Verify on another interval
                </Button>
              </div>
            )}
            {pendingPair && (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                <div className="flex justify-between text-xs">
                  <span>{pendingPair.tool === 'calibrate' ? 'Calibration span' : 'Verification span'}</span>
                  <span className="readout">{span.toFixed(2)} px</span>
                </div>
                {span < RECOMMENDED_CALIBRATION_SPAN_PX && pendingPair.tool === 'calibrate' && (
                  <p className="text-[11px] text-warning">Short span: a longer span lowers the pick contribution to the uncertainty.</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label htmlFor="cal-div">{isImported ? 'Known length between the points (µm)' : `Number of 0.01 mm divisions between the lines`}</Label>
                    <Input id="cal-div" inputMode="decimal" value={divisions} onChange={(e) => setDivisions(e.target.value)} placeholder={isImported ? 'e.g. 500' : 'e.g. 80'} data-testid="cal-divisions" />
                  </div>
                  <div>
                    <Label htmlFor="cal-cert">Reference u (µm, k=1)</Label>
                    <Input id="cal-cert" inputMode="decimal" value={certU} onChange={(e) => setCertU(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="cal-pick">Pick u (px, k=1)</Label>
                    <Input id="cal-pick" inputMode="decimal" value={pickU} onChange={(e) => setPickU(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={submit} data-testid="cal-submit">
                    {pendingPair.tool === 'calibrate' ? 'Create calibration' : 'Verify'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingPair(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {isImported && !pendingPair && (
              <div className="space-y-1.5 border-t pt-2">
                <p className="text-[11px] text-muted-foreground">Or enter a certified scale (e.g. from the microscope software's calibration record):</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="man-s">µm/px</Label>
                    <Input id="man-s" inputMode="decimal" value={manualScale} onChange={(e) => setManualScale(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="man-u">u (µm/px, k=1)</Label>
                    <Input id="man-u" inputMode="decimal" value={manualU} onChange={(e) => setManualU(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={submitManual}>
                  Use entered scale
                </Button>
              </div>
            )}
            {cal && (
              <div className="space-y-1 border-t pt-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scale</span>
                  <span className="readout">
                    {cal.umPerPx.toFixed(5)} ± {cal.umPerPxStdUncertainty.toFixed(5)} µm/px
                  </span>
                </div>
                {cal.verification && (
                  <div className="flex items-start gap-1.5">
                    {cal.verification.passed ? <CheckCircle2 className="mt-0.5 size-3.5 text-success" /> : <TriangleAlert className="mt-0.5 size-3.5 text-destructive" />}
                    <span>
                      Check of {cal.verification.referenceLengthUm.toFixed(0)} µm measured {cal.verification.measuredLengthUm.toFixed(2)} µm (error {cal.verification.errorUm.toFixed(2)} µm, U ={' '}
                      {cal.verification.expandedUncertaintyUm.toFixed(2)} µm): {cal.verification.passed ? 'passed' : 'failed. Recalibrate.'}
                    </span>
                  </div>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => calKey && setCalibration(calKey, null)}>
                  <Trash2 /> Discard calibration
                </Button>
              </div>
            )}
            {error && (
              <Alert variant="error">
                <TriangleAlert />
                <div>{error}</div>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

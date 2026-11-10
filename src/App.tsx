import { useState } from 'react';
import { Crosshair, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FocusCard, IlluminationCard, OpticsCard, SpecimenCard, StageCard } from '@/components/workstation/Controls';
import { Viewport } from '@/components/layout/Viewport';
import { MeasurePanel } from '@/components/panels/MeasurePanel';
import { CalibratePanel } from '@/components/panels/CalibratePanel';
import { ResultsPanel } from '@/components/panels/ResultsPanel';
import { LearnPanel } from '@/components/panels/LearnPanel';
import { AssessPanel } from '@/components/panels/AssessPanel';
import { calibrationStatusFor } from '@/core/calibration';
import { CoachOverlay } from '@/features/coach/CoachOverlay';
import { WelcomeDialog, WhatsNewDialog } from '@/features/coach/Dialogs';
import { WorkflowStrip } from '@/features/coach/WorkflowStrip';
import { useApp, type PanelTab } from '@/state/store';
import { APP_VERSION } from '@/version';

function ControlsColumn() {
  return (
    <div className="space-y-3">
      <SpecimenCard />
      <OpticsCard />
      <FocusCard />
      <StageCard />
      <IlluminationCard />
    </div>
  );
}

export default function App() {
  const objectiveId = useApp((s) => s.microscope.objectiveId);
  const cal = useApp((s) => s.calibrations[s.microscope.objectiveId]);
  const resetAll = useApp((s) => s.resetAll);
  const status = calibrationStatusFor(cal, objectiveId);
  const panelTab = useApp((s) => s.panelTab);
  const setPanelTab = useApp((s) => s.setPanelTab);
  const seenVersion = useApp((s) => s.seenVersion);
  const setSeenVersion = useApp((s) => s.setSeenVersion);
  const [whatsNew, setWhatsNew] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary">
            <Crosshair className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight tracking-tight">ToolWearLab</h1>
            <p className="text-[11px] leading-tight text-muted-foreground">Virtual tool wear microscope · MMT15603 Assessment of Machinability</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={status === 'verified' ? 'success' : status === 'calibrated' ? 'warning' : 'destructive'} data-testid="header-cal-status">
            {objectiveId.replace('x', '×')} calibration: {status}
          </Badge>
          <button
            onClick={() => {
              setWhatsNew(true);
              setSeenVersion(APP_VERSION);
            }}
            className="relative cursor-pointer rounded"
            title="What's new in this version"
            data-testid="version-badge"
          >
            <Badge variant="muted" className="hover:text-foreground">v{APP_VERSION}</Badge>
            {seenVersion !== APP_VERSION && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-accent" aria-label="New version" />}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('Clear all frames, calibrations and measurements stored in this browser?')) resetAll();
            }}
            title="Reset practice data"
          >
            <RotateCcw /> Reset
          </Button>
        </div>
      </header>
      <WorkflowStrip />
      <main className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-auto p-3 lg:grid-cols-[280px_minmax(0,1fr)_370px] lg:content-stretch lg:overflow-hidden">
        <aside className="order-2 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1" aria-label="Microscope controls" data-coach="controls">
          <ControlsColumn />
        </aside>
        <section className="order-1 h-[70vh] min-h-[420px] lg:order-2 lg:h-auto lg:min-h-0" aria-label="Microscope view" data-coach="viewport">
          <Viewport />
        </section>
        <aside className="order-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1" aria-label="Measurement and learning panels" data-coach="panels">
          <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as PanelTab)}>
            <TabsList>
              <TabsTrigger value="measure" data-coach="tab-measure"> Measure
              </TabsTrigger>
              <TabsTrigger value="calibrate" data-testid="tab-calibrate" data-coach="tab-calibrate"> Calibrate
              </TabsTrigger>
              <TabsTrigger value="results" data-testid="tab-results" data-coach="tab-results"> Results
              </TabsTrigger>
              <TabsTrigger value="learn" data-testid="tab-learn" data-coach="tab-learn"> Learn
              </TabsTrigger>
              <TabsTrigger value="assess" data-testid="tab-assess" data-coach="tab-assess"> Assess
              </TabsTrigger>
            </TabsList>
            <TabsContent value="measure">
              <MeasurePanel />
            </TabsContent>
            <TabsContent value="calibrate">
              <CalibratePanel />
            </TabsContent>
            <TabsContent value="results">
              <ResultsPanel />
            </TabsContent>
            <TabsContent value="learn">
              <LearnPanel />
            </TabsContent>
            <TabsContent value="assess">
              <AssessPanel />
            </TabsContent>
          </Tabs>
        </aside>
      </main>
      <CoachOverlay />
      <WelcomeDialog />
      {whatsNew && <WhatsNewDialog onClose={() => setWhatsNew(false)} />}
    </div>
  );
}

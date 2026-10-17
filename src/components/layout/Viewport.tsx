import { useRef, useState } from 'react';
import { ImagePlus, Microscope, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exposureStats, lumaFromRgba } from '@/core/imaging';
import type { CapturedFrame } from '@/core/types';
import { LiveView } from '@/components/workstation/LiveView';
import { FrameView } from '@/components/measurement/FrameView';
import { useActiveFrame, useApp } from '@/state/store';
import { uid } from '@/lib/utils';

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

async function importImage(file: File): Promise<CapturedFrame> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Image larger than 8 MB. Export a smaller copy (keep the original pixel size if possible).');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Unsupported image format.'));
    i.src = dataUrl;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(img, 0, 0);
  const st = exposureStats(lumaFromRgba(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height));
  const exposureOk = st.saturatedFraction <= 0.01;
  const ms = useApp.getState().microscope;
  return {
    id: uid('frm'),
    source: 'imported',
    label: `Imported · ${file.name}`,
    capturedAt: new Date().toISOString(),
    specimenId: 'IMPORTED',
    microscope: structuredClone(ms),
    widthPx: c.width,
    heightPx: c.height,
    noiseSeed: 0,
    importedDataUrl: dataUrl,
    quality: {
      defocusBlurPx: Number.NaN,
      sharpness: Number.NaN,
      meanGrey: st.mean,
      saturatedFraction: st.saturatedFraction,
      darkFraction: st.darkFraction,
      focusOk: true,
      exposureOk,
      acceptable: exposureOk,
      messages: [
        'Imported image: focus cannot be verified by the simulator; check sharpness visually.',
        'Zones cannot be assigned automatically: every reading is treated as zone B, so pick only within zone B.',
        ...(exposureOk ? [] : ['More than 1 % of pixels are saturated: measurement rejected.']),
      ],
    },
  };
}

export function Viewport() {
  const workspace = useApp((s) => s.workspace);
  const frames = useApp((s) => s.frames);
  const setActiveFrame = useApp((s) => s.setActiveFrame);
  const removeFrame = useApp((s) => s.removeFrame);
  const addFrame = useApp((s) => s.addFrame);
  const frame = useActiveFrame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={workspace === 'live' ? 'default' : 'outline'} onClick={() => setActiveFrame(null)} data-testid="ws-live">
          <Microscope /> Live view
        </Button>
        <select
          aria-label="Captured frames"
          className="h-8 min-w-0 max-w-[16rem] flex-1 rounded-md border border-input bg-background px-2 text-sm"
          value={workspace === 'frame' && frame ? frame.id : ''}
          onChange={(e) => e.target.value && setActiveFrame(e.target.value)}
          data-testid="frame-select"
        >
          <option value="">{frames.length ? `Captured frames (${frames.length})…` : 'No frames captured'}</option>
          {frames.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        {workspace === 'frame' && frame && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeFrame(frame.id)} title="Delete this frame and its measurements">
            <Trash2 />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title="Import your own micrograph (PNG/JPEG) and calibrate it">
          <ImagePlus /> Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/bmp,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setErr(null);
            try {
              addFrame(await importImage(f));
            } catch (x) {
              setErr(x instanceof Error ? x.message : String(x));
            }
          }}
        />
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
      <div className="min-h-0 flex-1">{workspace === 'frame' && frame ? <FrameView key={frame.id} frame={frame} /> : <LiveView />}</div>
    </div>
  );
}

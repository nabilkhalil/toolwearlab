---
name: toolwearlab-ui-conventions
description: UI conventions for ToolWearLab (React, TypeScript, Tailwind v4, shadcn-style components, Konva). Use when building or changing components, panels, overlays, layout, exports or local storage.
---

# UI conventions

## Stack
- React 19 + TypeScript strict, Vite, Tailwind v4 (`src/index.css` theme tokens), shadcn-style primitives in `src/components/ui` (Radix based; `components.json` present for `shadcn add`).
- State: Zustand store `src/state/store.ts`, persisted with the safe localStorage wrapper. Add new persisted fields to `partialize` and bump `version` with a `migrate` when the shape changes.
- Rendering: always through `renderClient` (worker). Live view uses `live()` (latest wins); captures/frames use `render()`.

## Rules
- Measurement points are created only in **image px** via `screenToImage`. Konva overlays live inside a Group transformed by the view; use `strokeScaleEnabled={false}` and radius/size × `1/scale` to keep constant screen size.
- Gate actions, don't just warn: capture requires `quality.acceptable`; VB requires an edge reference and a usable calibration for the frame's calibration key (`calibrationKey`).
- Never show the simulator's true µm/px or design wear values outside grading feedback.
- Label synthetic content as synthetic in any new view or export.
- Colours: cyan = optics/calibration, amber = VB readings, magenta = distances, green/amber/red badges for verified/calibrated/none. Status must also be written in text.
- Numbers: `readout` class (monospace, tabular). Units always shown (µm, px, %).
- Layout: desktop three columns ≥ lg; single column below. Verify no horizontal overflow at 1440×900 and 820×1180 (e2e).
- Accessibility: radio groups have `role="radiogroup"`/`aria-checked`, toggles `aria-pressed`, icons-only buttons have `aria-label`.
- Exports: CSV via `core/exportCsv.ts` (pure, tested); PDF via `features/export/pdf.ts` (jsPDF loaded lazily) with overlays burned in by `annotateFrame` from stored coordinates.

# ToolWearLab

Virtual tool wear microscope for **MMT15603 Assessment of Machinability**. Students position a cutting insert, focus, set illumination, calibrate against a stage micrometer and measure flank wear following ISO 3685 principles, entirely in the browser.

- **No server, no login, no API keys.** Practice data stays in the browser (localStorage) and can be exported as CSV or PDF.
- **Traceable numbers.** Every reading carries a calibration status and an uncertainty; captures are refused if focus or exposure is unsuitable.
- **Honest data.** Built-in specimens are synthetic, rendered from documented parameters; real micrographs can be imported and calibrated.

## Quick start

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # acceptance tests (Playwright; set CHROMIUM_PATH if the browser download is blocked)
npm run build        # static site in dist/ (GitHub Pages ready)
npm run build:single # single self-contained HTML in dist-single/
```

## Deploy to GitHub Pages

Push to `main`. The workflow in `.github/workflows/deploy.yml` type-checks, runs unit and e2e tests, builds and publishes `dist/`. Enable *Settings → Pages → Source: GitHub Actions* once.

## Student workflow

1. **Live view**: load `MIC-01`, choose an objective, coarse then fine focus (Q/A, W/S), set light so the histogram does not clip, capture.
2. **Calibrate** tab: pick two graduations far apart, enter the number of 0.01 mm divisions, then verify on another interval.
3. Load a worn insert, refocus, capture. **Edge ref.** on the original cutting edge, then **VB point** along the land boundary in zone B (toggle **Zones**).
4. **Results**: VB_B, VB_B max with U (k = 2), ISO 3685 decision, CSV/PDF export.
5. **Learn** for guided lessons; **Assess** for graded practice activities.

## Documentation

- `docs/ARCHITECTURE.md`: architecture, data models, component specifications, UI plan, uncertainty model, acceptance results and roadmap.
- `.claude/skills/*/SKILL.md`: project rules for Claude (ISO 3685 domain, optical metrology model, validation obligations, UI conventions).

## Specimens

| ID | View | Content |
|---|---|---|
| MIC-01 | Stage micrometer | 1 mm, 0.01 mm divisions |
| FW-00 | Flank | Unworn reference |
| FW-01 | Flank | Uniform flank wear |
| FW-02 | Flank | Irregular flank wear with a local peak |
| NW-01 | Flank | Notch wear at depth-of-cut line |
| CR-01 | Rake | Crater wear (KB, KF measurable; KT not) |

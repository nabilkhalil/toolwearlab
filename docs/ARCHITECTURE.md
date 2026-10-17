# ToolWearLab: Software Architecture and Implementation Plan

Virtual tool wear microscope for **MMT15603 Assessment of Machinability**
(Bachelor of Industrial Machining Technology, FKTM, UniMAP).

| Item | Value |
|---|---|
| Version | 0.1.0-phase1 |
| Status | Phase 1 implemented; acceptance tests passing (§11) |
| Runtime | 100 % client-side; no account, API key, server or database |
| Deployment | Static site on GitHub Pages (`.github/workflows/deploy.yml`) |

---

## 1. Purpose and scope

Students rarely get enough time on a physical toolmaker's microscope to
practise the full inspection chain: positioning an insert, finding focus,
setting illumination, calibrating the image, and measuring wear to
ISO 3685 principles. ToolWearLab reproduces that chain in a browser with
an explicit, inspectable optics and measurement model, so that every
number a student produces can be traced to a calibration, an image of
accepted quality and a documented procedure.

**Learning outcomes supported**

1. Operate a measuring microscope: XY stage, rotation, objective, coarse/fine focus, illumination and exposure.
2. Calibrate an image against a stage micrometer and state the calibration uncertainty.
3. Measure flank wear land width VB perpendicular to the original cutting edge, in the correct zone, and report VB_B, VB_B max, VB_C and VB_N.
4. Apply the ISO 3685 tool-life criteria, including an uncertainty-aware decision.
5. Distinguish flank, crater and notch wear by location, appearance and measurable parameters.

**Out of scope for Phase 1**: 3D specimen handling, automated wear segmentation,
crater depth (KT) measurement, multi-user/LMS integration.

---

## 2. Engineering principles

| Principle | How it is enforced |
|---|---|
| ISO 3685 terminology and method | VB measured perpendicular to a student-defined *original cutting edge* reference; readings allocated to zones C/B/N; VB_B and VB_B max from zone B only; criteria VB_B = 0.3 mm (regular), VB_B max = 0.6 mm (irregular), KT = 0.06 + 0.3f (`core/wearCriteria.ts`). |
| Flank vs crater vs notch | Separate specimen views (flank face, rake face), separate parameters (VB / KB, KF, KT / VB_N), a wear-mode reference card and an identification activity. |
| Original image coordinates preserved | Measurements are stored only as image-pixel coordinates on a frozen frame. Digital zoom/pan is a display transform (`core/viewTransform.ts`), proven invariant by unit tests. |
| Optical magnification ≠ digital scaling | Objective magnification sets µm/px and requires its own calibration; digital zoom never changes µm/px. Live digital zoom is an upscaled crop to demonstrate *empty magnification*. |
| Validation against known references | Unit tests render the stage micrometer through the full image chain, detect graduations, calibrate, verify on an independent interval, and check VB readings against the specimen design profile (`core/validation.test.ts`). |
| Uncertainty and calibration status | Every calibration carries u(s)/s; every reading carries u; results report U (k = 2); status is `none → calibrated → verified / invalid` per objective; criteria decisions return *indeterminate* inside ±U. |
| Image quality gate | Capture is refused unless defocus ≤ ±DOF/2 and exposure is unclipped (`assessQuality`). Measurement requires an accepted frame and a usable calibration. |
| No invented ground truth | All built-in specimens are **synthetic**, labelled as such in data, UI and reports. Their "design values" are properties of the synthetic geometry and are never presented as experimental measurements. Real micrographs can be imported and calibrated by the user. |

---

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI (React + Tailwind + shadcn-style components)                      │
│  Controls · LiveView · FrameView (Konva) · Panels: Measure,          │
│  Calibrate, Results, Learn, Assess                                    │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │ actions / selectors           │ render requests
┌───────────────▼──────────────┐   ┌────────────▼───────────────────────┐
│ State (Zustand + persist)    │   │ Render worker (Web Worker, inline) │
│ microscope, frames, sessions │   │ renderFrame + assessQuality        │
│ calibrations, assessment     │   │ latest-wins live channel           │
│ → localStorage (safe wrapper)│   └────────────┬───────────────────────┘
└───────────────┬──────────────┘                │
                │ pure function calls           │
┌───────────────▼───────────────────────────────▼──────────────────────┐
│ Core engine (pure TypeScript, DOM-free, unit-tested)                  │
│ optics · shading · renderer · imaging · lineDetection · calibration  │
│ measurement · wearProfile · wearCriteria · viewTransform · exportCsv │
└──────────────────────────────────────────────────────────────────────┘
          ▲ specimen definitions (data/specimens.ts, documented params)
```

**Key design decisions**

1. **Deterministic, physics-informed renderer instead of stored photographs.**
   Each pixel is computed from the specimen geometry in micrometres, the stage
   pose, the objective, the illumination mode and the camera settings. A frame
   is therefore *exactly reproducible* from its acquisition record and its noise
   seed, so the app persists acquisition metadata (a few hundred bytes) instead
   of images (megabytes), and the true scale is known for validation.
2. **Core engine is DOM-free.** All metrology (calibration, VB, uncertainty,
   zones, criteria, quality) runs in Node under Vitest; the UI only orchestrates.
3. **Readings are derived, not stored.** Sessions store raw picks; µm values and
   uncertainties are recomputed from the calibration in force. A corrected
   calibration propagates automatically and nothing derived can go stale.
4. **Rendering off the main thread.** A Web Worker renders the live view at half
   sensor resolution (~100 ms) with latest-request-wins scheduling; captures
   render at full resolution.
5. **OpenCV.js deferred to Phase 2.** Phase 1 needs only blur, statistics and
   line localisation, implemented in ~200 lines of tested TypeScript. OpenCV.js
   (≈ 8 MB WASM) is reserved for Phase 2 edge detection and segmentation,
   loaded lazily so Phase 1 start-up stays fast.

---

## 4. Optical and imaging model (`core/optics.ts`, `core/renderer.ts`)

| Quantity | Model |
|---|---|
| Objectives | 2×/0.055, 5×/0.14, 10×/0.28, 20×/0.42 (infinity-corrected plan-apo class, matched tube lens) |
| Camera | 1600 × 1200 px, 3.45 µm pitch, read noise 1.2 DN |
| Object sampling | s = pitch / M → 1.725, 0.69, 0.345, 0.1725 µm/px |
| Depth of field | DOF = λ/NA² + e/(M·NA), λ = 0.55 µm |
| Defocus PSF | Gaussian, σ = √[(2·NA·max(0, abs(Δz) − DOF/2)/4)² + (0.21λ/NA)²] / s |
| Image formation | reflectance → lamp × mode efficiency × exposure × vignetting → defocus blur → shot + read noise → contrast/brightness → 8-bit clip |
| Illumination | Coaxial bright-field (flat wear land bright, slopes dark) vs ring/oblique (scattering surfaces bright) |
| Quality gate | focusOk: abs(Δz) ≤ DOF/2; exposureOk: mean 35–215 DN, saturated ≤ 1 %, black-clipped ≤ 35 % |
| Sharpness metric | Variance of Laplacian on 2×2-binned luma (reported, used for the focus meter) |

Coordinate frames are defined in `core/types.ts`: specimen (µm) → sensor image
(px) → screen (view). Only the first two are ever persisted.

---

## 5. Folder structure

```
toolwearlab/
├── .claude/skills/              Project-specific Claude skills (§10)
├── .github/workflows/deploy.yml CI: typecheck, unit, e2e, then deploy Pages
├── docs/ARCHITECTURE.md         This document
├── e2e/workflow.spec.ts         Playwright acceptance tests
├── public/favicon.svg
├── scripts/render-samples.ts    Renders every specimen to PNG for review
├── src/
│   ├── core/                    DOM-free engine + unit tests (*.test.ts)
│   │   ├── types.ts             Data model and coordinate-frame contract
│   │   ├── optics.ts            Objectives, camera, DOF, PSF, frame mapping
│   │   ├── noise.ts             Seeded PRNG and value noise
│   │   ├── shading.ts           Procedural reflectance per specimen kind
│   │   ├── wearProfile.ts       VB(x), ISO zones, design reference values
│   │   ├── renderer.ts          Image formation + quality assessment
│   │   ├── imaging.ts           Blur, luma, Laplacian, histogram, binning
│   │   ├── lineDetection.ts     Sub-pixel graduation finding / snapping
│   │   ├── calibration.ts       Scale, uncertainty, verification, status
│   │   ├── geometry.ts          Point–line distance, projection
│   │   ├── measurement.ts       VB readings, zones, statistics, U
│   │   ├── wearCriteria.ts      ISO 3685 criteria, decision rule, wear modes
│   │   ├── viewTransform.ts     Digital zoom/pan (display only)
│   │   └── exportCsv.ts         CSV export
│   ├── data/specimens.ts        Synthetic specimen library (documented)
│   ├── state/store.ts           Zustand store, persistence, selectors
│   ├── workers/                 Render worker, protocol, client
│   ├── hooks/                   useFrameImage, useMeasurement
│   ├── components/
│   │   ├── ui/                  shadcn-style primitives (Radix based)
│   │   ├── layout/Viewport.tsx  Live/frame switch, frame list, import
│   │   ├── workstation/         Controls (stage, focus, optics, light), LiveView
│   │   ├── measurement/         FrameView (Konva measurement canvas)
│   │   └── panels/              Measure, Calibrate, Results, Learn, Assess
│   ├── features/
│   │   ├── tutorials/lessons.ts Guided lessons with state-checked steps
│   │   ├── assessment/          Grading logic (+ tests)
│   │   └── export/              PDF report, overlay annotation
│   ├── App.tsx · main.tsx · index.css · version.ts
├── components.json              shadcn/ui configuration
├── playwright.config.ts · vite.config.ts · tsconfig*.json
```

---

## 6. Data models (`core/types.ts`)

| Model | Purpose | Key fields |
|---|---|---|
| `Objective`, `CameraSpec` | Optical train | magnification, NA, pixel pitch |
| `MicroscopeState` | Complete acquisition state | specimenId, objectiveId, stage {x, y, rotation}, focusZUm, illumination {mode, intensity}, camera {exposure, brightness, contrast} |
| `SpecimenDef` | Specimen library entry | geometry (micrometer / insert-flank / insert-rake), wearModes, surfaceZUm, homeStage, loadRotationDeg, seed, **provenance** |
| `FlankWearProfile` | Synthetic wear land | vbCornerUm, vbMeanUm, undulation, roughness, peaks, notch |
| `CapturedFrame` | Frozen acquisition | source (simulated/imported), microscope state, noiseSeed, size, `ImageQualityReport`, optional imported data URL |
| `ImageQualityReport` | Gate result | defocus blur, sharpness, mean grey, saturated/dark fractions, focusOk, exposureOk, acceptable, messages |
| `CalibrationRecord` | Scale for one objective or imported image | p1, p2, reference length and u, pick u, µm/px, u(µm/px), status, verification |
| `MeasurementSession` | Raw student input on one frame | edge reference {a, b}, points [{id, p}], lines [{kind, a, b, label}] |
| `WearPoint`, `LineMeasurement` | Derived readings | zone, distance px, VB µm, u µm |
| `WearSummary` | Statistics | n, VB_B mean/max/min/s, u(mean), u(max), k, VB_C max, VB_N max |
| `CriterionAssessment` | Tool-life decision | limit, value, reached (true / false / null = indeterminate) |

**Persistence**: `localStorage` key `toolwearlab:v1` (versioned for migrations),
storing microscope state, frames (metadata only for simulated frames),
sessions, calibrations, student details and assessment answers. A safe storage
wrapper keeps the app working in private mode or when the quota is exceeded.

---

## 7. Measurement and uncertainty model

**Calibration** (stage micrometer, two picks a distance d px apart, reference L):

s = L / d,  u(s)/s = √[(u_ref / L)² + (√2 · u_pick / d)²]

Defaults: u_pick = 0.5 px, u_ref = 0.5 µm (illustrative; replace with the
certificate value of the laboratory micrometer). Minimum span 100 px;
recommended > 600 px. **Verification** measures an independent interval and
passes when |error| ≤ U = 2·√(u_meas² + u_ref²) (E_n ≤ 1).

**VB reading**: VB = s · d⊥, where d⊥ is the perpendicular pixel distance from
the boundary pick to the edge reference line;
u(VB) = √[(√2 · u_pick · s)² + (d⊥ · u(s))²].

**Statistics** (zone B readings only):
u(mean) = √[u_r²/n + (mean · u(s)/s)²], u(max) = √[u_r² + (max · u(s)/s)²],
U = 2u. The standard deviation along the edge describes the wear land and is
reported, not folded into U.

**Decision rule**: criterion *reached* if value − U ≥ limit, *not reached* if
value + U < limit, otherwise *indeterminate* (ISO 14253-1 principle).

**Stated limitation**: U covers calibration and pick resolution. The
interpretation of the land boundary (operator effect) is usually larger; it is
addressed by the Phase 2 repeatability (R&R) activity.

---

## 8. Component specifications

| Component | Responsibility | Inputs → Outputs | Rules |
|---|---|---|---|
| `SpecimenCard` | Load specimen | select → `loadSpecimen` | Keeps focus position, so a new specimen at a new height is out of focus (realistic). |
| `OpticsCard` | Objective turret | radio → `setObjective` | Shows NA, DOF, resolution and per-objective calibration status; never shows the true µm/px. |
| `FocusCard` | Coarse 100 µm / fine 2 µm focus | hold-to-repeat buttons, keys Q/A/W/S | Relative sharpness meter (best seen). |
| `StageCard` | XY jog (1 µm–1 mm) and rotation ±15° | buttons, arrows | Moves the view over the specimen. |
| `IlluminationCard` | Coaxial/ring, intensity, exposure, brightness, contrast | sliders | Clipping visible in the live histogram. |
| `LiveView` | Live camera image | microscope state → worker render | Crosshair, digital zoom (crop), scale bar from the *student's* calibration, histogram, quality badges, capture with quality gate. |
| `FrameView` | Measurement canvas (Konva) | captured frame + session | Wheel zoom about cursor, pan, tools: edge, VB, distance, KB, KF, calibrate, verify; snap-to-graduation; ISO zone overlay; draggable points; status bar with image px and µm. |
| `CalibratePanel` | Calibration register and workflow | pending pick pair → record | Enforces micrometer frame (or imported image), span checks, verification. |
| `MeasurePanel` | Pre-checks and reading table | session readings | Lists quality, calibration, edge and zone-B count checks. |
| `ResultsPanel` | Summary, criteria, export | summary → CSV/PDF | U with k = 2; indeterminate decisions explained. |
| `LearnPanel` | Guided lessons | store state → step ticks | Steps tick from actual actions, not "next" clicks. |
| `AssessPanel` | Formative assessment A1–A4 | student work → `grading.ts` | Feedback per item; assessment PDF. |
| `Viewport` | Live/frame switching, import | file → imported frame | Imported images: exposure checked, focus not verifiable, all readings treated as zone B. |

---

## 9. User interface plan

**Desktop (≥ 1024 px)**: three columns. Left: microscope controls in the order
of use (specimen → objective → focus → stage → illumination). Centre: the
viewport (live camera or captured frame) with its toolbar and status bar.
Right: task panels as tabs (Measure, Calibrate, Results, Learn, Assess).

**Tablet/narrow**: single column: viewport first, then controls, then panels.
Touch: tap to place points, drag to move them.

**Visual language**: dark instrument chassis (minimises glare around the image),
cyan for optics/calibration overlays, amber for wear readings, magenta for
distances; monospaced tabular numerals for all readouts.

**Workflow** (mirrors the laboratory procedure):

1. Live view → load MIC-01 → objective → coarse/fine focus → illumination → align → capture.
2. Frame view → Calibrate (two graduations, divisions, uncertainty) → Verify.
3. Live view → load insert → refocus → capture (gate) → Edge reference → VB points → Results → export.

**Accessibility**: keyboard operation of stage and focus, ARIA roles on
radio groups, meters and toolbars, visible focus rings, colour never the sole
carrier of status (badges carry text).

---

## 10. Claude skills (`.claude/skills`)

| Skill | Use it when |
|---|---|
| `iso3685-tool-wear` | Touching wear terminology, zones, criteria or specimen design. |
| `optical-metrology-model` | Changing optics, rendering, calibration or uncertainty. |
| `measurement-validation` | Adding or changing any calculation: the test obligations. |
| `toolwearlab-ui-conventions` | Building UI: coordinate rules, overlays, gating, layout. |

---

## 11. Phase 1 acceptance criteria and results

| # | Criterion | Evidence | Result |
|---|---|---|---|
| A1 | Calibration recovers the true scale within its uncertainty at 5× and 10× from rendered micrometer images | `validation.test.ts` | Pass |
| A2 | Calibrated scale reproduces an independent micrometer interval (E_n ≤ 1) | `validation.test.ts`, e2e | Pass |
| A3 | VB readings equal design VB(x) at picked boundary points; rendered boundary within 6 µm of design at 10× | `validation.test.ts` | Pass |
| A4 | Zoom/pan never changes stored coordinates | `viewTransform.test.ts` | Pass |
| A5 | Calibration valid only for its objective; digital zoom does not affect it | `calibration.test.ts` | Pass |
| A6 | VB perpendicular to a tilted edge; zone-B statistics; U; decision rule | `measurement.test.ts` | Pass |
| A7 | Defocused or over-exposed frames rejected; good frames accepted | `validation.test.ts`, e2e | Pass |
| A8 | Full workflow in a browser: focus, align, capture, calibrate, verify, measure 8 VB points (160–170 µm on FW-01), CSV and PDF export, persistence across reload | `e2e/workflow.spec.ts` | Pass |
| A9 | Measurement blocked without calibration | e2e | Pass |
| A10 | No horizontal overflow at 1440 × 900 and 820 × 1180 | e2e | Pass |
| A11 | Strict TypeScript build | `tsc -b` | Pass |

Unit tests: 54 passing. E2E: 6 passing (desktop and tablet projects).

---

## 12. Implementation roadmap

| Phase | Content | Exit criteria |
|---|---|---|
| **1 · 2D microscope and manual measurement** (done) | Renderer, controls, capture gate, calibration and verification, VB/KB/KF tools, ISO zones and criteria, uncertainty, lessons, assessment A1–A4, CSV/PDF, local persistence, import of real micrographs | §11 all pass |
| **2 · Real images and measurement quality** | Reference dataset ingestion (see §13) with licence and calibration metadata; OpenCV.js (lazy) for edge-assisted boundary snapping and optional land segmentation; repeatability / R&R activity (Type A operator uncertainty); per-reading zone assignment for imported images; instructor answer keys for imported sets | Assisted picks agree with manual expert readings within stated U on a held-out labelled set |
| **3 · Instructor tools** | Exercise packs (JSON) authored by the lecturer, randomised specimens per student, signed result files, CLO mapping report for OBE documentation | Pilot with one MMT15603 cohort; usability (SUS) and learning-gain survey |
| **4 · 3D positioning (Three.js)** | Insert in holder with tilt errors, view selection (flank/rake), height map for focus variation, KT estimation from focus stack | Only after Phase 2 passes; KT from synthetic height maps within design tolerance |
| **5 · Integration** | URLearn (Moodle) embedding via LTI or SCORM wrapper, offline PWA | Works on lab PCs without network |

---

## 13. Reference data policy

Built-in specimens are synthetic and documented in `src/data/specimens.ts`.
Candidate open datasets for Phase 2 (licence and calibration metadata must be
checked before use; neither dataset's public page states the image scale):

- Brili and Ghavi, *Microscopic Dataset of Cutting Tool Flank Wear with Quantitative Measurements and Expert Labels*, Zenodo, 2026, DOI 10.5281/zenodo.19239342, CC BY 4.0: 277 images of 104 inserts with VBmax, wear area and expert usability labels.
- Schibsdat, Dege and Möller, *Tool Wear Experiment Dataset for the Evaluation of Sensor Informativeness in Longitudinal Turning (ExtraDrey)*, TUHH, 2026, DOI 10.15480/882.17237, Public Domain Mark: flank, rake and edge images at 150×, VB_max per experiment, partial segmentation masks.

The preferred long-term source is the faculty's own micrographs captured with a
certified stage micrometer, which also supply realistic operator R&R data.

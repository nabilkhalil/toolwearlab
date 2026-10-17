---
name: measurement-validation
description: Testing obligations for ToolWearLab. Use before adding or modifying any calculation (optics, calibration, measurement, statistics, criteria, grading, export) or any user workflow, and before declaring a phase complete.
---

# Measurement validation rules

## Commands
- `npm test` — Vitest unit tests (Node, no DOM).
- `npm run typecheck` — strict TypeScript.
- `npm run test:e2e` — Playwright (builds, serves on :4173). Where the Playwright browser download is blocked, set `CHROMIUM_PATH` to any Chromium binary.
- `SHOTS=<dir> npm run test:e2e` — also saves workflow screenshots.

## Obligations
1. **Every formula has a test with a hand-checkable expected value** (closed form in the test, not a copy of the implementation).
2. **Validate against known reference distances**: changes to optics, renderer, line detection or calibration must keep `validation.test.ts` passing — micrometer rendered → graduations detected → calibration within 2·u(s)/s of the true scale → independent interval passes verification.
3. **Coordinate invariance**: any view/zoom code change must keep `viewTransform.test.ts` invariance tests green.
4. **Determinism**: same (state, seed) → identical pixels.
5. **Negative tests**: quality gate rejects defocus beyond DOF/2 and saturation; calibration rejects short spans and invalid references; measurement is blocked without calibration (e2e).
6. **Grading** compares with synthetic design values; tests must cover a full-score answer and a characteristic mistake (e.g. missed VB_B max peak).
7. Do not loosen a tolerance to make a test pass without writing down the physical reason in the test.
8. Phase gate: do not start Phase 4 (3D) work until all §11 criteria in `docs/ARCHITECTURE.md` pass, and update that table with evidence when criteria change.

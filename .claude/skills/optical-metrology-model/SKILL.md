---
name: optical-metrology-model
description: Optics, image-formation, calibration and uncertainty model of ToolWearLab. Use when changing objectives, camera, focus/defocus, illumination, the renderer, image-quality gate, coordinate transforms, calibration maths or uncertainty propagation.
---

# Optical metrology model

## Coordinate frames (contract in `src/core/types.ts`)
1. Specimen frame, µm. x along the cutting edge from the corner, y away from the edge.
2. Sensor/image frame, px, origin top-left. **Only frame used for stored measurements.**
3. Screen/view frame. Display only, never persisted.
Use `worldToImage` / `imageToWorld` (optics.ts) and `imageToScreen` / `screenToImage` (viewTransform.ts). Never compute positions from screen pixels.

## Magnification vs digital zoom
- Objective magnification sets s = pixelPitch / M (µm/px). Changing objective → calibration for that objective applies (stored per objective id).
- Digital zoom is a display transform (FrameView) or a centre crop (LiveView). It must never change s, stored points, or calibration status.
- The true s is hidden from students: do not display `nominalUmPerPx` in the UI. Scale bars use the student's calibration only.

## Image formation (`renderer.ts`)
reflectance (`shading.ts`) → lamp × mode efficiency × exposure × vignetting → Gaussian defocus PSF (`blurSigmaPx`) → noise (read + shot, seeded) → contrast/brightness → 8-bit clip.
- Must stay deterministic for a given (state, seed): frames are regenerated from metadata.
- Keep per-pixel work cheap: VB(x) is tabulated (`wearAt` LUT). Profile renders with `scripts/render-samples.ts` (target ≤ ~150 ms at scale 0.5 in Node).
- DOF = λ/NA² + e/(M·NA); focus acceptance abs(Δz) ≤ DOF/2.

## Calibration and uncertainty (`calibration.ts`, `measurement.ts`)
- s = L/d; u(s)/s = √[(u_ref/L)² + (√2·u_pick/d)²].
- Verification passes when |error| ≤ 2·√(u_meas² + u_ref²).
- VB reading u = √[(√2·u_pick·s)² + (d⊥·u(s))²]; mean/max combine random (÷√n for the mean) and fully correlated scale terms; k = 2.
- State clearly that U excludes boundary-interpretation (operator) uncertainty.
- Readings are derived from raw picks + current calibration (`deriveReadings`); never store derived µm values in state.

## Quality gate
`assessQuality` thresholds live in `QUALITY_LIMITS`. Any change needs updated tests in `validation.test.ts` and a check that all specimens at default lamp settings at 5× remain capturable when focused.

---
name: iso3685-tool-wear
description: Tool-wear domain rules for ToolWearLab. Use whenever code, text, specimens, grading or UI touches wear terminology, ISO 3685 zones (C, B, N), VB/KB/KF/KT parameters, tool-life criteria, or the distinction between flank, crater and notch wear.
---

# ISO 3685 tool-wear rules for ToolWearLab

## Terminology (use exactly these symbols)
- **VB**: flank wear land width, measured in the flank-face plane, **perpendicular to the original cutting edge**. Never measure vertical Δy on a tilted image.
- **VB_B**: average VB over zone B. **VB_B max**: maximum VB in zone B.
- **VB_C**: wear in zone C (corner). **VB_N**: wear in zone N (notch zone).
- **KT** crater depth, **KB** crater width (original edge → back of crater), **KM** crater centre distance, **KF** crater front distance. KT is NOT measurable from a 2D optical image; say so whenever crater depth comes up.

## Zones (simplified, documented in `src/core/wearProfile.ts`)
- C: 0 ≤ x ≤ r_ε (corner radius).
- B: r_ε < x < a_p (depth-of-cut line, edge-projected; lead angle ignored).
- N: a_p ≤ x ≤ a_p + 1 mm.
Only zone-B readings enter VB_B and VB_B max. If you change zone logic, update `zoneLimits`, the FrameView overlay, the docs and the tests together.

## Tool-life criteria (sintered carbide, ISO 3685:1993)
- VB_B = 0.3 mm when zone B is regularly worn.
- VB_B max = 0.6 mm when zone B is irregularly worn, scratched or chipped.
- KT = 0.06 + 0.3·f mm (f in mm/rev).
- HSS and ceramics have different criteria: do not apply these to them.
- Decisions use the expanded uncertainty: within ±U of the limit is **indeterminate** (`wearCriteria.decide`).
- `irregularityIndex` (> 0.4) is a teaching heuristic, not an ISO clause; label it as such.

## Wear modes
| Mode | Where | Parameters | Typical cause |
|---|---|---|---|
| Flank | Clearance face, land along the edge | VB family | Abrasion |
| Crater | Rake face behind the edge | KT, KB, KM, KF | Diffusion/dissolution at high temperature |
| Notch | Flank at depth-of-cut line (zone N) | VB_N | Work-hardened layer, oxidation, burr |

## Specimen data integrity
- All built-in specimens are **synthetic**. Keep `provenance.type: 'synthetic'` and the note. Design values from `referenceWear` are geometry properties, never "measured" or "experimental".
- Never add numbers presented as experimental ground truth without a cited, licensed source and its calibration metadata.
- Workpiece/cutting conditions on specimens are labelled "illustrative context only"; keep that wording.
- When adding a specimen: document every parameter, add it to `SPECIMENS`, add a design-value test in `validation.test.ts`, render it with `npx tsx scripts/render-samples.ts <dir>` and inspect the PNGs.

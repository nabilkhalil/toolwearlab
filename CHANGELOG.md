# Changelog

## v0.2.0 (2026-11-10): Interactive guided tour

New features

- Guided tour that shows where to click: each step highlights the exact control with a ring and an animated mouse pointer, and advances by itself when the student has done it. 29 steps, from first focus to the exported report.
- "Click here" markers on the captured image for the calibration lines, the cutting-edge reference and the first three VB readings.
- Focus coaching: the tour names the focus button to hold and switches from coarse to fine at the right moment.
- Welcome screen for first-time users; the tour can be closed, resumed or restarted (header strip and Learn tab).
- Workflow strip under the header: five stages with ticks, the next action, and a "Show me how" button.
- Drag the live picture to move the stage; mouse wheel over it for fine focus (Shift + wheel: coarse).
- "What's new" panel, opened from the version number.

Improvements

- Sharpness meter no longer reads 100 % while the image is out of focus.
- Enter key submits the calibration form.
- The right-hand tab is remembered and can be driven by the tour.

Testing

- A "robot student" browser test follows the tour literally (it only does what the tour points at) and must end with a verified calibration and at least eight valid VB readings.
- 60 unit tests, 10 browser tests.

Notes

- The tour uses the practice specimens MIC-01 and FW-01 at 5x. Its image markers come from the synthetic design geometry, so the graded activity keeps using a different specimen (FW-02) without markers.

## v0.1.0 (2026-10-16): Phase 1

- 2D virtual microscope: objectives, coarse and fine focus, XY stage, rotation, illumination, exposure.
- Stage-micrometer calibration with uncertainty and independent verification.
- ISO 3685 flank wear measurement (VB_B, VB_B max, zones C, B, N) and tool-life decision.
- Guided lesson checklists, practice assessment, CSV and PDF export.

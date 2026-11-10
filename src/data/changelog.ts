/** Release notes shown in the app ("What's new") and mirrored in CHANGELOG.md. */
export interface Release {
  version: string;
  date: string;
  title: string;
  features: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '0.2.0',
    date: '2026-11-10',
    title: 'Interactive guided tour',
    features: [
      'Guided tour that shows where to click: each step highlights the exact button, with an animated mouse pointer, and moves on by itself when you have done it.',
      '“Click here” markers on the image for the calibration lines, the cutting-edge reference and the first three VB readings.',
      'Focus coaching: the tour tells you which focus button to hold and switches from coarse to fine at the right moment.',
      'Welcome screen for first-time users, with a one-click start of the tour.',
      'Workflow strip under the header: five stages with ticks, the next thing to do, and a “Show me” button.',
      'Easier microscope handling: drag the live picture to move the stage, scroll the mouse wheel over it for fine focus (Shift + wheel for coarse).',
      '“What’s new” panel (click the version number).',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-16',
    title: 'Phase 1: 2D microscope and manual measurement',
    features: [
      'Virtual microscope with objectives, coarse and fine focus, XY stage, rotation, illumination and exposure.',
      'Stage-micrometer calibration with uncertainty and independent verification.',
      'ISO 3685 flank wear measurement (VB_B, VB_B max, zones C, B, N) with tool-life decision.',
      'Guided lessons, practice assessment, CSV and PDF export.',
    ],
  },
];

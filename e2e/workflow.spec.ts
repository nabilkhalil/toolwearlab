import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Phase 1 acceptance workflow, end to end in a real browser:
 *  setup → focus → align → capture micrometer → calibrate → verify →
 *  capture worn insert → edge reference → VB readings → results → CSV/PDF.
 * Geometry used to place clicks mirrors the documented specimen parameters
 * (MIC-01, FW-01) and the optics model (5×: 0.69 µm/px, 1600×1200 sensor).
 */
const UM_PER_PX_5X = 0.69;
const W = 1600;
const H = 1200;

/** Optional screenshots for documentation: SHOTS=<dir> npm run test:e2e */
async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
}

async function pressN(page: Page, key: string, n: number) {
  for (let i = 0; i < n; i++) await page.keyboard.press(key);
}

/** Image px → page coordinates for the fitted frame view. */
async function toScreen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('frame-view').boundingBox())!;
  const s = Math.min(box.width / W, box.height / H);
  return { x: box.x + (box.width - W * s) / 2 + x * s, y: box.y + (box.height - H * s) / 2 + y * s };
}

async function clickImage(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** World µm → image px for a stage centred at (sx, sy), total rotation t (deg), scale s. */
function w2i(x: number, y: number, sx: number, sy: number, tDeg: number, s: number) {
  const t = (tDeg * Math.PI) / 180;
  const dx = x - sx;
  const dy = y - sy;
  return { x: (Math.cos(t) * dx - Math.sin(t) * dy) / s + W / 2, y: (Math.sin(t) * dx + Math.cos(t) * dy) / s + H / 2 };
}

async function waitForFrame(page: Page) {
  // The capture renders at full resolution first; then the frame view mounts and reconstructs the image.
  await expect(page.getByTestId('frame-view').locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('live-canvas')).toBeVisible();
});

test('complete calibration and flank-wear measurement workflow', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Full workflow runs on the desktop layout');

  // 1. Optics: 5× objective, focus onto MIC-01 (surface at 1180 µm; focus starts 900 µm above).
  await page.getByRole('radio', { name: '5×' }).click();
  await expect(page.getByText('Defocused')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await pressN(page, 'a', 9);
  await expect(page.getByText('In focus')).toBeVisible({ timeout: 10_000 });

  // 2. Align: the micrometer is loaded at +0.6°, rotate back by 0.6°.
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Rotate −0.1°' }).click();

  // 3. Capture the micrometer.
  await page.getByTestId('capture').click();
  await expect(page.getByTestId('frame-view')).toBeVisible();
  await waitForFrame(page);

  // 4. Calibrate on the 250 µm and 750 µm graduations (50 divisions), snapping to line centres.
  await page.getByTestId('tab-calibrate').click();
  await page.getByTestId('start-calibrate').click();
  const yPick = w2i(0, 30, 500, 60, 0, UM_PER_PX_5X).y;
  await clickImage(page, w2i(250, 30, 500, 60, 0, UM_PER_PX_5X).x + 2, yPick);
  await clickImage(page, w2i(750, 30, 500, 60, 0, UM_PER_PX_5X).x - 2, yPick);
  await page.getByTestId('cal-divisions').fill('50');
  await page.getByTestId('cal-submit').click();
  await expect(page.getByTestId('header-cal-status')).toContainText('calibrated');

  // 5. Verify on 300 → 600 µm (30 divisions).
  await clickImage(page, w2i(300, 30, 500, 60, 0, UM_PER_PX_5X).x + 2, yPick);
  await clickImage(page, w2i(600, 30, 500, 60, 0, UM_PER_PX_5X).x - 1, yPick);
  await page.getByTestId('cal-divisions').fill('30');
  await page.getByTestId('cal-submit').click();
  await expect(page.getByTestId('header-cal-status')).toContainText('verified');
  await shot(page, '02_calibrated');

  // 6. Worn insert FW-01 (surface 4870 µm): refocus and capture at 5×.
  await page.getByTestId('ws-live').click();
  await page.getByLabel('Load specimen').selectOption('FW-01');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await pressN(page, 'q', 36);
  await pressN(page, 'w', 45);
  await expect(page.getByText('In focus')).toBeVisible({ timeout: 10_000 });
  await shot(page, '03_live_fw01');
  // Undo the earlier rotation so the total rotation is the FW-01 load angle (1.8°).
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Rotate +0.1°' }).click();
  await page.getByTestId('capture').click();
  await waitForFrame(page);

  // 7. Edge reference along the original edge, then VB readings near the design mean (~165 µm).
  const t = 1.8;
  await page.getByTestId('tool-edge').click();
  const e1 = w2i(900, 0, 1300, 300, t, UM_PER_PX_5X);
  const e2 = w2i(1750, 0, 1300, 300, t, UM_PER_PX_5X);
  await clickImage(page, e1.x, e1.y);
  await clickImage(page, e2.x, e2.y);
  await page.getByTestId('tool-vb').click();
  for (const x of [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600]) {
    const p = w2i(x, 165, 1300, 300, t, UM_PER_PX_5X);
    await clickImage(page, p.x, p.y);
  }
  await page.getByRole('tab', { name: 'Measure' }).click();
  const rows = page.getByTestId('vb-table').locator('tbody tr');
  await expect(rows).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    const vb = Number(await rows.nth(i).locator('td').nth(2).innerText());
    expect(vb).toBeGreaterThan(160);
    expect(vb).toBeLessThan(170);
  }

  await page.getByRole('button', { name: 'Zones' }).click();
  await shot(page, '04_measured');
  // 8. Results and exports.
  await page.getByTestId('tab-results').click();
  await expect(page.getByText('VB_B (average)').first()).toBeVisible();
  await shot(page, '05_results');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  const csvText = readFileSync((await csv.path())!, 'utf8');
  expect(csvText).toContain('VB_B_mean,16');
  expect(csvText).toContain('calibration_status,verified');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');

  // 9. Practice data survives a reload (local storage).
  await page.reload();
  await page.getByTestId('tab-calibrate').click();
  await expect(page.getByText('verified').first()).toBeVisible();
  await expect(page.getByTestId('frame-select').locator('option')).toHaveCount(3);
});

test('image-quality gate rejects an out-of-focus capture', async ({ page }) => {
  await page.getByTestId('capture').click();
  await expect(page.getByText('Frame rejected')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Out of focus/)).toBeVisible();
});

test('measurement requires a calibration and an edge reference', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Desktop layout');
  await page.getByLabel('Load specimen').selectOption('FW-01');
  await page.getByRole('radio', { name: '5×' }).click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await pressN(page, 'q', 27);
  await pressN(page, 'w', 45);
  await expect(page.getByText('In focus')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('capture').click();
  await waitForFrame(page);
  await page.getByTestId('tool-vb').click();
  await clickImage(page, 800, 600);
  await expect(page.getByText(/Calibrate this objective/)).toBeVisible();
});

test('layout fits without horizontal scrolling', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Capture frame' })).toBeVisible();
  await page.getByTestId('tab-learn').click();
  await expect(page.getByTestId('lesson-setup')).toBeVisible();
  await shot(page, `06_layout_${test.info().project.name}`);
});

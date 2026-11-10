import { expect, test, type Page } from '@playwright/test';

/**
 * A "robot student" follows the guided tour literally: it reads which control
 * the tour is pointing at and does exactly that, nothing else. If the tour
 * ever points at the wrong thing, or fails to notice a completed step, the
 * robot gets stuck and the test fails.
 */
const W = 1600;
const H = 1200;

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tour_${name}.png` });
}

/** Image px → page coordinates for the fitted frame view. */
async function toScreen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('frame-view').boundingBox())!;
  const s = Math.min(box.width / W, box.height / H);
  return { x: box.x + (box.width - W * s) / 2 + x * s, y: box.y + (box.height - H * s) / 2 + y * s };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('guided tour leads a new student from first focus to a verified VB result', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Tour robot runs on the desktop layout');
  test.setTimeout(180_000);

  await expect(page.getByTestId('welcome')).toBeVisible();
  await shot(page, '00_welcome');
  await page.getByTestId('welcome-start').click();

  const coach = page.getByTestId('coach');
  const visited: string[] = [];
  const shots = new Set<string>();
  let ownVb = 0;

  for (let guard = 0; guard < 600 && (await coach.count()) > 0; guard++) {
    const step = (await coach.getAttribute('data-step')) ?? '';
    const action = await coach.getAttribute('data-action');
    const target = (await coach.getAttribute('data-target')) ?? '';
    const value = (await coach.getAttribute('data-value')) ?? '';
    const done = (await coach.getAttribute('data-done')) === 'true';
    if (visited.at(-1) !== step) visited.push(step);

    const key = `${step}|${target}`;
    if (!shots.has(key) && ['focus-mic', 'align', 'capture-mic', 'cal-pick-1', 'cal-enter', 'ver-pick-2', 'focus-insert', 'edge-1', 'vb-points', 'read-results'].includes(step)) {
      shots.add(key);
      await page.waitForTimeout(1300); // let the pointer animation reach the target
      await shot(page, `${String(shots.size).padStart(2, '0')}_${step}`);
    }

    const next = page.getByTestId('coach-next');
    if ((await next.count()) > 0) {
      await next.click();
      continue;
    }
    if (done) {
      await page.waitForTimeout(150);
      continue;
    }
    if (target === 'point') {
      const box = await page.getByTestId('coach-point').boundingBox();
      if (!box) {
        await page.waitForTimeout(150);
        continue;
      }
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(120);
    } else if (action === 'choose') {
      await page.locator(target).selectOption(value);
    } else if (action === 'type') {
      await page.locator(target).fill(value);
      await page.waitForTimeout(250);
    } else if (action === 'click' || action === 'hold') {
      // The control can disappear between reading the step and clicking (e.g. the view switches after Capture).
      await page.locator(target).click({ timeout: 1500 }).catch(() => undefined);
    } else if (step === 'vb-points') {
      // "Your turn": the tour stops placing markers, so the robot picks boundary points itself.
      // FW-01 at home stage (1300, 300) µm, load rotation 1.8° (loading resets the holder), 0.69 µm/px, VB ≈ 165 µm.
      const t = (1.8 * Math.PI) / 180;
      const dx = 1480 + ownVb * 70 - 1300;
      const dy = 165 - 300;
      ownVb++;
      const p = await toScreen(page, (Math.cos(t) * dx - Math.sin(t) * dy) / 0.69 + W / 2, (Math.sin(t) * dx + Math.cos(t) * dy) / 0.69 + H / 2);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(120);
    } else {
      await page.waitForTimeout(150);
    }
  }

  // The tour closed itself after the last step, having passed through every stage in order.
  await expect(coach).toHaveCount(0);
  for (const id of ['objective', 'focus-mic', 'align', 'capture-mic', 'cal-pick-1', 'cal-enter', 'ver-enter', 'load-insert', 'focus-insert', 'capture-insert', 'zones', 'edge-2', 'vb-points', 'export'])
    expect(visited, `tour visited ${id}`).toContain(id);
  expect(visited.indexOf('cal-enter')).toBeLessThan(visited.indexOf('vb-points'));

  // What the student ends up with is a real, valid measurement.
  await expect(page.getByTestId('header-cal-status')).toContainText('verified');
  await page.getByRole('tab', { name: 'Measure' }).click();
  const rows = page.getByTestId('vb-table').locator('tbody tr');
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(8);
  for (let i = 0; i < n; i++) {
    const vb = Number(await rows.nth(i).locator('td').nth(2).innerText());
    expect(vb).toBeGreaterThan(150);
    expect(vb).toBeLessThan(180);
  }
  const stages = page.getByTestId('workflow-strip').locator('li span[data-done]');
  await expect(stages).toHaveCount(5);
  for (let i = 0; i < 4; i++) await expect(stages.nth(i)).toHaveAttribute('data-done', 'true');
  await shot(page, '99_finished');
});

test('tour can be closed and resumed, and the release notes open', async ({ page }) => {
  await page.getByTestId('welcome-start').click();
  await expect(page.getByTestId('coach-card')).toBeVisible();
  await page.getByTestId('coach-next').click();
  await page.getByTestId('coach-exit').click();
  await expect(page.getByTestId('coach')).toHaveCount(0);
  await expect(page.getByTestId('tour-start')).toContainText('Resume');
  await page.getByTestId('tour-start').click();
  await expect(page.getByTestId('coach')).toHaveAttribute('data-step', 'intro-view');
  await page.getByTestId('coach-exit').click();

  await page.getByTestId('version-badge').click();
  await expect(page.getByTestId('whats-new')).toContainText('0.2.0');
  await expect(page.getByTestId('whats-new')).toContainText('Interactive guided tour');
});

test('dragging the live picture moves the stage and the wheel focuses', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Mouse interaction');
  await page.getByTestId('welcome-skip').click();
  const view = page.locator('[data-coach="live-view"]');
  const box = (await view.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('toolwearlab:v1')!).state.microscope);
  const before = await state();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  const after = await state();
  // Dragging the picture right brings specimen from the left into view: stage x decreases.
  expect(after.stage.xUm).toBeLessThan(before.stage.xUm - 50);
  // Three wheel notches down = 3 fine steps of 2 µm downward.
  expect(after.focusZUm).toBeCloseTo(before.focusZUm - 6, 5);
});

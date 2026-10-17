import { defineConfig, devices } from '@playwright/test';

// CHROMIUM_PATH lets CI or sandboxed machines supply their own Chromium
// binary when the Playwright download is unavailable.
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath
      ? { executablePath, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
      : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 } } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

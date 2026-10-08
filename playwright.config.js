import { defineConfig, devices } from '@playwright/test'

/**
 * The opt-in end-to-end suite: smoke checks and the accessibility evidence (axe reports and
 * screenshots) taken on the emulator build. `npm run test:e2e` runs it against emulators that
 * are already up; `npm run test:e2e:emulators` starts them around it. Vitest never collects
 * tests/e2e, so `npm run check` is unchanged. The preview server is built and started here
 * unless port 4173 already answers, and tests/e2e/global-setup.js seeds the emulators first.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The phone project runs the smoke checks only: the evidence specs set their own widths.
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] }, testMatch: /smoke\.spec\.js$/u },
  ],
  webServer: {
    command:
      'npm run build:emulator && npm run preview -- --mode emulator --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})

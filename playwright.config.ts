import { defineConfig, devices } from '@playwright/test';

// ━━━ V4 — Playwright configuration — Golden Path E2E ━━━
// Scope: tests/e2e/*.spec.ts — PARCOURS PRODUIT + ISOLATION.
// baseURL: instance Next de test (jamais la production).

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,             // sériel — le Golden Path a un ordre
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                       // évite la contention sur la base de test
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3099',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      // Évite le piège des tests qui fuient via Referer.
      'Referrer-Policy': 'no-referrer',
    },
  },
  projects: [
    {
      name: 'mobile-iphone-14',
      use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'mobile-android-pixel-7',
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});

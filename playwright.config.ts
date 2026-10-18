import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/editor-compatibility',
  outputDir: 'test-results/editor',
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/editor-browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'node scripts/browser-test-server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

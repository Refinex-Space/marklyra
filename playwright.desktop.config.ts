import { defineConfig } from '@playwright/test';
import editorConfig from './playwright.config.js';

export default defineConfig({
  ...editorConfig,
  testDir: './tests/desktop-e2e',
  outputDir: 'test-results/desktop-shell',
  reporter: [['list'], ['json', { outputFile: 'test-results/desktop-shell-results.json' }]],
  use: { ...editorConfig.use, baseURL: 'http://127.0.0.1:4184' },
  webServer: [
    {
      command: 'node scripts/browser-test-server.mjs desktop',
      url: 'http://127.0.0.1:4184',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'node scripts/runtime-server.mjs',
      url: 'http://127.0.0.1:4174/index.html',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});

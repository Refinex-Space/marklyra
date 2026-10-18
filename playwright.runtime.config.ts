import { defineConfig } from '@playwright/test';
import editorConfig from './playwright.config.js';

export default defineConfig({
  ...editorConfig,
  testDir: './tests/editor-runtime',
  outputDir: 'test-results/runtime-editor',
  timeout: 45_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/runtime-editor-results.json' }]],
  webServer: [
    {
      command: 'node scripts/browser-test-server.mjs',
      url: 'http://127.0.0.1:4173',
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

import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const development = process.env.PLAYGROUND_DEV === '1';
const port = development ? 4173 : 4183;
export default defineConfig({
  testDir: './tests',
  outputDir: '../../test-results/playground',
  timeout: 45_000,
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: [
    {
      command: development
        ? 'pnpm --filter @marklyra/playground dev'
        : 'pnpm --filter @marklyra/playground exec vite preview --host 127.0.0.1 --port 4183 --strictPort',
      cwd: root,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: true,
    },
    {
      command: 'node scripts/runtime-server.mjs',
      cwd: root,
      url: 'http://127.0.0.1:4174/index.html',
      reuseExistingServer: true,
    },
  ],
});

import { resolve } from 'node:path';
import { createServer } from 'vite';

// Test fixtures deliberately import some source modules. A regular dev server
// broadcasts full-page reloads if any previously requested module is rewritten,
// including an identical rebuild by a separate desktop dev process.
const app = process.argv[2] ?? 'playground';
if (!['playground', 'desktop'].includes(app)) throw new Error('Unknown test application');
const port = app === 'desktop' ? 4184 : 4173;
const root = resolve(
  import.meta.dirname,
  app === 'desktop' ? '../apps/desktop' : '../apps/editor-playground',
);
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  clearScreen: false,
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
});
await server.listen();
console.log(
  `Browser test server: http://127.0.0.1:${port} (HMR and watch disabled; restart after source changes)`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

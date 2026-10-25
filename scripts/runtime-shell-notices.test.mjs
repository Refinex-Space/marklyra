import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, createServer, loadConfigFromFile } from 'vite';
import { projectNoticeFiles, readProjectNotices } from './lib/project-notices.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const desktopConfig = fileURLToPath(new URL('../apps/desktop/vite.config.ts', import.meta.url));

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'marklyra-desktop-notices-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head></head><body></body></html>',
  );
  return root;
}

test('desktop configuration emits the shared notice texts once while assets keep their own identities', async (t) => {
  const root = await fixture(t);
  const expected = await readProjectNotices(repository);
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, desktopConfig);
  assert.ok(loaded);
  const plugins = loaded.config.plugins.flat();
  assert.equal(plugins.filter((plugin) => plugin.name === 'project-notices').length, 1);
  const emitted = [];
  for (const plugin of plugins) {
    plugin.configResolved({ command: 'build' });
    await plugin.buildStart.call({
      emitFile(asset) {
        emitted.push(asset);
      },
    });
  }
  for (const name of projectNoticeFiles) {
    const matches = emitted.filter((asset) => asset.fileName === name);
    assert.equal(matches.length, 1, name);
    assert.deepEqual(Buffer.from(matches[0].source), expected.get(name).bytes);
  }
  assert.ok(emitted.every((asset) => !asset.fileName.includes('/licenses/')));

  const bundle = await build({
    ...loaded.config,
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    build: { write: false },
  });
  assert.ok(!Array.isArray(bundle));
  for (const name of projectNoticeFiles) {
    const files = bundle.output.filter((asset) => asset.fileName === name);
    assert.equal(files.length, 1, name);
    assert.deepEqual(Buffer.from(files[0].source), expected.get(name).bytes);
  }
  assert.ok(bundle.output.every((asset) => !asset.fileName.includes('/licenses/')));
});

test('desktop serves the shared root texts and retires the separate font and icon notice routes', async (t) => {
  const root = await fixture(t);
  const expected = await readProjectNotices(repository);
  const server = await createServer({
    root,
    configFile: desktopConfig,
    publicDir: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const name of projectNoticeFiles) {
    const response = await fetch(`${origin}/${name}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected.get(name).bytes);
    const head = await fetch(`${origin}/${name}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(Number(head.headers.get('content-length')), expected.get(name).bytes.length);
    const cached = await fetch(`${origin}/${name}`, {
      headers: { 'If-None-Match': response.headers.get('etag') },
    });
    assert.equal(cached.status, 304);
    assert.equal((await fetch(`${origin}/${name}`, { method: 'POST' })).status, 405);
  }
  for (const path of [
    '/__runtime-fonts/licenses/fonts/OFL-1.1.txt',
    '/__runtime-fonts/licenses/fonts/manifest.json',
    '/__runtime-icons/licenses/ionicons-MIT.txt',
    '/__runtime-icons/licenses/fontawesome-OFL.txt',
  ])
    assert.equal((await fetch(`${origin}${path}`)).status, 404, path);
});

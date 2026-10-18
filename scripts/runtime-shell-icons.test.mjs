import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { SHELL_FONT_MANIFEST } from './runtime-shell-fonts.mjs';
import {
  runtimeShellIcons,
  SHELL_ICON_MANIFEST,
  SHELL_ICON_PREFIX,
} from './runtime-shell-icons.mjs';

const source = fileURLToPath(new URL('../private/runtime-assets/style/', import.meta.url));
const servers = new Map();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, copy = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'marklyra-shell-icons-')));
  t.after(async () => {
    await servers.get(root)?.close();
    servers.delete(root);
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head></head><body></body></html>',
  );
  const fonts = join(root, 'private-icons');
  await mkdir(fonts);
  if (copy)
    for (const path of [
      ...SHELL_ICON_MANIFEST.map((font) => font.path),
      'ionicons-2.0.1/LICENSE',
    ]) {
      await mkdir(dirname(join(fonts, path)), { recursive: true });
      await copyFile(join(source, path), join(fonts, path));
    }
  return { root, fonts };
}

async function server(t, root, sourceDirectory = source) {
  const instance = await createServer({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [runtimeShellIcons({ sourceDirectory })],
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
  });
  servers.set(root, instance);
  await instance.listen();
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

function request(origin, path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const operation = http.request(origin, { path, method, headers }, (response) => {
      const bytes = [];
      response.on('data', (chunk) => bytes.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          bytes: Buffer.concat(bytes),
        }),
      );
    });
    operation.on('error', reject);
    operation.end();
  });
}

test('three private icon fonts, precise family aliases and the actual Ionicons notice are served unchanged', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  const html = await (await fetch(origin)).text();
  assert.match(html, /id="runtime-shell-icons"/);
  const css = await request(origin, `${SHELL_ICON_PREFIX}icons.css`);
  assert.equal(css.status, 200);
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
  assert.equal((css.bytes.toString().match(/@font-face/g) ?? []).length, 3);
  assert.doesNotMatch(css.bytes.toString(), /local\(/);
  for (const font of SHELL_ICON_MANIFEST) {
    assert.ok(css.bytes.toString().includes(JSON.stringify(font.family)));
    const result = await request(origin, SHELL_ICON_PREFIX + font.path, 'GET', {
      Origin: 'http://foreign.example',
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-type'], 'font/woff');
    assert.equal(result.headers['access-control-allow-origin'], undefined);
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.match(result.headers['cache-control'], /must-revalidate/);
    assert.equal(result.bytes.length, font.bytes);
    assert.equal(digest(result.bytes), font.sha256);
    const head = await request(origin, SHELL_ICON_PREFIX + font.path, 'HEAD');
    assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), font.bytes);
    assert.equal(
      (
        await request(origin, SHELL_ICON_PREFIX + font.path, 'GET', {
          'If-None-Match': result.headers.etag,
        })
      ).status,
      304,
    );
  }
  const notice = await request(origin, `${SHELL_ICON_PREFIX}licenses/ionicons-MIT.txt`);
  assert.deepEqual(notice.bytes, await readFile(join(source, 'ionicons-2.0.1/LICENSE')));
  const provenance = JSON.parse(
    (await request(origin, `${SHELL_ICON_PREFIX}provenance.json`)).bytes,
  );
  assert.equal(provenance.fonts.filter((font) => font.license === 'MIT').length, 1);
  assert.equal(provenance.fonts.filter((font) => font.license === 'private-unreviewed').length, 1);
  assert.equal(provenance.fonts.filter((font) => font.license === 'OFL-1.1').length, 1);
  const ofl = await request(origin, `${SHELL_ICON_PREFIX}licenses/fontawesome-OFL.txt`);
  assert.deepEqual(
    ofl.bytes,
    await readFile(new URL('../licenses/fonts/OFL-1.1.txt', import.meta.url)),
  );
  const fontNotices = await request(origin, `${SHELL_ICON_PREFIX}licenses/icon-notices.txt`);
  assert.equal(
    digest(fontNotices.bytes),
    'af0c3b5f101331c91f86b7aed2aa6194a51f70ed099588d0398506ecb0e723b9',
  );
  assert.equal(SHELL_FONT_MANIFEST.length, 24);
  assert.ok(
    SHELL_ICON_MANIFEST.every((font) => !SHELL_FONT_MANIFEST.some((f) => f.path === font.path)),
  );
});

test('unknown, encoded and traversal requests cannot expose other private resources', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  for (const path of [
    `${SHELL_ICON_PREFIX}../index.html`,
    `${SHELL_ICON_PREFIX}%2e%2e/index.html`,
    `${SHELL_ICON_PREFIX}typora-icon\\fonts\\typora-icon.woff`,
    '/__runtime-icons%2ftypora-icon/fonts/typora-icon.woff',
  ])
    assert.equal((await request(origin, path)).status, 400, path);
  assert.equal(
    (await request(origin, `${SHELL_ICON_PREFIX}typora-file-icon/fonts/ty-file.woff`)).status,
    404,
  );
  assert.equal((await request(origin, `${SHELL_ICON_PREFIX}icons.css`, 'POST')).status, 405);
  assert.equal(
    (await request(origin, `/@fs${join(source, SHELL_ICON_MANIFEST[0].path)}`)).status,
    403,
  );
});

for (const mutation of ['missing', 'corrupt', 'symlink', 'notice'])
  test(`private icon ${mutation} input fails before serving or emitting`, async (t) => {
    const { root, fonts } = await fixture(t, true);
    const target = join(fonts, SHELL_ICON_MANIFEST[0].path);
    if (mutation === 'missing') await rm(target);
    if (mutation === 'corrupt') await writeFile(target, 'changed private font');
    if (mutation === 'symlink') {
      const outside = join(root, 'outside.woff');
      await copyFile(target, outside);
      await rm(target);
      await symlink(outside, target);
    }
    if (mutation === 'notice')
      await writeFile(join(fonts, 'ionicons-2.0.1/LICENSE'), 'changed notice');
    const plugin = runtimeShellIcons({ sourceDirectory: fonts });
    plugin.configResolved({ command: 'build' });
    let emitted = 0;
    await assert.rejects(
      plugin.buildStart.call({
        emitFile() {
          emitted++;
        },
      }),
      /Runtime shell icon/,
    );
    assert.equal(emitted, 0);
  });

test('build hooks emit exactly eight identity-verified assets including mandatory notices while serve never emits', async () => {
  const serving = runtimeShellIcons();
  serving.configResolved({ command: 'serve' });
  await serving.buildStart.call({
    emitFile() {
      throw Error('serve must not emit');
    },
  });
  const plugin = runtimeShellIcons();
  plugin.configResolved({ command: 'build' });
  const output = new Map();
  await plugin.buildStart.call({
    emitFile(asset) {
      output.set(asset.fileName, asset.source);
    },
  });
  assert.equal(output.size, 8);
  for (const font of SHELL_ICON_MANIFEST)
    assert.equal(digest(output.get(`${SHELL_ICON_PREFIX.slice(1)}${font.path}`)), font.sha256);
  assert.ok(output.has('__runtime-icons/licenses/ionicons-MIT.txt'));
  assert.ok(output.has('__runtime-icons/licenses/fontawesome-OFL.txt'));
  assert.ok(output.has('__runtime-icons/licenses/icon-notices.txt'));
  assert.ok(output.has('__runtime-icons/provenance.json'));
  assert.ok(output.has('__runtime-icons/icons.css'));
});

for (const mutation of ['missing-ofl', 'changed-notices', 'notice-symlink'])
  test(`public icon notice ${mutation} fails before emitting any font`, async (t) => {
    const { root } = await fixture(t);
    for (const file of [
      'scripts/runtime-shell-icons.mjs',
      'scripts/runtime-shell-icon-manifest.mjs',
      'licenses/fonts/OFL-1.1.txt',
      'licenses/icons/FONT-NOTICES.txt',
    ]) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await copyFile(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(root, file));
    }
    const ofl = join(root, 'licenses/fonts/OFL-1.1.txt');
    if (mutation === 'missing-ofl') await rm(ofl);
    if (mutation === 'changed-notices')
      await writeFile(join(root, 'licenses/icons/FONT-NOTICES.txt'), 'unreviewed notice');
    if (mutation === 'notice-symlink') {
      await copyFile(ofl, join(root, 'outside.txt'));
      await rm(ofl);
      await symlink(join(root, 'outside.txt'), ofl);
    }
    const { runtimeShellIcons: isolated } = await import(
      pathToFileURL(join(root, 'scripts/runtime-shell-icons.mjs')).href
    );
    const plugin = isolated({ sourceDirectory: source });
    plugin.configResolved({ command: 'build' });
    let emitted = 0;
    await assert.rejects(
      plugin.buildStart.call({
        emitFile() {
          emitted++;
        },
      }),
      /Runtime shell icon/,
    );
    assert.equal(emitted, 0);
  });

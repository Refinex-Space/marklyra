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
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import {
  runtimeShellFonts,
  SHELL_FONT_MANIFEST,
  SHELL_FONT_PREFIX,
} from './runtime-shell-fonts.mjs';

const source = fileURLToPath(new URL('../packages/editor-runtime/assets/styles/', import.meta.url));
const themeSource = fileURLToPath(new URL('../packages/editor-themes/assets/', import.meta.url));
const fontSource = (font) =>
  font.path.startsWith('themes/')
    ? join(themeSource, font.path.slice('themes/'.length))
    : join(source, font.path);
const servers = new Map();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, copy = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'marklyra-shell-fonts-')));
  t.after(async () => {
    await servers.get(root)?.close();
    servers.delete(root);
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head></head><body>Font fixture</body></html>',
  );
  const fonts = join(root, 'private-fonts');
  await mkdir(fonts);
  if (copy)
    for (const font of SHELL_FONT_MANIFEST) {
      await mkdir(dirname(join(fonts, font.path)), { recursive: true });
      await copyFile(fontSource(font), join(fonts, font.path));
    }
  return { root, fonts };
}
async function server(t, root, fonts = source) {
  const instance = await createServer({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      runtimeShellFonts({
        sourceDirectory: fonts,
        themeDirectory: fonts === source ? themeSource : join(fonts, 'themes'),
      }),
    ],
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
  });
  servers.set(root, instance);
  await instance.listen();
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}
function rawRequest(origin, path, method = 'GET', headers = {}) {
  return new Promise((resolveRequest, reject) => {
    const request = http.request(origin, { path, method, headers }, (response) => {
      const bytes = [];
      response.on('data', (chunk) => bytes.push(chunk));
      response.on('end', () =>
        resolveRequest({
          status: response.statusCode,
          headers: response.headers,
          bytes: Buffer.concat(bytes),
        }),
      );
    });
    request.on('error', reject);
    request.end();
  });
}

test('same-origin dev font/CSS delivery preserves bytes, subsets, MIME, HEAD and revalidation', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  const html = await (await fetch(origin)).text();
  assert.match(html, /id="runtime-shell-fonts"/);
  const css = await rawRequest(origin, `${SHELL_FONT_PREFIX}fonts.css`);
  assert.equal(css.status, 200);
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
  assert.equal((css.bytes.toString().match(/@font-face/g) ?? []).length, 6);
  assert.match(css.bytes.toString(), /unicode-range:U\+0100-024F/);
  for (const font of SHELL_FONT_MANIFEST) {
    const response = await rawRequest(origin, SHELL_FONT_PREFIX + font.path, 'GET', {
      Origin: 'http://foreign.example',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], font.mime);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(response.headers['cache-control'], /must-revalidate/);
    assert.equal(hash(response.bytes), font.sha256);
    assert.equal(response.bytes.length, font.bytes);
    const head = await rawRequest(origin, SHELL_FONT_PREFIX + font.path, 'HEAD');
    assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), response.bytes.length);
    const cached = await rawRequest(origin, SHELL_FONT_PREFIX + font.path, 'GET', {
      'If-None-Match': response.headers.etag,
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.bytes.length, 0);
  }
});

test('serve buildStart verifies private inputs without invoking unsupported emitFile', async () => {
  const plugin = runtimeShellFonts();
  plugin.configResolved({ command: 'serve' });
  await plugin.buildStart.call({
    emitFile() {
      throw Error('emitFile must not run in serve');
    },
  });
});

test('unknown paths, traversal, methods and generic Vite private-file access are refused', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  for (const path of [
    '../index.html',
    '%2e%2e/index.html',
    'themes//github/font.woff2',
    'themes\\github\\font.woff2',
    '%252e%252e/secret',
    'licenses/fonts/../private.txt',
    'licenses/fonts/%2e%2e/private.txt',
  ]) {
    assert.equal((await rawRequest(origin, SHELL_FONT_PREFIX + path)).status, 400, path);
  }
  assert.equal((await rawRequest(origin, `${SHELL_FONT_PREFIX}unknown.woff2`)).status, 404);
  assert.equal(
    (await rawRequest(origin, `${SHELL_FONT_PREFIX}licenses/fonts/OFL-1.1.txt`)).status,
    404,
  );
  for (const retired of [
    'themes/gothic/texgyreadventor-regular.woff',
    'themes/newsprint/pt-serif-v11-latin-regular.woff2',
    'themes/pixyll/lato-v14-latin-300.woff',
  ])
    assert.equal((await rawRequest(origin, SHELL_FONT_PREFIX + retired)).status, 404);
  assert.equal((await rawRequest(origin, `${SHELL_FONT_PREFIX}fonts.css`, 'POST')).status, 405);
  for (const font of [SHELL_FONT_MANIFEST[0], SHELL_FONT_MANIFEST[2]]) {
    const bypass = await rawRequest(origin, `/@fs${resolve(fontSource(font))}`);
    assert.equal(bypass.status, 403);
  }
});

test('missing or modified private font inputs fail before serving or emitting desktop output', async (t) => {
  const empty = await fixture(t);
  await assert.rejects(() => server(t, empty.root, empty.fonts), /font input unavailable/);
  const changed = await fixture(t, true);
  await writeFile(join(changed.fonts, SHELL_FONT_MANIFEST[0].path), 'not the runtime font');
  await assert.rejects(
    () =>
      build({
        root: changed.root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          runtimeShellFonts({
            sourceDirectory: changed.fonts,
            themeDirectory: join(changed.fonts, 'themes'),
          }),
        ],
      }),
    /SHA-256 mismatch/,
  );
});

test('a symlink input is refused even when its target contains the expected font bytes', async (t) => {
  const { root, fonts } = await fixture(t, true);
  const font = SHELL_FONT_MANIFEST[0];
  const path = join(fonts, font.path);
  await rm(path);
  await symlink(fontSource(font), path);
  await assert.rejects(() => server(t, root, fonts), /not a regular source input/);
});

test('theme package symlinks and missing theme sources fail before any font is emitted', async (t) => {
  for (const treatment of ['missing', 'symlink']) {
    const { fonts } = await fixture(t, true);
    const themeDirectory = join(fonts, 'themes');
    await rm(themeDirectory, { recursive: true });
    if (treatment === 'symlink')
      await symlink(themeSource, themeDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    const plugin = runtimeShellFonts({ sourceDirectory: fonts, themeDirectory });
    plugin.configResolved({ command: 'build' });
    let emitted = 0;
    await assert.rejects(
      plugin.buildStart.call({
        emitFile() {
          emitted++;
        },
      }),
      /font input unavailable/,
    );
    assert.equal(emitted, 0);
  }
});

test('build emits only the current theme font assets and generated CSS', async (t) => {
  const { root } = await fixture(t);
  const bundle = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [runtimeShellFonts()],
    build: { write: false },
  });
  assert.ok(!Array.isArray(bundle));
  const output = bundle.output;
  const fonts = output.filter((asset) => asset.fileName.startsWith(SHELL_FONT_PREFIX.slice(1)));
  assert.equal(fonts.length, 7);
  for (const font of SHELL_FONT_MANIFEST) {
    const asset = fonts.find((asset) => asset.fileName === SHELL_FONT_PREFIX.slice(1) + font.path);
    assert.equal(asset?.type, 'asset');
    assert.equal(hash(asset.source), font.sha256);
  }
  assert.ok(output.every((asset) => !asset.fileName.includes('/licenses/')));
  const html = output.find((asset) => asset.fileName === 'index.html');
  assert.match(String(html.source), /href="\/__runtime-fonts\/fonts.css"/);
  assert.doesNotMatch(
    String(html.source),
    /private\/runtime-assets|marklyra:\/\/|http:\/\/runtime/,
  );
});

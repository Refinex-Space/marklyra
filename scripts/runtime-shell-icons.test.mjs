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
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { SHELL_FONT_MANIFEST } from './runtime-shell-fonts.mjs';
import { SEARCH_ICON_MANIFEST } from './runtime-shell-icon-manifest.mjs';
import {
  runtimeShellIcons,
  SHELL_ICON_MANIFEST,
  SHELL_ICON_PREFIX,
} from './runtime-shell-icons.mjs';

const source = fileURLToPath(new URL('../packages/editor-runtime/assets/styles/', import.meta.url));
const pageSource = fileURLToPath(new URL('../packages/editor-runtime/src/page/', import.meta.url));
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
    for (const path of SHELL_ICON_MANIFEST.map((font) => font.path)) {
      await mkdir(dirname(join(fonts, path)), { recursive: true });
      await copyFile(join(source, path), join(fonts, path));
    }
  if (copy) await copyFile(join(pageSource, 'index.html'), join(root, 'index.html'));
  return { root, fonts };
}

async function server(t, root, sourceDirectory = source) {
  const instance = await createServer({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      runtimeShellIcons({
        sourceDirectory,
        pageDirectory: sourceDirectory === source ? pageSource : root,
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

test('three tracked icon fonts and precise family aliases are served unchanged', async (t) => {
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
    assert.deepEqual(result.bytes, await readFile(join(source, font.path)));
    assert.equal(result.headers.etag, `"sha256-${digest(result.bytes)}"`);
    const head = await request(origin, SHELL_ICON_PREFIX + font.path, 'HEAD');
    assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), result.bytes.length);
    assert.equal(
      (
        await request(origin, SHELL_ICON_PREFIX + font.path, 'GET', {
          'If-None-Match': result.headers.etag,
        })
      ).status,
      304,
    );
  }
  assert.equal(SHELL_FONT_MANIFEST.length, 6);
  assert.ok(
    SHELL_ICON_MANIFEST.every((font) => !SHELL_FONT_MANIFEST.some((f) => f.path === font.path)),
  );
});

test('search sprite preserves exactly the three original find-panel symbols', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  const response = await request(origin, `${SHELL_ICON_PREFIX}search-options.svg`);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'image/svg+xml');
  const html = await readFile(join(pageSource, 'index.html'), 'utf8');
  const symbols = [...response.bytes.toString().matchAll(/<symbol\b[^>]*>[\s\S]*?<\/symbol>/g)];
  assert.equal(symbols.length, 3);
  for (const [index, { name }] of SEARCH_ICON_MANIFEST.entries()) {
    assert.match(symbols[index][0], new RegExp(`id="find-and-replace-icon-${name}"`));
    assert.ok(html.includes(symbols[index][0]));
  }
  assert.equal((await request(origin, `${SHELL_ICON_PREFIX}index.html`)).status, 404);
});

test('unknown, encoded and traversal requests cannot expose other private resources', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  for (const path of [
    `${SHELL_ICON_PREFIX}../index.html`,
    `${SHELL_ICON_PREFIX}%2e%2e/index.html`,
    `${SHELL_ICON_PREFIX}marklyra-icon\\fonts\\marklyra-icon.woff`,
    '/__runtime-icons%2fmarklyra-icon/fonts/marklyra-icon.woff',
  ])
    assert.equal((await request(origin, path)).status, 400, path);
  assert.equal(
    (await request(origin, `${SHELL_ICON_PREFIX}marklyra-file-icon/fonts/marklyra-file.woff`))
      .status,
    404,
  );
  assert.equal(
    (await request(origin, `${SHELL_ICON_PREFIX}licenses/fontawesome-OFL.txt`)).status,
    404,
  );
  assert.equal((await request(origin, `${SHELL_ICON_PREFIX}icons.css`, 'POST')).status, 405);
  assert.equal(
    (await request(origin, `/@fs${join(source, SHELL_ICON_MANIFEST[0].path)}`)).status,
    403,
  );
});

for (const mutation of ['missing', 'symlink', 'search-symbol'])
  test(`private icon ${mutation} input fails before serving or emitting`, async (t) => {
    const { root, fonts } = await fixture(t, true);
    const target = join(fonts, SHELL_ICON_MANIFEST[0].path);
    if (mutation === 'missing') await rm(target);
    if (mutation === 'symlink') {
      const outside = join(root, 'outside.woff');
      await copyFile(target, outside);
      await rm(target);
      await symlink(outside, target);
    }
    if (mutation === 'search-symbol') {
      const page = join(root, 'index.html');
      await writeFile(
        page,
        (await readFile(page, 'utf8')).replace(
          'id="find-and-replace-icon-case"',
          'id="missing-case"',
        ),
      );
    }
    const plugin = runtimeShellIcons({ sourceDirectory: fonts, pageDirectory: root });
    plugin.configResolved({ command: 'build' });
    let emitted = 0;
    await assert.rejects(
      plugin.buildStart.call({
        emitFile() {
          emitted++;
        },
      }),
      /Runtime shell icon|Expected one runtime search icon/,
    );
    assert.equal(emitted, 0);
  });

test('build hooks emit five current icon assets while serve never emits', async () => {
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
  assert.equal(output.size, 5);
  for (const font of SHELL_ICON_MANIFEST)
    assert.deepEqual(
      Buffer.from(output.get(`${SHELL_ICON_PREFIX.slice(1)}${font.path}`)),
      await readFile(join(source, font.path)),
    );
  assert.ok([...output.keys()].every((path) => !path.includes('/licenses/')));
  assert.ok(output.has('__runtime-icons/icons.css'));
  assert.ok(output.has('__runtime-icons/search-options.svg'));
});

test('edited icon fonts and search geometry are used without fixed digests', async (t) => {
  const { root, fonts } = await fixture(t, true);
  const relative = SHELL_ICON_MANIFEST[0].path;
  const replacement = await readFile(join(source, SHELL_ICON_MANIFEST[1].path));
  await writeFile(join(fonts, relative), replacement);
  const page = join(root, 'index.html');
  const original = await readFile(page, 'utf8');
  const edited = original.replace('M10.919,13', 'M10.918,13');
  assert.notEqual(edited, original);
  await writeFile(page, edited);
  const origin = await server(t, root, fonts);
  const font = await request(origin, SHELL_ICON_PREFIX + relative);
  assert.deepEqual(font.bytes, replacement);
  assert.equal(font.headers.etag, `"sha256-${digest(replacement)}"`);
  const sprite = await request(origin, SHELL_ICON_PREFIX + 'search-options.svg');
  assert.ok(sprite.bytes.toString().includes('M10.918,13'));
});

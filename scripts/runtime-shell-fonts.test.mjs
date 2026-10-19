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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, createServer } from 'vite';
import {
  runtimeShellFonts,
  SHELL_FONT_LICENSE_PREFIX,
  SHELL_FONT_MANIFEST,
  SHELL_FONT_PREFIX,
} from './runtime-shell-fonts.mjs';

const source = fileURLToPath(new URL('../dist/editor-runtime/style/', import.meta.url));
const servers = new Map();
const licenseSource = fileURLToPath(new URL('../licenses/fonts/', import.meta.url));
const licenseManifest = JSON.parse(await readFile(join(licenseSource, 'manifest.json'), 'utf8'));
const licenseFiles = [
  'manifest.json',
  'README.md',
  ...licenseManifest.noticeFiles.map((notice) => notice.file),
];
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
  const licenses = join(root, 'licenses/fonts');
  await mkdir(fonts);
  await mkdir(licenses, { recursive: true });
  for (const name of licenseFiles) await copyFile(join(licenseSource, name), join(licenses, name));
  if (copy)
    for (const font of SHELL_FONT_MANIFEST) {
      await mkdir(dirname(join(fonts, font.path)), { recursive: true });
      await copyFile(join(source, font.path), join(fonts, font.path));
    }
  return { root, fonts, licenses };
}
async function server(t, root, fonts = source, licenses = licenseSource) {
  const instance = await createServer({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [runtimeShellFonts({ sourceDirectory: fonts, licenseDirectory: licenses })],
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
  assert.equal((css.bytes.toString().match(/@font-face/g) ?? []).length, 24);
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

test('all nine license resources are served unchanged with a complete 24-font identity mapping', async (t) => {
  const { root } = await fixture(t);
  const origin = await server(t, root);
  const served = new Map();
  for (const name of licenseFiles) {
    const result = await rawRequest(origin, SHELL_FONT_LICENSE_PREFIX + name, 'GET', {
      Origin: 'http://foreign.example',
    });
    assert.equal(result.status, 200, name);
    assert.equal(result.headers['access-control-allow-origin'], undefined);
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.equal(
      result.headers['content-type'],
      name === 'manifest.json'
        ? 'application/json; charset=utf-8'
        : name === 'README.md'
          ? 'text/markdown; charset=utf-8'
          : 'text/plain; charset=utf-8',
    );
    assert.deepEqual(result.bytes, await readFile(join(licenseSource, name)));
    const head = await rawRequest(origin, SHELL_FONT_LICENSE_PREFIX + name, 'HEAD');
    assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), result.bytes.length);
    assert.equal(
      (
        await rawRequest(origin, SHELL_FONT_LICENSE_PREFIX + name, 'GET', {
          'If-None-Match': result.headers.etag,
        })
      ).status,
      304,
    );
    served.set(name, result.bytes);
  }
  const manifest = JSON.parse(served.get('manifest.json'));
  assert.equal(manifest.fonts.length, 24);
  assert.equal(new Set(manifest.fonts.map((font) => font.path)).size, 24);
  for (const font of SHELL_FONT_MANIFEST) {
    const licensed = manifest.fonts.find((entry) => entry.path === font.path);
    assert.equal(licensed?.sha256, font.sha256);
    assert.equal(licensed?.family, font.family);
    assert.equal(licensed?.bytes, (await readFile(join(source, font.path))).length);
    for (const name of licensed.licenseTextFiles) assert.ok(served.has(name));
  }
  for (const notice of manifest.noticeFiles)
    assert.equal(hash(served.get(notice.file)), notice.sha256);
  assert.equal(
    (await rawRequest(origin, `${SHELL_FONT_LICENSE_PREFIX}not-whitelisted.txt`)).status,
    404,
  );
  assert.equal(
    (await rawRequest(origin, `${SHELL_FONT_LICENSE_PREFIX}manifest.json`, 'POST')).status,
    405,
  );
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
  assert.equal((await rawRequest(origin, `${SHELL_FONT_PREFIX}fonts.css`, 'POST')).status, 405);
  const bypass = await rawRequest(origin, `/@fs${resolve(source, 'Raleway-latin.woff2')}`);
  assert.equal(bypass.status, 403);
});

test('missing or modified license metadata and notices all block builds before any output', async (t) => {
  for (const name of licenseFiles) {
    for (const treatment of ['missing', 'changed']) {
      const fixtureInput = await fixture(t);
      const path = join(fixtureInput.licenses, name);
      if (treatment === 'missing') await rm(path);
      else await writeFile(path, Buffer.concat([await readFile(path), Buffer.from('\nchanged')]));
      await assert.rejects(
        () =>
          build({
            root: fixtureInput.root,
            configFile: false,
            logLevel: 'silent',
            publicDir: false,
            plugins: [runtimeShellFonts({ licenseDirectory: fixtureInput.licenses })],
            build: { write: false },
          }),
        /font license input unavailable/,
        `${name}: ${treatment}`,
      );
    }
  }
});

test('valid bytes behind a notice symlink are refused rather than emitted', async (t) => {
  const { root, licenses } = await fixture(t);
  await rm(join(licenses, 'README.md'));
  await symlink(join(licenseSource, 'README.md'), join(licenses, 'README.md'));
  await assert.rejects(() => server(t, root, source, licenses), /not a regular license input/);
});

test('font inventory changes cannot ship with a mismatched existing license mapping', async (t) => {
  const script = await readFile(new URL('./runtime-shell-fonts.mjs', import.meta.url));
  for (const treatment of ['family', 'missing-font', 'duplicate-font']) {
    const { root } = await fixture(t);
    const fonts = structuredClone(SHELL_FONT_MANIFEST);
    if (treatment === 'family') fonts[0].family = 'Different Font';
    else if (treatment === 'missing-font') fonts.pop();
    else fonts[fonts.length - 1] = fonts[0];
    await writeFile(join(root, 'runtime-shell-fonts.mjs'), script);
    await writeFile(
      join(root, 'runtime-shell-font-manifest.mjs'),
      `export const SHELL_FONT_MANIFEST = ${JSON.stringify(fonts)};`,
    );
    const copiedPlugin = await import(pathToFileURL(join(root, 'runtime-shell-fonts.mjs')).href);
    const plugin = copiedPlugin.runtimeShellFonts({
      sourceDirectory: source,
      licenseDirectory: licenseSource,
    });
    plugin.configResolved({ command: 'build' });
    await assert.rejects(
      () =>
        plugin.buildStart.call({
          emitFile() {
            assert.fail('unlicensed font mapping must not emit any asset');
          },
        }),
      /license\/font correspondence mismatch/,
      treatment,
    );
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
        plugins: [runtimeShellFonts({ sourceDirectory: changed.fonts })],
      }),
    /SHA-256 mismatch/,
  );
});

test('a symlink input is refused even when its target contains the expected font bytes', async (t) => {
  const { root, fonts } = await fixture(t, true);
  const font = SHELL_FONT_MANIFEST[0];
  const path = join(fonts, font.path);
  await rm(path);
  await symlink(join(source, font.path), path);
  await assert.rejects(() => server(t, root, fonts), /not a regular source input/);
});

test('build emits checked fonts, generated CSS and all nine license assets into its desktop artifact', async (t) => {
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
  assert.equal(fonts.length, 34);
  for (const font of SHELL_FONT_MANIFEST) {
    const asset = fonts.find((asset) => asset.fileName === SHELL_FONT_PREFIX.slice(1) + font.path);
    assert.equal(asset?.type, 'asset');
    assert.equal(hash(asset.source), font.sha256);
  }
  for (const name of licenseFiles) {
    const asset = output.find(
      (item) => item.fileName === `${SHELL_FONT_LICENSE_PREFIX.slice(1)}${name}`,
    );
    assert.equal(asset?.type, 'asset');
    assert.equal(hash(asset.source), hash(await readFile(join(licenseSource, name))));
  }
  const html = output.find((asset) => asset.fileName === 'index.html');
  assert.match(String(html.source), /href="\/__runtime-fonts\/fonts.css"/);
  assert.doesNotMatch(
    String(html.source),
    /private\/runtime-assets|marklyra:\/\/|http:\/\/runtime/,
  );
});

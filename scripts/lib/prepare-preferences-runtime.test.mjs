import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext, Script } from 'node:vm';
import { parse } from 'acorn';
import {
  preferencesResources,
  preparePreferencesRuntime,
  transformPreferencesHtml,
  transformPreferencesSource,
} from './prepare-preferences-runtime.mjs';

const root = resolve(import.meta.dirname, '../..');
const input = resolve(root, 'private/vendor/TypeMark');
const sourcePath = 'page-dist/static/js/Preferences.962926a4.d7f6a912.chunk.js';
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('unknown or already transformed Preferences cannot acquire the settings bridge', async () => {
  for (const source of [null, '', 'console.log("unrelated")'])
    assert.throws(() => transformPreferencesSource(source), /Unknown original Preferences SHA-256/);
  const source = await readFile(resolve(input, sourcePath), 'utf8');
  const { code } = transformPreferencesSource(source);
  assert.throws(() => transformPreferencesSource(code), /Unknown original Preferences SHA-256/);
  assert.throws(
    () => transformPreferencesSource(`${source}\n`),
    /Unknown original Preferences SHA-256/,
  );
});

test('verified AST edits isolate settings and remove redundant or unsupported controls', async () => {
  const source = await readFile(resolve(input, sourcePath), 'utf8');
  const transformed = transformPreferencesSource(source);
  assert.equal(transformed.metadata.capabilityChecks, 26);
  assert.equal(transformed.metadata.bridgeCount, 1);
  assert.equal(transformed.metadata.edits.length, 36);
  assert.equal(transformed.metadata.originalSha256, preferencesResources[sourcePath]);
  let expected = source;
  for (const edit of [...transformed.metadata.edits].reverse())
    expected = expected.slice(0, edit.start) + edit.text + expected.slice(edit.end);
  assert.ok(expected === transformed.code);
  assert.equal(transformed.metadata.transformedSha256, digest(transformed.code));
  assert.ok(!transformed.code.includes('window.webkit'));
  assert.ok(!transformed.code.includes('../locales/'));
  assert.ok(!transformed.code.includes('keyName:"can_collapse_outline_panel"'));
  assert.ok(!transformed.code.includes('"Collapsible Outline on Left Panel"'));
  assert.ok(!transformed.code.includes('"Turn off Typewriter / Focus Mode"'));
  assert.ok(!transformed.code.includes('onClick:window.Setting.exitFocusAndTypewriterMode'));
  assert.ok(transformed.code.includes('keyName:"no_mid_caret"'));
  assert.ok(!transformed.code.includes('"Diagram Options"'));
  assert.ok(transformed.code.includes('keyName:"enable_diagram"'));
  assert.ok(transformed.code.includes('hint:"(Sequence, Flowchart and Mermaid)"'));
  assert.ok(transformed.code.includes('keyName:"save_file_on_switch"'));
  assert.doesNotThrow(() => new Script(transformed.code));
  assert.equal(
    digest(await readFile(resolve(input, sourcePath))),
    preferencesResources[sourcePath],
  );
});

test('native localhost origins always load the real offline locale rather than the original dev dictionary', async () => {
  const original = await readFile(resolve(input, sourcePath), 'utf8');
  const { code } = transformPreferencesSource(original);
  const ast = parse(code, { ecmaVersion: 'latest' });
  let loader;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'AssignmentExpression' &&
      node.left?.type === 'MemberExpression' &&
      node.left.object?.name === 'window' &&
      node.left.property?.name === 'loadDict'
    )
      loader = node.right;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) visit(child);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  assert.ok(loader);
  for (const href of [
    'marklyra://localhost/preferences/setting.html?os=mac',
    'http://marklyra.localhost/preferences/setting.html?os=win',
    'http://localhost:4196/setting.html?os=mac',
    'http://127.0.0.1:4196/setting.html?parentOrigin=tauri%3A%2F%2Flocalhost',
  ]) {
    const requested = [];
    const context = {
      window: { location: { href }, _options: { locale: 'zh-Hans' } },
      v: async (url) => {
        requested.push(url);
        return { requested: url };
      },
      Promise,
      setTimeout,
    };
    runInNewContext(`window.loadDict=${code.slice(loader.start, loader.end)}`, context);
    const result = await context.window.loadDict();
    assert.deepEqual(
      requested,
      ['Front', 'Menu', 'Panel', 'Welcome'].map((name) => `./locales/zh-Hans.lproj/${name}.json`),
    );
    assert.equal(result.Front.requested, requested[0]);
  }
});

test('original HTML boots the adapter first and cannot eagerly execute preferences before init', async () => {
  const source = await readFile(resolve(input, 'page-dist/setting.html'), 'utf8');
  const html = transformPreferencesHtml(source);
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes("connect-src 'self'"));
  assert.ok(html.includes('<script src="./child-host.js"></script>'));
  assert.ok(!html.includes('<script src="./static/js/'));
  assert.ok(html.includes('id="user-theme" rel="stylesheet" href="./empty.css"'));
  assert.throws(
    () => transformPreferencesHtml(`${source}\n`),
    /Unknown original setting.html SHA-256/,
  );
});

test('preparation copies only hash-verified offline resources and rejects drift before output', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'marklyra-preferences-'));
  const source = resolve(temporary, 'source');
  const output = resolve(temporary, 'runtime');
  try {
    for (const file of Object.keys(preferencesResources)) {
      await mkdir(dirname(resolve(source, file)), { recursive: true });
      await copyFile(resolve(input, file), resolve(source, file));
    }
    await writeFile(resolve(source, 'license.html'), '<p>Unselected resource</p>');
    const manifest = await preparePreferencesRuntime({
      inputDirectory: source,
      outputDirectory: output,
    });
    assert.equal(manifest.resources.length, 17);
    assert.ok(!(await readdir(output)).includes('license.html'));
    assert.equal(digest(await readFile(resolve(output, 'child-host.js'))), manifest.adapterSha256);
    for (const resource of manifest.resources)
      assert.equal(digest(await readFile(resolve(output, resource.path))), resource.runtimeSha256);
    await writeFile(resolve(source, 'page-dist/cocoa.css'), 'changed');
    const rejectedOutput = resolve(temporary, 'rejected');
    await assert.rejects(
      preparePreferencesRuntime({ inputDirectory: source, outputDirectory: rejectedOutput }),
      /Runtime Preferences resource changed: page-dist\/cocoa.css/,
    );
    await assert.rejects(readdir(rejectedOutput), { code: 'ENOENT' });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

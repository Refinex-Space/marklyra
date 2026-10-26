import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  assembleSourceBundle,
  loadSourceBundlePlans,
  sourceBundleInputs,
} from './source-bundles.mjs';

const base = 'apps/desktop/src/features/settings/runtime-preferences/page/static/js';

async function fixture(t, kind = 'sequence', parts = ['modules/first.js', 'modules/second.js']) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-source-bundles-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, text) => {
    const full = resolve(root, base, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, text);
  };
  const manifest = {
    schema: 1,
    bundles: [
      {
        entry: 'main.js',
        output: 'preferences/static/js/main.js',
        slots: [{ name: '__MARKLYRA_TEST__', kind, parts }],
      },
    ],
  };
  await write('bundles.json', JSON.stringify(manifest));
  await write('main.js', 'var result = __MARKLYRA_TEST__;');
  await write('modules/first.js', '1;');
  await write('modules/second.js', '2;');
  const build = async () => {
    const [plan] = await loadSourceBundlePlans(root);
    return assembleSourceBundle(root, plan);
  };
  return { root, write, build, manifest };
}

test('assembly preserves expression order, shared lexical state, this and lazy factories', async (t) => {
  const { root: fixtureRoot, write, build } = await fixture(t);
  await write(
    'main.js',
    '(function() { var value = 0, saved; __MARKLYRA_TEST__; this.result = saved; }).call(host);',
  );
  await write('modules/first.js', '(value = this.seed, trace.push("first"));');
  await write(
    'modules/second.js',
    '// Preserve this comment.\n(saved = function() { return ++value; }, trace.push("second"));',
  );
  const { code } = await build();
  const host = { seed: 10 };
  const trace = [];
  runInNewContext(code, { host, trace });
  assert.deepEqual(trace, ['first', 'second']);
  assert.equal(host.result(), 11);
  assert.equal(host.result(), 12);
  assert.match(code, /Preserve this comment/);
  const [plan] = await loadSourceBundlePlans(fixtureRoot);
  assert.equal(sourceBundleInputs(plan).length, 4);
  assert.equal(new Set(sourceBundleInputs(plan)).size, 4);
});

test('Webpack leading, interior and trailing holes retain indices and array length', async (t) => {
  const { write, build } = await fixture(t, 'array', [
    null,
    'modules/first.js',
    null,
    'modules/second.js',
    null,
  ]);
  await write('modules/first.js', '(function(module) { module.exports = "first"; });');
  await write('modules/second.js', '(function(module) { module.exports = "second"; });');
  const context = {};
  runInNewContext((await build()).code, context);
  assert.equal(context.result.length, 5);
  assert.deepEqual(Object.keys(context.result), ['1', '3']);
  const module = {};
  context.result[3](module);
  assert.equal(module.exports, 'second');
});

test('JSON data preserves keyword and suggestion ordering', async (t) => {
  const { write, build } = await fixture(t, 'json', ['data.json']);
  await write('data.json', '{"face":["smile","grin"],"中文":["cat"]}');
  const context = {};
  runInNewContext((await build()).code, context);
  assert.equal(JSON.stringify(context.result), '{"face":["smile","grin"],"中文":["cat"]}');
});

for (const path of ['../outside.js', '/absolute.js', 'modules\\other.js', 'C:/outside.js'])
  test(`bundle manifest rejects nonlocal input ${path}`, async (t) => {
    const { root, write, manifest } = await fixture(t);
    manifest.bundles[0].slots[0].parts[0] = path;
    await write('bundles.json', JSON.stringify(manifest));
    await assert.rejects(loadSourceBundlePlans(root), /Invalid source bundle path/);
  });

test('duplicate source parts cannot silently execute twice', async (t) => {
  const { root } = await fixture(t, 'sequence', ['modules/first.js', 'modules/first.js']);
  await assert.rejects(loadSourceBundlePlans(root), /Duplicate source bundle part/);
});

test('source bundle reads reject symlinks before following an external source', async (t) => {
  const { root, build } = await fixture(t);
  const target = resolve(root, base, 'modules/first.js');
  const outside = resolve(root, 'outside.js');
  await writeFile(outside, 'throw new Error("must not execute");');
  await rm(target);
  await symlink(outside, target);
  await assert.rejects(build(), /must be regular/);
});

for (const source of ['var result = 1;', '__MARKLYRA_TEST__; __MARKLYRA_TEST__;'])
  test('a missing or repeated slot fails instead of emitting an incomplete bundle', async (t) => {
    const { write, build } = await fixture(t);
    await write('main.js', source);
    await assert.rejects(build(), /Expected exactly one/);
  });

test('statements cannot escape a source expression slot', async (t) => {
  const { write, build } = await fixture(t);
  await write('modules/first.js', '1; globalThis.unexpected = true;');
  await assert.rejects(build(), /Expected one expression/);
});

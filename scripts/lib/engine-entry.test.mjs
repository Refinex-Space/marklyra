import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import {
  buildEngine,
  inspectEngineSources,
} from '../../packages/editor-runtime/scripts/build-engine.mjs';

const root = resolve(import.meta.dirname, '../..');
const base = 'packages/editor-runtime/src/engine';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-engine-entry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, code) => {
    const file = resolve(root, base, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, code);
  };
  return { root, write };
}

function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child.type === 'string') walk(child, visit);
}

test('the executable source entry declares all 86 modules in their original initialization order', async () => {
  const info = await inspectEngineSources();
  const identities = JSON.parse(
    await readFile(
      new URL('../test-fixtures/engine-module-identities.json', import.meta.url),
      'utf8',
    ),
  );
  const order =
    'b c d f 10 12 14 1a 1f 21 22 23 24 25 18 28 2b 26 2e 2f 36 39 3a 3b 3c 38 3d 3e 40 41 42 43 44 45 46 47 48 49 4a 4b 4c 4d 4e 4f 50 51 32 52 53 54 2d 55 56 57 59 30 5b 2c 37 58 35 34 31 5a 1d 1e 19 16 20 1c 15 1b 17 3f 2a 13 5c 11 29 33 27 5d e 5e 5f a';
  assert.equal(info.factories.length, 75);
  assert.equal(info.registrations.length, 86);
  assert.deepEqual(
    info.registrations.map((definition) => definition.name),
    order.split(' ').map((id) => identities[id]),
  );
  const names = new Set(info.registrations.map((definition) => definition.name));
  for (const definition of info.registrations)
    for (const dependency of definition.dependencies) assert.ok(names.has(dependency), dependency);
  assert.ok(info.inputs.includes(`${base}/module-loader.js`));
  assert.ok(info.factories.every((factory) => info.inputs.includes(factory.path)));
  assert.ok(info.inputs.every((path) => !path.endsWith('/bundles.json')));
  const entry = await readFile(resolve(root, info.entry), 'utf8');
  assert.match(entry, /import .* from/);
  assert.doesNotMatch(entry, /__MARKLYRA_.*MODULES__/);
  await assert.rejects(readFile(resolve(root, base, 'bundles.json')), { code: 'ENOENT' });
});

test('standard build retains classic and explicit strict function receivers without tree shaking effects', async (t) => {
  const { root, write } = await fixture(t);
  await write(
    'entry.js',
    `import install from './install.js';
const host = { seed: 7 };
const environment = {};
install.call(host, environment);
window.result = [environment.host === host, (0, environment.read)() === globalThis, environment.read.name, (0, environment.strict)()];
console.log('retained console');`,
  );
  await write(
    'install.js',
    `export default function install(environment) {
  environment.host = this;
  environment.read = Object.defineProperty(function () { return this; }, 'name', { value: 'f', configurable: true });
  environment.strict = function () { 'use strict'; return this === undefined; };
}`,
  );
  const before = await readFile(resolve(root, base, 'entry.js'), 'utf8');
  const output = await buildEngine({ root, entry: 'entry.js' });
  const logs = [];
  const context = { window: {}, console: { log: (message) => logs.push(message) } };
  runInNewContext(output.code, context);
  assert.deepEqual(Array.from(context.window.result), [true, true, 'f', true]);
  assert.deepEqual(logs, ['retained console']);
  assert.deepEqual(output.inputs, [`${base}/entry.js`, `${base}/install.js`]);
  assert.equal(await readFile(resolve(root, base, 'entry.js'), 'utf8'), before);
});

for (const [runtime, adapter, property, reflectedName, moduleName] of [
  [
    'error-reporter-runtime',
    'error-reporter-export',
    'errorReporterFactory',
    'f',
    'libraries/error-reporter-export',
  ],
  [
    'dom-purify-runtime',
    'dom-purify-export',
    'sanitizerFactory',
    'factory',
    'libraries/dom-purify-export',
  ],
]) {
  test(`${adapter} keeps shared factory identity, anonymous registration and bare-call receiver`, async () => {
    const environment = {};
    const definitions = [];
    const registry = { define: (...args) => definitions.push(args) };
    const context = {};
    runInNewContext(
      (await buildEngine({ entry: `modules/libraries/${runtime}.js` })).code,
      context,
    );
    context.MarkLyraEngine.call(context, registry, environment);
    assert.equal(environment[property].name, reflectedName);
    const sharedFactory = environment[property];
    runInNewContext(
      (await buildEngine({ entry: `modules/libraries/${adapter}.js` })).code,
      context,
    );
    context.MarkLyraEngine.call(context, registry, environment);
    assert.equal(environment[property], sharedFactory);
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0][0], moduleName);
    assert.equal(definitions[0][3].name, '');
    // The shared environment is live, just like the earlier shared lexical cell.
    const receiver = {};
    environment[property] = function () {
      return this;
    };
    assert.equal(definitions[0][3].call(receiver), receiver);
    environment.commonJsExports = {};
    environment.commonJsModule = { exports: 'unchanged' };
    context.MarkLyraEngine.call(receiver, registry, environment);
    assert.equal(environment.commonJsModule.exports, undefined);
    assert.equal(definitions.length, 1);
  });
}

test('real source factories remain anonymous at registration and compile as one classic script', async () => {
  const output = await buildEngine();
  const ast = parse(output.code, { ecmaVersion: 'latest' });
  // An entry without exports must not create a new window.MarkLyraEngine API.
  assert.equal(ast.body.length, 1);
  assert.equal(ast.body[0].type, 'ExpressionStatement');
  assert.equal(ast.body[0].expression.type, 'CallExpression');
  assert.equal(ast.body[0].expression.callee.type, 'FunctionExpression');
  const helpers = [];
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'anonymousFactory')
      helpers.push(node);
  });
  assert.equal(helpers.length, 1);
  const helper = runInNewContext(`(${output.code.slice(helpers[0].start, helpers[0].end)})`);
  function initializeExample(requireModule, moduleExports, moduleRecord) {}
  const actual = helper(initializeExample);
  assert.equal(actual, initializeExample);
  assert.equal(actual.name, '');
  assert.equal(actual.length, 3);
  assert.doesNotMatch(output.code, /__MARKLYRA_ENGINE_MODULES__|registerDynamic|\$__System/);
  assert.equal(output.factories.length, 75);
});

test('the normal Emoji JSON import preserves all 1076 entries and suggestion order', async () => {
  const output = await buildEngine({ entry: 'editor/EmojiSearchMap.js' });
  const data = JSON.parse(
    await readFile(resolve(root, base, 'editor/emoji-search-map.json'), 'utf8'),
  );
  const context = { window: {} };
  runInNewContext(output.code, context);
  assert.equal(JSON.stringify(context.window.EmojiSearchMap), JSON.stringify(data));
  assert.equal(Object.keys(data).length, 1076);
  assert.ok(output.inputs.includes(`${base}/editor/emoji-search-map.json`));
});

test('missing source entry fails with ENOENT instead of pretending to build an empty graph', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(inspectEngineSources({ root }), { code: 'ENOENT' });
});

for (const specifier of ['external-package', '../../outside.js', './not-code.txt']) {
  test(`source entry rejects unsupported import ${specifier}`, async (t) => {
    const { root, write } = await fixture(t);
    await write('entry.js', `import ${JSON.stringify(specifier)};`);
    await assert.rejects(buildEngine({ root, entry: 'entry.js' }), /Engine import/);
  });
}

test('source entry rejects symlink inputs before standard build can read their contents', async (t) => {
  const { root, write } = await fixture(t);
  await write('entry.js', "import './redirected.js';");
  const outside = resolve(root, 'outside.js');
  await writeFile(outside, 'throw new Error("must never execute");');
  await symlink(outside, resolve(root, base, 'redirected.js'));
  await assert.rejects(buildEngine({ root, entry: 'entry.js' }), /regular workspace file/);
});

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

test('the executable source entry declares all 86 modules in their required initialization order', async () => {
  const info = await inspectEngineSources();
  const order = [
    'libraries/fastdom',
    'libraries/fastdom-promised',
    'ui/localization',
    'libraries/bootstrap-widgets',
    'host/clipboard-bridge',
    'model/markdown-serializer',
    'model/html-renderer',
    'model/node-editing',
    'codemirror/selection-markers',
    'codemirror/close-brackets',
    'codemirror/close-tags',
    'codemirror/overlay-mode',
    'codemirror/lint',
    'codemirror/editor-extensions',
    'render/code-fences',
    'render/inline-math',
    'render/brush-queue',
    'editing/autocomplete',
    'media/image-scale',
    'media/image-editor',
    'document/options',
    'document/file-snapshot',
    'document/text-bundle',
    'document/file-writer',
    'libraries/error-reporter-export',
    'host/local-diagnostics',
    'document/file-controller',
    'document/editing-state',
    'ui/find-replace',
    'ui/word-count',
    'ui/page-breaks',
    'export/html',
    'export/print-and-images',
    'export/pandoc',
    'export/controller',
    'codemirror/active-line',
    'codemirror/markdown-overlay',
    'editing/source-mode',
    'document/project-settings',
    'ui/folder-search',
    'ui/context-menu',
    'host/spellchecker',
    'ui/spelling',
    'libraries/dom-morph',
    'ui/file-tree',
    'ui/file-list',
    'editing/selection',
    'ui/outline',
    'ui/quick-open',
    'editing/table-row-move',
    'editing/formatting',
    'editing/list-indent',
    'editing/character-pairs',
    'editing/deletion',
    'editing/clipboard',
    'editing/user-operations',
    'libraries/intersection-observer',
    'host/environment',
    'ui/document-menu',
    'editing/table-editor',
    'document/recovery',
    'media/asset-storage',
    'render/inline-decoration',
    'editing/emoji',
    'libraries/rangy',
    'editing/smart-quotes',
    'model/markdown-parser',
    'libraries/dom-purify-export',
    'libraries/codemirror',
    'render/math-blocks',
    'render/diagrams',
    'editing/undo-manager',
    'render/html-blocks',
    'model/html-parser',
    'media/actions',
    'model/document-model',
    'libraries/unicode-normalization',
    'shared/utilities',
    'ui/dialogs',
    'host/file-integration',
    'editing/keyboard-shortcuts',
    'ui/file-search-results',
    'libraries/jquery',
    'ui/sidebar',
    'editor-controller',
    'startup',
  ];
  assert.equal(info.factories.length, 75);
  assert.equal(info.registrations.length, 86);
  assert.deepEqual(
    info.registrations.map((definition) => definition.name),
    order,
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
  environment.read = function readHost() { return this; };
  environment.strict = function () { 'use strict'; return this === undefined; };
}`,
  );
  const before = await readFile(resolve(root, base, 'entry.js'), 'utf8');
  const output = await buildEngine({ root, entry: 'entry.js' });
  const logs = [];
  const context = { window: {}, console: { log: (message) => logs.push(message) } };
  runInNewContext(output.code, context);
  assert.deepEqual(Array.from(context.window.result), [true, true, 'readHost', true]);
  assert.deepEqual(logs, ['retained console']);
  assert.deepEqual(output.inputs, [`${base}/entry.js`, `${base}/install.js`]);
  assert.equal(await readFile(resolve(root, base, 'entry.js'), 'utf8'), before);
});

for (const [runtime, adapter, property, factoryName, moduleName] of [
  [
    'error-reporter-runtime',
    'error-reporter-export',
    'errorReporterFactory',
    'createErrorReporter',
    'libraries/error-reporter-export',
  ],
  [
    'dom-purify-runtime',
    'dom-purify-export',
    'sanitizerFactory',
    'createSanitizer',
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
    assert.equal(environment[property].name, factoryName);
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
    // Registered adapters read the current shared environment at call time.
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

test('source factories register with readable names and compile as one classic script', async () => {
  const output = await buildEngine();
  const ast = parse(output.code, { ecmaVersion: 'latest' });
  // The entry must not introduce a window.MarkLyraEngine API.
  assert.equal(ast.body.length, 1);
  assert.equal(ast.body[0].type, 'ExpressionStatement');
  assert.equal(ast.body[0].expression.type, 'CallExpression');
  assert.equal(ast.body[0].expression.callee.type, 'FunctionExpression');
  const declarations = new Map();
  const registrations = [];
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name.startsWith('initialize'))
      declarations.set(node.id.name, node);
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
    assert.ok(
      !(
        node.callee.object.name === 'Object' &&
        node.callee.property.name === 'defineProperty' &&
        node.arguments[1]?.value === 'name'
      ),
      'Function names must come from their source declarations',
    );
    if (
      node.callee.object.name === 'engineModules' &&
      node.callee.property.name === 'define' &&
      node.arguments[3]?.type === 'Identifier'
    )
      registrations.push(node);
  });
  assert.equal(registrations.length, 75);
  for (const registration of registrations) {
    const name = registration.arguments[3].name;
    const declaration = declarations.get(name);
    assert.ok(declaration, name);
    const factory = runInNewContext(`(${output.code.slice(declaration.start, declaration.end)})`);
    assert.equal(factory.name, name);
    assert.equal(factory.length, 3);
  }
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

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext, Script } from 'node:vm';
import { parse } from 'acorn';
import { assembleSourceBundle, loadSourceBundlePlans } from './source-bundles.mjs';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, 'apps/desktop/src/features/settings/runtime-preferences/page');
const plan = (await loadSourceBundlePlans(root)).find(
  (bundle) => bundle.output === 'preferences/static/js/Preferences.962926a4.d7f6a912.chunk.js',
);
const source = (await assembleSourceBundle(root, plan)).code;
const ast = parse(source, { ecmaVersion: 'latest' });
function nodes(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child?.type) nodes(child, predicate, found);
  return found;
}
const member = (node, name) => node?.type === 'MemberExpression' && node.property?.name === name;
const code = (node) => source.slice(node.start, node.end);
function one(predicate) {
  const result = nodes(ast, predicate);
  assert.equal(result.length, 1);
  return result[0];
}

test('native settings source uses only its isolated bridge and the supported controls', () => {
  assert.doesNotThrow(() => new Script(source));
  assert.ok(!source.includes('window.webkit'));
  const controlKeys = new Set(
    nodes(ast, (node) => node.type === 'Property' && node.key?.name === 'keyName').map(
      (node) => node.value.value,
    ),
  );
  for (const name of [
    'can_collapse_outline_panel',
    'autoUpdateToDev',
    'send_usage_info',
    'useMirrorInCN',
    'framelessWindow',
  ])
    assert.ok(!controlKeys.has(name), `Retired control: ${name}`);
  for (const name of [
    'debugMode',
    'defaultCodeLang',
    'enable_inline_math',
    'enable_diagram',
    'save_file_on_switch',
  ])
    assert.ok(controlKeys.has(name), `Missing control: ${name}`);
  assert.ok(!source.includes('/assets/icon'));
});

test('the native language selector offers only automatic, English and simplified Chinese', async () => {
  const control = one(
    (node) =>
      node.type === 'ObjectExpression' &&
      node.properties.some((p) => p.key?.name === 'keyName' && p.value?.value === 'userLanguage'),
  );
  const options = control.properties.find((p) => p.key?.name === 'options').value;
  const values = runInNewContext(`(${code(options)})`);
  assert.deepEqual(Object.keys(values).sort(), ['', 'Base', 'zh-Hans']);
  const locales = await readdir(resolve(root, 'packages/editor-runtime/assets/locales'));
  assert.deepEqual(locales.sort(), ['Base.lproj', 'zh-Hans.lproj']);
});

test('offline dictionaries load on all native and development origins', async () => {
  const loader = one(
    (node) =>
      node.type === 'AssignmentExpression' &&
      member(node.left, 'loadDict') &&
      node.left.object?.name === 'window',
  ).right;
  const batches = nodes(
    loader,
    (node) =>
      node.type === 'CallExpression' &&
      member(node.callee, 'all') &&
      node.callee.object.name === 'Promise',
  );
  assert.equal(batches.length, 1);
  const requests = batches[0].arguments[0];
  assert.equal(requests.type, 'ArrayExpression');
  assert.equal(requests.elements.length, 4);
  for (const request of requests.elements) {
    assert.equal(request.type, 'CallExpression');
    assert.equal(request.callee.type, 'Identifier');
  }
  const requestBindings = new Set(requests.elements.map((request) => request.callee.name));
  assert.equal(requestBindings.size, 1);
  const [requestBinding] = requestBindings;
  for (const href of [
    'marklyra://localhost/preferences/setting.html?os=mac',
    'http://marklyra.localhost/preferences/setting.html?os=win',
    'http://localhost:4196/setting.html',
    'http://127.0.0.1:4196/setting.html',
  ]) {
    for (const locale of ['Base', 'zh-Hans']) {
      const requested = [];
      const context = {
        window: { location: { href }, _options: { locale } },
        [requestBinding]: async (url) => {
          requested.push(url);
          return { requested: url };
        },
        Promise,
        setTimeout,
      };
      runInNewContext(`window.loadDict=${code(loader)}`, context);
      const result = await context.window.loadDict();
      assert.deepEqual(
        requested,
        ['Front', 'Menu', 'Panel', 'Welcome'].map(
          (name) => `./locales/${locale}.lproj/${name}.json`,
        ),
      );
      assert.equal(result.Front.requested, requested[0]);
    }
  }
});

test('settings HTML boots the adapter first without eager application scripts', async () => {
  const html = await readFile(resolve(directory, 'setting.html'), 'utf8');
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes("connect-src 'self'"));
  assert.ok(html.includes('<script src="./child-host.js"></script>'));
  assert.ok(!html.includes('<script src="./static/js/'));
  assert.ok(html.includes('id="user-theme" rel="stylesheet" href="./empty.css"'));
});

test('the actual General panel preserves handlers and the project/update controls', () => {
  const panel = one(
    (node) =>
      node.type === 'CallExpression' &&
      member(node.callee, 'createElement') &&
      node.arguments[0]?.property?.name === 'o' &&
      node.arguments[2]?.callee?.object?.type === 'ThisExpression' &&
      node.arguments[2]?.arguments[0]?.value === 'General',
  );
  const change = () => {};
  const reactBinding = panel.callee.object.object.name;
  const controlsBinding = panel.arguments[0].object.name;
  const updateControl = one(
    (node) =>
      node.type === 'ObjectExpression' &&
      node.properties.some(
        (property) =>
          property.key?.name === 'keyName' && property.value?.value === 'enableAutoUpdate',
      ),
  );
  const disabledBinding = updateControl.properties.find(
    (property) => property.key?.name === 'disabled',
  ).value.name;
  const result = runInNewContext(`(function(){return ${code(panel)}}).call(component)`, {
    [reactBinding]: {
      a: {
        Fragment: 'fragment',
        createElement: (type, props, ...children) => ({ type, props, children }),
      },
    },
    [controlsBinding]: Object.fromEntries(
      ['o', 'k', 'q', 'c', 'r', 'b', 'v', 'd', 'h'].map((key) => [key, key]),
    ),
    window: {
      isMac: true,
      isWin: false,
      __MARKLYRA_PRODUCT_VERSION__: '9.8.7',
      Setting: { checkUpdates() {} },
    },
    component: {
      state: { activeTab: 6 },
      getValue: () => false,
      onChange: change,
      panelHeader: () => null,
    },
    [disabledBinding]: false,
  });
  const rendered = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    rendered.push(node);
    for (const child of node.children ?? []) visit(child);
  }
  visit(result);
  assert.deepEqual(
    rendered.filter((node) => node.type === 'k').map((node) => node.props.title),
    ['应用偏好', '关于 MarkLyra'],
  );
  assert.equal(rendered.find((node) => node.props?.keyName === 'debugMode').props.onChange, change);
  assert.ok(rendered.find((node) => node.type === 'strong' && node.children.includes('9.8.7')));
  assert.ok(rendered.find((node) => node.props?.['data-marklyra-open-repository'] === 'true'));
  assert.ok(rendered.find((node) => node.props?.['data-marklyra-update-check'] === 'true'));
});

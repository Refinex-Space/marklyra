import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import { generalPreferencesEdits } from './general-preferences-source.mjs';

const source = await readFile(
  new URL(
    '../../resources/editor/page-dist/static/js/Preferences.962926a4.d7f6a912.chunk.js',
    import.meta.url,
  ),
  'utf8',
);

test('general redesign preserves control handlers without a runtime-license section', () => {
  const [edit] = generalPreferencesEdits(source, parse(source, { ecmaVersion: 'latest' }));
  const license = { type: 'original-license', activated: false };
  const change = () => {};
  const updates = () => {};
  const result = runInNewContext(`(function(){return ${edit.text}}).call(component)`, {
    p: {
      a: {
        Fragment: 'fragment',
        createElement: (type, props, ...children) => ({ type, props, children }),
      },
    },
    b: Object.fromEntries(['o', 'k', 'q', 'c', 'r', 'b', 'v', 'd', 'h'].map((key) => [key, key])),
    window: { isMac: true, isWin: false, Setting: { checkUpdates: updates } },
    component: {
      state: { activeTab: 6 },
      getValue: () => false,
      onChange: change,
      panelHeader: () => null,
    },
    n: false,
    e: license,
  });
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(result);
  assert.deepEqual(
    nodes.filter((node) => node.type === 'k').map((node) => node.props.title),
    ['应用偏好', '关于 MarkLyra'],
  );
  assert.ok(!nodes.includes(license));
  assert.ok(!edit.text.includes('settings-third-party-license'));
  assert.equal(nodes.find((node) => node.props?.keyName === 'debugMode').props.onChange, change);
  assert.equal(
    nodes.find((node) => node.props?.keyName === 'quitAfterWindowClose').props.onChange,
    change,
  );
  assert.ok(nodes.find((node) => node.props?.['data-marklyra-update-check'] === 'true'));
  for (const key of ['autoUpdateToDev', 'send_usage_info', 'useMirrorInCN'])
    assert.ok(!edit.text.includes(`keyName:"${key}"`));
  assert.ok(!edit.text.includes('Reset All Dialog Warnings'));
  assert.ok(!edit.text.includes('hasLicense:'));
});

test('unknown General panel structures are rejected', () => {
  assert.throws(
    () => generalPreferencesEdits('', parse('', { ecmaVersion: 'latest' })),
    /Unexpected original General panel/,
  );
});

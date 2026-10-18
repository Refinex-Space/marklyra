import { describe, expect, it } from 'vitest';
import { offeredContextActions } from '../src/context-menu/contracts.js';
import { type ContextMenuDependencies, RuntimeContextMenu } from '../src/runtime/context-menu.js';
import { type ContextMenuFacts, contextMenuItems } from '../src/runtime/context-menu-items.js';

const facts: ContextMenuFacts = {
  tokens: [
    'normal',
    'table',
    'code-tools',
    'insertParagraphBefore',
    'insertParagraphAfter',
    'delete-fences',
  ],
  selected: true,
  lineWise: false,
  writable: true,
  sourceMode: false,
  codeMirror: false,
  table: { row: 1, rows: 3, column: 0, columns: 2, body: true, sourceRows: true },
  link: undefined,
  externalLink: false,
  clipboardRead: true,
  clipboardWrite: true,
  openExternal: true,
};
describe('finite context action capabilities', () => {
  it('maps only fixed groups and ignores arbitrary original path-bearing tokens', () => {
    const actions = offeredContextActions(contextMenuItems(facts));
    expect(actions.has('table.insertRowBefore')).toBe(true);
    expect(actions.has('table.moveColumnLeft')).toBe(false);
    expect(actions.has('table.moveColumnRight')).toBe(true);
    expect(
      contextMenuItems({
        ...facts,
        tokens: ['deleteImgFile', 'copyImgToTarget-/secret', 'path.openFile'],
      }),
    ).toEqual([]);
  });
  it('disables locked writes, missing clipboard permissions, header deletion and table boundaries', () => {
    const actions = offeredContextActions(
      contextMenuItems({
        ...facts,
        writable: false,
        clipboardRead: false,
        clipboardWrite: false,
        table: { row: 0, rows: 1, column: 0, columns: 1, body: false, sourceRows: true },
      }),
    );
    expect([...actions]).toEqual([]);
    const header = offeredContextActions(
      contextMenuItems({
        ...facts,
        table: { row: 0, rows: 1, column: 0, columns: 1, body: false, sourceRows: true },
      }),
    );
    for (const action of [
      'table.deleteRow',
      'table.deleteColumn',
      'table.moveRowUp',
      'table.moveRowDown',
      'table.moveColumnLeft',
      'table.moveColumnRight',
    ] as const)
      expect(header.has(action)).toBe(false);
  });
  it('does not authorize link opening merely because copying is allowed', () => {
    const actions = offeredContextActions(
      contextMenuItems({
        ...facts,
        tokens: ['openLink', 'copyLink'],
        link: 'file:///private/x',
        externalLink: false,
      }),
    );
    expect([...actions]).toEqual(['link.copyAddress']);
  });
  it('uses original linewise intent separately from rich copy-as selection', () => {
    const actions = offeredContextActions(
      contextMenuItems({ ...facts, tokens: ['normal'], selected: false, lineWise: true }),
    );
    expect(actions.has('edit.cut')).toBe(true);
    expect(actions.has('edit.copyMarkdown')).toBe(false);
  });
});
function harness() {
  let deleted = 0;
  const stamp = { generation: 1, sequence: 4 };
  const target = {
    isConnected: true,
    closest: (selector: string) => (selector === '[cid]' ? { getAttribute: () => 'p' } : null),
  };
  const editor = {
    sessionStr: 'editor-session',
    sourceView: { inSourceMode: false },
    writingArea: { contains: () => true, ownerDocument: { getSelection: () => null } },
    UserOp: {
      copyHandler: () => menu.captureClipboardWrite({ data: { 'text/plain': 'selected' } }),
      copyAsSemanticHTML: () =>
        menu.captureClipboardWrite({
          data: { 'text/plain': 'semantic version', 'text/html': '<b>selected</b>' },
        }),
      backspaceHandler: () => {
        deleted++;
      },
    },
  };
  const deps = {
    runtime: { editor, File: { isLocked: false, _onInitParse: false, option: {} } },
    stamp: () => stamp,
    composing: () => false,
    loading: () => false,
    disposed: () => false,
    capabilities: () => ({ clipboardRead: true, clipboardWrite: true, openExternal: true }),
    send: () => {},
    clipboardHTML: (value: string) => value,
    normalizeSelection: () => true,
    armReplacement: () => true,
    armTableRow: () => true,
  } as unknown as ContextMenuDependencies;
  const menu = new RuntimeContextMenu(deps);
  const binding = {
    requestId: 'request',
    editor,
    session: 'editor-session',
    target,
    cid: 'p',
    sourceMode: false,
    stamp: { ...stamp },
    selection: { bookmark: null, focusCid: null, selected: true },
    actions: new Set(['edit.cut', 'edit.copy', 'link.open']),
    tokens: ['normal', 'openLink'],
    link: 'https://example.test',
    lineWise: false,
  };
  Reflect.set(menu, 'binding', binding);
  return { menu, stamp, editor, target, deps, deleted: () => deleted };
}
it('cut preparation is read-only and acknowledgment is one-shot', () => {
  const h = harness();
  const result = h.menu.prepare({ requestId: 'request', actionId: 'edit.cut' });
  expect(h.deleted()).toBe(0);
  expect(result.effect).toMatchObject({
    type: 'clipboard',
    content: { text: 'selected' },
  });
  if (result.effect?.type !== 'clipboard' || !result.effect.cutToken) throw Error('Missing token');
  h.menu.commitCut({ token: result.effect.cutToken });
  expect(h.deleted()).toBe(1);
  expect(() =>
    h.menu.commitCut({
      token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
    }),
  ).toThrow('失效');
});
it.each(['generation', 'sequence', 'mode', 'session', 'target', 'composition', 'cancel'] as const)(
  'rejects cut after %s changes without deleting',
  (change) => {
    const h = harness(),
      result = h.menu.prepare({ requestId: 'request', actionId: 'edit.cut' });
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Missing token');
    if (change === 'generation') h.stamp.generation++;
    if (change === 'sequence') h.stamp.sequence++;
    if (change === 'mode') h.editor.sourceView.inSourceMode = true;
    if (change === 'session') h.editor.sessionStr = 'different';
    if (change === 'target') h.target.isConnected = false;
    if (change === 'composition') h.deps.composing = () => true;
    if (change === 'cancel') h.menu.invalidate();
    expect(() =>
      h.menu.commitCut({
        token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
      }),
    ).toThrow();
    expect(h.deleted()).toBe(0);
  },
);
it('does not accept an action absent from the offered enabled set', () => {
  const h = harness();
  expect(() => h.menu.execute({ requestId: 'request', actionId: 'table.delete' })).toThrow();
  expect(h.deleted()).toBe(0);
});

it('preserves an explicitly empty original HTML flavor instead of overwriting it', () => {
  const h = harness();
  h.editor.UserOp.copyHandler = () =>
    h.menu.captureClipboardWrite({ data: { 'text/plain': 'original', 'text/html': '' } });
  h.editor.UserOp.copyAsSemanticHTML = () => {
    throw Error('Must not overwrite an explicit HTML flavor');
  };
  expect(h.menu.prepare({ requestId: 'request', actionId: 'edit.copy' })).toEqual({
    effect: { type: 'clipboard', content: { text: 'original', html: '' } },
  });
});

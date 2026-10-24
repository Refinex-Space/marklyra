import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ContextMenuRequest, offeredContextActions } from '../src/context-menu/contracts.js';
import { type ContextMenuDependencies, RuntimeContextMenu } from '../src/runtime/context-menu.js';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';

type Position = { line: number; ch: number };
type Range = { anchor: Position; head: Position };
function fixture(
  options: {
    mode?: 'source' | 'fence' | 'body';
    value?: string;
    ranges?: Range[];
    primary?: number;
    cmOption?: boolean;
    globalOption?: boolean;
    separator?: string | null;
    inputStyle?: 'textarea' | 'contenteditable';
    readOnly?: boolean | 'nocursor';
  } = {},
) {
  const mode = options.mode ?? 'source';
  let value = options.value ?? 'Alpha\nBravo\nCharlie';
  let ranges = structuredClone(
    options.ranges ?? [{ anchor: { line: 1, ch: 2 }, head: { line: 1, ch: 2 } }],
  );
  let primary = options.primary ?? 0;
  let cmOption = options.cmOption ?? true;
  let readOnly = options.readOnly ?? false;
  const listeners = new Map<string, (() => void)[]>();
  const document = {
    getSelection: () => null,
    addEventListener: (name: string, listener: () => void) =>
      listeners.set(name, [...(listeners.get(name) ?? []), listener]),
  };
  const source = {};
  const cid = mode === 'source' ? null : mode === 'fence' ? 'code' : 'paragraph';
  const wrapper = {
    nodeType: 1,
    isConnected: true,
    ownerDocument: document,
    CodeMirror: undefined as unknown,
    closest(selector: string): unknown {
      if (selector === '.CodeMirror') return mode === 'body' ? null : wrapper;
      if (selector === '#typora-source') return mode === 'source' ? source : null;
      if (selector === '[cid]') return cid ? { getAttribute: () => cid } : null;
      return null;
    },
  };
  const history = { generation: 1, maxGeneration: 1, done: [{ generation: 1 }], undone: [] };
  const cm = {
    cid: mode === 'source' ? undefined : 'code',
    doc: { history, lineSeparator: () => options.separator ?? '\n' },
    getWrapperElement: () => wrapper,
    getCursor: (edge: 'anchor' | 'head' = 'head') => ranges[primary]?.[edge],
    listSelections: () => structuredClone(ranges),
    setSelections: vi.fn((next: Range[], selected = 0) => {
      ranges = structuredClone(next);
      primary = selected;
    }),
    getOption: vi.fn((key: string) =>
      key === 'lineWiseCopyCut'
        ? cmOption
        : key === 'inputStyle'
          ? (options.inputStyle ?? 'textarea')
          : key === 'lineSeparator'
            ? (options.separator ?? null)
            : key === 'readOnly'
              ? readOnly
              : undefined,
    ),
    getValue: () => value,
    getLine: (line: number) => value.split(/\r\n|\r|\n/)[line],
    getSelection: () => 'selected text',
    focus: vi.fn(),
    operation: (work: () => unknown) => work(),
    replaceSelections: vi.fn(),
    replaceRange: vi.fn(),
  };
  wrapper.CodeMirror = cm;
  const editor = {
    focusCid: null,
    sessionStr: 'linewise-session',
    writingArea: { ownerDocument: document, contains: () => mode !== 'source' },
    sourceView: { inSourceMode: mode === 'source', cm },
    selection: {
      buildUndo: () => null,
      selectLineWrap: vi.fn(() => {
        throw Error('CM must not call the body line selector');
      }),
    },
    undo: { register: vi.fn() },
  } as unknown as LegacyEditor;
  const stamp = { generation: 1, sequence: 0 };
  const runtime = {
    editor,
    File: {
      option: { lineWiseCopyCut: options.globalOption ?? false },
      isLocked: false,
      _onInitParse: false,
    },
  };
  let request: ContextMenuRequest | undefined;
  const deps = {
    runtime,
    stamp: () => stamp,
    composing: () => false,
    loading: () => false,
    disposed: () => false,
    capabilities: () => ({ clipboardRead: true, clipboardWrite: true, openExternal: true }),
    send: (next: ContextMenuRequest) => {
      request = next;
    },
    cancel: vi.fn(),
    clipboardHTML: (html: string) => html,
    normalizeSelection: () => true,
    armReplacement: () => true,
    armTableRow: () => true,
    armCodeLineCut: vi.fn(() => true),
  } as unknown as ContextMenuDependencies;
  const menu = new RuntimeContextMenu(deps);
  return {
    cm,
    deps,
    editor,
    runtime,
    history,
    stamp,
    wrapper,
    menu,
    changeOption: (next: boolean) => {
      cmOption = next;
    },
    changeReadOnly: (next: boolean | 'nocursor') => {
      readOnly = next;
    },
    silentChange: (next: string) => {
      value = next;
    },
    fire: (name: string) => {
      for (const listener of listeners.get(name) ?? []) listener();
    },
    ranges: () => structuredClone(ranges),
    primary: () => primary,
    async offer() {
      vi.useFakeTimers();
      menu.offer(['input'], {
        isTrusted: true,
        target: wrapper,
        clientX: 1,
        clientY: 2,
      } as unknown as MouseEvent);
      await vi.runOnlyPendingTimersAsync();
      if (!request) throw Error('Expected context request');
      return request;
    },
  };
}
// Body menus probe for an optional language field. The Node fixture must provide
// the DOM constructor even when closest() correctly returns no matching field.
beforeEach(() => vi.stubGlobal('HTMLElement', class {}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('instance-scoped whole-line context clipboard', () => {
  it.each(['missing', 'rejected'] as const)(
    'does not register history or delete when fence proof is %s',
    async (kind) => {
      const f = fixture({ mode: 'fence' }),
        request = await f.offer();
      const result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
      if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
        throw Error('Missing token');
      if (kind === 'missing') delete f.deps.armCodeLineCut;
      else f.deps.armCodeLineCut = () => false;
      expect(() =>
        f.menu.commitCut({
          token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
        }),
      ).toThrow('可验证');
      expect(f.cm.replaceRange).not.toHaveBeenCalled();
      expect(f.editor.undo.register).not.toHaveBeenCalled();
    },
  );
  it('requires a fence proof before registering the original primary caret and deleting its first row', async () => {
    const f = fixture({
      mode: 'fence',
      ranges: [
        { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } },
        { anchor: { line: 2, ch: 1 }, head: { line: 2, ch: 1 } },
      ],
      primary: 1,
    });
    const request = await f.offer(),
      result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Missing token');
    f.menu.commitCut({ token: result.effect.cutToken });
    expect(f.deps.armCodeLineCut).toHaveBeenCalledExactlyOnceWith('code', f.cm, [
      { from: { line: 0, ch: 0 }, to: { line: 1, ch: 0 } },
    ]);
    expect(f.editor.undo.register).toHaveBeenCalledExactlyOnceWith({
      undo: [{ type: 'fences-pos', id: 'code', pos: { line: 2, ch: 1 } }],
      redo: [],
    });
    expect(f.cm.replaceRange).toHaveBeenCalledExactlyOnceWith(
      '',
      { line: 0, ch: 0 },
      { line: 1, ch: 0 },
      'cut-line',
    );
  });
  it.each([true, 'nocursor'] as const)(
    'does not offer or prepare line cuts for CM readOnly=%s',
    async (readOnly) => {
      const f = fixture({ readOnly }),
        request = await f.offer();
      expect(offeredContextActions(request.items).has('edit.cut')).toBe(false);
      expect(offeredContextActions(request.items).has('edit.copy')).toBe(true);
      expect(() =>
        f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' }),
      ).toThrow();
      expect(f.cm.replaceRange).not.toHaveBeenCalled();
      expect(f.cm.focus).not.toHaveBeenCalled();
    },
  );
  it.each([true, 'nocursor', 'cantEdit'] as const)(
    'rechecks CM %s after clipboard preparation before deleting',
    async (readOnly) => {
      const f = fixture(),
        request = await f.offer();
      const result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
      if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
        throw Error('Missing token');
      if (readOnly === 'cantEdit') Reflect.set(f.cm.doc, 'cantEdit', true);
      else f.changeReadOnly(readOnly);
      expect(() =>
        f.menu.commitCut({
          token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
        }),
      ).toThrow();
      expect(f.cm.replaceRange).not.toHaveBeenCalled();
    },
  );
  it.each(['textarea', 'contenteditable'] as const)(
    'preserves the original %s copy newline path',
    async (inputStyle) => {
      const f = fixture({
        value: 'Alpha\r\nBravo',
        separator: '\r\n',
        inputStyle,
        ranges: [{ anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } }],
      });
      const request = await f.offer();
      expect(
        f.menu.prepare({ requestId: request.requestId, actionId: 'edit.copy' }).effect,
      ).toMatchObject({
        type: 'clipboard',
        content: { text: inputStyle === 'textarea' ? 'Alpha\n' : 'Alpha\r\n' },
      });
    },
  );
  it.each(['source', 'fence'] as const)(
    'reads %s CM option rather than the changed global preference',
    async (mode) => {
      for (const [instance, global] of [
        [true, false],
        [false, true],
      ] as const) {
        const f = fixture({ mode, cmOption: instance, globalOption: global });
        const request = await f.offer();
        expect(offeredContextActions(request.items).has('edit.copy')).toBe(instance);
        expect(offeredContextActions(request.items).has('edit.cut')).toBe(instance);
      }
    },
  );
  it.each([true, false])('keeps body linewise policy on the global option %s', async (global) => {
    const f = fixture({ mode: 'body', cmOption: !global, globalOption: global });
    const request = await f.offer();
    expect(offeredContextActions(request.items).has('edit.copy')).toBe(global);
    expect(f.cm.getOption).not.toHaveBeenCalled();
  });
  it.each([
    { value: 'Alpha\nBravo\nCharlie', line: 1, text: 'Bravo\n', to: { line: 2, ch: 0 } },
    { value: 'Alpha\nBravo', line: 1, text: 'Bravo', to: { line: 1, ch: 5 } },
    { value: 'Alpha\n\nBravo', line: 1, text: '\n', to: { line: 2, ch: 0 } },
    { value: 'Alpha\n', line: 1, text: '', to: undefined },
    { value: '', line: 0, text: '', to: undefined },
    {
      value: '中文😀\r\n末行',
      line: 0,
      text: '中文😀\r\n',
      to: { line: 1, ch: 0 },
      separator: '\r\n',
    },
  ])(
    'copies logical line $line without changing selection/history or deleting before ACK',
    async (vector) => {
      const caret = { line: vector.line, ch: 0 };
      const f = fixture({
        value: vector.value,
        ranges: [{ anchor: caret, head: caret }],
        ...(vector.separator === undefined ? {} : { separator: vector.separator }),
      });
      const original = f.ranges(),
        history = structuredClone(f.history);
      const request = await f.offer();
      const result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
      expect(result.effect).toMatchObject({ type: 'clipboard', content: { text: vector.text } });
      expect(f.ranges()).toEqual(original);
      expect(f.history).toEqual(history);
      expect(f.cm.replaceRange).not.toHaveBeenCalled();
      expect(f.editor.selection.selectLineWrap).not.toHaveBeenCalled();
      if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
        throw Error('Expected cut token');
      f.menu.commitCut({ token: result.effect.cutToken });
      if (vector.to)
        expect(f.cm.replaceRange).toHaveBeenCalledExactlyOnceWith(
          '',
          { line: vector.line, ch: 0 },
          vector.to,
          'cut-line',
        );
      else expect(f.cm.replaceRange).not.toHaveBeenCalled();
      expect(f.cm.replaceSelections).not.toHaveBeenCalled();
    },
  );
  it('contenteditable copies repeated same-row carets but deletes each row once in descending order', async () => {
    const ranges = [0, 0, 1, 2].map((line, index) => ({
      anchor: { line, ch: index === 1 ? 3 : 0 },
      head: { line, ch: index === 1 ? 3 : 0 },
    }));
    const f = fixture({ ranges, primary: 2, inputStyle: 'contenteditable' });
    const request = await f.offer();
    const result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
    expect(result.effect).toMatchObject({
      type: 'clipboard',
      content: { text: 'Alpha\n\nAlpha\n\nBravo\n\nCharlie' },
    });
    expect(f.ranges()).toEqual(ranges);
    expect(f.primary()).toBe(2);
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Expected cut token');
    f.menu.commitCut({ token: result.effect.cutToken });
    expect(f.cm.replaceRange.mock.calls).toEqual([
      ['', { line: 2, ch: 0 }, { line: 2, ch: 7 }, 'cut'],
      ['', { line: 1, ch: 0 }, { line: 2, ch: 0 }, 'cut'],
      ['', { line: 0, ch: 0 }, { line: 1, ch: 0 }, 'cut'],
    ]);
    expect(() =>
      f.menu.commitCut({
        token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
      }),
    ).toThrow('失效');
  });
  it('textarea cuts only the first sorted caret line, even when the primary is on another row', async () => {
    const ranges = [
      { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } },
      { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 2, ch: 1 }, head: { line: 2, ch: 1 } },
    ];
    const f = fixture({ ranges, primary: 2 });
    const request = await f.offer(),
      result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
    expect(result.effect).toMatchObject({
      type: 'clipboard',
      content: { text: 'Alpha\n\nAlpha\n\nCharlie' },
    });
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Missing token');
    f.menu.commitCut({ token: result.effect.cutToken });
    expect(f.cm.replaceRange).toHaveBeenCalledExactlyOnceWith(
      '',
      { line: 0, ch: 0 },
      { line: 1, ch: 0 },
      'cut-line',
    );
    expect(f.primary()).toBe(2);
    expect(f.ranges()).toEqual(ranges);
  });
  it('does not expand a real CM selection even when instance linewise is enabled', async () => {
    const f = fixture({ ranges: [{ anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 1 } }] });
    const request = await f.offer();
    expect(
      f.menu.prepare({ requestId: request.requestId, actionId: 'edit.copy' }).effect,
    ).toMatchObject({ type: 'clipboard', content: { text: 'selected text' } });
    expect(f.cm.getOption).not.toHaveBeenCalledWith('lineWiseCopyCut');
  });
  it.each([
    'input',
    'beforeinput',
    'compositionstart',
    'generation',
    'sequence',
    'session',
    'instance',
    'document',
    'option',
    'silent-change',
    'permission',
    'loading',
    'dispose',
    'cancel',
  ])('rejects a pending line cut after %s and leaves code untouched', async (change) => {
    const f = fixture(),
      request = await f.offer();
    const result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Expected cut token');
    if (['input', 'beforeinput', 'compositionstart'].includes(change)) f.fire(change);
    if (change === 'generation') f.stamp.generation++;
    if (change === 'sequence') f.stamp.sequence++;
    if (change === 'session') f.editor.sessionStr = 'new-document';
    if (change === 'instance') f.wrapper.CodeMirror = { ...f.cm };
    if (change === 'document')
      f.cm.doc = { history: { ...f.history }, lineSeparator: f.cm.doc.lineSeparator };
    if (change === 'option') f.changeOption(false);
    if (change === 'silent-change') f.silentChange('new input without a DOM event');
    if (change === 'permission')
      f.deps.capabilities = () => ({
        clipboardWrite: false,
        clipboardRead: true,
        openExternal: true,
      });
    if (change === 'loading') f.deps.loading = () => true;
    if (change === 'dispose') f.deps.disposed = () => true;
    if (change === 'cancel') f.menu.invalidate(request.requestId);
    expect(() =>
      f.menu.commitCut({
        token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
      }),
    ).toThrow();
    expect(f.cm.replaceRange).not.toHaveBeenCalled();
  });
  it('a failed clipboard write can cancel the read-only prepared cut without changing code', async () => {
    const f = fixture(),
      request = await f.offer();
    const result = f.menu.prepare({ requestId: request.requestId, actionId: 'edit.cut' });
    f.menu.invalidate(request.requestId);
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Expected cut token');
    expect(() =>
      f.menu.commitCut({
        token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
      }),
    ).toThrow('失效');
    expect(f.cm.getValue()).toBe('Alpha\nBravo\nCharlie');
    expect(f.cm.replaceRange).not.toHaveBeenCalled();
  });
});

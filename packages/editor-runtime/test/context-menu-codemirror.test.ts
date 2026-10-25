import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ContextMenuDependencies, RuntimeContextMenu } from '../src/runtime/context-menu.js';
import {
  captureContextSelection,
  currentContextCodeMirror,
  restoreContextSelection,
} from '../src/runtime/context-menu-selection.js';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';

function fixture(sourceMode = true) {
  const document = { addEventListener: vi.fn(), getSelection: () => null };
  const source = {};
  const wrapper = {
    nodeType: 1,
    isConnected: true,
    ownerDocument: document,
    CodeMirror: undefined as unknown,
    closest: (selector: string) =>
      selector === '#marklyra-source' ? source : selector === '.CodeMirror' ? wrapper : null,
  };
  const leaf = {
    nodeType: 1,
    isConnected: true,
    closest: wrapper.closest,
  };
  const ranges = [{ anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 1 } }];
  const cm = {
    getOption: () => false,
    doc: { history: { done: ['existing'], undone: [] } },
    getWrapperElement: () => wrapper,
    getCursor: (edge: 'anchor' | 'head') => ranges[0]?.[edge],
    listSelections: () => ranges,
    setSelections: vi.fn(),
    getSelection: () => 'lph',
    focus: vi.fn(),
    operation: (work: () => unknown) => work(),
    replaceSelections: vi.fn(),
  };
  wrapper.CodeMirror = cm;
  const editor = {
    focusCid: null,
    sessionStr: '#write',
    writingArea: { ownerDocument: document, contains: () => !sourceMode },
    sourceView: { inSourceMode: sourceMode, cm },
  } as unknown as LegacyEditor;
  const stamp = { generation: 1, sequence: 3 };
  const deps = {
    runtime: { editor, File: { isLocked: false, _onInitParse: false, option: {} } },
    stamp: () => stamp,
    composing: () => false,
    loading: () => false,
    disposed: () => false,
    capabilities: () => ({ clipboardRead: true, clipboardWrite: true, openExternal: true }),
    send: vi.fn(),
    clipboardHTML: (value: string) => value,
    normalizeSelection: () => true,
    armReplacement: () => true,
    armTableRow: () => true,
  } as unknown as ContextMenuDependencies;
  const menu = new RuntimeContextMenu(deps);
  const event = {
    isTrusted: true,
    target: leaf,
    clientX: 10,
    clientY: 20,
  } as unknown as MouseEvent;
  return {
    cm,
    deps,
    editor,
    leaf,
    menu,
    ranges,
    stamp,
    wrapper,
    event,
    capture: () => captureContextSelection(editor, leaf as unknown as Element),
    async offer() {
      vi.useFakeTimers();
      menu.offer(['input'], event);
      await vi.runOnlyPendingTimersAsync();
      const binding = Reflect.get(menu, 'binding') as { target: unknown; requestId: string };
      expect(binding.target).toBe(wrapper);
      return binding.requestId;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('CodeMirror context identity', () => {
  it.each([true, false])(
    'preserves a source=%s CM selection across a rendered-leaf redraw',
    (source) => {
      const f = fixture(source);
      const saved = f.capture();
      f.leaf.isConnected = false;
      expect(currentContextCodeMirror(f.editor, saved)).toBe(true);
      restoreContextSelection(f.editor, saved);
      expect(f.cm.focus).toHaveBeenCalledOnce();
      expect(f.cm.setSelections).toHaveBeenCalledExactlyOnceWith(f.ranges, 0);
      expect(f.cm.doc.history).toEqual({ done: ['existing'], undone: [] });
    },
  );

  it.each(['wrapper', 'owner', 'instance', 'document', 'source-instance', 'source-mode'])(
    'rejects a changed %s before restoring its old ranges',
    (change) => {
      const f = fixture(),
        saved = f.capture();
      if (change === 'wrapper') f.cm.getWrapperElement = () => ({ ...f.wrapper });
      if (change === 'owner') f.wrapper.isConnected = false;
      if (change === 'instance') f.wrapper.CodeMirror = { ...f.cm };
      if (change === 'document') f.cm.doc = { history: { done: [], undone: [] } };
      if (change === 'source-instance')
        f.editor.sourceView.cm = { ...f.cm } as unknown as NonNullable<
          LegacyEditor['sourceView']['cm']
        >;
      if (change === 'source-mode') f.editor.sourceView.inSourceMode = false;
      expect(currentContextCodeMirror(f.editor, saved)).toBe(false);
      expect(() => restoreContextSelection(f.editor, saved)).toThrow('上下文');
      expect(f.cm.focus).not.toHaveBeenCalled();
      expect(f.cm.setSelections).not.toHaveBeenCalled();
    },
  );

  it('anchors an offered menu to its wrapper and keeps copy/cut authorization one-shot after redraw', async () => {
    const f = fixture(),
      requestId = await f.offer();
    f.leaf.isConnected = false;
    const result = f.menu.prepare({ requestId, actionId: 'edit.cut' });
    expect(result.effect).toMatchObject({ type: 'clipboard', content: { text: 'lph' } });
    expect(f.cm.replaceSelections).not.toHaveBeenCalled();
    if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
      throw Error('Missing token');
    f.menu.commitCut({ token: result.effect.cutToken });
    expect(f.cm.replaceSelections).toHaveBeenCalledExactlyOnceWith([''], 'start', 'cut');
    expect(() =>
      f.menu.commitCut({
        token: result.effect?.type === 'clipboard' ? (result.effect.cutToken ?? '') : '',
      }),
    ).toThrow('失效');
    expect(f.cm.replaceSelections).toHaveBeenCalledOnce();
  });

  it.each(['generation', 'sequence', 'session', 'wrapper', 'instance', 'document', 'permission'])(
    'preserves the existing %s rejection after view redraw',
    async (change) => {
      const f = fixture(),
        requestId = await f.offer();
      f.leaf.isConnected = false;
      if (change === 'generation') f.stamp.generation++;
      if (change === 'sequence') f.stamp.sequence++;
      if (change === 'session') f.editor.sessionStr = '#replacement';
      if (change === 'wrapper') f.wrapper.isConnected = false;
      if (change === 'instance') f.wrapper.CodeMirror = { ...f.cm };
      if (change === 'document') f.cm.doc = { history: { done: [], undone: [] } };
      if (change === 'permission')
        f.deps.capabilities = () => ({
          clipboardRead: true,
          clipboardWrite: false,
          openExternal: true,
        });
      expect(() => f.menu.prepare({ requestId, actionId: 'edit.copy' })).toThrow();
      expect(f.cm.focus).not.toHaveBeenCalled();
      expect(f.cm.replaceSelections).not.toHaveBeenCalled();
    },
  );
});

describe('original source context replay ownership', () => {
  it.each(['raw', 'jquery'])('consumes only the accepted %s event replay', async (kind) => {
    const f = fixture();
    await f.offer();
    const execute = vi.fn(() => 'original');
    const event = kind === 'jquery' ? { originalEvent: f.event } : f.event;
    expect(f.menu.replaySourceContext(f.cm, event, execute)).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(f.menu.replaySourceContext(f.cm, event, execute)).toBe('original');
    expect(execute).toHaveBeenCalledOnce();
  });
  it.each(['copy', 'cut', 'generation', 'document', 'invalidate', 'destroy'])(
    'does not replay an accepted old event after %s',
    async (change) => {
      const f = fixture(),
        requestId = await f.offer();
      if (change === 'copy') f.menu.prepare({ requestId, actionId: 'edit.copy' });
      if (change === 'cut') {
        const result = f.menu.prepare({ requestId, actionId: 'edit.cut' });
        if (result.effect?.type !== 'clipboard' || !result.effect.cutToken)
          throw Error('Missing cut token');
        f.menu.commitCut({ token: result.effect.cutToken });
      }
      if (change === 'generation') f.stamp.generation++;
      if (change === 'document') f.cm.doc = { history: { done: [], undone: [] } };
      if (change === 'invalidate') f.menu.invalidate();
      if (change === 'destroy') f.menu.destroy();
      const execute = vi.fn();
      f.menu.replaySourceContext(f.cm, f.event, execute);
      expect(execute).not.toHaveBeenCalled();
    },
  );
  it.each(['unoffered', 'other-event', 'other-instance', 'fenced'])(
    'preserves original fallback for %s',
    async (kind) => {
      const f = fixture(kind !== 'fenced');
      if (kind !== 'unoffered') await f.offer();
      const result = Promise.resolve('original');
      const execute = vi.fn(() => result);
      expect(
        f.menu.replaySourceContext(
          kind === 'other-instance' ? { ...f.cm } : f.cm,
          kind === 'other-event' ? { ...f.event } : f.event,
          execute,
        ),
      ).toBe(result);
      expect(execute).toHaveBeenCalledOnce();
    },
  );
});

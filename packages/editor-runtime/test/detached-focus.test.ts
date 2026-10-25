import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CursorBookmark } from '../src/protocol.js';
import { RuntimeFocus } from '../src/runtime/focus.js';
import type { LegacyEditor, LegacyGlobals } from '../src/runtime/legacy-types.js';

class FocusElement {
  isConnected = true;
  constructor(readonly area?: FocusElement) {}
  closest(selector: string) {
    return selector === '#write,#marklyra-source' && this.area ? this.area : null;
  }
  contains(value: unknown) {
    return (
      value === this || (value instanceof FocusElement && value.area === this && value.isConnected)
    );
  }
}
function fixture(owned = true) {
  vi.stubGlobal('Element', FocusElement);
  const area = new FocusElement();
  const input = new FocusElement(area),
    body = new FocusElement(),
    html = new FocusElement(),
    control = new FocusElement();
  let foreground = true,
    available = true,
    generation = 1;
  const document = {
    activeElement: owned ? input : control,
    body,
    documentElement: html,
    hasFocus: () => foreground,
  };
  Object.assign(area, { ownerDocument: document, focus: vi.fn() });
  Object.assign(input, { ownerDocument: document });
  const cursor: CursorBookmark = { type: 'cursor', id: 'image-paragraph', start: 33, end: 33 };
  const execute = vi.fn((value: CursorBookmark) => value);
  const editor = {
    writingArea: area,
    sourceView: { inSourceMode: false },
    undo: { exeCommand: execute },
    selection: { buildUndo: vi.fn(() => ({ ...cursor })) },
  } as unknown as LegacyEditor;
  const runtime = { editor } as LegacyGlobals;
  const focus = new RuntimeFocus(
    runtime,
    () => generation,
    () => foreground && area.contains(document.activeElement),
    () => available,
  );
  focus.install();
  const bookmark = editor.selection.buildUndo();
  if (!bookmark) throw Error('Missing real reader bookmark');
  const detach = () => {
    input.isConnected = false;
    document.activeElement = body;
  };
  return {
    area,
    input,
    body,
    html,
    control,
    document,
    editor,
    runtime,
    focus,
    bookmark,
    execute,
    detach,
    next: () => generation++,
    background: () => {
      foreground = false;
    },
    busy: () => {
      available = false;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('an original brush replacing its own focused descendant', () => {
  it.each(['body', 'html'] as const)(
    'uses the captured executor when its own detached input leaves only %s focused',
    (target) => {
      const f = fixture();
      f.detach();
      f.document.activeElement = f[target];
      const captured = vi.fn(() => 'original-result');
      f.editor.undo.exeCommand = () => {
        throw Error('must not reread original executor');
      };
      expect(f.focus.restoreBrushCursor(f.editor, f.bookmark, captured)).toBe('original-result');
      expect(captured).toHaveBeenCalledExactlyOnceWith(f.bookmark);
      expect(f.focus.bookmark()).toBeUndefined();
    },
  );
  it.each([
    'new-input',
    'outside-pointer',
    'new-control',
    'transient-control',
    'background',
    'connected-input',
    'detached-area',
    'generation',
    'source',
    'busy',
    'destroy',
    'editor',
    'document',
  ] as const)('does not grant detached-input permission after %s', (change) => {
    const f = fixture();
    f.detach();
    if (change === 'new-input') f.focus.interact(f.input as unknown as EventTarget);
    if (change === 'outside-pointer') f.focus.interact(f.body as unknown as EventTarget);
    if (change === 'new-control') f.document.activeElement = f.control;
    if (change === 'transient-control') {
      f.focus.observe(f.control as unknown as EventTarget);
      f.document.activeElement = f.body;
    }
    if (change === 'background') f.background();
    if (change === 'connected-input') f.input.isConnected = true;
    if (change === 'detached-area') f.area.isConnected = false;
    if (change === 'generation') f.next();
    if (change === 'source') f.editor.sourceView.inSourceMode = true;
    if (change === 'busy') f.busy();
    if (change === 'destroy') f.focus.destroy();
    if (change === 'editor') f.runtime.editor = { ...f.editor };
    if (change === 'document') Reflect.set(f.input, 'ownerDocument', {});
    f.focus.restoreBrushCursor(f.editor, f.bookmark);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('cannot create ownership retrospectively from an initially unowned bookmark', () => {
    const f = fixture(false);
    f.detach();
    f.focus.restoreBrushCursor(f.editor, f.bookmark);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('keeps the existing deferred behavior when WeakRef is unavailable', () => {
    vi.stubGlobal('WeakRef', undefined);
    const f = fixture();
    f.detach();
    f.focus.restoreBrushCursor(f.editor, f.bookmark);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.focus.bookmark()).toEqual(f.bookmark);
  });
  it('does not grant ownership when the weak target is no longer observable', () => {
    vi.stubGlobal(
      'WeakRef',
      class {
        deref() {
          return undefined;
        }
      },
    );
    const f = fixture();
    f.detach();
    f.focus.restoreBrushCursor(f.editor, f.bookmark);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('keeps ordinary deferred explicit focus available after a Host control took ownership', () => {
    const f = fixture();
    f.detach();
    f.document.activeElement = f.control;
    f.focus.observe(f.control as unknown as EventTarget);
    f.focus.restoreBrushCursor(f.editor, f.bookmark);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.focus.bookmark()).toEqual(f.bookmark);
    f.focus.command(() => undefined);
    expect(f.execute).toHaveBeenCalledExactlyOnceWith(f.bookmark);
  });
});

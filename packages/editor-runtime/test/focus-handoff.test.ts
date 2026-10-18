import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeFocus } from '../src/runtime/focus.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';

class Events {
  listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(name: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.get(name)?.delete(listener);
  }
  emit(name: string, event: unknown = {}) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(event);
  }
}
class ElementFixture {
  isConnected = true;
  focus = vi.fn();
  constructor(readonly area?: ElementFixture) {}
  contains(value: unknown) {
    return value === this || (value instanceof ElementFixture && value.area === this);
  }
}
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  vi.stubGlobal('Element', ElementFixture);
  const owner = Object.assign(new Events(), {
    body: new ElementFixture(),
    documentElement: new ElementFixture(),
    defaultView: new Events(),
    activeElement: null as ElementFixture | null,
    hasFocus: (): boolean => true,
    getSelection: () => selection,
  });
  const area = Object.assign(new ElementFixture(), { ownerDocument: owner });
  const anchor = new ElementFixture(area);
  const selection = {
    rangeCount: 1,
    anchorNode: anchor,
    focusNode: anchor,
    anchorOffset: 0,
    focusOffset: 0,
  };
  owner.activeElement = owner.body;
  const editor = { writingArea: area, sourceView: { inSourceMode: false, cm: { focus: vi.fn() } } };
  const runtime = { editor };
  let generation = 1,
    composing = false;
  const focus = new RuntimeFocus(
    runtime as unknown as LegacyGlobals,
    () => generation,
    undefined,
    () => !composing,
  );
  const key = (overrides = {}) => {
    const event = {
      isTrusted: true,
      defaultPrevented: false,
      isComposing: false,
      keyCode: 65,
      key: 'A',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      ...overrides,
    };
    owner.emit('keydown', event);
    return event;
  };
  return {
    focus,
    owner,
    area,
    selection,
    editor,
    runtime,
    key,
    next: () => generation++,
    compose: () => {
      composing = true;
    },
  };
}

describe('explicit failed input-owner handoff', () => {
  it('uses the real key gesture once without changing its default action or the original Range', () => {
    const f = fixture();
    f.focus.focus();
    expect(f.area.focus).toHaveBeenCalledOnce();
    const before = { ...f.selection };
    const event = f.key();
    expect(f.area.focus).toHaveBeenCalledTimes(2);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(f.selection).toEqual(before);
    f.key();
    expect(f.area.focus).toHaveBeenCalledTimes(2);
    expect([...f.owner.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it('requires an explicit focus request and does not arm when the first request already acquired ownership', () => {
    const f = fixture();
    f.key();
    expect(f.area.focus).not.toHaveBeenCalled();
    f.area.focus.mockImplementation(() => {
      f.owner.activeElement = f.area;
    });
    f.focus.focus();
    f.owner.activeElement = f.owner.body;
    f.key();
    expect(f.area.focus).toHaveBeenCalledOnce();
  });

  it('does not manufacture a missing or foreign editor selection', () => {
    for (const missing of [true, false]) {
      const f = fixture();
      if (missing) f.selection.rangeCount = 0;
      else f.selection.focusNode = new ElementFixture();
      f.focus.focus();
      f.key();
      expect(f.area.focus).toHaveBeenCalledOnce();
    }
  });

  it.each([
    'generation',
    'editor',
    'source',
    'selection',
    'detached',
    'background',
    'composition',
    'composition-key',
    'composition-event',
    'pointer',
    'search',
    'blur',
    'destroy',
  ] as const)('cannot steal a later input intent or invalid scope: %s', (kind) => {
    const f = fixture();
    f.focus.focus();
    if (kind === 'generation') f.next();
    if (kind === 'editor') f.runtime.editor = { ...f.editor };
    if (kind === 'source') f.editor.sourceView.inSourceMode = true;
    if (kind === 'selection') f.selection.anchorOffset = 1;
    if (kind === 'detached') f.area.isConnected = false;
    if (kind === 'background') f.owner.hasFocus = () => false;
    if (kind === 'composition') f.compose();
    if (kind === 'composition-key') f.key({ isComposing: true, keyCode: 229, key: 'Process' });
    if (kind === 'composition-event') f.owner.emit('compositionstart');
    if (kind === 'pointer') f.owner.emit('pointerdown');
    if (kind === 'search') {
      const search = new ElementFixture();
      f.owner.activeElement = search;
      f.owner.emit('focusin', { target: search });
      f.owner.activeElement = f.owner.body;
    }
    if (kind === 'blur') f.owner.defaultView.emit('blur');
    if (kind === 'destroy') f.focus.destroy();
    f.key();
    expect(f.area.focus).toHaveBeenCalledOnce();
  });

  it('keeps original source CodeMirror ownership and never arms a body fallback for it', () => {
    const f = fixture();
    f.editor.sourceView.inSourceMode = true;
    f.focus.focus();
    f.key();
    expect(f.editor.sourceView.cm.focus).toHaveBeenCalledOnce();
    expect(f.area.focus).not.toHaveBeenCalled();
  });

  it.each([
    { isTrusted: false },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { key: 'Tab' },
    { defaultPrevented: true },
  ])('does not redirect non-editing/default-prevented events %j', (event) => {
    const f = fixture();
    f.focus.focus();
    f.key(event);
    expect(f.area.focus).toHaveBeenCalledOnce();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeFocus } from '../src/runtime/focus.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';

class ElementFixture {
  isConnected = true;
  CodeMirror: { focus: ReturnType<typeof vi.fn> } | undefined;
  mirrorElement: ElementFixture | null = null;
  focus = vi.fn();
  constructor(readonly area?: ElementFixture) {}
  contains(value: unknown) {
    return value === this || (value instanceof ElementFixture && value.area === this);
  }
  closest() {
    return this.mirrorElement;
  }
}
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  vi.stubGlobal('Element', ElementFixture);
  const area = new ElementFixture();
  const wrapper = new ElementFixture(area);
  wrapper.CodeMirror = { focus: vi.fn() };
  const input = new ElementFixture(area);
  input.mirrorElement = wrapper;
  const cm = { focus: vi.fn() };
  const editor = { writingArea: area, sourceView: { inSourceMode: false, cm } };
  let generation = 1;
  const focus = new RuntimeFocus({ editor } as unknown as LegacyGlobals, () => generation);
  return { focus, area, wrapper, input, editor, cm, next: () => generation++ };
}
describe('focus returns input ownership without selection reconstruction', () => {
  it('focuses current source CodeMirror, never the hidden writing area', () => {
    const f = fixture();
    f.editor.sourceView.inSourceMode = true;
    f.focus.focus();
    expect(f.cm.focus).toHaveBeenCalledOnce();
    expect(f.area.focus).not.toHaveBeenCalled();
  });
  it('focuses writing area when no embedded editor owns the last editing focus', () => {
    const f = fixture();
    f.focus.focus();
    expect(f.area.focus).toHaveBeenCalledOnce();
  });
  it('retains the connected embedded CM across outside focus', () => {
    const f = fixture();
    f.focus.observe(f.input as unknown as EventTarget);
    f.focus.observe(new ElementFixture() as unknown as EventTarget);
    f.focus.focus();
    expect(f.wrapper.CodeMirror?.focus).toHaveBeenCalledOnce();
    expect(f.area.focus).not.toHaveBeenCalled();
  });
  it.each(['generation', 'detached', 'replaced', 'body'] as const)(
    'rejects stale embedded CM after %s',
    (kind) => {
      const f = fixture();
      const old = f.wrapper.CodeMirror;
      f.focus.observe(f.input as unknown as EventTarget);
      if (kind === 'generation') f.next();
      if (kind === 'detached') f.wrapper.isConnected = false;
      if (kind === 'replaced') f.wrapper.CodeMirror = { focus: vi.fn() };
      if (kind === 'body') f.focus.observe(new ElementFixture(f.area) as unknown as EventTarget);
      f.focus.focus();
      expect(old?.focus).not.toHaveBeenCalled();
      expect(f.area.focus).toHaveBeenCalledOnce();
    },
  );
});

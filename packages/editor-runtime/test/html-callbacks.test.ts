import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardHTMLCallback } from '../src/runtime/html-callbacks.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';

class TestElement {
  isConnected = true;
  cid = 'h';
  parent: TestElement | null = null;
  getAttribute(name: string) {
    return name === 'cid' ? this.cid : null;
  }
  closest() {
    return this.parent ?? this;
  }
}
function fixture() {
  const block = new TestElement(),
    wrapper = new TestElement();
  wrapper.parent = block;
  let node: object | undefined = { get: () => 'html_block' },
    epoch = 1,
    available = true;
  const cm = { cid: 'h', doc: {}, getWrapperElement: () => wrapper },
    editor = {
      htmlBlock: { currentCm: cm },
      sourceView: { inSourceMode: false },
      isIME: false,
      getNode: () => node,
      writingArea: { contains: (value: unknown) => value === block },
    },
    runtime = { editor, File: {} } as unknown as LegacyGlobals;
  const callback = vi.fn(() => 'ran'),
    guarded = guardHTMLCallback(
      runtime,
      () => epoch,
      () => available,
      callback,
    );
  return {
    runtime,
    editor,
    cm,
    block,
    wrapper,
    callback,
    guarded,
    newEpoch: () => epoch++,
    unavailable: () => (available = false),
    replaceNode: () => (node = { get: () => 'html_block' }),
  };
}
beforeEach(() => vi.stubGlobal('HTMLElement', TestElement));
afterEach(() => vi.unstubAllGlobals());
describe('HTML Enter callback document ownership', () => {
  it('allows the unchanged live document callback', () => {
    const f = fixture();
    expect(f.guarded()).toBe('ran');
    expect(f.callback).toHaveBeenCalledOnce();
  });
  for (const [name, change] of [
    ['new generation', (f: ReturnType<typeof fixture>) => f.newEpoch()],
    ['loading or disposed', (f: ReturnType<typeof fixture>) => f.unavailable()],
    ['replacement file', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'File', {})],
    ['replacement editor', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'editor', {})],
    ['same cid with replacement node', (f: ReturnType<typeof fixture>) => f.replaceNode()],
    [
      'replacement CM',
      (f: ReturnType<typeof fixture>) => Reflect.set(f.editor.htmlBlock, 'currentCm', {}),
    ],
    ['replacement CM Doc', (f: ReturnType<typeof fixture>) => (f.cm.doc = {})],
    ['disconnected block', (f: ReturnType<typeof fixture>) => (f.block.isConnected = false)],
    ['disconnected wrapper', (f: ReturnType<typeof fixture>) => (f.wrapper.isConnected = false)],
    [
      'wrong block ownership',
      (f: ReturnType<typeof fixture>) => (f.wrapper.parent = new TestElement()),
    ],
    ['source mode', (f: ReturnType<typeof fixture>) => (f.editor.sourceView.inSourceMode = true)],
    ['composition', (f: ReturnType<typeof fixture>) => (f.editor.isIME = true)],
  ] as const)
    it(`rejects ${name}`, () => {
      const f = fixture();
      change(f);
      expect(f.guarded()).toBeUndefined();
      expect(f.callback).not.toHaveBeenCalled();
    });
});

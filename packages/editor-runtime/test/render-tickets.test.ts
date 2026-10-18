import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeRenderTickets } from '../src/runtime/render-tickets.js';

class TestElement {
  isConnected = true;
  cid = 'm';
  parent: TestElement | null = null;
  matches() {
    return true;
  }
  closest() {
    return this.parent ?? this;
  }
  getAttribute() {
    return this.cid;
  }
  contains(value: unknown) {
    return value instanceof TestElement && value.parent === this;
  }
}
function fixture() {
  const scope = new TestElement(),
    preview = new TestElement(),
    wrapper = new TestElement();
  preview.parent = wrapper.parent = scope;
  let source = 'A',
    epoch = 1,
    available = true,
    node: object = { get: () => 'math_block' };
  const cm = { cid: 'm', doc: {}, getValue: () => source, getWrapperElement: () => wrapper },
    editor = {
      mathBlock: { currentCm: cm },
      fences: { queue: {} },
      isIME: false,
      sourceView: { inSourceMode: false },
      getNode: () => node,
      writingArea: { contains: (value: unknown) => value === scope },
    },
    runtime = { editor, File: {} } as unknown as LegacyGlobals,
    tickets = new RuntimeRenderTickets(
      runtime,
      () => epoch,
      () => available,
    );
  return {
    tickets,
    preview,
    wrapper,
    scope,
    cm,
    editor,
    runtime,
    setSource: (text: string) => (source = text),
    newEpoch: () => epoch++,
    unavailable: () => (available = false),
    replaceNode: () => (node = { get: () => 'math_block' }),
  };
}
beforeEach(() => vi.stubGlobal('HTMLElement', TestElement));
afterEach(() => vi.unstubAllGlobals());
describe('per-preview render request ownership', () => {
  it('rejects old success and error settlements, including a return to the same source', () => {
    const f = fixture(),
      first = f.tickets.begin(f.preview, f.cm);
    expect(first.current()).toBe(true);
    f.setSource('B');
    const second = f.tickets.begin(f.preview, f.cm);
    expect(first.current()).toBe(false);
    expect(second.current()).toBe(true);
    f.setSource('A');
    const third = f.tickets.begin(f.preview, f.cm);
    expect(first.current()).toBe(false);
    expect(second.current()).toBe(false);
    expect(third.current()).toBe(true);
  });
  it('keeps requests for separate preview elements independent', () => {
    const f = fixture(),
      a = f.tickets.begin(f.preview, f.cm),
      other = new TestElement();
    other.parent = f.scope;
    const b = f.tickets.begin(other, f.cm);
    expect(a.current()).toBe(true);
    expect(b.current()).toBe(true);
  });
  for (const [name, change] of [
    ['unrendered new source', (f: ReturnType<typeof fixture>) => f.setSource('new')],
    ['replacement document', (f: ReturnType<typeof fixture>) => f.newEpoch()],
    ['loading/disposal', (f: ReturnType<typeof fixture>) => f.unavailable()],
    ['replacement file', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'File', {})],
    ['replacement editor', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'editor', {})],
    ['same cid replacement node', (f: ReturnType<typeof fixture>) => f.replaceNode()],
    [
      'replacement CM',
      (f: ReturnType<typeof fixture>) => Reflect.set(f.editor.mathBlock, 'currentCm', {}),
    ],
    ['replacement CM document', (f: ReturnType<typeof fixture>) => (f.cm.doc = {})],
    ['retired preview', (f: ReturnType<typeof fixture>) => (f.preview.isConnected = false)],
    ['retired wrapper', (f: ReturnType<typeof fixture>) => (f.wrapper.isConnected = false)],
    [
      'reparented preview',
      (f: ReturnType<typeof fixture>) => (f.preview.parent = new TestElement()),
    ],
    ['source mode', (f: ReturnType<typeof fixture>) => (f.editor.sourceView.inSourceMode = true)],
    ['composition', (f: ReturnType<typeof fixture>) => (f.editor.isIME = true)],
  ] as const)
    it(`rejects ${name}`, () => {
      const f = fixture(),
        ticket = f.tickets.begin(f.preview, f.cm);
      change(f);
      expect(ticket.current()).toBe(false);
    });
});

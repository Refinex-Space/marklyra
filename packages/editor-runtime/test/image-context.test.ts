import { describe, expect, it, vi } from 'vitest';
import { DocumentImages } from '../src/images/host.js';
import { MarkLyraEditor } from '../src/index.js';

function fixture() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const images = new DocumentImages(
    { resolve: async () => null },
    'doc',
    'http://localhost/runtime',
  );
  const requests: unknown[][] = [];
  const editor = Object.create(MarkLyraEditor.prototype) as MarkLyraEditor;
  Object.assign(editor, {
    ready,
    images,
    disposed: false,
    composing: false,
    operations: Promise.resolve(),
    compositionWaiters: new Set(),
    loading: false,
    exportRenderers: new Set(),
    imageReferenceRenderers: new Set(),
    options: {},
    request: vi.fn(async (...args: unknown[]) => {
      requests.push(args);
      return true;
    }),
  });
  return { editor, images, requests, release };
}
describe('same-document image location epochs', () => {
  it('does not take over a different context while its load is pending or rolled back', async () => {
    const f = fixture();
    const before = f.images.capture();
    await f.editor.setDocumentContext('pending-document', true);
    expect(before.signal.aborted).toBe(false);
    expect(f.images.capture().context).toBe('doc');
    expect(f.requests).toEqual([]);
  });
  it('aborts before ready and refreshes only the captured generation without touching source state', async () => {
    const f = fixture();
    const before = f.images.capture();
    Object.assign(f.editor, { source: '\uFEFFraw\r\n', documentRevision: 9 });
    const pending = f.editor.setDocumentContext('doc', true);
    expect(before.signal.aborted).toBe(true);
    expect(f.requests).toEqual([]);
    f.release();
    await pending;
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]?.[0]).toBe('image-context');
    expect(f.editor.getMarkdown()).toBe('\uFEFFraw\r\n');
    expect(f.editor.revision).toBe(9);
  });
  it('never revives a forced refresh superseded by a new document', async () => {
    const f = fixture();
    const pending = f.editor.setDocumentContext('doc', true);
    f.images.transition('new-document');
    f.release();
    await pending;
    expect(f.images.capture().context).toBe('new-document');
    expect(f.requests).toEqual([]);
  });
  it('keeps the default same-ID no-op compatible and waits for composition before decoration', async () => {
    const f = fixture();
    f.release();
    const token = f.images.capture();
    await f.editor.setDocumentContext('doc');
    expect(token.signal.aborted).toBe(false);
    Reflect.set(f.editor, 'composing', true);
    const forced = f.editor.setDocumentContext('doc', true);
    await Promise.resolve();
    await Promise.resolve();
    expect(token.signal.aborted).toBe(true);
    expect(f.requests).toEqual([]);
    Reflect.set(f.editor, 'composing', false);
    const waiters = Reflect.get(f.editor, 'compositionWaiters') as Set<{ resolve(): void }>;
    for (const waiter of waiters) waiter.resolve();
    await forced;
    expect(f.requests).toHaveLength(1);
  });
});

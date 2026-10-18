import { describe, expect, it } from 'vitest';
import type { DraftContent, FallbackContext } from '../src/services/recovery.js';
import {
  consumeFallback,
  listFallbacks,
  RecoveryFallback,
} from '../src/services/recovery-fallback.js';

class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  writes: { key: string; length: number }[] = [];
  fail: ((key: string) => boolean) | undefined;
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail?.(key)) throw new Error('quota or process interruption');
    this.data.set(key, value);
    this.writes.push({ key, length: value.length });
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}
const owner = '00000000-0000-4000-8000-000000000001';
const inactive: FallbackContext = {
  owner: '00000000-0000-4000-8000-000000000002',
  activeOwners: [],
  activeLabels: ['main'],
};
const draft = (text: string, savedText = ''): DraftContent => ({
  text,
  savedText,
  document: null,
  selection: null,
});
function setup() {
  const storage = new MemoryStorage();
  let serial = 10;
  const writer = new RecoveryFallback(
    storage,
    owner,
    () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
    () => 100,
  );
  return { storage, writer };
}

describe('synchronous WebView fallback', () => {
  it('recovers changes made before any native checkpoint and preserves BOM/EOL/encoding', async () => {
    const { storage, writer } = setup();
    const first: DraftContent = {
      ...draft('\ufeff# 中\r\nold\r', '\ufeff# 中\r\n'),
      document: { path: '/notes/a.md', encoding: 'UTF-16BE BOM' },
    };
    writer.update(first);
    const next = { ...first, text: '\ufeff# 中\r\nnew🙂\rold\r' };
    writer.update(next);
    const listing = await listFallbacks(storage, inactive); // New process has no writer memory.
    expect(listing.issues).toEqual([]);
    expect(listing.drafts[0]?.content).toEqual(next);
  });
  it('first durable head survives failed replacement publication and keeps evidence', async () => {
    const { storage, writer } = setup();
    writer.update(draft('original edit'));
    storage.fail = (key) => key.startsWith('marklyra-fallback:v2:');
    expect(() => writer.update(draft('next edit', 'different saved baseline'))).toThrow(
      'interruption',
    );
    expect((await listFallbacks(storage, inactive)).drafts[0]?.content.text).toBe('original edit');
    expect(storage.length).toBe(3); // old base/head plus incomplete copy-on-write base
  });
  it('does not remove newer input when an older native checkpoint completes', async () => {
    const { storage, writer } = setup();
    writer.update(draft('A'));
    writer.update(draft('AB'));
    writer.confirm(draft('A'));
    expect((await listFallbacks(storage, inactive)).drafts[0]?.content.text).toBe('AB');
    writer.confirm(draft('AB'));
    expect((await listFallbacks(storage, inactive)).drafts).toEqual([]);
  });
  it('metadata and saved baseline participate in the native acknowledgement comparison', async () => {
    const { storage, writer } = setup();
    writer.update(draft('same', 'old'));
    writer.confirm(draft('same', 'other'));
    expect((await listFallbacks(storage, inactive)).drafts).toHaveLength(1);
  });
  it('labels live owners active and retains newer local versions on import CAS', async () => {
    const { storage, writer } = setup();
    writer.update(draft('one'));
    const initial = (await listFallbacks(storage, { ...inactive, activeOwners: [owner] }))
      .drafts[0];
    expect(initial?.active).toBe(true);
    if (!initial) throw new Error('missing fixture');
    writer.update(draft('two'));
    expect(consumeFallback(storage, initial)).toBe(false);
    expect((await listFallbacks(storage, inactive)).drafts[0]?.content.text).toBe('two');
  });
  it('retains the exact plain legacy key until explicit successful import CAS', async () => {
    const { storage } = setup();
    storage.setItem('marklyra-draft', '\ufefflegacy\r\n\r');
    storage.setItem('marklyra-draft:editor-live', 'live');
    const context = { ...inactive, activeLabels: ['main', 'editor-live'] };
    const listing = await listFallbacks(storage, context);
    const main = listing.drafts.find((draft) => draft.key === 'marklyra-draft');
    expect(main?.content.text).toBe('\ufefflegacy\r\n\r');
    expect(listing.drafts.find((draft) => draft.legacyLabel === 'editor-live')?.active).toBe(true);
    expect((await listFallbacks(storage, context)).drafts[0]?.id).toBe(listing.drafts[0]?.id);
    if (!main) throw new Error('missing fixture');
    expect(consumeFallback(storage, main)).toBe(true);
    expect(storage.getItem('marklyra-draft:editor-live')).toBe('live');
  });
  it('bounds ordinary large-document keystrokes to a small synchronous patch write', async () => {
    const { storage, writer } = setup();
    const source = 'A'.repeat(1024 * 1024);
    writer.update(draft(`${source}X`, source));
    storage.writes = [];
    for (let index = 0; index < 12; index++)
      writer.update(draft(`${source}X${'中'.repeat(index + 1)}`, source));
    expect(storage.writes).toHaveLength(12);
    expect(Math.max(...storage.writes.map((write) => write.length))).toBeLessThan(2048);
    expect((await listFallbacks(storage, inactive)).drafts[0]?.content.text).toBe(
      `${source}X${'中'.repeat(12)}`,
    );
  });
  it('oversize updates fail without deleting the previous fallback', async () => {
    const { storage, writer } = setup();
    writer.update(draft('safe'));
    expect(() => writer.update(draft('X'.repeat(2 * 1024 * 1024 + 1)))).toThrow('大小');
    expect((await listFallbacks(storage, inactive)).drafts[0]?.content.text).toBe('safe');
  });
});

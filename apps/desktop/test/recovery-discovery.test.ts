import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverRecovery, type FallbackContext } from '../src/services/recovery.js';
import { listFallbacks, RecoveryFallback } from '../src/services/recovery-fallback.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const oldOwner = '00000000-0000-4000-8000-000000000001';
const context: FallbackContext = {
  owner: '00000000-0000-4000-8000-000000000002',
  activeOwners: [],
  activeLabels: ['main'],
};
let values: Map<string, string>;
let storage: Storage;

beforeEach(() => {
  values = new Map();
  storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'fallback_recovery_context') return context;
    if (command === 'list_recovery_drafts') return { drafts: [], savedCopies: [], issues: [] };
    throw Error(`Unexpected command: ${command}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('startup recovery discovery', () => {
  it.each([false, true])('offers only unsaved fallback content (saved=%s)', async (saved) => {
    const writer = new RecoveryFallback(storage, oldOwner);
    const text = '\ufeffAlpha 新稿\r\n';
    const content = { text, savedText: 'Alpha\n', document: null, selection: null };
    writer.update(content);
    if (saved) writer.update({ ...content, savedText: text });
    // A process can stop after the save baseline is protected but before local
    // cleanup. The readable copy remains useful without being an unsaved draft.
    const before = [...values];
    expect((await discoverRecovery()).fallbackAvailable).toBe(!saved);
    expect([...values]).toEqual(before);
    expect((await listFallbacks(storage, context)).drafts[0]?.content.text).toBe(text);
  });

  it('does not offer a dirty fallback still owned by a live window', async () => {
    const writer = new RecoveryFallback(storage, context.owner);
    writer.update({ text: 'new', savedText: 'old', document: null, selection: null });
    vi.mocked(invoke).mockResolvedValueOnce({ ...context, activeOwners: [context.owner] });
    expect((await discoverRecovery()).fallbackAvailable).toBe(false);
  });

  it('keeps a dirty fallback discoverable beside a clean one', async () => {
    const content = { text: 'saved', savedText: 'old', document: null, selection: null };
    const clean = new RecoveryFallback(storage, oldOwner);
    clean.update(content);
    clean.update({ ...content, savedText: 'saved' });
    new RecoveryFallback(storage, oldOwner).update({ ...content, text: 'unsaved' });
    expect((await discoverRecovery()).fallbackAvailable).toBe(true);
    expect((await listFallbacks(storage, context)).drafts).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mirrorLegacyTheme,
  normalizeThemeId,
  persistThemeChoice,
  prepareThemeChoice,
  rollbackThemeChoice,
  storedTheme,
  themeChoiceKey,
} from '../src/features/themes/model.js';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

const record = (theme: string, revision: string) => JSON.stringify({ theme, revision });

describe('revisioned theme choice transactions', () => {
  it('prepares a unique choice without writing either storage key', () => {
    const previous = '{ "theme": "marklyra-light", "revision": "prior" }';
    storage.setItem(themeChoiceKey, previous);
    storage.setItem('marklyra-theme', 'marklyra-light');
    const first = prepareThemeChoice('marklyra-dark'),
      second = prepareThemeChoice('marklyra-dark');
    expect(first.previous).toBe(previous);
    expect(JSON.parse(first.value)).toMatchObject({
      theme: 'marklyra-dark',
      revision: expect.any(String),
    });
    expect(first.value).not.toBe(second.value);
    expect(storage.getItem(themeChoiceKey)).toBe(previous);
    expect(storage.getItem('marklyra-theme')).toBe('marklyra-light');
  });
  it('persists the authoritative choice and only explicitly mirrors the successful legacy value', () => {
    storage.setItem('marklyra-theme', 'marklyra-light');
    const write = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(write);
    expect(storage.getItem(themeChoiceKey)).toBe(write.value);
    expect(storedTheme()).toBe('marklyra-dark');
    expect(storage.getItem('marklyra-theme')).toBe('marklyra-light');
    mirrorLegacyTheme(write);
    expect(storage.getItem('marklyra-theme')).toBe('marklyra-dark');
  });
  it('restores the exact prior record on a failed own choice', () => {
    const previous = '{ "theme":"gothic", "revision":"before" }';
    storage.setItem(themeChoiceKey, previous);
    storage.setItem('marklyra-theme', 'gothic');
    const write = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(write);
    rollbackThemeChoice(write);
    expect(storage.getItem(themeChoiceKey)).toBe(previous);
    expect(storage.getItem('marklyra-theme')).toBe('gothic');
    expect(storedTheme()).toBe('gothic');
  });
  it('removes only its own new key when no authority record existed', () => {
    storage.setItem('marklyra-theme', 'marklyra-light');
    const write = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(write);
    rollbackThemeChoice(write);
    expect(storage.getItem(themeChoiceKey)).toBeNull();
    expect(storedTheme()).toBe('marklyra-light');
  });
  it('does not roll back or mirror over a later winning choice', () => {
    const old = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(old);
    const winner = prepareThemeChoice('gothic');
    persistThemeChoice(winner);
    mirrorLegacyTheme(winner);
    rollbackThemeChoice(old);
    mirrorLegacyTheme(old);
    expect(storage.getItem(themeChoiceKey)).toBe(winner.value);
    expect(storage.getItem('marklyra-theme')).toBe('gothic');
  });
  it('distinguishes a later same-name choice after an intervening theme (ABA)', () => {
    const old = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(old);
    const middle = prepareThemeChoice('marklyra-light');
    persistThemeChoice(middle);
    const winner = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(winner);
    expect(old.value).not.toBe(winner.value);
    rollbackThemeChoice(old);
    mirrorLegacyTheme(old);
    expect(storage.getItem(themeChoiceKey)).toBe(winner.value);
    expect(storage.getItem('marklyra-theme')).toBeNull();
  });
  it('keeps a later equal semantic record with a different exact serialization', () => {
    const old = prepareThemeChoice('marklyra-dark');
    persistThemeChoice(old);
    const later = JSON.stringify(JSON.parse(old.value), null, 2);
    storage.setItem(themeChoiceKey, later);
    rollbackThemeChoice(old);
    expect(storage.getItem(themeChoiceKey)).toBe(later);
  });
  it('leaves the legacy setting untouched on quota failure', () => {
    storage.setItem('marklyra-theme', 'marklyra-light');
    const write = prepareThemeChoice('marklyra-dark');
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => persistThemeChoice(write)).toThrow('QuotaExceededError');
    expect(storage.getItem(themeChoiceKey)).toBeNull();
    expect(storage.getItem('marklyra-theme')).toBe('marklyra-light');
  });
  it('rejects a silent dropped write without claiming persistence success', () => {
    storage.setItem(themeChoiceKey, record('marklyra-light', 'before'));
    const write = prepareThemeChoice('marklyra-dark');
    vi.spyOn(storage, 'setItem').mockImplementation(() => {});
    expect(() => persistThemeChoice(write)).toThrow('无法持久保存主题选择');
    expect(storedTheme()).toBe('marklyra-light');
  });
  it('rejects an invalid theme before preparing a revision', () => {
    expect(() => prepareThemeChoice('../night')).toThrow('主题名称无效');
    expect(storage.length).toBe(0);
  });
});

describe('theme storage compatibility', () => {
  it.each([
    ['dark', 'marklyra-dark'],
    ['marklyra-dark', 'marklyra-dark'],
    ['gothic', 'gothic'],
    ['../bad', 'marklyra-light'],
  ])('reads legacy %s when the new record is absent', (legacy, expected) => {
    storage.setItem('marklyra-theme', legacy);
    expect(storedTheme()).toBe(expected);
  });
  it('prefers a valid revisioned choice to a stale legacy mirror', () => {
    storage.setItem(themeChoiceKey, record('newsprint', 'winner'));
    storage.setItem('marklyra-theme', 'marklyra-dark');
    expect(storedTheme()).toBe('newsprint');
  });
  it('falls back to legacy for a record with an invalid schema', () => {
    storage.setItem(themeChoiceKey, JSON.stringify({ theme: 'marklyra-dark', revision: 1 }));
    storage.setItem('marklyra-theme', 'gothic');
    expect(storedTheme()).toBe('gothic');
  });
  it('uses a safe default when storage itself is unavailable', () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(storedTheme()).toBe('marklyra-light');
  });
});

it('preserves dark as a valid new catalog ID while migrating only the legacy alias', () => {
  expect(normalizeThemeId('dark')).toBe('dark');
  storage.setItem('marklyra-theme', 'dark');
  expect(storedTheme()).toBe('marklyra-dark');
  storage.setItem(themeChoiceKey, record('dark', 'custom-theme'));
  expect(storedTheme()).toBe('dark');
});

it('retains the legacy Night choice when the new record contains malformed JSON', () => {
  storage.setItem(themeChoiceKey, '{malformed');
  storage.setItem('marklyra-theme', 'marklyra-dark');
  expect(storedTheme()).toBe('marklyra-dark');
});

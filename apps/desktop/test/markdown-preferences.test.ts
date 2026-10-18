import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import {
  markdownPreferenceChange,
  markdownPreferencePatch,
  markdownPreferences,
  markdownPreferencesOptions,
  markdownPreferencesSnapshot,
} from '../src/services/markdownPreferences.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const baseline = () => ({
  schemaVersion: 1 as const,
  revision: 0,
  indentSize: 2 as const,
  prettyIndent: false,
});

describe('Native Markdown serialization preference storage contract', () => {
  it('maps only original style keys to validated numeric native values and original read aliases', () => {
    for (const [key, sdkKey, values] of [
      ['heading_style', 'headingStyle', [0, 1, 2, 3]],
      ['ul_style', 'ulStyle', [0, 1, 2]],
      ['ol_style', 'olStyle', [0, 1]],
    ] as const) {
      for (const value of values) {
        expect(markdownPreferencePatch(key, value)).toEqual({ [sdkKey]: value });
        const snapshot = markdownPreferencesSnapshot({ ...baseline(), [sdkKey]: value });
        expect(markdownPreferencesOptions(snapshot)).toMatchObject({
          [key]: value,
          [sdkKey]: value,
        });
      }
      for (const value of [-1, values.length, '1', null, true, undefined]) {
        expect(() => markdownPreferencePatch(key, value)).toThrow();
        expect(() => markdownPreferencesSnapshot({ ...baseline(), [sdkKey]: value })).toThrow();
      }
    }
    expect(() => markdownPreferencePatch('headingStyle', 1)).toThrow();
    expect(markdownPreferencesOptions(baseline())).toMatchObject({
      heading_style: 0,
      ul_style: 0,
      ol_style: 0,
    });
  });
  it('rejects a matching revision with the wrong style receipt', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce({ ...baseline(), revision: 1, headingStyle: 0 });
    await expect(markdownPreferences.request(0, { headingStyle: 3 })).rejects.toThrow('匹配');
    vi.mocked(invoke).mockResolvedValueOnce({
      ...baseline(),
      revision: 1,
      headingStyle: 3,
      ulStyle: 2,
      olStyle: 1,
    });
    await expect(
      markdownPreferences.request(0, { headingStyle: 3, ulStyle: 2, olStyle: 1 }),
    ).resolves.toMatchObject({ headingStyle: 3, ulStyle: 2, olStyle: 1 });
  });
  it('preserves Auto and all original numeric settings without coercion', () => {
    for (const indentSize of [-1, 0, 2, 3, 4, 5])
      expect(markdownPreferenceChange({ indentSize, prettyIndent: true })).toEqual({
        indentSize,
        prettyIndent: true,
      });
    expect(markdownPreferenceChange({ prettyIndent: false })).toEqual({ prettyIndent: false });
    for (const value of [
      {},
      null,
      [],
      { indentSize: '0' },
      { indentSize: 1 },
      { indentSize: 2.5 },
      { indentSize: 6 },
      { indentSize: null },
      { prettyIndent: undefined },
      { prettyIndent: 'false' },
      { prettyIndent: 0 },
      { arbitrary: true },
      JSON.parse('{"__proto__":true}'),
      { constructor: true },
      { text: 'source' },
      { history: [] },
    ])
      expect(() => markdownPreferenceChange(value)).toThrow();
  });
  it('rejects unknown, missing or malformed authoritative snapshots', () => {
    expect(markdownPreferencesSnapshot(baseline())).toEqual(baseline());
    for (const value of [
      { ...baseline(), indentSize: 0 },
      { ...baseline(), indentSize: -1 },
    ])
      expect(markdownPreferencesSnapshot(value).indentSize).toBe(value.indentSize);
    for (const value of [
      { ...baseline(), schemaVersion: 2 },
      { ...baseline(), revision: -1 },
      { ...baseline(), revision: 0.5 },
      { ...baseline(), revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...baseline(), indentSize: '2' },
      { ...baseline(), prettyIndent: null },
      { ...baseline(), source: 'private' },
      { revision: 0, indentSize: 2, prettyIndent: false },
      Object.create(baseline()),
    ])
      expect(() => markdownPreferencesSnapshot(value)).toThrow();
  });
  it('copies a validated partial without mutating a caller-owned object on rejection', () => {
    const value = { indentSize: 0 as const, prettyIndent: true };
    expect(markdownPreferenceChange(value)).not.toBe(value);
    expect(() => markdownPreferenceChange({ ...value, prettyIndent: null })).toThrow();
    expect(value).toEqual({ indentSize: 0, prettyIndent: true });
  });
  it('invokes exact Native CAS signatures without local mirrors or application claims', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce(baseline());
    expect(await markdownPreferences.get()).toEqual(baseline());
    expect(invoke).toHaveBeenLastCalledWith('get_markdown_preferences');
    vi.mocked(invoke).mockResolvedValueOnce({
      ...baseline(),
      revision: 1,
      indentSize: 0,
      prettyIndent: true,
    });
    expect(await markdownPreferences.put(0, { indentSize: 0, prettyIndent: true })).toMatchObject({
      revision: 1,
      indentSize: 0,
      prettyIndent: true,
    });
    expect(invoke).toHaveBeenLastCalledWith('put_markdown_preferences', {
      expectedRevision: 0,
      change: { indentSize: 0, prettyIndent: true },
    });
    const calls = vi.mocked(invoke).mock.calls.length;
    await expect(markdownPreferences.put(-1, { prettyIndent: false })).rejects.toThrow();
    await expect(markdownPreferences.put(1, {})).rejects.toThrow();
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
  });
  it('propagates CAS and storage failures instead of acknowledging a guessed snapshot', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('revision conflict'));
    await expect(markdownPreferences.put(0, { prettyIndent: true })).rejects.toThrow(
      'revision conflict',
    );
    vi.mocked(invoke).mockResolvedValueOnce({ ...baseline(), schemaVersion: 99 });
    await expect(markdownPreferences.get()).rejects.toThrow();
  });
  it('requires the scoped opener request receipt rather than a local put acknowledgement', async () => {
    vi.mocked(invoke).mockReset();
    const saved = { ...baseline(), revision: 1, indentSize: 4 as const };
    vi.mocked(invoke).mockResolvedValueOnce(saved);
    expect(await markdownPreferences.request(0, { indentSize: 4 })).toEqual(saved);
    expect(invoke).toHaveBeenLastCalledWith('request_preference_markdown', {
      expectedRevision: 0,
      change: { indentSize: 4 },
    });
    const token = 'de305d54-75b4-431b-adb2-eb6b9e546014';
    vi.mocked(invoke).mockResolvedValueOnce(saved);
    expect(await markdownPreferences.complete(token, null)).toEqual(saved);
    expect(invoke).toHaveBeenLastCalledWith('complete_preference_markdown', { token, error: null });
    vi.mocked(invoke).mockResolvedValueOnce(null);
    expect(await markdownPreferences.complete(token, 'SDK rejected')).toBeNull();
    const count = vi.mocked(invoke).mock.calls.length;
    await expect(markdownPreferences.request(-1, { indentSize: 4 })).rejects.toThrow();
    await expect(markdownPreferences.complete('arbitrary', null)).rejects.toThrow();
    expect(vi.mocked(invoke).mock.calls.length).toBe(count);
    vi.mocked(invoke).mockRejectedValueOnce(Error('stale opener'));
    await expect(markdownPreferences.request(0, { prettyIndent: true })).rejects.toThrow(
      'stale opener',
    );
    for (const saved of [baseline(), { ...baseline(), revision: 1 }]) {
      vi.mocked(invoke).mockResolvedValueOnce(saved);
      await expect(markdownPreferences.request(0, { indentSize: 4 })).rejects.toThrow('匹配');
    }
  });
});

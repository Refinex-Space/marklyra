import { defaultMarkLyraEditorPreferences } from '@marklyra/editor-runtime';
import { describe, expect, it } from 'vitest';
import {
  applicationEditorPreferences,
  applicationPreferenceChange,
  applicationPreferencesSnapshot,
} from '../src/features/settings/runtime-preferences/application-preferences.js';
import { preferenceChange } from '../src/features/settings/runtime-preferences/policy.js';

describe('native preference overrides', () => {
  it('keeps existing editor configuration when no native setting has been written', () => {
    const legacy = {
      ...defaultMarkLyraEditorPreferences,
      showLineNumbersForFence: true,
      codeIndentSize: 3 as const,
    };
    expect(
      applicationEditorPreferences({ schemaVersion: 1, revision: 0, values: {} }, legacy),
    ).toBe(legacy);
  });
  it('inverts the original no_mid_caret exactly once across UI, storage and SDK', () => {
    for (const value of [false, true]) {
      expect(preferenceChange('no_mid_caret', value)).toEqual({ key: 'no_mid_caret', value });
      const next = applicationEditorPreferences(
        { schemaVersion: 1, revision: 3, values: { no_mid_caret: value } },
        defaultMarkLyraEditorPreferences,
      );
      expect(next.scrollWithCursor).toBe(!value);
      expect(next.copyMarkdownByDefault).toBe(
        defaultMarkLyraEditorPreferences.copyMarkdownByDefault,
      );
    }
  });
  it('normalizes original numeric selects but rejects noncanonical native values or arbitrary capabilities', () => {
    expect(applicationPreferenceChange('codeIndentSize', '3')).toEqual({
      key: 'codeIndentSize',
      value: 3,
    });
    expect(applicationPreferenceChange('zoomFactor', '1.25')).toEqual({
      key: 'zoomFactor',
      value: 1.25,
    });
    for (const values of [
      { zoomFactor: '1.25' },
      { zoomFactor: 9 },
      { enableAutoSave: 1 },
      { execCommand: true },
      { line_ending_crlf: null },
    ])
      expect(() =>
        applicationPreferencesSnapshot({ schemaVersion: 1, revision: 1, values }),
      ).toThrow();
  });
  it('rejects future/corrupt snapshots without resetting old settings', () => {
    for (const value of [
      { schemaVersion: 2, revision: 1, values: {} },
      { schemaVersion: 1, revision: -1, values: {} },
      { schemaVersion: 1, revision: 0, values: {}, path: '/x' },
    ])
      expect(() => applicationPreferencesSnapshot(value)).toThrow();
  });
});

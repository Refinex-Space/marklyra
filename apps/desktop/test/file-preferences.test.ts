import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import {
  effectiveSaveFileOnSwitch,
  filePreferenceChange,
  filePreferencesOptions,
  filePreferencesSnapshot,
} from '../src/features/settings/runtime-preferences/file-preferences.js';
import {
  initialPreferencesOptions,
  preferenceChange,
} from '../src/features/settings/runtime-preferences/policy.js';
import { filePreferences } from '../src/services/file-preferences.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const snapshot = () => ({
  revision: 4,
  defaultExtension: 'md',
  saveFileOnSwitch: false,
  noRecentFiles: false,
  alwaysConfirmsChanges: true,
  actionWhenDropFile: '' as const,
  actionWhenDropFolder: '' as const,
  actionWhenDropImport: '' as const,
});

describe('native file preference contract', () => {
  it('accepts only bounded naming tokens without imitating original blur normalization', () => {
    for (const value of ['', 'md', 'custom', 'text', 'foo.bar', '-_A', 'A'.repeat(128)])
      expect(filePreferenceChange('defaultExtension', value)).toEqual({
        key: 'defaultExtension',
        value,
      });
    for (const value of [
      '.md',
      '..md',
      'foo..bar',
      'foo/bar',
      'foo\\bar',
      'foo ',
      ' foo',
      'a.',
      'a\nb',
      'a\0b',
      '中文',
      'x'.repeat(129),
      1,
      null,
    ])
      expect(() => filePreferenceChange('defaultExtension', value)).toThrow();
    for (const key of ['save_file_on_switch', 'noRecentFiles']) {
      for (const value of [true, false])
        expect(filePreferenceChange(key, value)).toEqual({ key, value });
      for (const value of [0, 1, 'true', 'false', null])
        expect(() => filePreferenceChange(key, value)).toThrow();
    }
    expect(() => filePreferenceChange('restoreWhenLaunch', 0)).toThrow();
    for (const key of ['actionWhenDropFile', 'actionWhenDropFolder', 'actionWhenDropImport']) {
      for (const value of ['', 'link'])
        expect(filePreferenceChange(key, value)).toEqual({ key, value });
      for (const value of ['open', '../link', false, null])
        expect(() => filePreferenceChange(key, value)).toThrow();
    }
  });

  it('keeps stored switch choice separate from the system-forced effective value', () => {
    for (const alwaysConfirmsChanges of [false, true])
      for (const saveFileOnSwitch of [false, true]) {
        const value = { ...snapshot(), alwaysConfirmsChanges, saveFileOnSwitch };
        expect(effectiveSaveFileOnSwitch(value)).toBe(!alwaysConfirmsChanges || saveFileOnSwitch);
        expect(filePreferencesOptions(value)).toEqual({
          defaultExtension: 'md',
          save_file_on_switch: saveFileOnSwitch,
          noRecentFiles: false,
          NSCloseAlwaysConfirmsChanges: alwaysConfirmsChanges,
          marklyraFileActions: true,
          actionWhenDropFile: '',
          actionWhenDropFolder: '',
          actionWhenDropImport: '',
        });
      }
  });

  it('rejects malformed native responses rather than inventing a persisted default', () => {
    expect(filePreferencesSnapshot(snapshot())).toEqual(snapshot());
    expect(filePreferencesSnapshot({ ...snapshot(), secretPath: '/private' })).not.toHaveProperty(
      'secretPath',
    );
    for (const value of [
      null,
      [],
      {},
      { ...snapshot(), revision: -1 },
      { ...snapshot(), revision: 1.5 },
      { ...snapshot(), revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...snapshot(), alwaysConfirmsChanges: 0 },
      { ...snapshot(), saveFileOnSwitch: 'false' },
      { ...snapshot(), noRecentFiles: null },
      { ...snapshot(), defaultExtension: '../md' },
    ])
      expect(() => filePreferencesSnapshot(value)).toThrow();
  });

  it('adds the real file and drop UI keys and read-only system metadata to the isolated policy', () => {
    expect(initialPreferencesOptions({})).toMatchObject({
      defaultExtension: 'md',
      save_file_on_switch: false,
      noRecentFiles: false,
      NSCloseAlwaysConfirmsChanges: true,
      marklyraFileActions: false,
    });
    const options = initialPreferencesOptions(
      filePreferencesOptions({ ...snapshot(), alwaysConfirmsChanges: false }),
    );
    expect(options).toMatchObject({
      NSCloseAlwaysConfirmsChanges: false,
      save_file_on_switch: false,
      marklyraFileActions: true,
    });
    expect(preferenceChange('defaultExtension', 'foo.bar')).toEqual({
      key: 'defaultExtension',
      value: 'foo.bar',
    });
    expect(() => preferenceChange('NSCloseAlwaysConfirmsChanges', false)).toThrow();
    expect(() => preferenceChange('marklyraFileActions', true)).toThrow();
    expect(() => preferenceChange('setting.askForClearRecentDocuments', true)).toThrow();
  });

  it('uses native get/CAS and returns only validated receipts', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce(snapshot());
    expect(await filePreferences.get()).toEqual(snapshot());
    expect(invoke).toHaveBeenLastCalledWith('get_file_preferences');
    vi.mocked(invoke).mockResolvedValueOnce({ ...snapshot(), revision: 5, noRecentFiles: true });
    expect(await filePreferences.put(4, { key: 'noRecentFiles', value: true })).toMatchObject({
      revision: 5,
      noRecentFiles: true,
    });
    expect(invoke).toHaveBeenLastCalledWith('put_file_preference', {
      expectedRevision: 4,
      change: { key: 'noRecentFiles', value: true },
    });
    const calls = vi.mocked(invoke).mock.calls.length;
    await expect(
      filePreferences.put(-1, { key: 'defaultExtension', value: 'md' }),
    ).rejects.toThrow();
    await expect(
      filePreferences.put(5, { key: 'defaultExtension', value: '../md' }),
    ).rejects.toThrow();
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
    vi.mocked(invoke).mockRejectedValueOnce(new Error('revision conflict'));
    await expect(filePreferences.put(4, { key: 'noRecentFiles', value: false })).rejects.toThrow(
      'revision conflict',
    );
  });

  it('delegates clear/cancel to the native dialog without carrying original command strings', async () => {
    vi.mocked(invoke).mockReset();
    for (const value of [true, false]) {
      vi.mocked(invoke).mockResolvedValueOnce(value);
      expect(await filePreferences.clearRecentHistory()).toBe(value);
      expect(invoke).toHaveBeenLastCalledWith('ask_clear_recent_history');
    }
    vi.mocked(invoke).mockResolvedValueOnce(null);
    await expect(filePreferences.clearRecentHistory()).rejects.toThrow('清除近期记录响应无效');
  });
});

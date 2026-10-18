import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import {
  initialPreferencesOptions,
  preferenceChange,
} from '../src/features/settings/runtime-preferences/policy.js';
import {
  initialStartupOptions,
  startupControlMode,
  startupPreferenceAction,
  startupPreferencesOptions,
  startupPreferencesSnapshot,
} from '../src/features/settings/runtime-preferences/startup-preferences.js';
import { startupPreferences } from '../src/services/startup.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const snapshot = () => ({ revision: 4, restoreWhenLaunch: 0 as const, pinFolder: null });

describe('startup preference actions and Native-only authority', () => {
  it('normalizes only the four exact original select strings', () => {
    for (const mode of [0, 1, 2, 3] as const) {
      expect(startupControlMode(String(mode))).toBe(mode);
      expect(startupPreferenceAction({ kind: 'set-mode', mode })).toEqual({
        kind: 'set-mode',
        mode,
      });
    }
    for (const mode of ['03', ' 3', '3.0', '-1', 4, 1.5, true, null])
      expect(() => startupControlMode(mode)).toThrow();
    expect(() => startupPreferenceAction({ kind: 'set-mode', mode: '3' })).toThrow();
  });
  it('refuses paths, callbacks, unknown operations and inherited action tags', () => {
    expect(startupPreferenceAction({ kind: 'choose-folder' })).toEqual({ kind: 'choose-folder' });
    for (const action of [
      null,
      [],
      { kind: 'choose-folder', path: '/private' },
      { kind: 'set-mode', mode: 3, pinFolder: '/private' },
      { kind: 'open-folder' },
      { kind: 'choose-folder', callback: 'run()' },
      Object.create({ kind: 'choose-folder' }),
    ])
      expect(() => startupPreferenceAction(action)).toThrow();
  });
  it('validates Native snapshots while projecting only the two read-only scalars', () => {
    const full = {
      revision: 5,
      restoreWhenLaunch: 3,
      pinFolder: '/Users/中文/Docs',
      documentGrant: 'secret',
    };
    expect(startupPreferencesSnapshot(full)).toEqual({
      revision: 5,
      restoreWhenLaunch: 3,
      pinFolder: '/Users/中文/Docs',
    });
    expect(startupPreferencesOptions(startupPreferencesSnapshot(full))).toEqual({
      marklyraStartupActions: true,
      restoreWhenLaunch: 3,
      pinFolder: '/Users/中文/Docs',
    });
    for (const value of [
      null,
      [],
      {},
      { ...snapshot(), revision: -1 },
      { ...snapshot(), revision: 1.5 },
      { ...snapshot(), restoreWhenLaunch: '3' },
      { ...snapshot(), restoreWhenLaunch: 4 },
      { ...snapshot(), pinFolder: '' },
      { ...snapshot(), pinFolder: false },
      { ...snapshot(), pinFolder: '/bad\0path' },
      { ...snapshot(), pinFolder: '/'.repeat(4097) },
    ])
      expect(() => startupPreferencesSnapshot(value)).toThrow();
  });
  it('keeps startup actions outside generic put and does not grant paths from initial metadata', () => {
    expect(initialStartupOptions({})).toEqual({
      restoreWhenLaunch: 0,
      pinFolder: null,
      marklyraStartupActions: false,
    });
    expect(
      initialPreferencesOptions({
        ...startupPreferencesOptions(snapshot()),
        documentGrant: 'hidden',
      }),
    ).toMatchObject({ restoreWhenLaunch: 0, pinFolder: null, marklyraStartupActions: true });
    for (const key of ['restoreWhenLaunch', 'pinFolder', 'marklyraStartupActions'])
      expect(() => preferenceChange(key, key === 'restoreWhenLaunch' ? 3 : '/private')).toThrow();
    expect(() => initialStartupOptions({ restoreWhenLaunch: '3' })).toThrow();
  });
  it('performs three exact Native calls and preserves cancel as null', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce(snapshot());
    expect(await startupPreferences.get()).toEqual(snapshot());
    expect(invoke).toHaveBeenLastCalledWith('get_startup_preferences');
    vi.mocked(invoke).mockResolvedValueOnce(null);
    expect(await startupPreferences.setMode(4, 3)).toBeNull();
    expect(invoke).toHaveBeenLastCalledWith('set_startup_mode', { expectedRevision: 4, mode: 3 });
    vi.mocked(invoke).mockResolvedValueOnce({
      revision: 5,
      restoreWhenLaunch: 3,
      pinFolder: '/chosen',
    });
    expect(await startupPreferences.chooseFolder(4)).toEqual({
      revision: 5,
      restoreWhenLaunch: 3,
      pinFolder: '/chosen',
    });
    expect(invoke).toHaveBeenLastCalledWith('choose_startup_folder', { expectedRevision: 4 });
    const calls = vi.mocked(invoke).mock.calls.length;
    await expect(startupPreferences.chooseFolder(-1)).rejects.toThrow();
    await expect(startupPreferences.setMode(1.5, 3)).rejects.toThrow();
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
  });
  it('rejects malformed replies and CAS failures without inventing a committed snapshot', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await expect(startupPreferences.chooseFolder(4)).rejects.toThrow();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('revision conflict'));
    await expect(startupPreferences.setMode(4, 1)).rejects.toThrow('revision conflict');
  });
});

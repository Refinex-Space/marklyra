import { invoke } from '@tauri-apps/api/core';
import {
  type StartupMode,
  type StartupPreferences,
  startupMode,
  startupPreferencesSnapshot,
} from '../features/settings/runtime-preferences/startup-preferences.js';

export type { StartupMode, StartupPreferences };

function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('启动设置版本无效。');
  return value;
}
function result(value: unknown): StartupPreferences | null {
  return value === null ? null : startupPreferencesSnapshot(value);
}

/** Native owns persistence, directory authorization and CAS. No localStorage mirror. */
export const startupPreferences = {
  async get(): Promise<StartupPreferences> {
    return startupPreferencesSnapshot(await invoke<unknown>('get_startup_preferences'));
  },
  async setMode(expectedRevision: number, mode: StartupMode): Promise<StartupPreferences | null> {
    return result(
      await invoke<unknown>('set_startup_mode', {
        expectedRevision: revision(expectedRevision),
        mode: startupMode(mode),
      }),
    );
  },
  async chooseFolder(expectedRevision: number): Promise<StartupPreferences | null> {
    return result(
      await invoke<unknown>('choose_startup_folder', {
        expectedRevision: revision(expectedRevision),
      }),
    );
  },
};

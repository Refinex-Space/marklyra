import { invoke } from '@tauri-apps/api/core';
import {
  type FilePreferenceChange,
  type FilePreferences,
  filePreferenceChange,
  filePreferencesSnapshot,
} from '../features/settings/runtime-preferences/file-preferences.js';

export type { FilePreferenceChange, FilePreferences };

/** Rust owns persistence, CAS and the native clear dialog. Never mirrors these values in LS. */
export const filePreferences = {
  async get(): Promise<FilePreferences> {
    return filePreferencesSnapshot(await invoke<unknown>('get_file_preferences'));
  },
  async put(expectedRevision: number, change: FilePreferenceChange): Promise<FilePreferences> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error('文件设置版本无效。');
    const checked = filePreferenceChange(change.key, change.value);
    return filePreferencesSnapshot(
      await invoke<unknown>('put_file_preference', {
        expectedRevision,
        change: checked,
      }),
    );
  },
  async clearRecentHistory(): Promise<boolean> {
    const result = await invoke<unknown>('ask_clear_recent_history');
    if (typeof result !== 'boolean') throw new Error('清除近期记录响应无效。');
    return result;
  },
};

import { invoke } from '@tauri-apps/api/core';
import {
  type ExportPreferenceChange,
  type ExportPreferencesSnapshot,
  exportPreferenceChange,
  exportPreferencesSnapshot,
} from '../features/settings/runtime-preferences/export-preferences.js';

export type { ExportPreferenceChange, ExportPreferencesSnapshot };

/** Persistence and revision ownership stay in Rust; read failures block export. */
export const exportPreferences = {
  async get(): Promise<ExportPreferencesSnapshot> {
    return exportPreferencesSnapshot(await invoke<unknown>('get_export_preferences'));
  },
  async put(
    expectedRevision: number,
    change: ExportPreferenceChange,
  ): Promise<ExportPreferencesSnapshot> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error('导出设置版本无效。');
    const checked = exportPreferenceChange(change.key, change.value);
    const result = exportPreferencesSnapshot(
      await invoke<unknown>('put_export_preferences', {
        expectedRevision,
        change: checked,
      }),
    );
    const actual =
      checked.key === 'export.html'
        ? result.html
        : checked.key === 'export.pdf'
          ? result.pdf
          : checked.key === 'export.image'
            ? (result.image ?? {})
            : (result.pandocPath ?? '');
    if (checked.key === 'pandocPath') {
      if (result.revision !== expectedRevision + 1 || actual !== checked.value)
        throw new Error('Pandoc路径保存未确认。');
      return result;
    }
    const expected = checked.value as Record<string, unknown>;
    if (
      result.revision !== expectedRevision + 1 ||
      Object.keys(actual).length !== Object.keys(expected).length ||
      Object.entries(actual).some(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(expected[key]),
      )
    )
      throw new Error('导出设置保存结果未确认，请重新打开设置；不得重放。');
    return result;
  },
};

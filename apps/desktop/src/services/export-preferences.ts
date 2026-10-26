import { invoke } from '@tauri-apps/api/core';
import {
  type ExportPreferenceChange,
  type ExportPreferencesSnapshot,
  exportPreferenceChange,
  exportPreferencesSnapshot,
} from '../features/export/preferences.js';

export type { ExportPreferenceChange, ExportPreferencesSnapshot };

function committed(snapshot: ExportPreferencesSnapshot, change: ExportPreferenceChange): unknown {
  switch (change.key) {
    case 'export.general':
      return snapshot.general;
    case 'export.html':
      return snapshot.html;
    case 'export.pdf':
      return snapshot.pdf;
    case 'export.image':
      return snapshot.image;
    case 'export.formats':
      return snapshot.formats;
    case 'export.custom':
      return snapshot.custom;
    case 'pandocPath':
      return snapshot.pandocPath;
  }
}

/** Structural equality that ignores object key order. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = Object.entries(left);
    const b = Object.entries(right);
    return (
      a.length === b.length &&
      a.every(
        ([key, value]) => Object.hasOwn(right, key) && sameValue(value, Reflect.get(right, key)),
      )
    );
  }
  return left === right;
}

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
    // The host answers with the record it committed. Anything other than exactly the requested
    // value at the next revision is an unconfirmed write that must not be replayed.
    if (
      result.revision !== expectedRevision + 1 ||
      !sameValue(committed(result, checked), checked.value)
    )
      throw new Error('导出设置保存结果未确认，请重新打开设置；不得重放。');
    return result;
  },
};

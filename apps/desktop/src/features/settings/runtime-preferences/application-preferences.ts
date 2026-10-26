import type { MarkLyraEditorPreferences } from '@marklyra/editor-runtime';
import { defaultMarkLyraEditorPreferences } from '@marklyra/editor-runtime';
import { validThemeId } from '../../themes/model.js';
import {
  editorPreferenceKeys,
  editorPreferencesOptions,
  isEditorPreferenceKey,
  updateEditorPreference,
} from './editor-preferences.js';
import { isStartupEditorKey, startupEditorKeys } from './startup-editor-preferences.js';

export const applicationPreferenceKeys = [
  ...editorPreferenceKeys,
  ...startupEditorKeys,
  'enableAutoSave',
  'zoomFactor',
  'darkTheme',
  'useSeparateDarkTheme',
  'quitAfterWindowClose',
  'debugMode',
  'can_collapse_outline_panel',
  'wordsPerMinute',
  'customWordsPerMinute',
  'always_show_wordcount',
] as const;
export type ApplicationPreferenceKey = (typeof applicationPreferenceKeys)[number];
export type ApplicationPreferenceValue = boolean | number | string;
export interface ApplicationPreferencesSnapshot {
  schemaVersion: 1;
  revision: number;
  values: Partial<Record<ApplicationPreferenceKey, ApplicationPreferenceValue>>;
}
export function isApplicationPreferenceKey(key: string): key is ApplicationPreferenceKey {
  return applicationPreferenceKeys.includes(key as ApplicationPreferenceKey);
}
export function applicationPreferenceChange(
  key: unknown,
  value: unknown,
): { key: ApplicationPreferenceKey; value: ApplicationPreferenceValue } {
  if (key === 'auto_numbering_for_math' && (value === '' || value === 'ams' || value === 'all'))
    return { key, value };
  if (
    key === 'darkTheme' &&
    typeof value === 'string' &&
    value.endsWith('.css') &&
    validThemeId(value.slice(0, -4))
  )
    return { key, value };
  if (
    (key === 'debugMode' ||
      key === 'quitAfterWindowClose' ||
      key === 'useSeparateDarkTheme' ||
      key === 'can_collapse_outline_panel') &&
    typeof value === 'boolean'
  )
    return { key, value };
  if (
    typeof key === 'string' &&
    isStartupEditorKey(key) &&
    key !== 'auto_numbering_for_math' &&
    typeof value === 'boolean'
  )
    return { key, value };
  if (key === 'wordsPerMinute') {
    const speed = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;
    if (typeof speed === 'number' && Number.isInteger(speed) && speed >= 1 && speed <= 999)
      return { key, value: speed } as const;
    throw Error('阅读速度无效。');
  }
  if (
    (key === 'customWordsPerMinute' || key === 'always_show_wordcount') &&
    typeof value === 'boolean'
  )
    return { key, value };
  if (key === 'zoomFactor') {
    const factor = typeof value === 'string' ? Number(value) : value;
    if (
      typeof factor === 'number' &&
      [0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5].includes(factor)
    )
      return { key, value: factor } as const;
    throw Error('页面缩放比例无效。');
  }
  if (key === 'enableAutoSave' && typeof value === 'boolean') return { key, value } as const;
  if (typeof key !== 'string' || !isEditorPreferenceKey(key)) throw Error('应用偏好字段无效。');
  const preferences = updateEditorPreference(defaultMarkLyraEditorPreferences, key, value);
  return { key, value: editorPreferencesOptions(preferences)[key] as ApplicationPreferenceValue };
}
export function applicationPreferencesSnapshot(value: unknown): ApplicationPreferencesSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('应用偏好响应无效。');
  const input = value as Record<string, unknown>;
  if (
    input.schemaVersion !== 1 ||
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    Object.keys(input).length !== 3 ||
    !input.values ||
    typeof input.values !== 'object' ||
    Array.isArray(input.values)
  )
    throw Error('应用偏好损坏或版本不受支持。');
  const values: ApplicationPreferencesSnapshot['values'] = {};
  for (const [key, item] of Object.entries(input.values)) {
    const checked = applicationPreferenceChange(key, item);
    // Native storage has canonical types; the select's string coercion is UI-only.
    if (checked.value !== item) throw Error('应用偏好响应值无效。');
    values[checked.key] = checked.value;
  }
  return { schemaVersion: 1, revision: input.revision, values };
}
export function applicationEditorPreferences(
  snapshot: ApplicationPreferencesSnapshot,
  legacy: MarkLyraEditorPreferences,
): MarkLyraEditorPreferences {
  let value = legacy;
  for (const [key, input] of Object.entries(snapshot.values))
    if (isEditorPreferenceKey(key)) value = updateEditorPreference(value, key, input);
  return value;
}

interface StatisticsPreferences {
  wordsPerMinute: number;
  customWordsPerMinute: boolean;
  alwaysShowWordCount: boolean;
}
export function applicationStatisticsPreferences(
  snapshot: ApplicationPreferencesSnapshot | null,
  legacy: StatisticsPreferences,
): StatisticsPreferences {
  return {
    wordsPerMinute: Number(snapshot?.values.wordsPerMinute ?? legacy.wordsPerMinute),
    customWordsPerMinute:
      (snapshot?.values.customWordsPerMinute as boolean | undefined) ?? legacy.customWordsPerMinute,
    alwaysShowWordCount:
      (snapshot?.values.always_show_wordcount as boolean | undefined) ?? legacy.alwaysShowWordCount,
  };
}

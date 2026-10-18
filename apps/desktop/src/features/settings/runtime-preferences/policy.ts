import { defaultMarkLyraEditorPreferences } from '@marklyra/editor-runtime';
import { validThemeId } from '../../themes/model.js';
import { validateImageStorageFolder } from '../image-storage.js';
import { applicationPreferenceChange } from './application-preferences.js';
import {
  editorPreferenceKeys,
  editorPreferencesOptions,
  isEditorPreferenceKey,
  updateEditorPreference,
} from './editor-preferences.js';
import {
  type ExportPreferenceValue,
  exportPreferenceChange,
  exportPreferenceKeys,
  isExportPreferenceKey,
} from './export-preferences.js';
import {
  filePreferenceChange,
  filePreferenceKeys,
  isFilePreferenceKey,
} from './file-preferences.js';
import { checkedFileTypeList } from './file-types.js';
import {
  isMarkdownPreferenceKey,
  markdownPreferenceKeys,
  markdownPreferencePatch,
} from './markdown-preferences.js';
import {
  isStartupEditorKey,
  startupEditorKeys,
  startupEditorOptions,
} from './startup-editor-preferences.js';
import { initialStartupOptions } from './startup-preferences.js';

export const preferencesProtocol = 'marklyra/preferences/v1';
export const preferenceThemes = [
  'github.css',
  'gothic.css',
  'newsprint.css',
  'night.css',
  'pixyll.css',
  'whitey.css',
] as const;
export const preferenceKeys = [
  'theme',
  'image_save_location',
  'custom_image_save_location',
  'no_image_move_for_local',
  'apply_image_move_for_web',
  'use_relative_path_for_img',
  'relativePathWithDot',
  'wordsPerMinute',
  'customWordsPerMinute',
  'always_show_wordcount',
  'enableAutoSave',
  'zoomFactor',
  'darkTheme',
  'useSeparateDarkTheme',
  'quitAfterWindowClose',
  'can_collapse_outline_panel',
  ...editorPreferenceKeys,
  ...startupEditorKeys,
  ...filePreferenceKeys,
  ...markdownPreferenceKeys,
  ...exportPreferenceKeys,
] as const;
export type PreferenceKey = (typeof preferenceKeys)[number];
export type PreferenceValue = string | number | boolean | string[] | ExportPreferenceValue;
export type InitialPreferencesOptions = Readonly<Record<string, unknown>>;
export type PreferenceChange = { key: PreferenceKey; value: PreferenceValue };
export type PreferenceAction =
  | 'choose-pandoc'
  | 'close'
  | 'open-theme-folder'
  | 'theme-gallery'
  | 'clear-recent-history'
  | 'reset-dialog-warnings'
  | 'startup';

export function preferenceThemeFiles(value: unknown): readonly string[] {
  if (value === undefined) return preferenceThemes;
  if (!Array.isArray(value) || value.length > 1030) throw new Error('主题列表无效。');
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.endsWith('.css') || !validThemeId(entry.slice(0, -4)))
      throw new Error('主题列表无效。');
    if (!result.includes(entry)) result.push(entry);
  }
  if (!result.length) throw new Error('主题列表为空。');
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function preferenceChange(
  key: unknown,
  value: unknown,
  themes: readonly string[] = preferenceThemes,
): PreferenceChange {
  if (typeof key !== 'string' || !preferenceKeys.includes(key as PreferenceKey))
    throw new Error('此设置暂不支持，不能保存。');
  if (isStartupEditorKey(key)) return applicationPreferenceChange(key, value);
  if (isExportPreferenceKey(key)) return exportPreferenceChange(key, value);
  if (
    key === 'quitAfterWindowClose' ||
    key === 'zoomFactor' ||
    key === 'useSeparateDarkTheme' ||
    key === 'can_collapse_outline_panel'
  )
    return applicationPreferenceChange(key, value);
  if (key === 'darkTheme') {
    if (typeof value !== 'string' || !themes.includes(value))
      throw Error('主题列表中不存在该深色主题。');
    return applicationPreferenceChange(key, value);
  }
  if (isMarkdownPreferenceKey(key)) {
    const valueForKey = Object.values(markdownPreferencePatch(key, value))[0];
    if (valueForKey === undefined) throw new Error('Markdown偏好值无效。');
    return { key, value: valueForKey };
  }
  if (isFilePreferenceKey(key)) return filePreferenceChange(key, value);
  if (isEditorPreferenceKey(key)) {
    const settings = updateEditorPreference(defaultMarkLyraEditorPreferences, key, value);
    return { key, value: editorPreferencesOptions(settings)[key] as number | boolean | string };
  }
  switch (key as PreferenceKey) {
    case 'theme':
      if (typeof value === 'string' && themes.includes(value)) return { key: 'theme', value };
      break;
    case 'image_save_location':
      if (
        ['', 'folder', 'assert', 'per-file-assert', 'custom'].includes(String(value)) &&
        typeof value === 'string'
      )
        return { key: 'image_save_location', value };
      break;
    case 'custom_image_save_location': {
      if (typeof value !== 'string') break;
      const path = value.startsWith('./') ? value.slice(2) : value;
      const result = validateImageStorageFolder(path);
      if (result.valid) return { key: 'custom_image_save_location', value };
      throw new Error(result.message);
    }
    case 'wordsPerMinute':
      if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999)
        return { key: 'wordsPerMinute', value };
      break;
    case 'enableAutoSave':
    case 'no_image_move_for_local':
    case 'apply_image_move_for_web':
    case 'use_relative_path_for_img':
    case 'relativePathWithDot':
    case 'customWordsPerMinute':
    case 'always_show_wordcount':
      if (typeof value === 'boolean') return { key: key as PreferenceKey, value };
      break;
  }
  throw new Error('设置值无效，原设置未修改。');
}

/** Only host-owned values and bounded export objects enter the isolated page. */
export function initialPreferencesOptions(
  input: InitialPreferencesOptions,
): Record<string, unknown> {
  const themes = preferenceThemeFiles(input.allThemes);
  const result: Record<string, unknown> = {
    locale: input.locale === 'Base' || input.locale === 'en' ? 'Base' : 'zh-Hans',
    osVersion:
      typeof input.osVersion === 'string' && /^\d+(?:\.\d+){0,3}$/.test(input.osVersion)
        ? input.osVersion
        : '11.0',
    allThemes: [...themes],
    marklyraThemeActions: input.marklyraThemeActions === true,
    marklyraReadingSpeedActions: input.marklyraReadingSpeedActions === true,
    marklyraFileActions: input.marklyraFileActions === true,
    marklyraFileTypeActions: input.marklyraFileTypeActions === true,
    supportedFileTypes:
      input.marklyraFileTypeActions === true ? checkedFileTypeList(input.supportedFileTypes) : [],
    disabledFileTypes: [],
    marklyraMarkdownActions: input.marklyraMarkdownActions === true,
    marklyraExportActions: input.marklyraExportActions === true,
    'export.html': {},
    'export.pdf': {},
    'export.image': {},
    pandocPath: '',
    indentSize: 2,
    prettyIndent: false,
    heading_style: 0,
    ul_style: 0,
    ol_style: 0,
    NSCloseAlwaysConfirmsChanges:
      typeof input.NSCloseAlwaysConfirmsChanges === 'boolean'
        ? input.NSCloseAlwaysConfirmsChanges
        : true,
    defaultExtension: 'md',
    save_file_on_switch: false,
    noRecentFiles: false,
    actionWhenDropFile: '',
    actionWhenDropFolder: '',
    actionWhenDropImport: '',
    canUseDarkMode: true,
    useSeparateDarkTheme: false,
    darkTheme: 'night.css',
    can_collapse_outline_panel: true,
    quitAfterWindowClose: false,
    use_seamless_window: true,
    theme: 'github.css',
    image_save_location: 'assert',
    custom_image_save_location: './assets',
    wordsPerMinute: 382,
    customWordsPerMinute: false,
    always_show_wordcount: true,
    ...editorPreferencesOptions(defaultMarkLyraEditorPreferences),
    ...startupEditorOptions({}),
    ...initialStartupOptions(input),
    // Read-only fields show this product's present behavior, not alleged original user settings.
    no_image_move_for_local: false,
    apply_image_move_for_web: false,
    use_relative_path_for_img: true,
    relativePathWithDot: false,
    allow_image_upload: false,
    enableAutoUpdate: false,
    send_usage_info: false,
  };
  for (const key of preferenceKeys) {
    if (input[key] === undefined) continue;
    const change = preferenceChange(key, input[key], themes);
    result[change.key] = change.value;
  }
  // The runtime getValue checks the camel-case prop before reading the stored key.
  result.canCollapseOutlinePanel = result.can_collapse_outline_panel;
  result.headingStyle = result.heading_style;
  result.ulStyle = result.ul_style;
  result.olStyle = result.ol_style;
  return result;
}

export function runtimePreferencesUrl(value: string, base: string, parentOrigin: string): URL {
  const url = new URL(value, base);
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  const runtimeHttps =
    ['http:', 'https:'].includes(url.protocol) && url.hostname === 'marklyra.localhost';
  if (
    !localHttp &&
    !runtimeHttps &&
    !(url.protocol === 'marklyra:' && url.hostname === 'localhost')
  )
    throw new Error('偏好设置只允许隔离的本机运行资源。');
  if (url.origin !== 'null' && url.origin === parentOrigin)
    throw new Error('偏好设置页面必须与宿主使用不同的 origin。');
  return url;
}

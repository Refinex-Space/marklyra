import {
  baseFileTypes,
  checkedFileTypeList,
  fileTypeCatalog,
  fileTypeEnabled,
} from './file-types.js';
export const filePreferenceKeys = [
  'defaultExtension',
  'disabledFileTypes',
  'removeCustomFileType',
  'save_file_on_switch',
  'noRecentFiles',
  'actionWhenDropFile',
  'actionWhenDropFolder',
  'actionWhenDropImport',
] as const;
export type FilePreferenceKey = (typeof filePreferenceKeys)[number];
export type FilePreferenceChange =
  | { key: 'defaultExtension'; value: string }
  | { key: 'disabledFileTypes'; value: string[] }
  | { key: 'removeCustomFileType'; value: string }
  | {
      key: 'actionWhenDropFile' | 'actionWhenDropFolder' | 'actionWhenDropImport';
      value: '' | 'link';
    }
  | { key: 'save_file_on_switch' | 'noRecentFiles'; value: boolean };
export interface FilePreferences {
  revision: number;
  defaultExtension: string;
  disabledFileTypes?: string[];
  supportedFileTypes?: string[];
  saveFileOnSwitch: boolean;
  noRecentFiles: boolean;
  alwaysConfirmsChanges: boolean;
  actionWhenDropFile?: '' | 'link';
  actionWhenDropFolder?: '' | 'link';
  actionWhenDropImport?: '' | 'link';
}

export function isFilePreferenceKey(key: string): key is FilePreferenceKey {
  return filePreferenceKeys.includes(key as FilePreferenceKey);
}

/** File naming metadata only. No path or filesystem authority crosses this boundary. */
export function filePreferenceChange(key: unknown, value: unknown): FilePreferenceChange {
  if (
    key === 'actionWhenDropFile' ||
    key === 'actionWhenDropFolder' ||
    key === 'actionWhenDropImport'
  ) {
    if (value === '' || value === 'link') return { key, value };
    throw new Error('拖入文件设置无效。');
  }
  if (key === 'disabledFileTypes') return { key, value: checkedFileTypeList(value) };
  if (key === 'removeCustomFileType') {
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 128 &&
      /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(value) &&
      !baseFileTypes.includes(value)
    )
      return { key, value };
    throw Error('只能删除自定义文件类型。');
  }
  if (key === 'defaultExtension') {
    if (
      typeof value === 'string' &&
      value.length <= 128 &&
      (value === '' || /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i.test(value))
    )
      return { key, value };
    throw new Error('默认扩展名无效。');
  }
  if ((key === 'save_file_on_switch' || key === 'noRecentFiles') && typeof value === 'boolean')
    return { key, value };
  throw new Error('文件设置无效。');
}

export function filePreferencesSnapshot(value: unknown): FilePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('文件设置响应无效。');
  const input = value as Record<string, unknown>;
  if (
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    typeof input.saveFileOnSwitch !== 'boolean' ||
    typeof input.noRecentFiles !== 'boolean' ||
    typeof input.alwaysConfirmsChanges !== 'boolean'
  )
    throw new Error('文件设置响应无效。');
  const extension = filePreferenceChange('defaultExtension', input.defaultExtension);
  const drops: Pick<
    FilePreferences,
    'actionWhenDropFile' | 'actionWhenDropFolder' | 'actionWhenDropImport'
  > = {};
  for (const key of [
    'actionWhenDropFile',
    'actionWhenDropFolder',
    'actionWhenDropImport',
  ] as const) {
    const value = input[key] === undefined ? '' : input[key];
    if (value !== '' && value !== 'link') throw new Error('拖入文件设置响应无效。');
    drops[key] = value;
  }
  if (extension.key !== 'defaultExtension') throw new Error('文件设置响应无效。');
  const types: Pick<FilePreferences, 'disabledFileTypes' | 'supportedFileTypes'> = {};
  if (input.supportedFileTypes !== undefined || input.disabledFileTypes !== undefined) {
    types.supportedFileTypes = checkedFileTypeList(input.supportedFileTypes);
    types.disabledFileTypes = checkedFileTypeList(input.disabledFileTypes);
    if (
      baseFileTypes.some((id) => !types.supportedFileTypes?.includes(id)) ||
      types.disabledFileTypes.some((id) => !types.supportedFileTypes?.includes(id)) ||
      !fileTypeEnabled(extension.value.toLowerCase() || 'md', {
        defaultExtension: extension.value,
        ...types,
      })
    )
      throw Error('文件类型设置响应无效。');
  }
  return {
    revision: input.revision,
    defaultExtension: extension.value,
    saveFileOnSwitch: input.saveFileOnSwitch,
    noRecentFiles: input.noRecentFiles,
    alwaysConfirmsChanges: input.alwaysConfirmsChanges,
    ...drops,
    ...types,
  };
}

export function effectiveSaveFileOnSwitch(value: FilePreferences): boolean {
  return value.saveFileOnSwitch;
}

export function filePreferencesOptions(value: FilePreferences): Record<string, unknown> {
  return {
    defaultExtension: value.defaultExtension,
    ...(value.supportedFileTypes
      ? {
          disabledFileTypes: value.disabledFileTypes ?? [],
          supportedFileTypes: fileTypeCatalog(value),
          marklyraFileTypeActions: true,
        }
      : {}),
    save_file_on_switch: value.saveFileOnSwitch,
    noRecentFiles: value.noRecentFiles,
    // Adapt the legacy control: MarkLyra owns this choice independently of macOS.
    NSCloseAlwaysConfirmsChanges: true,
    marklyraFileActions: true,
    actionWhenDropFile: value.actionWhenDropFile ?? '',
    actionWhenDropFolder: value.actionWhenDropFolder ?? '',
    actionWhenDropImport: value.actionWhenDropImport ?? '',
  };
}

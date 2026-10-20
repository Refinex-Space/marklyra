/**
 * Export preferences as the host stores them. Rust is the authority for every rule here; this
 * module only rejects malformed values early and gives the settings page and the export flow
 * one typed view of the confirmed record.
 */
export const pandocFormatKeys = [
  'docx',
  'odt',
  'rtf',
  'epub',
  'latex',
  'wiki',
  'rst',
  'textile',
  'opml',
] as const;
export type PandocFormatKey = (typeof pandocFormatKeys)[number];
export const exportThemes = ['', 'marklyra-light', 'marklyra-dark'] as const;
export type ExportTheme = (typeof exportThemes)[number];
export const exportPaperSizes = [
  '',
  'A5',
  'A4',
  'A3',
  'Letter',
  'Legal',
  'Tabloid',
  'custom',
] as const;
export type ExportPaperSize = (typeof exportPaperSizes)[number];

export const exportPreferenceKeys = [
  'export.general',
  'export.html',
  'export.pdf',
  'export.image',
  'export.formats',
  'export.custom',
  'pandocPath',
] as const;
export type ExportPreferenceKey = (typeof exportPreferenceKeys)[number];

export interface GeneralExportPreferences {
  folderMode?: 'document' | 'custom';
  folder?: string;
  openLocation?: boolean;
  openFile?: boolean;
}
export interface HtmlExportPreferences {
  exportTheme?: ExportTheme;
  extraCss?: string;
}
export interface PdfExportPreferences extends HtmlExportPreferences {
  paper?: ExportPaperSize;
  'paper.custom'?: [number, number];
  'paper.margin'?: '' | 'custom';
  'paper.marginTop'?: number;
  'paper.marginBottom'?: number;
  'paper.marginLeft'?: number;
  'paper.marginRight'?: number;
  landscape?: boolean;
  splitPages?: boolean;
  bookmarks?: boolean;
  background?: boolean;
  author?: string;
  headerLeft?: string;
  header?: string;
  headerRight?: string;
  footerLeft?: string;
  footer?: string;
  footerRight?: string;
}
export interface ImageExportPreferences extends HtmlExportPreferences {
  imageWidth?: number;
  quality?: number;
  useThemeFontSize?: number;
  imageFontSize?: number;
}
export interface PandocFormatPreferences {
  extraArguments?: string;
  toc?: boolean;
  tocDepth?: number;
  numberSections?: boolean;
  /** Set only through a native file dialog. */
  referenceDoc?: string;
  /** Set only through a native file dialog. */
  template?: string;
}
export interface CustomExportPreference {
  id: string;
  name: string;
  writer: string;
  extension: string;
  options: PandocFormatPreferences;
}
export type PandocFormatMap = Partial<Record<PandocFormatKey, PandocFormatPreferences>>;

export interface ExportPreferencesSnapshot {
  schemaVersion: 1;
  revision: number;
  general: GeneralExportPreferences;
  html: HtmlExportPreferences;
  pdf: PdfExportPreferences;
  image: ImageExportPreferences;
  formats: PandocFormatMap;
  custom: CustomExportPreference[];
  pandocPath: string;
}
export type ExportPreferenceChange =
  | { key: 'export.general'; value: GeneralExportPreferences }
  | { key: 'export.html'; value: HtmlExportPreferences }
  | { key: 'export.pdf'; value: PdfExportPreferences }
  | { key: 'export.image'; value: ImageExportPreferences }
  | { key: 'export.formats'; value: PandocFormatMap }
  | { key: 'export.custom'; value: CustomExportPreference[] }
  | { key: 'pandocPath'; value: string };
/** The target of a native "Choose…" dialog whose answer the host stores itself. */
export type ExportPathTarget =
  | { kind: 'folder' }
  | { kind: 'referenceDoc'; format: string }
  | { kind: 'template'; format: string };

export const MAX_CUSTOM_EXPORTS = 12;
export const MAX_EXPORT_TEXT = 200;
export const MAX_EXPORT_CSS_BYTES = 16 * 1024;
export const MAX_EXTRA_ARGUMENT_BYTES = 1024;
const blockedExtensions = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'scr',
  'msi',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'lnk',
  'dll',
  'sh',
  'jar',
  'app',
  'command',
]);
const blockedWriters = new Set(['pdf', 'chunkedhtml', 'lua']);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function boolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
function integer(value: unknown, low: number, high: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high;
}
function finite(value: unknown, low: number, high: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
}
function text(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    [...value].length <= limit &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused.
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
function css(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    new TextEncoder().encode(value).byteLength <= MAX_EXPORT_CSS_BYTES &&
    !/[\0<]/.test(value)
  );
}
function path(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 4096 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused.
    !/[\u0000-\u001f\u007f]/.test(value) &&
    (value === '' || /^(?:\/|[a-z]:[\\/]|\\\\)/i.test(value))
  );
}
function fail(message: string): never {
  throw new Error(message);
}
function exact<T extends object>(
  value: unknown,
  rules: Record<string, (item: unknown) => boolean>,
  message: string,
): T {
  if (!record(value)) fail(message);
  const result: Record<string, unknown> = {};
  for (const [field, item] of Object.entries(value)) {
    const rule = rules[field];
    if (!rule) fail('此导出设置暂不支持。');
    if (!rule(item)) fail(message);
    result[field] = Array.isArray(item) ? [...item] : item;
  }
  return result as T;
}

const themeRule = (item: unknown) => exportThemes.includes(item as ExportTheme);
const marginRule = (item: unknown) => finite(item, 0, 500);
const generalRules: Record<string, (item: unknown) => boolean> = {
  folderMode: (item) => item === 'document' || item === 'custom',
  folder: path,
  openLocation: boolean,
  openFile: boolean,
};
const htmlRules: Record<string, (item: unknown) => boolean> = {
  exportTheme: themeRule,
  extraCss: css,
};
const pdfRules: Record<string, (item: unknown) => boolean> = {
  ...htmlRules,
  paper: (item) => exportPaperSizes.includes(item as ExportPaperSize),
  'paper.custom': (item) =>
    Array.isArray(item) && item.length === 2 && item.every((n) => finite(n, 10, 2000)),
  'paper.margin': (item) => item === '' || item === 'custom',
  'paper.marginTop': marginRule,
  'paper.marginBottom': marginRule,
  'paper.marginLeft': marginRule,
  'paper.marginRight': marginRule,
  landscape: boolean,
  splitPages: boolean,
  bookmarks: boolean,
  background: boolean,
  author: (item) => text(item, 100),
  headerLeft: (item) => text(item, MAX_EXPORT_TEXT),
  header: (item) => text(item, MAX_EXPORT_TEXT),
  headerRight: (item) => text(item, MAX_EXPORT_TEXT),
  footerLeft: (item) => text(item, MAX_EXPORT_TEXT),
  footer: (item) => text(item, MAX_EXPORT_TEXT),
  footerRight: (item) => text(item, MAX_EXPORT_TEXT),
};
const imageRules: Record<string, (item: unknown) => boolean> = {
  ...htmlRules,
  imageWidth: (item) => integer(item, 64, 4096),
  quality: (item) => integer(item, 0, 3),
  useThemeFontSize: (item) => item === 0 || item === 1,
  imageFontSize: (item) => integer(item, 6, 128),
};
const pandocRules: Record<string, (item: unknown) => boolean> = {
  extraArguments: (item) => typeof item === 'string' && item.length <= MAX_EXTRA_ARGUMENT_BYTES,
  toc: boolean,
  tocDepth: (item) => integer(item, 1, 6),
  numberSections: boolean,
  referenceDoc: path,
  template: path,
};

export function isExportPreferenceKey(key: string): key is ExportPreferenceKey {
  return exportPreferenceKeys.includes(key as ExportPreferenceKey);
}
export function isPandocFormatKey(key: string): key is PandocFormatKey {
  return pandocFormatKeys.includes(key as PandocFormatKey);
}
/** The Pandoc writer behind a built-in format key. */
export function pandocWriter(key: PandocFormatKey): string {
  return key === 'wiki' ? 'mediawiki' : key;
}
function pandocOptions(value: unknown): PandocFormatPreferences {
  return exact<PandocFormatPreferences>(value, pandocRules, '格式导出设置无效，原设置未修改。');
}
function pandocFormats(value: unknown): PandocFormatMap {
  if (!record(value)) fail('格式导出设置无效，原设置未修改。');
  const result: PandocFormatMap = {};
  for (const [key, options] of Object.entries(value)) {
    if (!isPandocFormatKey(key)) fail('此导出格式暂不支持。');
    result[key] = pandocOptions(options);
  }
  return result;
}
function customExports(value: unknown): CustomExportPreference[] {
  const message = '自定义导出设置无效，原设置未修改。';
  if (!Array.isArray(value) || value.length > MAX_CUSTOM_EXPORTS) fail(message);
  const seen = new Set<string>();
  return value.map((item) => {
    if (
      !record(item) ||
      Object.keys(item).some((key) => !['id', 'name', 'writer', 'extension', 'options'].includes(key))
    )
      fail(message);
    const { id, name, writer, extension } = item;
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ||
      seen.has(id) ||
      !text(name, 40) ||
      !name.trim() ||
      typeof writer !== 'string' ||
      writer.length > 60 ||
      !/^[a-z0-9_]+(?:[+-][a-z0-9_]+)*$/.test(writer) ||
      blockedWriters.has(writer.split(/[+-]/)[0] ?? '') ||
      typeof extension !== 'string' ||
      !/^[a-z0-9]{1,10}$/.test(extension) ||
      blockedExtensions.has(extension)
    )
      fail(message);
    seen.add(id);
    return { id, name, writer, extension, options: pandocOptions(item.options ?? {}) };
  });
}

/** Validates one complete settings object before it is written. */
export function exportPreferenceChange(key: unknown, value: unknown): ExportPreferenceChange {
  switch (key) {
    case 'pandocPath':
      if (!path(value)) fail('Pandoc路径无效。');
      return { key, value };
    case 'export.general':
      return { key, value: exact(value, generalRules, '导出位置设置无效，原设置未修改。') };
    case 'export.html':
      return { key, value: exact(value, htmlRules, '导出设置值无效，原设置未修改。') };
    case 'export.pdf':
      return { key, value: exact(value, pdfRules, '导出设置值无效，原设置未修改。') };
    case 'export.image':
      return { key, value: exact(value, imageRules, '导出设置值无效，原设置未修改。') };
    case 'export.formats':
      return { key, value: pandocFormats(value) };
    case 'export.custom':
      return { key, value: customExports(value) };
    default:
      return fail('导出偏好无效。');
  }
}

/** Validates the host's reply; an unknown or malformed field means the record is not trusted. */
export function exportPreferencesSnapshot(value: unknown): ExportPreferencesSnapshot {
  const allowed = [
    'schemaVersion',
    'revision',
    'general',
    'html',
    'pdf',
    'image',
    'formats',
    'custom',
    'pandocPath',
  ];
  if (
    !record(value) ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    value.schemaVersion !== 1 ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    fail('导出设置响应无效。');
  return {
    schemaVersion: 1,
    revision: value.revision,
    general: exportPreferenceChange('export.general', value.general === undefined ? {} : value.general)
      .value as GeneralExportPreferences,
    html: exportPreferenceChange('export.html', value.html === undefined ? {} : value.html).value as HtmlExportPreferences,
    pdf: exportPreferenceChange('export.pdf', value.pdf === undefined ? {} : value.pdf).value as PdfExportPreferences,
    image: exportPreferenceChange('export.image', value.image === undefined ? {} : value.image).value as ImageExportPreferences,
    formats: exportPreferenceChange('export.formats', value.formats === undefined ? {} : value.formats).value as PandocFormatMap,
    custom: exportPreferenceChange('export.custom', value.custom === undefined ? [] : value.custom)
      .value as CustomExportPreference[],
    pandocPath: exportPreferenceChange('pandocPath', value.pandocPath === undefined ? '' : value.pandocPath).value as string,
  };
}

/** The Pandoc options of a built-in format key (`docx`) or custom target (`custom:<id>`). */
export function pandocOptionsFor(
  snapshot: ExportPreferencesSnapshot,
  target: string,
): PandocFormatPreferences {
  if (target.startsWith('custom:'))
    return snapshot.custom.find((item) => item.id === target.slice(7))?.options ?? {};
  return isPandocFormatKey(target) ? (snapshot.formats[target] ?? {}) : {};
}

const variable = (name: string) => `\${${name}}`;
/** Header and footer text with the variables an export can resolve. */
export const headerFooterVariables = [
  { token: variable('title'), label: '标题' },
  { token: variable('author'), label: '作者' },
  { token: variable('pageNo'), label: '页码' },
  { token: variable('totalPages'), label: '总页数' },
  { token: variable('today'), label: '日期' },
] as const;

/** A complete, empty record: what a fresh install holds. */
export function defaultExportPreferences(): ExportPreferencesSnapshot {
  return {
    schemaVersion: 1,
    revision: 0,
    general: {},
    html: {},
    pdf: {},
    image: {},
    formats: {},
    custom: [],
    pandocPath: '',
  };
}

/** What is wrong with a custom export's name, output format and extension, field by field. */
export function customExportProblems(value: {
  name: string;
  writer: string;
  extension: string;
}): Record<'name' | 'writer' | 'extension', string> | Record<string, never> {
  const problems: Partial<Record<'name' | 'writer' | 'extension', string>> = {};
  if (!value.name.trim()) problems.name = '请输入名称';
  else if (!text(value.name, 40)) problems.name = '名称最多 40 个字符，且不能含控制字符';
  const base = value.writer.split(/[+-]/)[0] ?? '';
  if (!value.writer) problems.writer = '请选择或输入 Pandoc 输出格式';
  else if (value.writer.length > 60 || !/^[a-z0-9_]+(?:[+-][a-z0-9_]+)*$/.test(value.writer))
    problems.writer = '输出格式只能是 Pandoc 的写出器名称';
  else if (blockedWriters.has(base)) problems.writer = '此输出格式需要外部引擎，暂不支持导出为单个文件';
  if (!value.extension) problems.extension = '请输入扩展名';
  else if (!/^[a-z0-9]{1,10}$/.test(value.extension))
    problems.extension = '扩展名只能是 1–10 位小写字母或数字';
  else if (blockedExtensions.has(value.extension)) problems.extension = '不能使用可执行文件或脚本的扩展名';
  return problems as Record<string, never>;
}

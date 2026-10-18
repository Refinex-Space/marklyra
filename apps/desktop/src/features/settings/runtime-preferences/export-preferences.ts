export const exportPreferenceKeys = [
  'export.html',
  'export.pdf',
  'export.image',
  'pandocPath',
] as const;
export type ExportPreferenceKey = (typeof exportPreferenceKeys)[number];
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
export interface HtmlExportPreferences {
  exportTheme?: string;
}
export interface PdfExportPreferences extends HtmlExportPreferences {
  paper?: ExportPaperSize;
  'paper.custom'?: [number, number];
  'paper.margin'?: '' | 'custom';
  'paper.marginTop'?: number;
  'paper.marginBottom'?: number;
  'paper.marginLeft'?: number;
  'paper.marginRight'?: number;
  splitPages?: boolean;
  header?: string;
  footer?: string;
}
export interface ImageExportPreferences extends HtmlExportPreferences {
  imageWidth?: number;
  quality?: number;
  useThemeFontSize?: number;
  imageFontSize?: number;
}
export type ExportPreferenceValue =
  | HtmlExportPreferences
  | PdfExportPreferences
  | ImageExportPreferences;
export type ExportPreferenceChange =
  | { key: 'export.html'; value: HtmlExportPreferences }
  | { key: 'export.pdf'; value: PdfExportPreferences }
  | { key: 'export.image'; value: ImageExportPreferences }
  | { key: 'pandocPath'; value: string };
export interface ExportPreferencesSnapshot {
  schemaVersion: 1;
  revision: number;
  html: HtmlExportPreferences;
  pdf: PdfExportPreferences;
  image?: ImageExportPreferences;
  pandocPath?: string;
}
const themes = ['', 'github', 'gothic', 'newsprint', 'night', 'pixyll', 'whitey'];
const pdfFields = [
  'exportTheme',
  'paper',
  'paper.custom',
  'paper.margin',
  'paper.marginTop',
  'paper.marginBottom',
  'paper.marginLeft',
  'paper.marginRight',
  'splitPages',
  'header',
  'footer',
] as const;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function isExportPreferenceKey(key: string): key is ExportPreferenceKey {
  return exportPreferenceKeys.includes(key as ExportPreferenceKey);
}
export function exportPreferenceFieldSupported(group: string, field: string): boolean {
  if (group === 'image')
    return ['exportTheme', 'imageWidth', 'quality', 'useThemeFontSize', 'imageFontSize'].includes(
      field,
    );
  return group === 'html'
    ? field === 'exportTheme'
    : group === 'pdf' && pdfFields.includes(field as (typeof pdfFields)[number]);
}
export function exportPreferenceControlSupported(group: string, field: string): boolean {
  return field !== 'header' && field !== 'footer' && exportPreferenceFieldSupported(group, field);
}
/** The shipped select omits its valueType prop; normalize only its finite UI choices. */
export function originalImageExportValue(value: unknown): unknown {
  if (!record(value)) return value;
  const result = { ...value };
  if (typeof result.quality === 'string' && /^[0-3]$/.test(result.quality))
    result.quality = Number(result.quality);
  if (typeof result.useThemeFontSize === 'string' && /^[01]$/.test(result.useThemeFontSize))
    result.useThemeFontSize = Number(result.useThemeFontSize);
  return result;
}
/** The runtime page writes one complete format object. No paths, commands or HTML injection. */
export function exportPreferenceChange(key: unknown, value: unknown): ExportPreferenceChange {
  if (key === 'pandocPath') {
    if (
      typeof value !== 'string' ||
      value.length > 4096 ||
      /[\0\r\n]/.test(value) ||
      (value !== '' && !/^(?:\/|[a-z]:[\\/])/i.test(value))
    )
      throw new Error('Pandoc路径无效。');
    return { key, value };
  }
  if ((key !== 'export.html' && key !== 'export.pdf' && key !== 'export.image') || !record(value))
    throw new Error('导出偏好无效。');
  const result: Record<string, unknown> = {};
  for (const [field, item] of Object.entries(value)) {
    if (!exportPreferenceFieldSupported(key.slice(7), field))
      throw new Error('此导出设置暂不支持。');
    let valid = false;
    if (field === 'exportTheme') valid = typeof item === 'string' && themes.includes(item);
    else if (field === 'imageWidth')
      valid = Number.isInteger(item) && typeof item === 'number' && item >= 64 && item <= 4096;
    else if (field === 'quality')
      valid = Number.isInteger(item) && typeof item === 'number' && item >= 0 && item <= 3;
    else if (field === 'useThemeFontSize') valid = item === 0 || item === 1;
    else if (field === 'imageFontSize')
      valid = Number.isInteger(item) && typeof item === 'number' && item >= 6 && item <= 128;
    else if (field === 'paper')
      valid = typeof item === 'string' && exportPaperSizes.includes(item as ExportPaperSize);
    else if (field === 'paper.margin') valid = item === '' || item === 'custom';
    else if (field === 'paper.custom')
      valid =
        Array.isArray(item) &&
        item.length === 2 &&
        item.every(
          (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 10 && n <= 2000,
        );
    else if (field.startsWith('paper.margin'))
      valid = typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 500;
    else if (field === 'splitPages') valid = typeof item === 'boolean';
    // WKWebView exposes no public custom header/footer contract; do not persist inert text.
    else if (field === 'header' || field === 'footer') valid = item === '';
    if (!valid) throw new Error('导出设置值无效，原设置未修改。');
    result[field] = Array.isArray(item) ? [...item] : item;
  }
  return { key, value: result } as ExportPreferenceChange;
}
export function exportPreferencesSnapshot(value: unknown): ExportPreferencesSnapshot {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !['schemaVersion', 'revision', 'html', 'pdf', 'image', 'pandocPath'].includes(key),
    ) ||
    value.schemaVersion !== 1 ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new Error('导出设置响应无效。');
  return {
    schemaVersion: 1,
    revision: value.revision,
    html: exportPreferenceChange('export.html', value.html).value as HtmlExportPreferences,
    pdf: exportPreferenceChange('export.pdf', value.pdf).value as PdfExportPreferences,
    ...(value.image === undefined
      ? {}
      : {
          image: exportPreferenceChange('export.image', value.image)
            .value as ImageExportPreferences,
        }),
    ...(value.pandocPath === undefined
      ? {}
      : { pandocPath: exportPreferenceChange('pandocPath', value.pandocPath).value as string }),
  };
}
export function exportPreferencesOptions(
  value: ExportPreferencesSnapshot,
): Record<string, unknown> {
  const checked = exportPreferencesSnapshot(value);
  return {
    'export.html': checked.html,
    'export.pdf': checked.pdf,
    'export.image': checked.image ?? {},
    pandocPath: checked.pandocPath ?? '',
    marklyraExportActions: true,
  };
}

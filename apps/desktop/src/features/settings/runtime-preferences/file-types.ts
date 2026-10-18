export const builtInFileTypes = [
  'md',
  'markdown',
  'mkd',
  'mdown',
  'mdtext',
  'mdtxt',
  'mdwn',
  'mdx',
  'mmd',
  'rmd',
  'qmd',
  'rmarkdown',
  'txt',
  'text',
  'apib',
] as const;
export const baseFileTypes: readonly string[] = [...builtInFileTypes, ''];
export interface FileTypeSettings {
  defaultExtension: string;
  disabledFileTypes?: readonly string[];
  supportedFileTypes?: readonly string[];
}
export function validFileTypeId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length <= 128 &&
    (id === '' || /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(id))
  );
}
export function checkedFileTypeList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 48 ||
    value.some((id) => !validFileTypeId(id)) ||
    new Set(value).size !== value.length
  )
    throw Error('文件类型列表无效。');
  return [...value] as string[];
}
export function fileTypeCatalog(settings: FileTypeSettings): string[] {
  return settings.supportedFileTypes
    ? [...settings.supportedFileTypes]
    : [...new Set([...baseFileTypes, settings.defaultExtension.toLowerCase() || 'md'])];
}
export function documentFileType(name: string, settings: FileTypeSettings): string {
  const lower = name.toLowerCase();
  const matched = fileTypeCatalog(settings)
    .filter((id) => id && lower.endsWith(`.${id}`) && lower.length > id.length + 1)
    .sort((a, b) => b.length - a.length)[0];
  return matched ?? (lower.includes('.') ? (lower.split('.').at(-1) ?? '') : '');
}
export function fileTypeEnabled(id: string, settings: FileTypeSettings): boolean {
  return fileTypeCatalog(settings).includes(id) && !settings.disabledFileTypes?.includes(id);
}

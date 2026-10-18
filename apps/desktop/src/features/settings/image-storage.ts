export const defaultImageStorageFolder = 'assets';
export const filenameImageStorageFolder = '${filename}.assets';

export type ImageStorageValidation =
  | { valid: true; folder: string }
  | { valid: false; message: string };

/** A path preference is a request; only native retained scopes authorize IO. */
export function validateImageStorageFolder(value: string): ImageStorageValidation {
  const invalid = (message: string): ImageStorageValidation => ({ valid: false, message });
  if (value === '') return { valid: true, folder: '' };
  if (value === '/') return { valid: true, folder: '/' };
  if (value === '.') return { valid: true, folder: '.' };
  if (!value) return invalid('请输入图片保存目录。');
  if (new TextEncoder().encode(value).length > 240)
    return invalid('目录名称过长，请使用较短的目录。');
  if (value.startsWith('\\') || value.startsWith('//')) return invalid('不支持网络共享目录。');
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return invalid('目录使用本地路径，不能填写 URL。');
  // Forward slashes have one meaning on both supported desktop platforms.
  if (/[\\<>:"|?*\p{Cc}\p{Cs}]/u.test(value))
    return invalid('目录不能包含反斜杠、冒号、控制字符或系统不支持的符号。');
  const folder = value.endsWith('/') ? value.slice(0, -1) : value;
  const segments = (folder.startsWith('/') ? folder.slice(1) : folder).split('/');
  if (folder === '/') return { valid: true, folder };
  for (const segment of segments) {
    if (!segment) return invalid('目录不能包含空段。');
    if (segment === '.' || segment === '..') continue;
    if (segment !== segment.trim() || /[. ]$/.test(segment))
      return invalid('目录名称前后不能有空白，也不能以句点结尾。');
    const literal = segment.replaceAll('${filename}', 'document');
    if (/\$\{/.test(literal)) return invalid('目录变量仅支持 ${filename}。');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(literal))
      return invalid('该目录名称被系统保留，请换一个名称。');
  }
  return { valid: true, folder };
}

export function normalizeImageStorageFolder(value: unknown): string {
  if (typeof value !== 'string') return defaultImageStorageFolder;
  const result = validateImageStorageFolder(value);
  return result.valid ? result.folder : defaultImageStorageFolder;
}

/** Preview uses a known example filename; native import resolves the actual stem. */
export function previewImageStorageFolder(
  value: string,
  exampleFilename = '笔记.md',
): string | null {
  const result = validateImageStorageFolder(value);
  if (!result.valid) return null;
  if (result.folder === '') return '不复制；二进制图片保留在应用暂存区';
  if (result.folder === '.') return '文档所在目录/';
  const extension = exampleFilename.lastIndexOf('.');
  const stem = extension > 0 ? exampleFilename.slice(0, extension) : exampleFilename;
  return `${result.folder.replaceAll('${filename}', stem)}/`;
}

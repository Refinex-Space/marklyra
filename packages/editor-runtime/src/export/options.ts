import type { RuntimeConfiguration } from '../protocol.js';

export interface ExportHTMLOptions {
  title?: string;
  /** Include the current bundled theme and editor styles. Default true. */
  styled?: boolean;
  theme?: RuntimeConfiguration['theme'];
  /** Static, self-contained CSS. No imports, scripts or external resource URLs. */
  extraCss?: string;
  /** Use the original print serializer and its top-level heading/footnote page boundaries. */
  print?: { splitPages: boolean };
}
export interface ResolvedExportOptions {
  title?: string;
  styled: boolean;
  theme?: RuntimeConfiguration['theme'];
  extraCss?: string;
  print?: { splitPages: boolean };
}
export const MAX_EXPORT_BYTES = 32 * 1024 * 1024;
export const MAX_EXPORT_RESOURCE_BYTES = 8 * 1024 * 1024;
const themes = new Set(['marklyra-light', 'marklyra-dark']);

export function exportOptions(value: ExportHTMLOptions = {}): ResolvedExportOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('HTML 导出选项无效');
  for (const key of Object.keys(value))
    if (!['title', 'styled', 'theme', 'extraCss', 'print'].includes(key))
      throw new Error(`不支持 HTML 导出选项：${key}`);
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 512))
    throw new Error('导出标题必须是最多 512 字符的文本');
  if (value.styled !== undefined && typeof value.styled !== 'boolean')
    throw new Error('styled 必须是 boolean');
  if (value.theme !== undefined && !themes.has(value.theme)) throw new Error('不支持该导出主题');
  if (
    value.extraCss !== undefined &&
    (typeof value.extraCss !== 'string' ||
      new TextEncoder().encode(value.extraCss).byteLength > 16 * 1024 ||
      /[\0<]/.test(value.extraCss))
  )
    throw new Error('导出 CSS 必须是不含 HTML 的最多 16 KiB 静态样式');
  if (
    value.print !== undefined &&
    (!value.print ||
      typeof value.print !== 'object' ||
      Array.isArray(value.print) ||
      Object.keys(value.print).some((key) => key !== 'splitPages') ||
      typeof value.print.splitPages !== 'boolean' ||
      value.styled === false)
  )
    throw new Error('打印选项无效，打印必须保留样式');
  return {
    styled: value.styled ?? true,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.theme === undefined ? {} : { theme: value.theme }),
    ...(value.extraCss === undefined ? {} : { extraCss: value.extraCss }),
    ...(value.print === undefined ? {} : { print: { splitPages: value.print.splitPages } }),
  };
}
/** Custom-protocol origins may be opaque; compare their complete authority instead. */
export function sameRuntimeOrigin(candidate: URL, runtime: URL): boolean {
  return (
    candidate.protocol === runtime.protocol &&
    candidate.host === runtime.host &&
    !candidate.username &&
    !candidate.password
  );
}
export function bundledFontUrl(value: string, base: string, runtime: string): string {
  const url = new URL(value, base),
    owner = new URL(runtime);
  const root = new URL('./style/themes/', owner).pathname;
  if (
    !sameRuntimeOrigin(url, owner) ||
    !url.pathname.startsWith(root) ||
    !/\.(?:woff2?|ttf|otf)$/i.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error('导出字体必须来自已捆绑主题资源');
  return url.href;
}

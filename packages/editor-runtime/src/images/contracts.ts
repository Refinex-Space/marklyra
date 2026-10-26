import type { CursorBookmark } from '../protocol.js';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_FILES = 128;
export const VIRTUAL_DOCUMENT_FOLDER = '/__marklyra_document__';
export const VIRTUAL_DOCUMENT_PATH = `${VIRTUAL_DOCUMENT_FOLDER}/document.md`;

export interface ImageResolveRequest {
  /** Source Markdown destination, unchanged. */
  source: string;
  /** Percent-encoded relative path or explicit absolute/file/HTTP request. Host
   * decodes local paths once and independently checks its own authority. */
  reference: string;
  documentContext: string | null;
  signal: AbortSignal;
}
export interface ImageImportRequest {
  /** YAML image base; a path declaration never grants additional authority. */
  referenceRoot: string;
  /** WYSIWYG document override. Undefined leaves storage policy to the host. */
  storageFolder?: string;
  name: string;
  type: string;
  bytes: Uint8Array;
  documentContext: string | null;
  signal: AbortSignal;
}
export interface ImageHostAdapter {
  resolve(request: ImageResolveRequest): Promise<{ url: string } | null>;
  import?(request: ImageImportRequest): Promise<{ source: string; url: string }>;
  /** Only explicitly listed actions are offered. Paths and URLs are requests,
   * never file authority; every action remains bound to this document. */
  actions?: readonly ImageHostAction[];
  action?(request: ImageActionRequest): Promise<{ source: string; url: string } | null>;
  automatic?(request: ImageAutomaticRequest): boolean | Promise<boolean>;
  /** Native host owns external Files drops. DOM text/internal drags keep their existing route. */
  nativeDrop?: boolean;
}
export type ImageHostAction = 'reveal' | 'copyToStorage' | 'downloadToStorage';
export interface ImageActionRequest extends ImageResolveRequest {
  action: ImageHostAction;
  referenceRoot: string;
  storageFolder?: string;
}
export type ImageAutomaticRequest = Omit<ImageActionRequest, 'action'> & { sourceMode: boolean };
/** Host viewport client coordinates in CSS pixels, before iframe conversion. */
export interface NativeImageInput {
  id: string;
  point?: { x: number; y: number };
}
export interface NativeImageImportRequest {
  documentContext: string | null;
  referenceRoot: string;
  storageFolder?: string;
  signal: AbortSignal;
}
export interface NativeImageResult {
  kind?: 'image';
  source: string;
  url: string;
  name: string;
}
export interface NativeLinkResult {
  kind: 'link';
  name: string;
  source: string;
}
export type NativeInputResult = NativeImageResult | NativeLinkResult;
export function nativeImageResults(value: unknown, runtimeUrl?: string): NativeInputResult[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMAGE_FILES)
    throw new ImageHostError('原生图片导入数量无效');
  return value.map((image: unknown) => {
    if (!image || typeof image !== 'object') throw new ImageHostError('原生图片导入结果无效');
    const item = image as Partial<NativeInputResult>;
    if (
      typeof item.name !== 'string' ||
      !item.name ||
      item.name.length > 255 ||
      hasControl(item.name) ||
      typeof item.source !== 'string'
    )
      throw new ImageHostError('原生图片导入结果无效');
    imageHostReference(item.source);
    if (item.kind === 'link') return { kind: 'link', name: item.name, source: item.source };
    if (
      (item.kind !== undefined && item.kind !== 'image') ||
      !('url' in item) ||
      typeof item.url !== 'string'
    )
      throw new ImageHostError('原生图片导入结果无效');
    return { name: item.name, source: item.source, url: displayImageUrl(item.url, runtimeUrl) };
  });
}
export type NativeImageImporter = (
  request: NativeImageImportRequest,
) => Promise<readonly NativeInputResult[]>;
export type NativeInput = NativeImageInput;
export type NativeInputImportRequest = NativeImageImportRequest;
export type NativeInputImporter = NativeImageImporter;
export interface ImageContextMessage {
  generation: number;
  enabled: boolean;
  canImport: boolean;
  readClipboard?: boolean;
  actions?: readonly ImageHostAction[];
  automatic?: boolean;
  nativeDrop?: boolean;
}
export interface ImageResolutionMessage {
  generation: number;
  id: number;
  source: string;
  reference: string;
}
export interface ImageCheckpoint {
  generation: number;
  canonical: string;
  sequence: number;
  bookmark: CursorBookmark | null;
  referenceRoot: string;
  storageFolder?: string;
  /** Native input freezes the destination until the import commits. */
  destination?: { selection: string; interaction: number };
}
export interface ImageImportMessage {
  referenceRoot: string;
  storageFolder?: string;
  generation: number;
  id: number;
  name: string;
  type: string;
  bytes: Uint8Array;
}
export interface ImageAutomaticMessage {
  generation: number;
  id: number;
  expected: { canonical: string; sequence: number; checkpoint: number };
  sources: { source: string; requestSource: string; reference: string }[];
  storage: { referenceRoot: string; storageFolder?: string; sourceMode: boolean };
}
export class ImageHostError extends Error {
  override readonly name = 'ImageHostError';
}
const extensions: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};
const mimeTypes = new Set(Object.values(extensions));
export function imageType(name: string, type: string, size: number): string {
  if (!Number.isSafeInteger(size) || size <= 0) throw new ImageHostError('图片为空或大小无效');
  if (size > MAX_IMAGE_BYTES) throw new ImageHostError('图片超过 8 MiB 限制');
  const inferred = extensions[name.split('.').at(-1)?.toLowerCase() ?? ''];
  const declared = type.toLowerCase().split(';')[0]?.trim();
  const aliases: Record<string, string> = {
    'image/x-png': 'image/png',
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
  };
  const selected =
    !declared || declared === 'application/octet-stream'
      ? inferred
      : (aliases[declared] ?? declared);
  if (!selected || !mimeTypes.has(selected))
    throw new ImageHostError('仅支持 PNG、JPEG、GIF、WebP 和经宿主校验的 SVG 图片');
  return selected;
}
function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index++)
    if (value.charCodeAt(index) < 32 || value.charCodeAt(index) === 127) return true;
  return false;
}
function localPath(value: string): string {
  if (!value || hasControl(value)) throw new ImageHostError('图片引用为空或包含控制字符');
  if (/^[\\/]|^[a-z][a-z\d+.-]*:/i.test(value))
    throw new ImageHostError('图片引用必须相对当前文档，绝对路径与网络地址需要显式宿主授权');
  return value.replace(/\\/g, '/');
}
/** No percent decoding here: %23 and %3F are filename characters, decoded once by the host. */
export function imageReference(source: string, root = ''): string {
  const path = localPath(source.trim().split(/[?#]/, 1)[0] ?? '');
  const base = root.trim();
  const combined = (base ? `${localPath(base)}/${path}` : path).split('/');
  const parts: string[] = [];
  for (const part of combined) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
    else parts.push(part);
  }
  if (!parts.length) throw new ImageHostError('图片引用未指向文件');
  return parts.join('/');
}
/** Lexical request only. It does not open files, grant access or enable network.
 * Relative paths retain the existing root behavior; explicit host adapters may
 * authorize absolute/file/HTTP references without exposing them to the frame. */
export function imageHostReference(source: string, root = ''): string {
  const value = source.trim();
  if (!value || hasControl(value) || value.length > 16_384)
    throw new ImageHostError('图片引用为空或无效');
  if (value.startsWith('//')) return imageHostReference(`http:${value}`);
  if (/^(?:https?|file):/i.test(value)) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      (url.protocol === 'file:' && url.hostname && url.hostname !== 'localhost')
    )
      throw new ImageHostError('图片引用不允许凭据或远程文件主机');
    return value;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value))
    throw new ImageHostError('图片引用协议未受宿主支持');
  if (root && /^[\\/]|^[a-z]:[\\/]|^file:/i.test(root)) {
    if (hasControl(root) || root.length > 16_384) throw new ImageHostError('图片引用根目录无效');
    return `${root.replace(/[\\/]$/, '')}/${value.replace(/^[\\/]+/, '')}`;
  }
  if (root) return imageReference(value.replace(/^[\\/]+/, ''), root);
  if (/^[\\/]|^[a-z]:[\\/]/i.test(value)) return value;
  return imageReference(value);
}
/** Prefer the current namespace while accepting a single existing editor's
 * image field. Metadata declares a path; the host still owns all file authority. */
export function imageMetadataValue(
  entries: Iterable<readonly [string, unknown]>,
  field: 'root-url' | 'copy-images-to',
): unknown {
  const canonical: unknown[] = [];
  const compatible: unknown[] = [];
  for (const [key, value] of entries) {
    const name = key.toLowerCase();
    if (name === `marklyra-${field}`) canonical.push(value);
    else if (
      name.endsWith(`-${field}`) &&
      /^[a-z][a-z\d]*(?:-[a-z\d]+)*$/.test(name.slice(0, -field.length - 1))
    )
      compatible.push(value);
  }
  const selected = canonical.length ? canonical : compatible;
  if (selected.length > 1) throw new ImageHostError(`图片元数据字段存在歧义：${field}`);
  return selected[0];
}

export function imageRoot(frontMatter: string): string {
  const entries = [...frontMatter.matchAll(/^[ \t]*([a-z][a-z\d-]*)[ \t]*:[ \t]*(.*)$/gim)].map(
    (match): [string, unknown] => [match[1] ?? '', match[2]],
  );
  const setting = imageMetadataValue(entries, 'root-url');
  const value = typeof setting === 'string' ? setting.trim() : '';
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      /* Reject malformed roots when resolving. */
    }
  }
  return value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1).replace(/''/g, "'")
    : value;
}
export function displayImageUrl(value: string, runtimeUrl?: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_IMAGE_BYTES * 2 ||
    hasControl(value)
  )
    throw new ImageHostError('宿主返回了无效的图片显示 URL');
  if (/^data:/i.test(value)) {
    if (!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);(?:base64,|charset=[a-z\d-]+,)/i.test(value))
      throw new ImageHostError('拒绝非图片 data URL');
    return value;
  }
  const url = new URL(value);
  if (url.username || url.password) throw new ImageHostError('图片 URL 不允许携带凭据');
  if (url.protocol === 'blob:' || url.protocol === 'marklyra:' || url.protocol === 'runtime-asset:')
    return value;
  if (['http:', 'https:'].includes(url.protocol)) {
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    const sameOrigin = runtimeUrl && new URL(runtimeUrl).origin === url.origin;
    if (local || sameOrigin) return value;
  }
  throw new ImageHostError('拒绝未授权的图片 URL 协议或远程网络地址');
}
export function imageMarkdown(source: string, name: string): string {
  // The source is an already-authorized host result. Rendering still resolves
  // through the host and never gives the frame native file/network authority.
  imageHostReference(source);
  const destination = source.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\n|\r/g, '');
  const alt =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[\\[\]<>\r\n]/g, '')
      .slice(0, 160) || 'image';
  return `![${alt}](<${destination}>)`;
}

/** Syntax only. A returned file URI carries no read grant in the runtime. */
export function nativeInputMarkdown(value: NativeInputResult): string {
  if (value.kind !== 'link') return imageMarkdown(value.source, value.name);
  imageHostReference(value.source);
  const source = value.source.replace(/</g, '%3C').replace(/>/g, '%3E');
  const destination = /[\s()<>]/.test(value.source) ? `<${source}>` : source;
  const name = value.name.replace(/[\\[\]<>]/g, '\\$&');
  return ` [${name}](${destination}) `;
}

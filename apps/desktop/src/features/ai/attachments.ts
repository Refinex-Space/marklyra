import { agentApi } from './api.js';
import type { Attachment, DraftAttachment } from './types.js';

export const maxAttachmentBytes = 4 * 1024 * 1024;
export const maxAttachments = 8;
const cache = new Map<string, DraftAttachment>();
const deletedRecords = new Set<string>();
export function rememberAttachment(recordId: string, value: DraftAttachment) {
  if (deletedRecords.has(recordId)) return;
  cache.set(`${recordId}:${value.id}`, value);
  while (
    cache.size > 24 ||
    [...cache.values()].reduce((size, item) => size + item.size, 0) > 32 * 1024 * 1024
  ) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}
export function forgetAttachments(recordId: string) {
  deletedRecords.add(recordId);
  for (const key of cache.keys()) if (key.startsWith(`${recordId}:`)) cache.delete(key);
}
export function cachedAttachment(recordId: string, id: string) {
  return cache.get(`${recordId}:${id}`);
}
export async function readAttachment(
  rootPath: string,
  recordId: string,
  value: Attachment,
): Promise<DraftAttachment> {
  const found = cachedAttachment(recordId, value.id);
  if (found) return found;
  const stored = await agentApi.invoke<DraftAttachment>('agent_read_attachment', {
    rootPath,
    recordId,
    attachmentId: value.id,
  });
  if (deletedRecords.has(recordId)) throw new Error('会话附件已移除');
  rememberAttachment(recordId, stored);
  return stored;
}
export function attachmentUrl(value: DraftAttachment) {
  return `data:${value.mimeType};base64,${value.data}`;
}
export function bytesFromBase64(data: string) {
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}
export function attachmentText(value: DraftAttachment): string | null {
  if (
    value.mimeType.startsWith('image/') ||
    value.mimeType === 'application/pdf' ||
    value.mimeType === 'application/zip' ||
    value.mimeType.startsWith('application/vnd.')
  )
    return null;
  try {
    const bytes = bytesFromBase64(value.data);
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : 'utf-8';
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    return [...text].some((char) => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))
      ? null
      : text;
  } catch {
    return null;
  }
}
function mime(bytes: Uint8Array, name: string): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const prefix = new TextDecoder().decode(bytes.subarray(0, 12));
  if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return 'image/gif';
  if (prefix.startsWith('RIFF') && prefix.endsWith('WEBP')) return 'image/webp';
  if (prefix.startsWith('%PDF-')) return 'application/pdf';
  const extension = name.split('.').at(-1)?.toLowerCase();
  return (
    (
      {
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        zip: 'application/zip',
        md: 'text/markdown',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        svg: 'text/plain',
        html: 'text/plain',
      } as Record<string, string>
    )[extension ?? ''] ?? 'application/octet-stream'
  );
}
export async function prepareAttachment(file: File): Promise<DraftAttachment> {
  if (file.size > maxAttachmentBytes) throw new Error(`${file.name} 超过 4 MiB，请选择较小的文件`);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length > maxAttachmentBytes) throw new Error(`${file.name} 超过 4 MiB`);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  const value: DraftAttachment = {
    id: crypto.randomUUID(),
    name:
      [...file.name]
        .map((char) => (char.charCodeAt(0) < 32 || '/\\'.includes(char) ? '_' : char))
        .join('')
        .slice(0, 180) || '附件',
    mimeType: mime(bytes, file.name),
    size: bytes.length,
    digest,
    data: btoa(binary),
  };
  if (value.mimeType === 'application/octet-stream' && attachmentText(value) !== null)
    value.mimeType = 'text/plain';
  if (value.mimeType.startsWith('image/')) {
    const image = new Image();
    image.src = attachmentUrl(value);
    await image.decode().catch(() => {
      throw new Error(`${file.name} 不是可读取的图片`);
    });
    if (
      image.naturalWidth * image.naturalHeight > 16_777_216 ||
      Math.max(image.naturalWidth, image.naturalHeight) > 16384
    )
      throw new Error(`${file.name} 图片尺寸过大`);
  }
  return value;
}
export function attachmentBlocks(
  values: DraftAttachment[],
  capabilities: { image: boolean; embeddedContext: boolean },
) {
  if (values.length > maxAttachments || values.reduce((n, v) => n + v.size, 0) > maxAttachmentBytes)
    throw new Error('最多添加 8 个附件，总量不能超过 4 MiB');
  return values.map((value) => {
    const uri = `marklyra-attachment:///${value.id}/${encodeURIComponent(value.name)}`;
    if (value.mimeType.startsWith('image/')) {
      if (!capabilities.image)
        throw new Error('当前智能体未声明图片理解能力，请移除图片或使用支持图片的智能体');
      return { type: 'image', mimeType: value.mimeType, data: value.data, uri };
    }
    const content = attachmentText(value);
    if (content !== null)
      return capabilities.embeddedContext
        ? { type: 'resource', resource: { uri, mimeType: value.mimeType, text: content } }
        : {
            type: 'text',
            text: `附件 ${value.name}\n<attachment-content>\n${content}\n</attachment-content>`,
          };
    if (!capabilities.embeddedContext)
      throw new Error(
        `当前智能体不支持 ${value.name} 的文件类型，请使用文本文件或支持文件上下文的智能体`,
      );
    return { type: 'resource', resource: { uri, mimeType: value.mimeType, blob: value.data } };
  });
}
export function attachmentSize(size: number) {
  return size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${Math.ceil(size / 1024)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

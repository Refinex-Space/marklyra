import { cssUrlTokens } from '../styles/css-resources.js';
import { MAX_EXPORT_RESOURCE_BYTES } from './options.js';

/** Decode in memory rather than fetch(data:), which a strict connect-src may prohibit. */
export function imageData(value: string): { mime: string; bytes: Uint8Array } {
  if (value.length > MAX_EXPORT_RESOURCE_BYTES * 3 + 256) throw new Error('导出资源超过 8 MiB');
  const match =
    /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml))(?:;charset=[a-z\d-]+)?(;base64)?,([\s\S]*)$/i.exec(
      value,
    );
  if (!match) throw new Error('导出图片 data URL 无效');
  const payload = match[3] ?? '';
  if (match[2] && payload.length > Math.ceil(MAX_EXPORT_RESOURCE_BYTES / 3) * 4)
    throw new Error('导出资源超过 8 MiB');
  const bytes = match[2]
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  if (!bytes.length || bytes.length > MAX_EXPORT_RESOURCE_BYTES)
    throw new Error('导出资源为空或超过 8 MiB');
  return { mime: match[1]?.toLowerCase() ?? '', bytes };
}

/** The cap applies while consuming chunks, including responses with missing/false lengths. */
export async function resourceBytes(
  response: Response,
  limit = MAX_EXPORT_RESOURCE_BYTES,
  allowEmpty = false,
): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('导出资源超过 8 MiB');
  }
  if (!response.body) throw new Error('导出资源为空');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('导出资源超过 8 MiB');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size && !allowEmpty) throw new Error('导出资源为空');
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Conservative static-export subset: unsupported resource syntax fails rather than disappears. */
export function portableCss(css: string): string {
  const normalized = css
    .replace(
      /\\([0-9a-f]{1,6})[ \t\r\n\f]?|\\([^\r\n\f])/gi,
      (_match, hex: string | undefined, literal: string | undefined) => {
        if (!hex) return literal ?? '';
        const code = Number.parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
      },
    )
    .replace(/\/\*[\s\S]*?\*\//g, '');
  if (
    /@(?:import|namespace|include-when-export)\b|\b(?:image|image-set|-webkit-image-set|src|local|paint|expression)\s*\(/i.test(
      normalized,
    )
  )
    throw new Error('导出样式含未内嵌的资源语法');
  for (const token of cssUrlTokens(css)) {
    const url = token.value.trim();
    if (
      !url.startsWith('#') &&
      !/^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/[a-z\d+.-]+)[;,]/i.test(url)
    )
      throw new Error('导出样式含未内嵌的资源地址');
  }
  return css;
}

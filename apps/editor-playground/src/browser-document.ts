import type { MarkLyraEditor } from '@marklyra/editor-runtime';

type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be';
interface BrowserDocument {
  readonly name: string;
  readonly source: string;
  readonly encoding: Encoding;
  readonly originalBytes?: Uint8Array;
}

function decode(name: string, bytes: Uint8Array): BrowserDocument {
  const utf32le = bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0;
  const utf32be = bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff;
  if (utf32le || utf32be)
    throw new Error('浏览器示例暂不支持 UTF-32，请先转换为 UTF-8 或带 BOM 的 UTF-16。');
  const encoding: Encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  let source: string;
  try {
    source = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('文件编码无效；请使用 UTF-8 或带 BOM 的 UTF-16 LE/BE。当前文档保持不变。');
  }
  if (source.includes('\0'))
    throw new Error('文件含 NUL 字符，可能是未标记编码或二进制数据。当前文档保持不变。');
  return { name, source, encoding, originalBytes: bytes };
}

function encode(source: string, encoding: Encoding): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(source);
  const bytes = new Uint8Array(source.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < source.length; index++)
    view.setUint16(index * 2, source.charCodeAt(index), encoding === 'utf-16le');
  return bytes;
}

/** File input and browser download belong to this example host, not to the editor SDK. */
export class BrowserDocumentController {
  private document: BrowserDocument;
  constructor(
    private readonly editor: MarkLyraEditor,
    initial: string,
  ) {
    this.document = { name: 'document.md', source: initial, encoding: 'utf-8' };
  }
  get name(): string {
    return this.document.name;
  }
  async open(file: File): Promise<void> {
    const next = decode(file.name, new Uint8Array(await file.arrayBuffer()));
    await this.editor.load(next.source);
    this.document = next;
  }
  async download(): Promise<void> {
    // flush rejects unsynchronized composition/mirror errors; canonical is never a fallback save.
    const source = await this.editor.flush();
    const bytes =
      source === this.document.source && this.document.originalBytes
        ? this.document.originalBytes
        : encode(source, this.document.encoding);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'text/markdown' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.document.name.replace(/[\\/]/g, '-');
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

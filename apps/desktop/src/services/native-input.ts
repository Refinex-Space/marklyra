import type { NativeImageImporter } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import { readPreferences } from '../features/settings/preferences.js';
import type { FilePreferences } from './file-preferences.js';
import { imageEpoch } from './image-epochs.js';
import { guardImageWrite, setNativeDropAvailable } from './images.js';

let enabled = false;
export async function initialiseNativeInput(): Promise<string | undefined> {
  try {
    enabled = (await invoke<boolean>('initialise_native_drop')) === true;
    return undefined;
  } catch (error) {
    enabled = false;
    return `系统文件输入尚未就绪：${String(error)}`;
  } finally {
    setNativeDropAvailable(enabled);
  }
}
export function nativeInputAvailable(): boolean {
  return enabled;
}
export interface NativeFileDrop {
  ticket: string;
  entries: { name: string; kind: 'image' | 'file' | 'directory' }[];
  position: { x: number; y: number };
  viewport: { width: number; height: number };
}
export function nativeFileDrop(value: unknown): NativeFileDrop {
  const item = value as Partial<NativeFileDrop> | null;
  if (
    !item ||
    typeof item.ticket !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(item.ticket) ||
    !Array.isArray(item.entries) ||
    !item.entries.length ||
    item.entries.length > 32 ||
    item.entries.some(
      (entry) =>
        !entry ||
        typeof entry.name !== 'string' ||
        entry.name.length > 255 ||
        !['image', 'file', 'directory'].includes(entry.kind),
    ) ||
    !item.position ||
    !Number.isFinite(item.position.x) ||
    !Number.isFinite(item.position.y) ||
    !item.viewport ||
    !Number.isFinite(item.viewport.width) ||
    item.viewport.width <= 0 ||
    !Number.isFinite(item.viewport.height) ||
    item.viewport.height <= 0
  )
    throw new Error('系统文件拖放响应无效');
  return item as NativeFileDrop;
}
const documents = new Set([
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
]);
const imports = new Set([
  'docx',
  'doc',
  'rtf',
  'odt',
  'epub',
  'html',
  'htm',
  'tex',
  'rst',
  'org',
  'wiki',
  'mediawiki',
  'textile',
  'opml',
]);
export function nativeDropIntent(
  drop: NativeFileDrop,
  preferences: FilePreferences,
): 'images' | 'references' | 'document' | 'directory' | 'unsupported-import' {
  const first = drop.entries[0];
  if (!first) throw new Error('没有可拖入的文件');
  if (first.kind === 'directory')
    return preferences.actionWhenDropFolder === 'link' ? 'references' : 'directory';
  if (first.kind === 'image') return 'images';
  const extension = first.name.split('.').at(-1)?.toLowerCase() ?? '';
  if (documents.has(extension) || extension === preferences.defaultExtension.toLowerCase())
    return preferences.actionWhenDropFile === 'link' ? 'references' : 'document';
  if (imports.has(extension))
    return preferences.actionWhenDropImport === 'link' ? 'references' : 'unsupported-import';
  return 'references';
}
export const cancelNativeInput = (ticket: string) =>
  invoke<void>('cancel_native_input', { ticket });
export function importNativeInput(
  ticket: string,
  mode: 'images' | 'references' | 'paste' = 'images',
): NativeImageImporter {
  return async ({ documentContext, referenceRoot, storageFolder, signal }) => {
    if (!documentContext) throw new Error('当前文稿尚未提供原生图片能力');
    signal.throwIfAborted();
    const assertWrite = guardImageWrite(documentContext);
    const expectedMetadataRevision = imageEpoch(documentContext);
    const preferences = readPreferences();
    const cancel = () => {
      void cancelNativeInput(ticket).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await invoke<Awaited<ReturnType<NativeImageImporter>>>(
        'import_native_input_images',
        {
          request: {
            ticket,
            id: documentContext,
            referenceRoot,
            storageFolder: storageFolder ?? preferences.imageStorageFolder,
            relativePath: preferences.useRelativeImagePath,
            relativePathWithDot: preferences.relativeImagePathWithDot,
            expectedMetadataRevision: expectedMetadataRevision ?? null,
            mode,
          },
        },
      );
      assertWrite();
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  };
}

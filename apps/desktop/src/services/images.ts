import type { MarkLyraHostAdapter } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import { readPreferences } from '../features/settings/preferences.js';
import { desktopAvailable } from './documents.js';
import { imageEpoch } from './image-epochs.js';

let nativeDropAvailable = false;
export function setNativeDropAvailable(value: boolean): void {
  nativeDropAvailable = value;
}

interface DocumentImage {
  source: string;
  url: string;
}
const provisional = new Map<string, string>();
const savingImages = new Set<string>();
const imageSaveEpochs = new Map<string, object>();

/** An image arriving during Save As must not become a new href in the old owner. */
export function fenceImageSave(context: string | null): () => void {
  if (!context) return () => {};
  imageSaveEpochs.delete(context);
  imageSaveEpochs.set(context, {});
  if (imageSaveEpochs.size > 128) {
    const oldest = imageSaveEpochs.keys().next().value;
    if (oldest) imageSaveEpochs.delete(oldest);
  }
  savingImages.add(context);
  return () => savingImages.delete(context);
}
export function guardImageWrite(context: string): () => void {
  const epoch = imageSaveEpochs.get(context);
  const assert = () => {
    if (savingImages.has(context) || imageSaveEpochs.get(context) !== epoch)
      throw new Error('文稿保存期间图片操作已取消，请保存完成后重新插入');
  };
  assert();
  return assert;
}

/** Native IDs are bound to an SDK document lifetime, never a mutable fallback. */
export async function createUntitledImageOwner(): Promise<string | null> {
  return desktopAvailable ? ((await invoke<string | null>('create_image_draft')) ?? null) : null;
}
export async function activateImageOwner(id: string | null): Promise<void> {
  if (desktopAvailable && id) await invoke('set_document_image_context', { id });
}
export async function closeUntitledImageOwner(id: string | null): Promise<void> {
  if (desktopAvailable && id) await invoke('close_image_draft', { id });
}
export function provisionalImageSources(
  mappings: readonly { target: DocumentImage }[],
): () => void {
  for (const { target } of mappings) provisional.set(target.source, target.url);
  return () => {
    for (const { target } of mappings)
      if (provisional.get(target.source) === target.url) provisional.delete(target.source);
  };
}
function owner(context: string | null): string {
  const id = context;
  if (!id) throw new Error('当前宿主尚未提供图片暂存能力');
  return id;
}
/**
 * A day's draft becomes its file before an image is written, so the image is stored
 * beside the note instead of in a draft store that is discarded with the draft.
 */
export interface DraftImageHandoff {
  /** The owner the image is written to: the new document, or `draft` unchanged. Synchronous
   * unless a file must be created, so the usual write keeps capturing its epoch at invocation. */
  materialize(draft: string): string | Promise<string>;
  /** Called once the write finished; the editor then adopts the new owner. */
  settle(draft: string, next: string): void;
}
let draftHandoff: DraftImageHandoff | null = null;
export function setDraftImageHandoff(handoff: DraftImageHandoff): () => void {
  draftHandoff = handoff;
  return () => {
    if (draftHandoff === handoff) draftHandoff = null;
  };
}
interface WriteOwner {
  id: string;
  settle(): void;
}
function writeOwner(context: string | null): WriteOwner | Promise<WriteOwner> {
  const draft = owner(context);
  const handoff = draftHandoff;
  const target = (id: string): WriteOwner => ({
    id,
    settle: () => (id === draft ? undefined : handoff?.settle(draft, id)),
  });
  const id = handoff ? handoff.materialize(draft) : draft;
  return typeof id === 'string' ? target(id) : id.then(target);
}

export type PreparedImageSave =
  | { kind: 'cancel' | 'discard' | 'unsupported' }
  | {
      kind: 'prepared';
      operationId: string;
      mappings: { source: string; target: DocumentImage }[];
    };
export const imageSaves = {
  prepare: (request: {
    sourceOwner: string;
    sourceId?: string;
    encoding?: string;
    suggestedName?: string;
    references: string[];
    referenceRoot: string;
    storageFolder: string;
    close: boolean;
    expectedMetadataRevision?: number;
    relativePath?: boolean;
    relativePathWithDot?: boolean;
    relocation?: { previousPath: string; metadataRevision: number };
    preserveReferences?: boolean;
  }) => invoke<PreparedImageSave>('prepare_document_image_save', { request }),
  commit: (operationId: string, text: string) =>
    invoke<import('./documents.js').DocumentFile>('commit_document_image_save', {
      operationId,
      text,
    }),
  cancel: (operationId: string) => invoke<void>('cancel_document_image_save', { operationId }),
};
// The Tauri transport accepts JSON only. Chunked conversion avoids spreading a
// multi-megabyte array into a function call or importing a Node Buffer into SDK.
export function imageBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16_384)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 16_384)));
  return btoa(chunks.join(''));
}
export function imageBytes(base64: string): Uint8Array {
  if (typeof base64 !== 'string' || base64.length > Math.ceil((8 * 1024 * 1024) / 3) * 4)
    throw new Error('剪贴板图片超过大小限制');
  const binary = atob(base64);
  if (!binary.length || binary.length > 8 * 1024 * 1024) throw new Error('剪贴板图片为空或过大');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
export const documentImages: NonNullable<MarkLyraHostAdapter['images']> = {
  get nativeDrop() {
    return nativeDropAvailable;
  },
  async automatic({ source, reference, referenceRoot, storageFolder, documentContext, signal }) {
    if (!desktopAvailable) return false;
    if (documentContext && savingImages.has(documentContext)) return false;
    signal.throwIfAborted();
    const preferences = readPreferences();
    const folder = storageFolder ?? preferences.imageStorageFolder;
    if (
      !folder ||
      ['upload', 'ipic', 'textbundle'].includes(folder.toLowerCase()) ||
      /^(?:staged\/|data:)/i.test(source)
    )
      return false;
    if (/^(?:https?:|\/\/)/i.test(source)) return preferences.imageMoveForWeb;
    if (!preferences.imageMoveForLocal) return false;
    if (documentContext && imageEpoch(documentContext) !== undefined) {
      const document = await invoke<import('./documents.js').DocumentMetadata>(
        'get_document_metadata',
        { id: documentContext },
      );
      signal.throwIfAborted();
      if (document?.path) {
        const path = document.path.replaceAll('\\', '/');
        const name = path.split('/').at(-1) ?? '';
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const base = new URL('file:///');
        base.pathname = path.startsWith('/') ? path : `/${path}`;
        try {
          const target = new URL(
            `${folder.replaceAll('${filename}', stem).replace(/\/+$/, '')}/`,
            base,
          );
          const resolved = new URL(
            referenceRoot ? `${referenceRoot.replace(/\/+$/, '')}/${source}` : reference,
            base,
          );
          if (new URL('.', resolved).href === target.href) return false;
        } catch {
          return false;
        }
      }
    }
    return true;
  },
  actions: ['reveal', 'copyToStorage', 'downloadToStorage'],
  async resolve({ source, reference, documentContext, signal }) {
    if (!desktopAvailable) return null;
    const pending = provisional.get(source);
    if (pending) return { url: pending };
    signal.throwIfAborted();
    const id = owner(documentContext);
    signal.throwIfAborted();
    const expectedMetadataRevision = imageEpoch(id);
    const result = await invoke<DocumentImage>('resolve_document_image', {
      id,
      source,
      reference,
      ...(expectedMetadataRevision === undefined ? {} : { expectedMetadataRevision }),
    });
    signal.throwIfAborted();
    return { url: result.url };
  },
  async import({ name, bytes, documentContext, referenceRoot, storageFolder, signal }) {
    if (!desktopAvailable) throw new Error('保存图片需要桌面程序');
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('图片超过当前支持的 8 MiB 大小限制');
    signal.throwIfAborted();
    const owned = writeOwner(documentContext);
    const target = owned instanceof Promise ? await owned : owned;
    try {
      const id = target.id;
      signal.throwIfAborted();
      const assertWrite = guardImageWrite(id);
      const expectedMetadataRevision = imageEpoch(id);
      const result = await invoke<DocumentImage>('import_document_image', {
        id,
        name,
        referenceRoot,
        storageFolder: storageFolder ?? readPreferences().imageStorageFolder,
        relativePath: readPreferences().useRelativeImagePath,
        relativePathWithDot: readPreferences().relativeImagePathWithDot,
        base64: imageBase64(bytes),
        ...(expectedMetadataRevision === undefined ? {} : { expectedMetadataRevision }),
      });
      assertWrite();
      signal.throwIfAborted();
      return result;
    } finally {
      target.settle();
    }
  },
  async action({
    action,
    source,
    reference,
    documentContext,
    referenceRoot,
    storageFolder,
    signal,
  }) {
    if (!desktopAvailable) throw new Error('图片操作需要桌面程序');
    signal.throwIfAborted();
    const owned = writeOwner(documentContext);
    const target = owned instanceof Promise ? await owned : owned;
    const id = target.id;
    const operationId = crypto.randomUUID();
    const cancel = () => {
      void invoke('cancel_document_image_action', { operationId }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      signal.throwIfAborted();
      const assertWrite = guardImageWrite(id);
      const expectedMetadataRevision = imageEpoch(id);
      const result = await invoke<DocumentImage | null>('perform_document_image_action', {
        request: {
          operationId,
          id,
          action,
          source,
          reference,
          referenceRoot,
          storageFolder: storageFolder ?? readPreferences().imageStorageFolder,
          expectedMetadataRevision: expectedMetadataRevision ?? null,
          relativePath: readPreferences().useRelativeImagePath,
          relativePathWithDot: readPreferences().relativeImagePathWithDot,
        },
      });
      assertWrite();
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener('abort', cancel);
      target.settle();
    }
  },
};

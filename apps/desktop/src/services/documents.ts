import { invoke, isTauri } from '@tauri-apps/api/core';
import { forgetImageEpoch } from './image-epochs.js';
import type { EntryRenameReceipt } from './workspaces.js';
export interface DocumentFile {
  id: string;
  path: string;
  text: string;
  encoding: string;
  imageWarning?: string | null;
  /** Only a Native file-input receipt may report this entity comparison. */
  nativeSameDocument?: boolean;
  /** Native path generation. Optional only for older hosts/test fixtures. */
  metadataRevision?: number;
  /** Missing only for older hosts. Trashed drafts keep their editor identity. */
  locationState?: 'available' | 'trashed';
}
export interface DocumentMetadata {
  id: string;
  path: string;
  encoding: string;
  metadataRevision: number;
  locationState?: 'available' | 'trashed';
}
/** Same-window successful write acknowledgement; bounded independently of the active document. */
export interface SavedDocumentPreview {
  path: string;
  sourcePrefix: string;
}
export type DocumentChange =
  | { status: 'unchanged' }
  | { status: 'changed'; version: string; document: DocumentFile }
  | { status: 'missing'; message: string }
  | {
      status: 'unreadable';
      reason:
        | 'invalid-path'
        | 'unsupported-encoding'
        | 'too-large'
        | 'permission-denied'
        | 'io'
        | 'unstable'
        | 'capacity';
      message: string;
    };
export type ChangedDocument = Extract<DocumentChange, { status: 'changed' }>;
export type DocumentWatch =
  | { status: 'watching'; watchId: string }
  | { status: 'fallback'; reason: string; message: string };
export type PreparedUntitledClose =
  | { kind: 'unsupported' | 'cancel' | 'discard' }
  | { kind: 'saved'; document: DocumentFile };
export const desktopAvailable = isTauri();
export const documents = {
  metadata: (id: string) => invoke<DocumentMetadata>('get_document_metadata', { id }),
  prepareUntitledClose: (text: string, encoding?: string, suggestedName?: string) =>
    invoke<PreparedUntitledClose>('prepare_untitled_close', {
      request: { text, encoding: encoding ?? null, suggestedName: suggestedName ?? null },
    }),
  close: async (id: string) => {
    await invoke<void>('close_document', { id });
    forgetImageEpoch(id);
  },
  open: () => invoke<DocumentFile>('open_document'),
  openNative: (ticket: string) => invoke<DocumentFile>('open_native_input_document', { ticket }),
  save: (id: string, text: string) => invoke<DocumentFile>('save_document', { id, text }),
  saveAs: (text: string, sourceId?: string, encoding?: string, suggestedName?: string) =>
    invoke<DocumentFile>('save_document_as', {
      text,
      sourceId: sourceId ?? null,
      encoding: encoding ?? null,
      suggestedName: suggestedName ?? null,
    }),
  /** Rename the file the open document is saved as; the host owns the location. */
  renameFile: (id: string, newName: string, operationId: string) =>
    invoke<EntryRenameReceipt>('rename_document_file', { documentId: id, newName, operationId }),
  checkChange: (id: string) => invoke<DocumentChange>('check_document_change', { id }),
  acceptChange: (id: string, version: string) =>
    invoke<DocumentFile>('accept_document_change', { id, version }),
  dismissChange: (id: string, version: string) =>
    invoke<boolean>('dismiss_document_change', { id, version }),
  startWatch: (id: string) => invoke<DocumentWatch>('start_document_watch', { id }),
  stopWatch: (id: string, watchId: string) =>
    invoke<boolean>('stop_document_watch', { id, watchId }),
};

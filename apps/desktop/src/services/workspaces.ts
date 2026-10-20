import { invoke } from '@tauri-apps/api/core';
import type { DocumentFile } from './documents.js';

export interface WorkspaceFolder {
  id: string;
  name: string;
  path: string;
  metadataRevision?: number;
}
export interface WorkspaceEntry {
  name: string;
  relativePath: string;
  kind: 'directory' | 'file';
  size: number | null;
  /** Unix milliseconds; absent for older hosts and null when the filesystem cannot supply it. */
  modifiedAt?: number | null;
  createdAt?: number | null;
}
export interface DirectoryListing {
  entries: WorkspaceEntry[];
  truncated: boolean;
  skipped: number;
  ignored?: number;
  scannedEntries?: number;
  truncationReasons?: 'entries'[];
}
export interface WorkspaceCatalogSnapshot {
  fingerprint: string;
  scannedEntries: number;
  unreadable: number;
  truncated: boolean;
  truncationReasons: ('entries' | 'depth' | 'time')[];
}
export interface CreatedWorkspaceEntry extends WorkspaceEntry {
  /** Window/workspace-bound authority for naming this newly created entity only. */
  entryToken: string;
}
export type InspectedWorkspaceEntry = CreatedWorkspaceEntry;
export interface EntryRenameReceipt extends InspectedWorkspaceEntry {
  operationId: string;
  oldRelativePath: string;
  warnings: string[];
}
export type EntryRenameResolution =
  | { status: 'prepared' }
  | { status: 'committed'; receipt: EntryRenameReceipt }
  | { status: 'rejected'; message: string }
  | { status: 'mutationUncertain' };
export interface WorkspaceEntryRenamed {
  oldPath: string;
  newPath: string;
  kind: 'file' | 'directory';
}

export interface WorkspaceFileUndo {
  token: string;
  description: string;
}
export interface WorkspaceTrashReceipt {
  operationId: string;
  entryToken: string;
  status: 'trashed' | 'cancelled';
  /** Interactive confirmation retains the current document; suppressed warnings may advance. */
  preserveCurrent?: boolean;
  relativePath: string;
  kind: 'file' | 'directory';
  warnings: string[];
}
export interface WorkspaceUndoReceipt {
  operationId: string;
  undoToken: string;
  restoredRelativePath: string | null;
  kind: 'file' | 'directory';
  warnings: string[];
}
export type FileOperationResolution<T> =
  | { status: 'prepared' }
  | { status: 'committed'; receipt: T }
  | { status: 'rejected'; message: string }
  | { status: 'mutationUncertain' };
export interface WorkspaceEntryPresence {
  path: string;
  kind: 'file' | 'directory';
}

export interface WorkspaceDocument {
  name: string;
  relativePath: string;
  folderName: string;
  folderRelativePath: string;
  size: number;
  modifiedAt: number | null;
  createdAt: number | null;
  /** Strictly decoded raw Markdown prefix of at most 800 source bytes, never executable HTML. */
  summary: string;
  summaryTruncated: boolean;
}
/** One preview read for a row that became visible; `ignored` rows are hidden by the host. */
export interface WorkspaceDocumentSummary {
  relativePath: string;
  state: 'ready' | 'ignored' | 'unavailable' | 'unsupported';
  size: number;
  modifiedAt: number | null;
  createdAt: number | null;
  summary: string;
  summaryTruncated: boolean;
}
export interface WorkspaceArticlesReport {
  entries: WorkspaceDocument[];
  truncated: boolean;
  scannedFiles: number;
  scannedEntries: number;
  readBytes: number;
  skipped: {
    symlinks: number;
    unsupportedNames: number;
    unreadable: number;
    unsupportedEncoding: number;
    ignored: number;
  };
  truncationReasons: ('documents' | 'scan' | 'depth' | 'bytes')[];
}
/** Documents per directory, including everything below it. Folders without documents are absent. */
export interface WorkspaceDocumentCounts {
  counts: Record<string, number>;
  scannedEntries: number;
  truncated: boolean;
}
export interface WorkspaceMatchPosition {
  /** One-based line and UTF-16 column, matching JavaScript string offsets. */
  line: number;
  column: number;
  matchLength: number;
  /** Full source match when bounded; null for matches represented only by fingerprint. */
  expectedText?: string | null;
  /** FNV-1a 64-bit hash of actual matched UTF-16LE units, excluding preview text. */
  matchFingerprint?: string;
  /** Fingerprint of the decoded source whose UTF-16 coordinates were searched. */
  sourceFingerprint?: string;
}
export interface WorkspaceSearchMatch extends WorkspaceMatchPosition {
  relativePath: string;
  preview: string;
  /** UTF-16 offset/length of the matched text inside `preview`. */
  previewMatchStart: number;
  previewMatchLength: number;
}
export interface WorkspaceSearchReport {
  matches: WorkspaceSearchMatch[];
  scannedFiles: number;
  skipped: {
    nonUtf8: number;
    unsupportedEncoding?: number;
    ignored?: number;
    tooLarge: number;
    unreadable: number;
    symlinks: number;
    unsupportedNames: number;
  };
  truncated: boolean;
  scannedEntries?: number;
  readBytes?: number;
  truncationReasons?: (
    | 'results'
    | 'files'
    | 'entries'
    | 'directory'
    | 'depth'
    | 'bytes'
    | 'time'
  )[];
}
export const workspaces = {
  fileUndo: (workspaceId: string) =>
    invoke<WorkspaceFileUndo | null>('get_workspace_file_undo', { workspaceId }),
  performFileUndo: (workspaceId: string, undoToken: string, operationId: string) =>
    invoke<WorkspaceUndoReceipt>('perform_workspace_file_undo', {
      workspaceId,
      undoToken,
      operationId,
    }),
  resolveFileUndo: (workspaceId: string, undoToken: string, operationId: string) =>
    invoke<FileOperationResolution<WorkspaceUndoReceipt> | null>('resolve_workspace_file_undo', {
      workspaceId,
      undoToken,
      operationId,
    }),
  trashEntry: (workspaceId: string, entryToken: string, operationId: string) =>
    invoke<WorkspaceTrashReceipt>('trash_workspace_entry', {
      workspaceId,
      entryToken,
      operationId,
    }),
  resolveTrash: (workspaceId: string, entryToken: string, operationId: string) =>
    invoke<FileOperationResolution<WorkspaceTrashReceipt> | null>('resolve_workspace_entry_trash', {
      workspaceId,
      entryToken,
      operationId,
    }),
  inspect: (workspaceId: string, relativePath: string) =>
    invoke<InspectedWorkspaceEntry>('inspect_workspace_entry', { workspaceId, relativePath }),
  renameEntry: (workspaceId: string, entryToken: string, newName: string, operationId: string) =>
    invoke<EntryRenameReceipt>('rename_workspace_entry', {
      workspaceId,
      entryToken,
      newName,
      operationId,
    }),
  resolveRename: (workspaceId: string, operationId: string) =>
    invoke<EntryRenameResolution | null>('resolve_workspace_entry_rename', {
      workspaceId,
      operationId,
    }),
  finishEntry: (workspaceId: string, entryToken: string) =>
    invoke<void>('finish_workspace_entry', { workspaceId, entryToken }),
  create: (
    workspaceId: string,
    parentRelativePath: string,
    kind: 'file' | 'directory',
    operationId: string,
  ) =>
    invoke<CreatedWorkspaceEntry>('create_workspace_entry', {
      workspaceId,
      parentRelativePath,
      kind,
      operationId,
    }),
  renameCreation: (workspaceId: string, entryToken: string, newName: string) =>
    invoke<CreatedWorkspaceEntry>('rename_workspace_creation', {
      workspaceId,
      entryToken,
      newName,
    }),
  finishCreation: (workspaceId: string, entryToken: string) =>
    invoke<void>('finish_workspace_creation', { workspaceId, entryToken }),
  createWithDialog: (workspaceId: string) =>
    invoke<boolean>('create_workspace_file_with_dialog', { workspaceId }),
  select: () => invoke<WorkspaceFolder>('select_workspace'),
  openNative: (ticket: string) =>
    invoke<WorkspaceFolder>('open_native_input_workspace', { ticket }),
  close: (workspaceId: string) => invoke<void>('close_workspace', { workspaceId }),
  list: (workspaceId: string, relativePath = '') =>
    invoke<DirectoryListing>('list_directory', { workspaceId, relativePath }),
  catalogSnapshot: (workspaceId: string) =>
    invoke<WorkspaceCatalogSnapshot | null>('snapshot_workspace', { workspaceId }),
  articles: (workspaceId: string) =>
    invoke<WorkspaceArticlesReport>('list_workspace_documents', { workspaceId }),
  /** Previews for at most 64 already-listed documents; the listing itself carries no content. */
  articleSummaries: (workspaceId: string, relativePaths: string[]) =>
    invoke<WorkspaceDocumentSummary[] | null>('read_workspace_document_summaries', {
      workspaceId,
      relativePaths,
    }),
  open: (workspaceId: string, relativePath: string) =>
    invoke<DocumentFile>('open_workspace_document', { workspaceId, relativePath }),
  documentCounts: (workspaceId: string) =>
    invoke<WorkspaceDocumentCounts>('count_workspace_documents', { workspaceId }),
  search: (
    workspaceId: string,
    query: string,
    options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean } = {},
    maxResults = 5000,
  ) =>
    invoke<WorkspaceSearchReport>('search_workspace', {
      workspaceId,
      query,
      caseSensitive: options.caseSensitive ?? true,
      wholeWord: options.wholeWord ?? false,
      useRegex: options.useRegex ?? false,
      maxResults,
    }),
};

import { invoke } from '@tauri-apps/api/core';
import type { DocumentFile } from './documents.js';

export interface RecentFile {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
}
export interface RecentListing {
  revision: number;
  entries: RecentFile[];
}
/** Paths are display-only. Only Rust can resolve a persisted ID or obtain a
 * path from a currently authorized document session. */
export const recentFiles = {
  list: () => invoke<RecentListing>('list_recent_files'),
  remember: (documentId: string) =>
    invoke<RecentFile | null>('remember_recent_file', { documentId }),
  open: (id: string) => invoke<DocumentFile>('open_recent_file', { id }),
  remove: (id: string) => invoke<RecentListing>('remove_recent_file', { id }),
  clear: () => invoke<RecentListing>('clear_recent_files'),
};

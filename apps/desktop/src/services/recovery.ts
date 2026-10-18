import { invoke } from '@tauri-apps/api/core';
import { listFallbacks } from './recovery-fallback.js';

export interface DraftContent {
  text: string;
  savedText: string;
  document: { path: string; encoding: string } | null;
  selection: { anchor: number; head: number } | null;
}
export interface RecoveryLease {
  id: string;
  lease: string;
  version: number;
}
export interface RecoveryReceipt {
  id: string;
  version: number;
  updatedAt: number;
  imageWarning?: string | null;
}
export interface RecoverySummary {
  id: string;
  version: number;
  updatedAt: number;
  textBytes: number;
  document: DraftContent['document'];
  active: boolean;
}
export interface RecoveryDraft extends DraftContent, RecoveryReceipt {
  sequence: number;
  createdAt: number;
  /** Native-only checkpoint association; source paths cannot create this grant. */
  imageContext?: string | null;
  imageWarning?: string | null;
}
export interface RecoveryListing {
  drafts: RecoverySummary[];
  savedCopies: RecoverySummary[];
  issues: { file: string; reason: string }[];
}
export interface RecoveryCheckpoint extends DraftContent, RecoveryLease {
  expectedVersion: number;
  sequence: number;
}
export interface RecoveryAdapter {
  begin(): Promise<RecoveryLease>;
  checkpoint(value: Omit<RecoveryCheckpoint, 'version'>): Promise<RecoveryReceipt>;
  consume(id: string, version: number, lease?: string): Promise<void>;
  end(id: string, lease: string): Promise<void>;
}
export const recovery: RecoveryAdapter & {
  list(): Promise<RecoveryListing>;
  read(id: string, version: number): Promise<RecoveryDraft>;
} = {
  begin: () => invoke('begin_recovery_session'),
  checkpoint: (checkpoint) => invoke('checkpoint_recovery', { checkpoint }),
  list: () => invoke('list_recovery_drafts'),
  read: (id, version) => invoke('read_recovery_draft', { id, version }),
  consume: (id, version, lease) =>
    invoke('consume_recovery_draft', { id, version, lease: lease ?? null }),
  end: (id, lease) => invoke('end_recovery_session', { id, lease }),
};

export interface FallbackContext {
  owner: string;
  activeOwners: string[];
  activeLabels: string[];
}
export interface FallbackImport {
  id: string;
  version: number;
  owner: string | null;
  legacyLabel: string | null;
  content: DraftContent;
}
export interface FallbackReceipt extends RecoveryReceipt {
  available: boolean;
}
export const fallbackRecovery = {
  context: () => invoke<FallbackContext>('fallback_recovery_context'),
  import: (fallback: FallbackImport) =>
    invoke<FallbackReceipt>('import_fallback_recovery', { fallback }),
};

export async function discoverRecovery(): Promise<
  RecoveryListing & { fallbackAvailable: boolean }
> {
  const context = await fallbackRecovery.context();
  const local = await listFallbacks(localStorage, context);
  const listing = await recovery.list();
  return {
    ...listing,
    issues: [
      ...listing.issues,
      ...local.issues.map((reason) => ({ file: 'localStorage', reason })),
    ],
    fallbackAvailable: local.drafts.some((draft) => !draft.active),
  };
}

import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import type { DocumentFile } from '../../services/documents.js';
import { type OsOpenResult, osOpenService } from './os-open-service.js';
export interface OsOpenContext {
  editor: () => MarkLyraEditor | null;
  available: () => boolean;
  /** Excludes only this initialization's own document busy flag. */
  mayInitialize: () => boolean;
  owner: () => object;
  canReuse: () => boolean;
  initialize: (
    document: DocumentFile,
    revision: number,
    mayLoad: () => boolean,
  ) => Promise<boolean>;
  settleSession: () => Promise<void>;
  report: (message: string) => void;
}
interface Service {
  take: (reuse: boolean) => Promise<OsOpenResult | null>;
  complete: (token: string, accepted: boolean) => Promise<void>;
}
/** Every asynchronous boundary rechecks the editor owner, source and revision.
 * A document that can no longer use the blank editor is handed back to Native
 * for a separate window; it never enters a dirty-document replacement flow. */
export async function deliverOsOpen(
  context: OsOpenContext,
  service: Service = osOpenService,
): Promise<boolean> {
  const active = context.editor();
  if (!active || !context.available() || active.isComposing) return false;
  const owner = context.owner();
  const revision = active.revision;
  const source = active.getMarkdown();
  const current = (initializing = false) =>
    (initializing ? context.mayInitialize() : context.available()) &&
    context.editor() === active &&
    context.owner() === owner &&
    !active.isComposing &&
    !active.hasPendingChanges &&
    active.revision === revision &&
    active.getMarkdown() === source;
  if (!current()) return false;
  // Empty-queue polling performs no editor serialization. Only a Native
  // candidate that may reuse this window needs a synchronous source flush.
  const result = await service.take(context.canReuse() && source === '');
  if (!result) return false;
  if (result.kind === 'warning') {
    context.report(result.message);
    return true;
  }
  if (result.kind === 'handled') return true;
  let accepted = false;
  try {
    if (current()) await active.flush();
    if (current() && context.canReuse() && source === '')
      accepted = await context.initialize(
        result.document,
        revision,
        () => current(true) && context.canReuse(),
      );
  } finally {
    // After successful initialize the owner intentionally changes. ACK success
    // is based on its confirmed return, not on the obsolete source snapshot.
    await service.complete(result.token, accepted);
  }
  if (accepted) await context.settleSession();
  return true;
}

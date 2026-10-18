import { useEffect, useRef, useState } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import {
  type WorkspaceCatalogSnapshot,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';

/** Metadata-only, bounded checks. Each generation owns at most one pending invocation. */
export function useWorkspaceCatalog(workspace: WorkspaceFolder | null, changed: () => void) {
  const notify = useRef(changed);
  notify.current = changed;
  const [status, setStatus] = useState('');
  const id = workspace?.id;
  const path = workspace?.path;
  const revision = workspace?.metadataRevision;
  // biome-ignore lint/correctness/useExhaustiveDependencies: path/revision invalidate a relocated capability's pending scan.
  useEffect(() => {
    setStatus('');
    if (!desktopAvailable || !id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fingerprint: string | undefined;
    let previousTruncated: boolean | undefined;
    const check = async () => {
      let supported = true;
      try {
        const snapshot: WorkspaceCatalogSnapshot | null = await workspaces.catalogSnapshot(id);
        if (!live) return;
        // Older hosts/test doubles can explicitly omit snapshot support.
        if (snapshot === null || snapshot === undefined) {
          supported = false;
          return;
        }
        // The first listing may finish before this baseline includes an external mutation.
        // Re-read once after establishing it; otherwise that mutation has no later delta.
        // Partial scans can cover a different prefix at each time/entry cutoff.
        // Publish each completeness transition, but never restart listings/searches
        // repeatedly just because two incomplete observations have different hashes.
        if (
          fingerprint === undefined ||
          previousTruncated !== snapshot.truncated ||
          (!snapshot.truncated && fingerprint !== snapshot.fingerprint)
        )
          notify.current();
        fingerprint = snapshot.fingerprint;
        previousTruncated = snapshot.truncated;
        const messages: string[] = [];
        if (snapshot.truncated) {
          const reasons = snapshot.truncationReasons.map((reason) =>
            reason === 'entries' ? '条目数' : reason === 'depth' ? '目录深度' : '扫描时间',
          );
          messages.push(
            `目录变化检查已达到${reasons.join('、') || '扫描'}上限，已检查 ${snapshot.scannedEntries} 个条目。自动刷新已暂停；请手动刷新或选择更小的目录。`,
          );
        }
        if (snapshot.unreadable > 0)
          messages.push(
            `目录变化检查有 ${snapshot.unreadable} 项无法检查，未检查部分可能存在未显示的变化。`,
          );
        setStatus(messages.join(''));
      } catch (reason) {
        if (live) setStatus(`目录变化检查失败：${String(reason)}。稍后重试；可手动刷新目录。`);
      } finally {
        if (live && supported) timer = setTimeout(() => void check(), 2000);
      }
    };
    void check();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [id, path, revision]);
  return status;
}

import type {
  DirectoryHistoryCatalog,
  DirectoryHistoryEntry,
} from '../../services/directory-history.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';

/** Display budget excludes the selected current location. */
export function directoryMenuLimit(
  contentHeight: number,
  baseHeight: number,
  rowHeight: number,
): number {
  if (![contentHeight, baseHeight, rowHeight].every(Number.isFinite) || rowHeight < 0) return 0;
  const available = contentHeight - baseHeight - 20;
  if (rowHeight === 0) return available > 0 ? 6 : 0;
  return Math.max(0, Math.min(6, Math.floor(available / rowHeight)));
}
export function directoryMenuRows(
  catalog: DirectoryHistoryCatalog,
  workspace: WorkspaceFolder | null,
  limit: number,
): DirectoryHistoryEntry[] {
  const selected = catalog.entries.filter((entry) => entry.current);
  if (selected.length > 1) throw new Error('目录列表的当前位置无效。');
  const current =
    selected[0] ??
    (workspace
      ? {
          target: { kind: 'workspace' as const, workspaceId: workspace.id },
          name: workspace.name,
          path: workspace.path,
          pinned: false,
          current: true,
          reopenable: true,
        }
      : undefined);
  const others = catalog.entries.filter(
    (entry) => !entry.current && (!catalog.noRecentFiles || entry.pinned),
  );
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(6, Math.floor(limit))) : 0;
  const rows = [
    ...others.filter((entry) => entry.pinned),
    ...others.filter((entry) => !entry.pinned),
  ].slice(0, count);
  return current ? [...rows, current] : rows;
}

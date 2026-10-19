export interface HistoryItem {
  id: string;
  title: string;
  archived: boolean;
}
export interface HistoryRemoval {
  removed: string[];
  failed: { item: HistoryItem; error: string }[];
}
/** Reuse the host archive gate and per-record ownership/tombstone cleanup. */
export async function removeHistory(
  items: HistoryItem[],
  manage: (id: string, action: 'archive' | 'delete') => Promise<unknown>,
  progress: (completed: number) => void,
): Promise<HistoryRemoval> {
  const result: HistoryRemoval = { removed: [], failed: [] };
  for (const source of items) {
    const item = { ...source };
    try {
      if (!item.archived) {
        await manage(item.id, 'archive');
        item.archived = true;
      }
      await manage(item.id, 'delete');
      result.removed.push(item.id);
    } catch (error) {
      result.failed.push({ item, error: String(error) });
    }
    progress(result.removed.length + result.failed.length);
  }
  return result;
}

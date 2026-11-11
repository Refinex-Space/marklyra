import { type TaskFields, type TaskSnapshot, tasks as taskApi } from '../../services/tasks.js';

/** What the host recorded for each task change an agent made in one turn. */
export type AiReceipt =
  | { kind: 'created'; ids: string[] }
  | {
      kind: 'updated';
      id: string;
      /** Field values before the change, in patch form. */
      before: Partial<TaskFields>;
      /** The description before the change, when it changed. */
      description: string | null;
      /** The task's revision right after the change. */
      revision: string;
    };
export interface AiChange {
  agent: string;
  turnId: string;
  workspaceId: string;
  receipts: AiReceipt[];
}

export const aiChangeCount = (receipts: AiReceipt[]) =>
  receipts.reduce((n, r) => n + (r.kind === 'created' ? r.ids.length : 1), 0);

/**
 * Puts one turn's changes back, newest first. A task edited again after the agent (by the
 * person, the command line or sync) keeps that later edit and is reported as skipped.
 * Created tasks are archived, never deleted.
 */
export async function undoAiChanges(
  change: AiChange,
): Promise<{ undone: number; skipped: number }> {
  const { workspaceId } = change;
  let snapshot: TaskSnapshot = await taskApi.snapshot(workspaceId);
  const current = (id: string) => snapshot.tasks.find((t) => t.id === id);
  const reload = async () => {
    snapshot = await taskApi.snapshot(workspaceId);
  };
  // Tasks this undo already rewrote: their revision moved because of us, not someone else.
  const touched = new Set<string>();
  let undone = 0;
  let skipped = 0;
  for (const receipt of [...change.receipts].reverse()) {
    if (receipt.kind === 'created') {
      for (const id of receipt.ids) {
        const task = current(id);
        if (!task || task.archived) continue;
        const result = await taskApi.mutate(workspaceId, {
          kind: 'patch',
          ids: [id],
          revisions: [task.revision],
          set: { archived: true },
        });
        if (result.applied.includes(id)) undone++;
        else skipped++;
      }
      await reload();
      continue;
    }
    const task = current(receipt.id);
    if (!task || (task.revision !== receipt.revision && !touched.has(receipt.id))) {
      skipped++;
      continue;
    }
    let revision = task.revision;
    if (receipt.description !== null) {
      await taskApi.mutate(workspaceId, {
        kind: 'setDescription',
        id: receipt.id,
        revision,
        body: receipt.description,
      });
      await reload();
      revision = current(receipt.id)?.revision ?? revision;
    }
    if (Object.keys(receipt.before).length) {
      const result = await taskApi.mutate(workspaceId, {
        kind: 'patch',
        ids: [receipt.id],
        revisions: [revision],
        set: receipt.before,
      });
      if (!result.applied.includes(receipt.id)) {
        skipped++;
        continue;
      }
    }
    touched.add(receipt.id);
    undone++;
    await reload();
  }
  return { undone, skipped };
}

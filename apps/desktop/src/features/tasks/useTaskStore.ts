import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type MutationResult,
  onTasksChanged,
  type TaskFields,
  type TaskMeta,
  type TaskMutation,
  type TaskSnapshot,
  taskErrorMessage,
  tasks,
} from '../../services/tasks.js';
import { dismissNotice, notify, notifyTracked } from '../notices/notices.js';
import { Catalog } from './model/catalog.js';

type Load =
  | { state: 'loading' }
  | { state: 'ready'; snapshot: TaskSnapshot }
  | { state: 'error'; error: string };
interface UndoEntry {
  /** Previous field values per task id. */
  previous: Map<string, Partial<TaskFields>>;
  message: string;
}

/** Applies `set` to local copies so the list reacts in the same frame as the keypress. */
function optimistic(
  snapshot: TaskSnapshot,
  ids: ReadonlySet<string>,
  set: Partial<TaskFields>,
): TaskSnapshot {
  return {
    ...snapshot,
    tasks: snapshot.tasks.map((t) => (ids.has(t.id) ? ({ ...t, ...set } as TaskMeta) : t)),
  };
}

export interface TaskStore {
  load: Load;
  catalog: Catalog | null;
  refresh(): Promise<void>;
  /** Runs any mutation; returns null when it failed (already reported). */
  run(mutation: TaskMutation): Promise<MutationResult | null>;
  /** Field changes on existing tasks, with optimistic update, conflict report and undo. */
  patch(ids: string[], set: Partial<TaskFields>, message?: string): Promise<boolean>;
  undo(): Promise<void>;
  canUndo: boolean;
}

export function useTaskStore(workspaceId: string): TaskStore {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const latest = useRef<TaskSnapshot | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const undoNotices = useRef<number[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const serial = ++request.current;
    try {
      const snapshot = await tasks.snapshot(workspaceId);
      if (serial !== request.current) return;
      latest.current = snapshot;
      setLoad({ state: 'ready', snapshot });
    } catch (error) {
      if (serial !== request.current) return;
      if (!latest.current) setLoad({ state: 'error', error: taskErrorMessage(error) });
      else notify(taskErrorMessage(error), 'error');
    }
  }, [workspaceId]);
  useEffect(() => {
    latest.current = null;
    undoStack.current = [];
    setUndoDepth(0);
    setLoad({ state: 'loading' });
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onTasksChanged((generation) => {
      if (generation !== latest.current?.generation) void refresh();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('focus', focus);
      request.current++;
    };
  }, [refresh]);
  const run = useCallback(
    async (mutation: TaskMutation) => {
      try {
        const result = await tasks.mutate(workspaceId, mutation);
        await refresh();
        return result;
      } catch (error) {
        notify(taskErrorMessage(error), 'error');
        await refresh();
        return null;
      }
    },
    [refresh, workspaceId],
  );
  const apply = useCallback(
    async (ids: string[], set: Partial<TaskFields>) => {
      const snapshot = latest.current;
      if (!snapshot) return null;
      const current = snapshot.tasks.filter((t) => ids.includes(t.id));
      if (!current.length) return null;
      request.current++; // An in-flight refresh must not paint over the optimistic state.
      setLoad({ state: 'ready', snapshot: optimistic(snapshot, new Set(ids), set) });
      const result = await run({
        kind: 'patch',
        ids: current.map((t) => t.id),
        revisions: current.map((t) => t.revision),
        set,
      });
      if (result?.conflicts.length)
        notify(
          `${result.conflicts.length} 个任务已在其他地方被修改，未更新；已载入最新内容`,
          'warning',
        );
      return result ? { result, before: current } : null;
    },
    [run],
  );
  const undo = useCallback(async () => {
    const entry = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!entry) return;
    for (const id of undoNotices.current.splice(0)) dismissNotice(id);
    // Tasks with the same previous values go back in one batch.
    const batches = new Map<string, string[]>();
    for (const [id, values] of entry.previous) {
      const key = JSON.stringify(values);
      batches.set(key, [...(batches.get(key) ?? []), id]);
    }
    for (const [key, ids] of batches) await apply(ids, JSON.parse(key) as Partial<TaskFields>);
    notify('已撤销', 'info');
  }, [apply]);
  const patch = useCallback(
    async (ids: string[], set: Partial<TaskFields>, message?: string) => {
      const outcome = await apply(ids, set);
      if (!outcome) return false;
      const applied = new Set(outcome.result.applied);
      const previous = new Map<string, Partial<TaskFields>>();
      for (const t of outcome.before) {
        if (!applied.has(t.id)) continue;
        const values: Partial<TaskFields> = {};
        for (const key of Object.keys(set) as (keyof TaskFields)[])
          (values as Record<string, unknown>)[key] = (t as unknown as Record<string, unknown>)[key];
        previous.set(t.id, values);
      }
      if (previous.size && !('project' in set)) {
        undoStack.current.push({ previous, message: message ?? '已更新' });
        if (undoStack.current.length > 50) undoStack.current.shift();
        setUndoDepth(undoStack.current.length);
        if (message) {
          const id = notifyTracked(message, 'success', {
            actions: [{ label: '撤销 ⌘Z', run: () => void undo() }],
          });
          if (id !== undefined) undoNotices.current.push(id);
        }
      } else if (message) notify(message, 'success');
      return outcome.result.conflicts.length === 0;
    },
    [apply, undo],
  );
  const catalog = useMemo(
    () => (load.state === 'ready' ? new Catalog(load.snapshot) : null),
    [load],
  );
  return { load, catalog, refresh, run, patch, undo, canUndo: undoDepth > 0 };
}

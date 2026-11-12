import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onTasksChanged,
  type TaskMeta,
  type TaskSnapshot,
  taskErrorMessage,
  tasks,
} from '../../services/tasks.js';
import { Catalog } from '../tasks/model/catalog.js';
import { todayKey } from './calendar-dates.js';

export type AgendaStatus = 'loading' | 'ready' | 'error';
export interface TaskAgenda {
  status: AgendaStatus;
  error: string;
  retry(): void;
  catalog: Catalog | null;
  /** Unarchived tasks by due day, open ones first, then by priority (urgent first). */
  byDay: ReadonlyMap<string, readonly TaskMeta[]>;
  /** Open tasks due before today, oldest first. */
  overdue: readonly TaskMeta[];
}

const rank = (catalog: Catalog) => (a: TaskMeta, b: TaskMeta) =>
  Number(catalog.isOpen(b)) - Number(catalog.isOpen(a)) ||
  (a.priority || 5) - (b.priority || 5) ||
  a.order - b.order;

/**
 * The workspace's tasks for the home view and the sidebar calendar: one read-only snapshot
 * (a folder without tasks reads as empty and is never written), refreshed when tasks change.
 */
export function useTaskAgenda(workspaceId: string | null, today = todayKey()): TaskAgenda {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  const [status, setStatus] = useState<AgendaStatus>('loading');
  const [error, setError] = useState('');
  const serial = useRef(0);
  const generation = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const ticket = ++serial.current;
    try {
      const next = await tasks.snapshot(workspaceId);
      if (ticket !== serial.current) return;
      generation.current = next.generation;
      setSnapshot(next);
      setStatus('ready');
      setError('');
    } catch (failure) {
      if (ticket !== serial.current) return;
      setError(taskErrorMessage(failure));
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, [workspaceId]);
  useEffect(() => {
    setSnapshot(null);
    setStatus('loading');
    generation.current = null;
    if (!workspaceId) return;
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onTasksChanged((value) => {
      if (value !== generation.current) void refresh();
    }).then(
      (stop) => {
        if (disposed) stop();
        else unlisten = stop;
      },
      () => {},
    );
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      disposed = true;
      serial.current++;
      unlisten?.();
      window.removeEventListener('focus', focus);
    };
  }, [workspaceId, refresh]);

  const catalog = useMemo(() => (snapshot ? new Catalog(snapshot) : null), [snapshot]);
  const { byDay, overdue } = useMemo(() => {
    const days = new Map<string, TaskMeta[]>();
    const late: TaskMeta[] = [];
    if (catalog)
      for (const task of catalog.snapshot.tasks) {
        if (task.archived || !task.due) continue;
        const list = days.get(task.due);
        if (list) list.push(task);
        else days.set(task.due, [task]);
        if (task.due < today && catalog.isOpen(task)) late.push(task);
      }
    if (catalog) for (const list of days.values()) list.sort(rank(catalog));
    late.sort(
      (a, b) => (a.due ?? '').localeCompare(b.due ?? '') || (a.priority || 5) - (b.priority || 5),
    );
    return { byDay: days, overdue: late };
  }, [catalog, today]);
  return { status, error, retry: () => void refresh(), catalog, byDay, overdue };
}

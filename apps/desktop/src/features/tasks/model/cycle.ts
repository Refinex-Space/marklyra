import type { Cycle, Status, TaskMeta } from '../../../services/tasks.js';
import type { Catalog } from './catalog.js';
import { daysUntil } from './query.js';

export const cycleTitle = (cycle: Cycle) => cycle.name ?? `迭代 ${cycle.number}`;

export interface CycleStats {
  total: number;
  done: number;
  cancelled: number;
  open: number;
  planned: number;
  added: number;
  byStatus: { status: Status; count: number }[];
  byProject: { project: string | null; total: number; done: number }[];
  /** Unfinished tasks, for completing the cycle. */
  unfinished: TaskMeta[];
}

/** A finished cycle reports its frozen summary; a running one is counted live. */
export function cycleStats(catalog: Catalog, cycle: Cycle): CycleStats {
  const summary = cycle.state === 'completed' ? cycle.summary : null;
  const ids = summary
    ? new Set([...summary.completed, ...summary.cancelled, ...summary.unfinished])
    : null;
  const tasks = catalog.tasks.filter((t) =>
    ids ? ids.has(t.id) : t.cycle === cycle.number && !t.archived,
  );
  const started = cycle.started ?? `${cycle.start}T00:00:00Z`;
  const planned = tasks.filter((t) => !t.cycleAdded || t.cycleAdded <= started).length;
  const unfinished = tasks.filter((t) => catalog.isOpen(t));
  const projects = new Map<string | null, { total: number; done: number }>();
  for (const t of tasks) {
    const row = projects.get(t.project) ?? { total: 0, done: 0 };
    row.total += 1;
    if (catalog.category(t) === 'completed') row.done += 1;
    projects.set(t.project, row);
  }
  const statuses = new Map<string, number>();
  for (const t of tasks) statuses.set(t.status, (statuses.get(t.status) ?? 0) + 1);
  return {
    total: summary
      ? summary.completed.length + summary.cancelled.length + summary.unfinished.length
      : tasks.length,
    done: summary
      ? summary.completed.length
      : tasks.filter((t) => catalog.category(t) === 'completed').length,
    cancelled: summary
      ? summary.cancelled.length
      : tasks.filter((t) => catalog.category(t) === 'cancelled').length,
    open: summary ? summary.unfinished.length : unfinished.length,
    planned: summary ? summary.planned : planned,
    added: summary ? summary.added : tasks.length - planned,
    byStatus: catalog
      .statusesFor(null)
      .map((status) => ({ status, count: statuses.get(status.id) ?? 0 })),
    byProject: [...projects]
      .map(([project, row]) => ({ project, ...row }))
      .sort((a, b) => b.total - a.total),
    unfinished,
  };
}

/** How a cycle sits relative to today, in local days. */
export function cycleTiming(cycle: Cycle, now = new Date()) {
  const toStart = daysUntil(cycle.start, now);
  const toEnd = daysUntil(cycle.end, now);
  if (cycle.state === 'completed') return { kind: 'completed' as const, days: 0 };
  if (toStart > 0) return { kind: 'before' as const, days: toStart };
  if (toEnd < 0) return { kind: 'overrun' as const, days: -toEnd };
  // The end day itself still counts.
  return { kind: 'running' as const, days: toEnd + 1 };
}
export const timingText = (timing: ReturnType<typeof cycleTiming>) =>
  timing.kind === 'before'
    ? `${timing.days} 天后开始`
    : timing.kind === 'overrun'
      ? `已超出 ${timing.days} 天`
      : timing.kind === 'running'
        ? `剩余 ${timing.days} 天`
        : '已完成';

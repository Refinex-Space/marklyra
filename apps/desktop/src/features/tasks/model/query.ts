import type { Cycle, TaskMeta } from '../../../services/tasks.js';
import { type Catalog, PRIORITIES } from './catalog.js';

/** Filter keys and their aliases. Chinese aliases let people type in their own language. */
export const QUERY_KEYS = {
  status: ['status', 'state', '状态'],
  priority: ['priority', 'p', '优先级'],
  label: ['label', 'tag', '标签'],
  type: ['type', '类型'],
  bucket: ['bucket', '队列'],
  cycle: ['cycle', '迭代'],
  project: ['project', '项目'],
  is: ['is', '是'],
  has: ['has', '有'],
  due: ['due', '到期'],
  created: ['created', '创建'],
  completed: ['completed', '完成'],
} as const;
export type QueryKey = keyof typeof QUERY_KEYS;
export const QUERY_KEY_NAMES: Record<QueryKey, string> = {
  status: '状态',
  priority: '优先级',
  label: '标签',
  type: '类型',
  bucket: '队列',
  cycle: '迭代',
  project: '项目',
  is: '是',
  has: '有',
  due: '到期',
  created: '创建',
  completed: '完成',
};
export interface QueryChip {
  key: QueryKey;
  negated: boolean;
  values: string[];
}
export interface Query {
  chips: QueryChip[];
  text: string;
}

export function canonicalKey(raw: string): QueryKey | undefined {
  const lower = raw.toLowerCase();
  return (Object.keys(QUERY_KEYS) as QueryKey[]).find((key) =>
    (QUERY_KEYS[key] as readonly string[]).includes(lower),
  );
}

const TOKEN = /(-?)([^\s:"]+):("([^"]*)"|\S*)|"([^"]*)"|(\S+)/gu;
export function parseQuery(source: string): Query {
  const chips: QueryChip[] = [];
  const text: string[] = [];
  for (const m of source.matchAll(TOKEN)) {
    if (m[2] !== undefined) {
      const key = canonicalKey(m[2]);
      const raw = m[4] ?? m[3] ?? '';
      if (key && raw)
        chips.push({ key, negated: m[1] === '-', values: raw.split(',').filter(Boolean) });
      else text.push(m[0]);
    } else text.push(m[5] ?? m[6] ?? '');
  }
  return { chips, text: text.join(' ') };
}
const quote = (v: string) => (/[\s,"]/.test(v) ? `"${v.replace(/"/g, '')}"` : v);
export function serializeQuery(query: Query): string {
  return [
    ...query.chips.map((c) => `${c.negated ? '-' : ''}${c.key}:${c.values.map(quote).join(',')}`),
    query.text.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

const DAY = 86_400_000;
export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
/** Whole days from today to a `YYYY-MM-DD` date in local time. */
export function daysUntil(due: string, now = new Date()) {
  return Math.round((new Date(`${due}T00:00:00`).getTime() - startOfDay(now).getTime()) / DAY);
}
function withinRange(iso: string | null, value: string, now: Date) {
  const m = /^([<>])(\d+)([hdwm])$/.exec(value);
  if (!m || !iso) return false;
  const unit = { h: 3_600_000, d: DAY, w: 7 * DAY, m: 30 * DAY }[m[3] as 'h' | 'd' | 'w' | 'm'];
  const age = now.getTime() - new Date(iso).getTime();
  return m[1] === '<' ? age <= unit * Number(m[2]) : age > unit * Number(m[2]);
}

function matchValue(task: TaskMeta, key: QueryKey, raw: string, catalog: Catalog, now: Date) {
  const v = raw.toLowerCase();
  switch (key) {
    case 'status': {
      const s = catalog.status(task.status);
      const alias: Record<string, string> = {
        review: 'review',
        started: 'started',
        completed: 'completed',
        canceled: 'cancelled',
      };
      return (
        v === s.id || v === s.category || v === s.name.toLowerCase() || alias[v] === s.category
      );
    }
    case 'priority': {
      const p = PRIORITIES.find((x) => x.id === v || String(x.value) === v || x.name === v);
      return p !== undefined && task.priority === p.value;
    }
    case 'label':
      return task.labels.some((id) => id === v || catalog.label(id)?.name.toLowerCase() === v);
    case 'type':
      return v === 'none'
        ? !task.type
        : task.type === v || catalog.type(task.type)?.name.toLowerCase() === v;
    case 'bucket':
      return v === 'none'
        ? !task.bucket
        : task.bucket === v || catalog.bucket(task.bucket)?.name.toLowerCase() === v;
    case 'project':
      return v === 'none'
        ? !task.project
        : task.project === v ||
            catalog.key(task.project).toLowerCase() === v ||
            catalog.project(task.project)?.name.toLowerCase() === v;
    case 'cycle': {
      if (v === 'none' || v === '无') return task.cycle === null;
      if (task.cycle === null) return false;
      const named: Record<string, Cycle | undefined> = {
        current: catalog.activeCycle,
        当前: catalog.activeCycle,
        upcoming: catalog.upcomingCycle,
        next: catalog.upcomingCycle,
        下一个: catalog.upcomingCycle,
        previous: catalog.previousCycle,
        上一个: catalog.previousCycle,
      };
      const target = v in named ? named[v]?.number : Number(v.replace(/^#/, ''));
      return task.cycle === target;
    }
    case 'is':
      switch (v) {
        case 'open':
          return catalog.isOpen(task);
        case 'closed':
          return !catalog.isOpen(task);
        case 'overdue':
          return catalog.isOpen(task) && task.due !== null && daysUntil(task.due, now) < 0;
        case 'archived':
          return task.archived;
        case 'parent':
          return catalog.children(task.id).length > 0;
        case 'subtask':
          return task.parent !== null;
        case 'blocked':
        case '阻塞':
          return catalog.isBlocked(task);
        default:
          return false;
      }
    case 'has':
      switch (v) {
        case 'due':
          return task.due !== null;
        case 'labels':
          return task.labels.length > 0;
        case 'description':
          return task.hasDescription;
        case 'comments':
          return task.comments > 0;
        case 'subtasks':
          return catalog.children(task.id).length > 0;
        case 'parent':
          return task.parent !== null;
        case 'priority':
          return task.priority > 0;
        case 'type':
          return task.type !== null;
        case 'bucket':
          return task.bucket !== null;
        case 'cycle':
          return task.cycle !== null;
        case 'relations':
          return task.blockedBy.length > 0 || task.related.length > 0;
        default:
          return false;
      }
    case 'due': {
      if (v === 'none') return task.due === null;
      if (task.due === null) return false;
      const d = daysUntil(task.due, now);
      if (v === 'overdue') return d < 0 && catalog.isOpen(task);
      if (v === 'today') return d === 0;
      if (v === 'week') return d <= 7;
      // One calendar day, as the sidebar calendar asks for it.
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return task.due === v;
      const m = /^([<>])(\d+)([dw])$/.exec(v);
      if (!m) return false;
      const n = Number(m[2]) * (m[3] === 'w' ? 7 : 1);
      return m[1] === '<' ? d <= n : d > n;
    }
    case 'created':
      return withinRange(task.created, v, now);
    case 'completed':
      return catalog.category(task) === 'completed' && withinRange(task.completed, v, now);
  }
}

/** All chips AND together; values inside one chip OR together. Archived tasks need `is:archived`. */
export function matches(
  task: TaskMeta,
  query: Query,
  catalog: Catalog,
  now = new Date(),
  /** Ids the host found by description text; they satisfy the free-text words. */
  textHits?: ReadonlySet<string>,
): boolean {
  const wantArchived = query.chips.some(
    (c) => c.key === 'is' && !c.negated && c.values.includes('archived'),
  );
  if (task.archived !== wantArchived) return false;
  for (const chip of query.chips) {
    const hit = chip.values.some((v) => matchValue(task, chip.key, v, catalog, now));
    if (chip.negated ? hit : !hit) return false;
  }
  if (textHits?.has(task.id) && !/#\d/.test(query.text)) return true;
  for (const word of query.text.toLowerCase().split(/\s+/).filter(Boolean)) {
    const number = /^#(\d+)$/.exec(word);
    if (number) {
      if (task.number !== Number(number[1])) return false;
      continue;
    }
    const id = catalog.humanId(task).toLowerCase();
    if (
      !task.title.toLowerCase().includes(word) &&
      id !== word &&
      !task.previousIds.some((old) => old.toLowerCase() === word)
    )
      return false;
  }
  return true;
}

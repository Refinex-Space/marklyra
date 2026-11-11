import type { TaskFields, TaskMeta } from '../../../services/tasks.js';
import { type Catalog, PRIORITIES, priorityRank } from './catalog.js';

export type GroupBy = 'status' | 'priority' | 'type' | 'bucket' | 'project' | 'none';
export type OrderBy = 'manual' | 'priority' | 'due' | 'created' | 'updated';
export type Layout = 'list' | 'board';
export interface Display {
  layout: Layout;
  groupBy: GroupBy;
  orderBy: OrderBy;
}
export const DEFAULT_DISPLAY: Display = { layout: 'list', groupBy: 'status', orderBy: 'manual' };
/** Boards lay out columns by status or bucket only. */
export const boardColumns = (groupBy: GroupBy): 'status' | 'bucket' =>
  groupBy === 'bucket' ? 'bucket' : 'status';

export interface Group {
  key: string;
  name: string;
  /** Field values a task created inside this group starts with. */
  defaults: Partial<TaskFields>;
  /** What kind of glyph to draw, and its subject id. */
  glyph: { kind: 'status' | 'priority' | 'type' | 'bucket' | 'project' | 'all'; id: string };
  count: number;
}
export type Row =
  | { kind: 'task'; id: string; tree: 'mid' | 'end' | null }
  | { kind: 'ghost'; id: string }
  | { kind: 'fold'; key: string; count: number; open: boolean };
export interface Section {
  group: Group;
  collapsed: boolean;
  rows: Row[];
}

const NONE = '∅';
const keyOf = (task: TaskMeta, by: GroupBy): string => {
  switch (by) {
    case 'status':
      return task.status;
    case 'priority':
      return String(task.priority);
    case 'type':
      return task.type ?? NONE;
    case 'bucket':
      return task.bucket ?? NONE;
    case 'project':
      return task.project ?? NONE;
    case 'none':
      return '*';
  }
};

export function groupsFor(
  by: GroupBy,
  catalog: Catalog,
  project: string | null,
): Omit<Group, 'count'>[] {
  const snap = catalog.snapshot;
  switch (by) {
    case 'status':
      return catalog.statusesFor(project).map((s) => ({
        key: s.id,
        name: s.name,
        defaults: { status: s.id },
        glyph: { kind: 'status', id: s.id },
      }));
    case 'priority':
      return PRIORITIES.map((p) => ({
        key: String(p.value),
        name: p.name,
        defaults: { priority: p.value },
        glyph: { kind: 'priority', id: String(p.value) },
      }));
    case 'type':
      return [
        ...snap.types.map((t) => ({
          key: t.id,
          name: t.name,
          defaults: { type: t.id },
          glyph: { kind: 'type' as const, id: t.id },
        })),
        { key: NONE, name: '无类型', defaults: { type: null }, glyph: { kind: 'type', id: '' } },
      ];
    case 'bucket':
      return [
        ...snap.buckets.map((b) => ({
          key: b.id,
          name: b.name,
          defaults: { bucket: b.id },
          glyph: { kind: 'bucket' as const, id: b.id },
        })),
        {
          key: NONE,
          name: '无队列',
          defaults: { bucket: null },
          glyph: { kind: 'bucket', id: '' },
        },
      ];
    case 'project':
      return [
        ...snap.projects.map((p) => ({
          key: p.id,
          name: p.name,
          defaults: { project: p.id },
          glyph: { kind: 'project' as const, id: p.id },
        })),
        {
          key: NONE,
          name: '无项目',
          defaults: { project: null },
          glyph: { kind: 'project', id: '' },
        },
      ];
    case 'none':
      return [{ key: '*', name: '全部任务', defaults: {}, glyph: { kind: 'all', id: '' } }];
  }
}

export function comparator(order: OrderBy): (a: TaskMeta, b: TaskMeta) => number {
  const tie = (a: TaskMeta, b: TaskMeta) => a.order - b.order || a.id.localeCompare(b.id);
  switch (order) {
    case 'manual':
      return tie;
    case 'priority':
      return (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || tie(a, b);
    case 'due':
      return (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || tie(a, b);
    case 'created':
      return (a, b) => b.created.localeCompare(a.created) || tie(a, b);
    case 'updated':
      return (a, b) => b.updated.localeCompare(a.updated) || tie(a, b);
  }
}

/**
 * Lays out a grouped list. Subtasks follow their parent with tree lines; a subtask whose
 * parent sits in another group gets a dimmed copy of the parent above it. Outside status
 * grouping, closed tasks fold into one "N closed" row per group.
 */
export function buildSections(
  tasks: TaskMeta[],
  catalog: Catalog,
  display: Display,
  options: {
    project: string | null;
    collapsed: ReadonlySet<string>;
    openFolds: ReadonlySet<string>;
  },
): Section[] {
  const compare = comparator(display.orderBy);
  const byGroup = new Map<string, TaskMeta[]>();
  for (const t of tasks) {
    const k = keyOf(t, display.groupBy);
    const list = byGroup.get(k) ?? [];
    list.push(t);
    byGroup.set(k, list);
  }
  const sections: Section[] = [];
  for (const g of groupsFor(display.groupBy, catalog, options.project)) {
    const items = (byGroup.get(g.key) ?? []).sort(compare);
    if (!items.length && display.groupBy !== 'status') continue;
    const collapsed = options.collapsed.has(g.key);
    const rows: Row[] = [];
    if (!collapsed) {
      const fold = display.groupBy !== 'status';
      const live = fold ? items.filter((t) => catalog.isOpen(t)) : items;
      const closed = fold ? items.filter((t) => !catalog.isOpen(t)) : [];
      emit(live, rows, catalog);
      if (closed.length) {
        const key = `${g.key}:closed`;
        const open = options.openFolds.has(key);
        if (open) emit(closed, rows, catalog);
        rows.push({ kind: 'fold', key, count: closed.length, open });
      }
    }
    sections.push({ group: { ...g, count: items.length }, collapsed, rows });
  }
  return sections;
}

function emit(list: TaskMeta[], rows: Row[], catalog: Catalog) {
  const present = new Set(list.map((t) => t.id));
  const orphans = new Map<string, TaskMeta[]>();
  for (const t of list) {
    if (t.parent && present.has(t.parent)) continue;
    if (t.parent) {
      const group = orphans.get(t.parent) ?? [];
      group.push(t);
      orphans.set(t.parent, group);
      continue;
    }
    rows.push({ kind: 'task', id: t.id, tree: null });
    const kids = list.filter((k) => k.parent === t.id);
    kids.forEach((k, i) => {
      rows.push({ kind: 'task', id: k.id, tree: i < kids.length - 1 ? 'mid' : 'end' });
    });
  }
  for (const [parent, kids] of orphans) {
    if (catalog.task(parent)) rows.push({ kind: 'ghost', id: parent });
    kids.forEach((k, i) => {
      rows.push({ kind: 'task', id: k.id, tree: i < kids.length - 1 ? 'mid' : 'end' });
    });
  }
}

/** Ids in visual order, for keyboard movement and shift-selection. */
export const navigable = (sections: Section[]) =>
  sections.flatMap((s) => s.rows.flatMap((r) => (r.kind === 'task' ? [r.id] : [])));

/** The previous values of `fields` on each task, for an undo patch. */
export function inverse(
  tasks: TaskMeta[],
  fields: (keyof TaskFields)[],
): Map<string, Partial<TaskFields>> {
  const out = new Map<string, Partial<TaskFields>>();
  for (const t of tasks) {
    const previous: Partial<TaskFields> = {};
    for (const f of fields)
      (previous as Record<string, unknown>)[f] = (t as unknown as Record<string, unknown>)[f];
    out.set(t.id, previous);
  }
  return out;
}

const PINYIN_BOUNDARIES = '阿八嚓哒妸发旮哈讥咔垃妈拏噢妑七呥仨他屲夕丫帀';
const PINYIN_LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
let collator: Intl.Collator | undefined;
function pinyinInitial(char: string): string {
  collator ??= new Intl.Collator('zh-Hans-u-co-pinyin');
  let letter = '';
  for (let i = 0; i < PINYIN_BOUNDARIES.length; i++) {
    if (collator.compare(char, PINYIN_BOUNDARIES[i] ?? '') >= 0) letter = PINYIN_LETTERS[i] ?? '';
    else break;
  }
  return letter;
}
/** Suggests a 2–5 letter project key: English initials, pinyin initials for Chinese. */
export function suggestKey(name: string, taken: ReadonlySet<string>): string {
  const words = name.match(/[A-Za-z][A-Za-z0-9]*|[一-鿿]/gu) ?? [];
  let base = words
    .map((w) => (/^[一-鿿]$/u.test(w) ? pinyinInitial(w) : (w[0] ?? '')))
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (base.length === 1)
    base += (words[0]?.slice(1, 3) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (base.length < 2) base = 'PRJ';
  base = base.slice(0, 4);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10; i++)
    if (!taken.has(`${base.slice(0, 4)}${i}`)) return `${base.slice(0, 4)}${i}`;
  return base;
}
export const validKey = (key: string) => /^[A-Z][A-Z0-9]{1,4}$/.test(key);

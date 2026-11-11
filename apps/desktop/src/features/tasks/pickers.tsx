import { useState } from 'react';
import type { TaskFields, TaskMeta } from '../../services/tasks.js';
import { PriorityGlyph, StatusGlyph, TaskIcon } from './glyphs.js';
import { type Catalog, PRIORITIES } from './model/catalog.js';
import { type PickerOption, TaskPicker } from './TaskPicker.js';

export type PickerKind =
  | 'status'
  | 'priority'
  | 'label'
  | 'type'
  | 'bucket'
  | 'project'
  | 'due'
  | 'cycle'
  | 'template'
  | 'blockedBy'
  | 'related'
  | 'parent';
export const PICKER_KEYS: Record<string, PickerKind> = {
  s: 'status',
  p: 'priority',
  l: 'label',
  t: 'type',
  b: 'bucket',
  m: 'project',
  d: 'due',
  y: 'cycle',
};
const TITLES: Record<PickerKind, string> = {
  status: '修改状态…',
  priority: '设置优先级…',
  label: '添加或移除标签…',
  type: '设置类型…',
  bucket: '移到队列…',
  project: '移到项目…',
  due: '到期日：今天、明天，或输入 2026-12-01 / 3d',
  cycle: '加入迭代…',
  template: '使用模板…',
  blockedBy: '被以下任务阻塞…',
  related: '与以下任务相关…',
  parent: '设为以下任务的子任务…',
};
const FIELD_NAMES: Record<PickerKind, string> = {
  status: '状态',
  priority: '优先级',
  label: '标签',
  type: '类型',
  bucket: '队列',
  project: '项目',
  due: '到期日',
  cycle: '迭代',
  template: '模板',
  blockedBy: '阻塞关系',
  related: '相关任务',
  parent: '父任务',
};

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const dayFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDay(d);
};
export const formatDay = (day: string) => {
  const [, m, d] = day.split('-');
  return `${Number(m)}月${Number(d)}日`;
};
/** `11月9日–22日`, or with both months when the range crosses one. */
export const formatRange = (start: string, end: string) => {
  const [, m1] = start.split('-');
  const [, m2, d2] = end.split('-');
  return `${formatDay(start)}–${m1 === m2 ? `${Number(d2)}日` : formatDay(end)}`;
};
/** `2026-12-01`, `12-01`, `3d`, `2w` → `YYYY-MM-DD`. */
export function parseDay(text: string): string | null {
  const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const short = /^(\d{1,2})-(\d{1,2})$/.exec(text);
  const rel = /^(\d{1,3})([dw])$/.exec(text);
  if (rel) return dayFromNow(Number(rel[1]) * (rel[2] === 'w' ? 7 : 1));
  const parts = full
    ? [Number(full[1]), Number(full[2]), Number(full[3])]
    : short
      ? [new Date().getFullYear(), Number(short[1]), Number(short[2])]
      : null;
  if (!parts) return null;
  const [y = 0, m = 0, d = 0] = parts;
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d ? isoDay(date) : null;
}

export interface PickerTarget {
  kind: PickerKind;
  /** Existing tasks being changed; empty when editing a draft. */
  tasks: TaskMeta[];
  anchor: DOMRect | null;
  /** For drafts: the current values instead of task fields. */
  draft?: Partial<TaskFields> & { template?: string | null };
}

export function pickerOptions(
  kind: PickerKind,
  target: PickerTarget,
  catalog: Catalog,
): PickerOption<unknown>[] {
  const single = target.tasks.length === 1 ? target.tasks[0] : undefined;
  const value = <K extends keyof TaskFields>(field: K): TaskFields[K] | undefined =>
    target.draft
      ? (target.draft[field] as TaskFields[K] | undefined)
      : single
        ? (single[field as keyof TaskMeta] as TaskFields[K])
        : undefined;
  switch (kind) {
    case 'status':
      return catalog
        .statusesFor(target.draft ? (target.draft.project ?? null) : (single?.project ?? null))
        .map((s, i) => ({
          value: s.id,
          label: s.name,
          icon: <StatusGlyph status={s} />,
          ...(i < 9 ? { digit: String(i + 1) } : {}),
          selected: value('status') === s.id,
        }));
    case 'priority':
      return PRIORITIES.map((p, i) => ({
        value: p.value,
        label: p.name,
        icon: <PriorityGlyph value={p.value} />,
        digit: String(i === 4 ? 0 : i + 1),
        selected: value('priority') === p.value,
      }));
    case 'label': {
      const labels = target.draft?.labels;
      return catalog
        .labelsFor(target.draft ? (target.draft.project ?? null) : (single?.project ?? null))
        .map((l) => ({
          value: l.id,
          label: l.name,
          icon: (
            <i
              className="task-dot"
              style={{ background: `var(--task-c-${l.color}, var(--task-c-gray))` }}
            />
          ),
          selected: labels
            ? labels.includes(l.id)
            : target.tasks.length > 0 && target.tasks.every((t) => t.labels.includes(l.id)),
        }));
    }
    case 'type':
      return [
        ...catalog.snapshot.types.map((t) => ({
          value: t.id,
          label: t.name,
          icon: <TaskIcon name="type" color={t.color} />,
          selected: value('type') === t.id,
        })),
        {
          value: null,
          label: '无类型',
          icon: <TaskIcon name="blocked" />,
          selected: value('type') === null,
        },
      ];
    case 'bucket':
      return [
        ...catalog
          .bucketsFor(target.draft ? (target.draft.project ?? null) : (single?.project ?? null))
          .map((b) => ({
            value: b.id,
            label: b.name,
            icon: <TaskIcon name="layers" color={b.color} />,
            selected: value('bucket') === b.id,
          })),
        {
          value: null,
          label: '无队列',
          icon: <TaskIcon name="blocked" />,
          selected: value('bucket') === null,
        },
      ];
    case 'project':
      return [
        ...catalog.snapshot.projects
          .filter((p) => p.state !== 'archived')
          .map((p) => ({
            value: p.id,
            label: p.name,
            hint: p.key,
            icon: <TaskIcon name="folder" color={p.color} />,
            selected: value('project') === p.id,
          })),
        {
          value: null,
          label: '无项目',
          hint: catalog.snapshot.settings.unassignedKey,
          icon: <TaskIcon name="blocked" />,
          selected: value('project') === null,
        },
      ];
    case 'due':
      return [
        ...[
          ['今天', 0],
          ['明天', 1],
          ['下周一', (8 - new Date().getDay()) % 7 || 7],
          ['两周后', 14],
        ].map(([label, days]) => {
          const day = dayFromNow(Number(days));
          return {
            value: day,
            label: String(label),
            hint: formatDay(day),
            icon: <TaskIcon name="flag" />,
            selected: value('due') === day,
          };
        }),
        { value: null, label: '清除到期日', icon: <TaskIcon name="blocked" /> },
      ];
    case 'cycle':
      return [
        ...[catalog.activeCycle, catalog.upcomingCycle]
          .filter((c) => c !== undefined)
          .map((c, i) => ({
            value: c.number,
            label: c.state === 'active' ? '当前迭代' : '下一迭代',
            hint: formatRange(c.start, c.end),
            icon: <TaskIcon name="cycle" />,
            digit: String(i + 1),
            selected: value('cycle') === c.number,
          })),
        {
          value: null,
          label: '移出迭代',
          icon: <TaskIcon name="blocked" />,
          selected: value('cycle') === null,
        },
      ];
    case 'template':
      return [
        ...catalog.snapshot.templates.map((t, i) => ({
          value: t.id,
          label: t.name,
          ...(t.title ? { hint: t.title } : {}),
          icon: <TaskIcon name="template" />,
          ...(i < 9 ? { digit: String(i + 1) } : {}),
          selected: target.draft?.template === t.id,
        })),
        {
          value: null,
          label: '不使用模板',
          icon: <TaskIcon name="blocked" />,
          selected: !target.draft?.template,
        },
      ];
    case 'blockedBy':
    case 'related': {
      const [task] = target.tasks;
      if (!task) return [];
      const current = new Set(kind === 'blockedBy' ? task.blockedBy : task.related);
      return catalog.tasks
        .filter((t) => t.id !== task.id && !t.archived && (current.has(t.id) || catalog.isOpen(t)))
        .sort(
          (a, b) =>
            Number(current.has(b.id)) - Number(current.has(a.id)) ||
            Number(b.project === task.project) - Number(a.project === task.project) ||
            a.order - b.order,
        )
        .map((t) => ({
          value: t.id,
          label: t.title,
          hint: catalog.humanId(t),
          icon: <StatusGlyph status={catalog.status(t.status)} />,
          selected: current.has(t.id),
        }));
    }
    case 'parent': {
      const ids = new Set(target.tasks.map((t) => t.id));
      const project = single?.project ?? null;
      return [
        ...catalog.tasks
          .filter((t) => !t.parent && !t.archived && !ids.has(t.id))
          .sort(
            (a, b) =>
              Number(b.project === project) - Number(a.project === project) || a.order - b.order,
          )
          .map((t) => ({
            value: t.id,
            label: t.title,
            hint: catalog.humanId(t),
            icon: <StatusGlyph status={catalog.status(t.status)} />,
          })),
        { value: null, label: '设为独立任务', icon: <TaskIcon name="blocked" /> },
      ];
    }
  }
}

/** What the picker header shows about the tasks being changed. */
export function pickerContext(target: PickerTarget, catalog: Catalog) {
  const [first] = target.tasks;
  if (!first) return null;
  if (target.tasks.length === 1)
    return (
      <>
        <StatusGlyph status={catalog.status(first.status)} size={13} />
        <span className="mono">{catalog.humanId(first)}</span>
        <b>· {first.title}</b>
      </>
    );
  return (
    <>
      <b>{target.tasks.length} 个任务</b>
      <span>
        ·{' '}
        {target.tasks
          .slice(0, 3)
          .map((t) => catalog.humanId(t))
          .join(', ')}
        {target.tasks.length > 3 ? '…' : ''}
      </span>
    </>
  );
}

export const changeMessage = (kind: PickerKind, tasks: TaskMeta[], catalog: Catalog) =>
  tasks.length === 1 && tasks[0]
    ? `${catalog.humanId(tasks[0])} 的${FIELD_NAMES[kind]}已更新`
    : `已更新 ${tasks.length} 个任务的${FIELD_NAMES[kind]}`;

export function usePicker() {
  const [target, setTarget] = useState<PickerTarget | null>(null);
  return {
    target,
    open: (
      kind: PickerKind,
      tasks: TaskMeta[],
      anchor: Element | null = null,
      draft?: Partial<TaskFields> & { template?: string | null },
    ) =>
      setTarget({
        kind,
        tasks,
        anchor: anchor?.getBoundingClientRect() ?? null,
        ...(draft ? { draft } : {}),
      }),
    close: () => setTarget(null),
    set: setTarget,
  };
}

export function PickerHost({
  target,
  catalog,
  close,
  commit,
  createLabel,
}: {
  target: PickerTarget;
  catalog: Catalog;
  close(): void;
  /** Applies a single pick; labels toggle and keep the picker open. */
  commit(kind: PickerKind, value: unknown): void;
  createLabel?: (name: string) => void;
}) {
  const multiple = ['label', 'blockedBy', 'related'].includes(target.kind);
  return (
    <TaskPicker
      title={TITLES[target.kind]}
      context={pickerContext(target, catalog)}
      options={pickerOptions(target.kind, target, catalog)}
      multiple={multiple}
      anchor={target.anchor}
      onClose={close}
      onPick={(option) => {
        commit(target.kind, option.value);
        if (!multiple) close();
      }}
      {...(target.kind === 'due'
        ? {
            parse: (text: string) => {
              const day = parseDay(text);
              return day
                ? { value: day, label: formatDay(day), hint: day, icon: <TaskIcon name="flag" /> }
                : null;
            },
          }
        : {})}
      {...(multiple && createLabel
        ? { onCreate: createLabel, createLabel: (t: string) => `创建标签「${t}」` }
        : {})}
    />
  );
}

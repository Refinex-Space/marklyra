import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { TaskFields, TaskMeta } from '../../services/tasks.js';
import { colorVar, PriorityGlyph, ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import { type Catalog, PRIORITIES, priorityName } from './model/catalog.js';
import {
  canonicalKey,
  daysUntil,
  matches,
  parseQuery,
  QUERY_KEY_NAMES,
  QUERY_KEYS,
  type Query,
  type QueryKey,
} from './model/query.js';
import {
  buildSections,
  DEFAULT_DISPLAY,
  type Display,
  type GroupBy,
  navigable,
  type OrderBy,
  type Section,
} from './model/view.js';
import { formatDay } from './pickers.js';
import { TaskBoard } from './TaskBoard.js';

export interface ListState {
  query: Query;
  display: Display;
  collapsed: Set<string>;
  openFolds: Set<string>;
}
export const newListState = (): ListState => ({
  query: { chips: [], text: '' },
  display: { ...DEFAULT_DISPLAY },
  collapsed: new Set(),
  openFolds: new Set(),
});

interface Props {
  catalog: Catalog;
  tasks: TaskMeta[];
  project: string | null;
  state: ListState;
  setState(update: (state: ListState) => ListState): void;
  selection: ReadonlySet<string>;
  active: string | null;
  setActive(id: string | null, scroll?: boolean): void;
  toggleSelected(id: string, extend: boolean): void;
  open(id: string, order: string[]): void;
  pick(kind: 'status' | 'priority', task: TaskMeta, anchor: Element): void;
  createIn(defaults: Partial<TaskFields>): void;
  /** Ids in visual order, reported after each layout for keyboard movement. */
  onLayout(order: string[]): void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Board drops: the column's field plus a manual order. */
  move(task: TaskMeta, set: Partial<TaskFields>): void;
  /** Host full-text search over titles and descriptions. */
  searchText(text: string): Promise<string[]>;
  /** Extra toolbar controls, e.g. saving the search as a view. */
  toolbarExtra?: ReactNode;
}

const VALUE_HINTS: Record<QueryKey, string> = {
  status: 'backlog, todo, in-progress, done…',
  priority: 'urgent, high, medium, low, none',
  label: '标签名',
  type: '类型名或 none',
  bucket: '队列名或 none',
  cycle: '编号或 none',
  project: '项目 key',
  is: 'open, closed, overdue, blocked, parent, subtask, archived',
  has: 'due, labels, description, comments…',
  due: 'overdue, today, week, <7d, 2026-12-01, none',
  created: '<7d, >30d',
  completed: '<7d',
};

export function TaskList(props: Props) {
  const { catalog, state, setState } = props;
  // Description matches come from the host; titles and ids still match instantly.
  const [hits, setHits] = useState<{ text: string; ids: ReadonlySet<string> }>({
    text: '',
    ids: new Set(),
  });
  const text = state.query.text.trim();
  const { searchText } = props;
  useEffect(() => {
    if (!text) return;
    let live = true;
    const timer = setTimeout(() => {
      void searchText(text)
        .then((ids) => live && setHits({ text, ids: new Set(ids) }))
        .catch(() => {});
    }, 160);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, searchText]);
  const visible = useMemo(() => {
    const now = new Date();
    const ids = hits.text === text ? hits.ids : undefined;
    return props.tasks.filter((t) => matches(t, state.query, catalog, now, ids));
  }, [props.tasks, state.query, catalog, hits, text]);
  const sections = useMemo(
    () =>
      buildSections(visible, catalog, state.display, {
        project: props.project,
        collapsed: state.collapsed,
        openFolds: state.openFolds,
      }),
    [visible, catalog, state.display, state.collapsed, state.openFolds, props.project],
  );
  const order = useMemo(() => navigable(sections), [sections]);
  const reported = useRef<string>('');
  const key = order.join(',');
  if (reported.current !== key) {
    reported.current = key;
    queueMicrotask(() => props.onLayout(order));
  }
  return (
    <>
      <QueryBar
        state={state}
        setState={setState}
        searchRef={props.searchRef}
        total={visible.length}
        extra={props.toolbarExtra}
      />
      {state.display.layout === 'board' && visible.length > 0 ? (
        <TaskBoard
          catalog={catalog}
          tasks={visible}
          project={props.project}
          display={state.display}
          active={props.active}
          setActive={props.setActive}
          open={props.open}
          createIn={props.createIn}
          move={props.move}
          onLayout={props.onLayout}
        />
      ) : (
        <section className="task-list" aria-label="任务列表">
          {sections.some((s) => s.group.count) &&
            sections.map((section) => (
              <SectionView key={section.group.key} section={section} {...props} order={order} />
            ))}
          {!sections.some((s) => s.group.count) && (
            <div className="task-empty">
              <h3>
                {state.query.chips.length || state.query.text ? '没有匹配的任务' : '还没有任务'}
              </h3>
              {state.query.chips.length || state.query.text ? (
                <button
                  type="button"
                  className="task-btn"
                  onClick={() => setState((s) => ({ ...s, query: { chips: [], text: '' } }))}
                >
                  清除筛选
                </button>
              ) : (
                <button
                  type="button"
                  className="task-btn primary"
                  onClick={() => props.createIn({})}
                >
                  <Icon name="add" />
                  新建任务
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function GroupGlyph({ section, catalog }: { section: Section; catalog: Catalog }) {
  const { kind, id } = section.group.glyph;
  if (kind === 'status') return <StatusGlyph status={catalog.status(id)} />;
  if (kind === 'priority') return <PriorityGlyph value={Number(id)} />;
  if (kind === 'type') return <TaskIcon name="type" color={catalog.type(id)?.color ?? 'gray'} />;
  if (kind === 'bucket')
    return <TaskIcon name="layers" color={catalog.bucket(id)?.color ?? 'gray'} />;
  if (kind === 'project')
    return <TaskIcon name="folder" color={catalog.project(id)?.color ?? 'gray'} />;
  return <TaskIcon name="tasks" />;
}

function SectionView(props: Props & { section: Section; order: string[] }) {
  const { section, catalog, setState } = props;
  const toggle = () =>
    setState((s) => {
      const collapsed = new Set(s.collapsed);
      if (!collapsed.delete(section.group.key)) collapsed.add(section.group.key);
      return { ...s, collapsed };
    });
  return (
    <section className="task-section">
      <div className="task-group-head">
        <button
          type="button"
          className="task-group-toggle"
          aria-expanded={!section.collapsed}
          onClick={toggle}
          aria-label={`${section.collapsed ? '展开' : '收起'}${section.group.name}`}
        >
          <span className="task-chevron">
            <Icon name="chevronDown" />
          </span>
          <GroupGlyph section={section} catalog={catalog} />
          <span>{section.group.name}</span>
          <span className="task-count">{section.group.count}</span>
        </button>
        <button
          type="button"
          className="task-icon-btn"
          title="在此分组新建"
          aria-label={`在${section.group.name}中新建任务`}
          onClick={() => props.createIn(section.group.defaults)}
        >
          <Icon name="add" />
        </button>
      </div>
      {section.rows.map((row) => {
        if (row.kind === 'fold')
          return (
            <button
              type="button"
              key={row.key}
              className="task-fold"
              onClick={() =>
                setState((s) => {
                  const openFolds = new Set(s.openFolds);
                  if (!openFolds.delete(row.key)) openFolds.add(row.key);
                  return { ...s, openFolds };
                })
              }
            >
              <Icon name={row.open ? 'chevronUp' : 'chevronDown'} />
              {row.open ? '收起已关闭' : `${row.count} 个已关闭`}
            </button>
          );
        const task = catalog.task(row.id);
        if (!task) return null;
        return row.kind === 'ghost' ? (
          <div key={`ghost-${row.id}`} className="task-row ghost" aria-hidden="true">
            <span className="task-sel-slot" />
            <span className="task-prio">
              <PriorityGlyph value={task.priority} />
            </span>
            <span className="task-id mono">{catalog.humanId(task)}</span>
            <span className="task-status-slot">
              <StatusGlyph status={catalog.status(task.status)} />
            </span>
            <span className="task-title">{task.title}</span>
          </div>
        ) : (
          <TaskRow key={row.id} task={task} tree={row.tree} {...props} />
        );
      })}
    </section>
  );
}

function TaskRow(props: Props & { task: TaskMeta; tree: 'mid' | 'end' | null; order: string[] }) {
  const { task, catalog } = props;
  const status = catalog.status(task.status);
  const open = catalog.isOpen(task);
  const kids = catalog.children(task.id);
  const done = kids.filter((k) => !catalog.isOpen(k)).length;
  const selected = props.selection.has(task.id);
  const blockers = catalog.isBlocked(task) ? catalog.openBlockers(task) : [];
  const blocked = blockers.length > 0;
  const due = task.due ? daysUntil(task.due) : null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: pointer shortcut only; the list opens rows with Enter/O and selects with X.
    <div
      className={open ? 'task-row' : 'task-row closed'}
      data-id={task.id}
      data-selected={selected}
      data-active={props.active === task.id}
      onMouseMove={() => props.active !== task.id && props.setActive(task.id, false)}
      onClick={(event) => {
        if ((event.target as Element).closest('button')) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey)
          props.toggleSelected(task.id, event.shiftKey);
        else props.open(task.id, props.order);
      }}
    >
      <button
        type="button"
        className="task-sel"
        tabIndex={-1}
        aria-label={`选择 ${catalog.humanId(task)}`}
        aria-pressed={selected}
        onClick={(event) => props.toggleSelected(task.id, event.shiftKey)}
      >
        <Icon name="check" />
      </button>
      {props.tree && <span className={`task-tree ${props.tree}`} />}
      <button
        type="button"
        className="task-prio"
        tabIndex={-1}
        title={priorityName(task.priority)}
        aria-label={`优先级：${priorityName(task.priority)}`}
        onClick={(e) => props.pick('priority', task, e.currentTarget)}
      >
        <PriorityGlyph value={task.priority} />
      </button>
      <span className="task-id mono">{catalog.humanId(task)}</span>
      <button
        type="button"
        className="task-status-btn"
        tabIndex={-1}
        title={status.name}
        aria-label={`状态：${status.name}`}
        onClick={(e) => props.pick('status', task, e.currentTarget)}
      >
        <StatusGlyph status={status} />
      </button>
      <span className="task-title">{task.title}</span>
      <span className="task-props">
        {kids.length > 0 && (
          <span className="task-subprog" title={`${done} / ${kids.length} 个子任务已完成`}>
            <ProgressPie fraction={done / kids.length} size={13} />
            {done}/{kids.length}
          </span>
        )}
        {blocked && (
          <span
            className="task-pill danger"
            title={`被 ${blockers.map((t) => catalog.humanId(t)).join('、')} 阻塞`}
          >
            <TaskIcon name="blocked" />
            被阻塞
          </span>
        )}
        {task.bucket && catalog.bucket(task.bucket) && (
          <span className="task-pill">
            <TaskIcon name="layers" color={catalog.bucket(task.bucket)?.color ?? 'gray'} />
            {catalog.bucket(task.bucket)?.name}
          </span>
        )}
        {task.labels.slice(0, 3).map((id) => {
          const label = catalog.label(id);
          return (
            label && (
              <span key={id} className="task-pill task-label-pill">
                <i className="task-dot" style={{ background: colorVar(label.color) }} />
                {label.name}
              </span>
            )
          );
        })}
      </span>
      <span
        className={`task-date ${open && due !== null ? (due < 0 ? 'overdue' : due <= 2 ? 'soon' : '') : ''}`}
        title={task.due ? `到期 ${task.due}` : undefined}
      >
        {task.due &&
          (due === 0 ? '今天' : due === 1 ? '明天' : due === -1 ? '昨天' : formatDay(task.due))}
      </span>
    </div>
  );
}

function QueryBar({
  state,
  setState,
  searchRef,
  total,
  extra,
}: {
  state: ListState;
  setState: Props['setState'];
  searchRef: Props['searchRef'];
  total: number;
  extra?: ReactNode;
}) {
  const [text, setText] = useState(state.query.text);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [display, setDisplay] = useState(false);
  const setQuery = (update: (q: Query) => Query) =>
    setState((s) => ({ ...s, query: update(s.query) }));
  const word = text.split(/\s/).pop() ?? '';
  const keyMatch = /^(-?)([^:]+):(.*)$/.exec(word);
  const suggestions: { insert: string; label: string; hint: string }[] = (() => {
    if (!focused) return [];
    const key = keyMatch?.[2] ? canonicalKey(keyMatch[2]) : undefined;
    if (keyMatch && key)
      return valueSuggestions(key)
        .filter(
          (v) => !keyMatch[3] || v.value.includes(keyMatch[3]) || v.label.includes(keyMatch[3]),
        )
        .map((v) => ({
          insert: `${keyMatch[1]}${keyMatch[2]}:${v.value} `,
          label: v.label,
          hint: v.value,
        }));
    if (keyMatch) return [];
    return (Object.keys(QUERY_KEYS) as QueryKey[])
      .filter(
        (k) => !word || k.startsWith(word.toLowerCase()) || QUERY_KEY_NAMES[k].startsWith(word),
      )
      .map((k) => ({
        insert: `${k}:`,
        label: `${k}:`,
        hint: `${QUERY_KEY_NAMES[k]} · ${VALUE_HINTS[k]}`,
      }));
  })().slice(0, 8);
  const commit = (value: string) => {
    // A space after complete `key:value` tokens turns them into chips; pasting a whole query works too.
    if (/\s$/.test(value)) {
      const parsed = parseQuery(value);
      if (parsed.chips.length) {
        setQuery((q) => ({ chips: [...q.chips, ...parsed.chips], text: parsed.text }));
        setText(parsed.text ? `${parsed.text} ` : '');
        return;
      }
    }
    setText(value);
    setQuery((q) => ({ ...q, text: value }));
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    event.stopPropagation();
    if (event.key === 'Backspace' && !text && state.query.chips.length) {
      event.preventDefault();
      const last = state.query.chips.at(-1);
      setQuery((q) => ({ ...q, chips: q.chips.slice(0, -1) }));
      if (last) commit(`${last.negated ? '-' : ''}${last.key}:${last.values.join(',')}`);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault();
      setActive(
        (i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length,
      );
    } else if ((event.key === 'Enter' || event.key === 'Tab') && suggestions[active]) {
      event.preventDefault();
      const base = text.slice(0, text.length - word.length);
      commit(base + (suggestions[active]?.insert ?? ''));
      setActive(0);
    } else if (event.key === 'Escape' || (event.key === 'ArrowDown' && !suggestions.length)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  return (
    <div className="task-toolbar">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: clicking the frame focuses its input */}
      <div
        className="task-search"
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <Icon name="search" />
        {state.query.chips.map((chip, index) => (
          <span
            key={`${chip.key}:${chip.negated}:${chip.values.join(',')}`}
            className={chip.negated ? 'task-chip negated' : 'task-chip'}
          >
            <button
              type="button"
              className="task-chip-key"
              title="切换包含 / 排除"
              onClick={() =>
                setQuery((q) => ({
                  ...q,
                  chips: q.chips.map((c, i) => (i === index ? { ...c, negated: !c.negated } : c)),
                }))
              }
            >
              {chip.negated ? '不是 ' : ''}
              {QUERY_KEY_NAMES[chip.key]}
            </button>
            <span className="task-chip-value">
              {chip.values.map((v) => valueLabel(chip.key, v)).join('、')}
            </span>
            <button
              type="button"
              className="task-chip-x"
              aria-label="移除筛选"
              onClick={() =>
                setQuery((q) => ({ ...q, chips: q.chips.filter((_, i) => i !== index) }))
              }
            >
              <Icon name="close" />
            </button>
          </span>
        ))}
        <input
          ref={searchRef}
          value={text}
          placeholder={state.query.chips.length ? '' : '搜索或筛选，例如 status:todo priority:high'}
          aria-label="搜索或筛选任务"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            commit(e.target.value);
            setActive(0);
          }}
          onKeyDown={keyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <kbd>/</kbd>
        {suggestions.length > 0 && (
          <div className="task-suggest" role="listbox">
            {suggestions.map((s, i) => (
              <button
                type="button"
                key={s.insert}
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                className="task-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(text.slice(0, text.length - word.length) + s.insert);
                }}
              >
                <span className="mono">{s.label}</span>
                <span className="task-option-hint">{s.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="task-result-count" aria-live="polite">
        {total}
      </span>
      {extra}
      <div className="task-display-wrap">
        <button
          type="button"
          className="task-btn"
          aria-expanded={display}
          aria-label="显示选项"
          onClick={() => setDisplay((v) => !v)}
        >
          <TaskIcon name="sliders" />
          <Icon name="chevronDown" />
        </button>
        {display && (
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
            <div className="task-scrim clear" onMouseDown={() => setDisplay(false)} />
            <div className="task-menu task-display" role="dialog" aria-label="显示选项">
              <div className="task-seg">
                {(
                  [
                    ['list', '列表', 'list'],
                    ['board', '看板', 'board'],
                  ] as const
                ).map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={state.display.layout === value}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        display: {
                          ...s.display,
                          layout: value,
                          groupBy:
                            value === 'board' && !['status', 'bucket'].includes(s.display.groupBy)
                              ? 'status'
                              : s.display.groupBy,
                        },
                      }))
                    }
                  >
                    <TaskIcon name={icon} />
                    {label}
                  </button>
                ))}
              </div>
              <label>
                {state.display.layout === 'board' ? '列' : '分组'}
                <select
                  value={state.display.groupBy}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      display: { ...s.display, groupBy: e.target.value as GroupBy },
                    }))
                  }
                >
                  {(
                    [
                      ['status', '状态'],
                      ['priority', '优先级'],
                      ['type', '类型'],
                      ['bucket', '队列'],
                      ['project', '项目'],
                      ['none', '不分组'],
                    ] as const
                  )
                    .filter(
                      ([v]) => state.display.layout !== 'board' || v === 'status' || v === 'bucket',
                    )
                    .map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                排序
                <select
                  value={state.display.orderBy}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      display: { ...s.display, orderBy: e.target.value as OrderBy },
                    }))
                  }
                >
                  {(
                    [
                      ['manual', '手动'],
                      ['priority', '优先级'],
                      ['due', '到期日'],
                      ['created', '创建时间'],
                      ['updated', '更新时间'],
                    ] as const
                  ).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function valueSuggestions(key: QueryKey): { value: string; label: string }[] {
  switch (key) {
    case 'status':
      return [
        ['backlog', '待规划'],
        ['todo', '待办'],
        ['in-progress', '进行中'],
        ['in-review', '评审中'],
        ['done', '已完成'],
        ['cancelled', '已取消'],
      ].map(([value = '', label = '']) => ({ value, label }));
    case 'priority':
      return PRIORITIES.map((p) => ({ value: p.id, label: p.name }));
    case 'is':
      return [
        ['open', '未关闭'],
        ['closed', '已关闭'],
        ['overdue', '已逾期'],
        ['blocked', '被阻塞'],
        ['parent', '父任务'],
        ['subtask', '子任务'],
        ['archived', '已归档'],
      ].map(([value = '', label = '']) => ({ value, label }));
    case 'has':
      return [
        'due',
        'labels',
        'description',
        'comments',
        'subtasks',
        'parent',
        'priority',
        'type',
        'bucket',
        'cycle',
        'relations',
      ].map((value) => ({ value, label: value }));
    case 'due':
      return [
        ['overdue', '已逾期'],
        ['today', '今天'],
        ['week', '7 天内'],
        ['none', '无到期日'],
      ].map(([value = '', label = '']) => ({ value, label }));
    case 'created':
    case 'completed':
      return [
        ['<7d', '7 天内'],
        ['<30d', '30 天内'],
      ].map(([value = '', label = '']) => ({ value, label }));
    default:
      return [];
  }
}
const VALUE_NAMES: Record<string, string> = Object.fromEntries(
  (['status', 'priority', 'is', 'due', 'created'] as QueryKey[]).flatMap((k) =>
    valueSuggestions(k).map((v) => [`${k}:${v.value}`, v.label]),
  ),
);
const valueLabel = (key: QueryKey, value: string) => VALUE_NAMES[`${key}:${value}`] ?? value;

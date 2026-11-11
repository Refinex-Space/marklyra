import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Skeleton, SkeletonBar, SkeletonRows } from '../../components/Skeleton.js';
import {
  type TaskDetail,
  type TaskEvent,
  type TaskMention,
  type TaskMeta,
  tasks as taskApi,
  taskErrorCode,
  taskErrorMessage,
} from '../../services/tasks.js';
import type { WorkspaceMatchPosition } from '../../services/workspaces.js';
import { notify } from '../notices/notices.js';
import { colorVar, PriorityGlyph, ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import { type Catalog, priorityName } from './model/catalog.js';
import { cycleTitle } from './model/cycle.js';
import { taskLink } from './model/links.js';
import { daysUntil } from './model/query.js';
import { formatDay, formatRange, type PickerKind } from './pickers.js';
import type { TaskStore } from './useTaskStore.js';

interface Props {
  workspaceId: string;
  catalog: Catalog;
  store: TaskStore;
  task: TaskMeta;
  order: string[];
  propsOpen: boolean;
  toggleProps(): void;
  back(): void;
  open(id: string): void;
  /** Opens a workspace note at the mention, leaving the workbench. */
  openNote(relativePath: string, match?: WorkspaceMatchPosition): void;
  pick(kind: PickerKind, anchor: Element | null): void;
  setStatus(tasks: TaskMeta[], status: string): void;
  remove(task: TaskMeta): void;
}

/** Agent ids as people know them. */
const agentName = (id: string) =>
  ({
    'claude-acp': 'Claude',
    'codex-acp': 'Codex',
    cursor: 'Cursor',
    'github-copilot-cli': 'Copilot',
    kimi: 'Kimi',
    opencode: 'OpenCode',
    qoder: 'Qoder',
  })[id] ?? id;
/** Who made a change that was not the person in the app. */
const actorName = (by: string) =>
  by.startsWith('ai:')
    ? agentName(by.slice(3))
    : by === 'cli'
      ? '命令行'
      : by === 'mcp'
        ? '外部 MCP'
        : by;
const relative = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
};

export function TaskPage(props: Props) {
  const { task, catalog, store } = props;
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [comment, setComment] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const cycle = catalog.cycle(task.cycle);
  /** The task's fields, subtasks and description become a reusable template. */
  const saveAsTemplate = async () => {
    const taken = new Set(catalog.snapshot.templates.map((t) => t.name));
    const base = task.title.slice(0, 36).trim() || '模板';
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    const result = await store.run({
      kind: 'saveTemplate',
      set: {
        name,
        status: task.status,
        priority: task.priority,
        type: task.type,
        labels: task.labels,
        bucket: task.bucket,
        subtasks: catalog.children(task.id).map((k) => k.title),
        description: detail?.body ?? '',
      },
    });
    if (result) notify(`已存为模板「${name}」`, 'success');
  };
  const load = useCallback(async () => {
    try {
      setDetail(await taskApi.detail(props.workspaceId, task.id));
    } catch (error) {
      notify(taskErrorMessage(error), 'error');
    }
  }, [props.workspaceId, task.id]);
  // Reload whenever the file changed (own writes, sync, other windows), but never under an edit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision and comment count are the change signals.
  useEffect(() => {
    if (!editing) void load();
  }, [load, task.revision, task.comments, editing]);
  // Notes linking here; `null` while the workspace is being searched.
  const [mentions, setMentions] = useState<TaskMention[] | null>(null);
  useEffect(() => {
    let alive = true;
    setMentions(null);
    taskApi.mentions(props.workspaceId, task.id).then(
      (list) => alive && setMentions(list),
      () => alive && setMentions([]),
    );
    return () => {
      alive = false;
    };
  }, [props.workspaceId, task.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: transient UI resets when another task opens.
  useEffect(() => {
    setEditing(false);
    setConflict(false);
    setAdding(false);
    setMenu(false);
  }, [task.id]);
  const saveDescription = async (revision = detail?.revision) => {
    if (!detail || revision === undefined) return;
    if (draft === detail.body) {
      setEditing(false);
      return;
    }
    try {
      await taskApi.mutate(props.workspaceId, {
        kind: 'setDescription',
        id: task.id,
        revision,
        body: draft,
      });
      setConflict(false);
      setEditing(false);
      await store.refresh();
    } catch (error) {
      if (taskErrorCode(error) === 'conflict') setConflict(true);
      else notify(taskErrorMessage(error), 'error');
    }
  };
  const keepMine = async () => {
    const latest = await taskApi.detail(props.workspaceId, task.id);
    await saveDescription(latest.revision);
  };
  const startEditing = () => {
    if (!detail) return;
    setDraft(detail.body);
    setEditing(true);
  };
  const project = catalog.project(task.project);
  const parent = catalog.task(task.parent);
  const kids = catalog.children(task.id).sort((a, b) => a.order - b.order);
  const kidsDone = kids.filter((k) => !catalog.isOpen(k)).length;
  const index = props.order.indexOf(task.id);
  const status = catalog.status(task.status);
  const type = catalog.type(task.type);
  const bucket = catalog.bucket(task.bucket);
  /** Each relation knows which task's field holds it, so it can be removed from either side. */
  type Relation = {
    kind: string;
    task: TaskMeta;
    owner: TaskMeta;
    field: 'blockedBy' | 'related';
  };
  const relations = [
    ...task.blockedBy.map((id) => ({
      kind: '被阻塞于',
      task: catalog.task(id),
      owner: task,
      field: 'blockedBy' as const,
    })),
    ...catalog.tasks
      .filter((t) => t.blockedBy.includes(task.id))
      .map((t) => ({ kind: '阻塞', task: t, owner: t, field: 'blockedBy' as const })),
    ...task.related.map((id) => ({
      kind: '相关',
      task: catalog.task(id),
      owner: task,
      field: 'related' as const,
    })),
    ...catalog.tasks
      .filter((t) => t.related.includes(task.id) && !task.related.includes(t.id))
      .map((t) => ({ kind: '相关', task: t, owner: t, field: 'related' as const })),
  ].filter((r): r is Relation => !!r.task && !r.task.archived);
  const unlink = (r: Relation) => {
    const other = r.owner.id === task.id ? r.task.id : task.id;
    void store.patch(
      [r.owner.id],
      { [r.field]: r.owner[r.field].filter((x) => x !== other) },
      '已移除关系',
    );
  };
  const events: (
    | { kind: 'event'; at: string; event: TaskEvent }
    | { kind: 'comment'; at: string; id: string; body: string }
  )[] = [
    ...(detail?.activity ?? []).map((event) => ({ kind: 'event' as const, at: event.at, event })),
    ...(catalog.snapshot.settings.comments
      ? (detail?.comments ?? []).map((c) => ({
          kind: 'comment' as const,
          at: c.created,
          id: c.id,
          body: c.body,
        }))
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const chip = (
    kind: PickerKind,
    label: string,
    icon: React.ReactNode,
    text: string,
    empty: boolean,
  ) => (
    <button
      type="button"
      className={empty ? 'task-dchip unset' : 'task-dchip'}
      title={label}
      aria-label={`${label}：${text}`}
      onClick={(e) => props.pick(kind, e.currentTarget)}
    >
      {icon}
      {text}
    </button>
  );
  const prop = (label: string, kind: PickerKind, value: React.ReactNode, empty: boolean) => (
    <div className="task-prop">
      <span className="task-prop-key">{label}</span>
      <button
        type="button"
        className={empty ? 'task-prop-value empty' : 'task-prop-value'}
        onClick={(e) => props.pick(kind, e.currentTarget)}
      >
        {value}
      </button>
    </div>
  );
  const postComment = async () => {
    const body = comment.trim();
    if (!body) return;
    const result = await store.run({ kind: 'comment', id: task.id, body });
    if (result) setComment('');
  };
  return (
    <div className="task-page-wrap">
      <div className="task-pane-head">
        <button
          type="button"
          className="task-icon-btn"
          onClick={props.back}
          title="返回 Esc"
          aria-label="返回列表"
        >
          <Icon name="chevronLeft" />
        </button>
        <nav className="task-crumbs" aria-label="位置">
          {project && (
            <>
              <span>
                <TaskIcon name="folder" color={project.color} />
                {project.name}
              </span>
              <Icon name="chevronRight" />
            </>
          )}
          {parent && (
            <>
              <button type="button" className="mono" onClick={() => props.open(parent.id)}>
                {catalog.humanId(parent)}
              </button>
              <Icon name="chevronRight" />
            </>
          )}
          <span className="mono task-muted">{catalog.humanId(task)}</span>
        </nav>
        <span className="task-spacer" />
        {index >= 0 && (
          <span className="task-muted task-small">
            {index + 1} / {props.order.length}
          </span>
        )}
        <button
          type="button"
          className="task-icon-btn"
          disabled={index <= 0}
          onClick={() => props.order[index - 1] && props.open(props.order[index - 1] ?? '')}
          title="上一个 K"
          aria-label="上一个任务"
        >
          <Icon name="chevronUp" />
        </button>
        <button
          type="button"
          className="task-icon-btn"
          disabled={index < 0 || index >= props.order.length - 1}
          onClick={() => props.order[index + 1] && props.open(props.order[index + 1] ?? '')}
          title="下一个 J"
          aria-label="下一个任务"
        >
          <Icon name="chevronDown" />
        </button>
        <button
          type="button"
          className="task-icon-btn"
          aria-pressed={props.propsOpen}
          onClick={props.toggleProps}
          title="属性"
          aria-label="显示或隐藏属性"
        >
          <Icon name="sidebar" />
        </button>
        <div className="task-menu-wrap">
          <button
            type="button"
            className="task-icon-btn"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            aria-label="更多操作"
          >
            <Icon name="more" />
          </button>
          {menu && (
            <>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
              <div className="task-scrim clear" onMouseDown={() => setMenu(false)} />
              <div className="task-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={(e) => {
                    setMenu(false);
                    if (task.parent)
                      void store.patch([task.id], { parent: null }, '已设为独立任务');
                    else props.pick('parent', e.currentTarget);
                  }}
                >
                  <TaskIcon name="subtask" />
                  <span className="task-option-label">
                    {task.parent ? '设为独立任务' : '设为子任务…'}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => {
                    setMenu(false);
                    void navigator.clipboard?.writeText(catalog.humanId(task));
                    notify(`已复制 ${catalog.humanId(task)}`);
                  }}
                >
                  <Icon name="copy" />
                  <span className="task-option-label">复制编号</span>
                  <span className="task-option-hint mono">{catalog.humanId(task)}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => {
                    setMenu(false);
                    void navigator.clipboard?.writeText(
                      taskLink(catalog.humanId(task), task.title, task.id),
                    );
                    notify('已复制笔记链接，粘贴到任意笔记即可');
                  }}
                >
                  <TaskIcon name="link" />
                  <span className="task-option-label">复制笔记链接</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => {
                    setMenu(false);
                    // The task's own file, in the note editor: formatting, input methods, undo
                    // and saving are the editor's; the task list picks the change up from disk.
                    props.openNote(`.marklyra/tasks/items/${task.id}.md`);
                  }}
                >
                  <TaskIcon name="note" />
                  <span className="task-option-label">在编辑器中编辑描述</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => {
                    setMenu(false);
                    void saveAsTemplate();
                  }}
                >
                  <TaskIcon name="template" />
                  <span className="task-option-label">存为模板</span>
                </button>
                <div className="task-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => {
                    setMenu(false);
                    void store.patch(
                      [task.id],
                      { archived: !task.archived },
                      task.archived ? '已恢复任务' : '已归档任务',
                    );
                  }}
                >
                  <Icon name={task.archived ? 'restore' : 'archive'} />
                  <span className="task-option-label">{task.archived ? '恢复' : '归档'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="task-option danger"
                  onClick={() => {
                    setMenu(false);
                    props.remove(task);
                  }}
                >
                  <Icon name="delete" />
                  <span className="task-option-label">永久删除…</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="task-page">
        <article className="task-main">
          {task.archived && (
            <div className="task-banner">
              <Icon name="archive" />
              <span>此任务已归档</span>
              <span className="task-spacer" />
              <button
                type="button"
                className="task-btn"
                onClick={() => void store.patch([task.id], { archived: false }, '已恢复任务')}
              >
                恢复
              </button>
            </div>
          )}
          {conflict && (
            <div className="task-banner" role="alert">
              <Icon name="warning" />
              <span>描述已在其他地方被修改</span>
              <span className="task-spacer" />
              <button type="button" className="task-btn" onClick={() => void keepMine()}>
                保留我的
              </button>
              <button
                type="button"
                className="task-btn"
                onClick={() => {
                  setConflict(false);
                  setEditing(false);
                  void load();
                }}
              >
                使用外部版本
              </button>
            </div>
          )}
          {/* With the card hidden or too narrow to fit, every property stays one click away. */}
          <div className={props.propsOpen ? 'task-prop-strip narrow-only' : 'task-prop-strip'}>
            {chip('status', '状态', <StatusGlyph status={status} />, status.name, false)}
            {chip(
              'priority',
              '优先级',
              <PriorityGlyph value={task.priority} />,
              priorityName(task.priority),
              !task.priority,
            )}
            {chip(
              'type',
              '类型',
              <TaskIcon name="type" color={type?.color ?? 'gray'} />,
              type?.name ?? '类型',
              !type,
            )}
            {chip(
              'label',
              '标签',
              <TaskIcon name="tag" />,
              task.labels.length
                ? task.labels.map((id) => catalog.label(id)?.name ?? id).join('、')
                : '标签',
              !task.labels.length,
            )}
            {chip(
              'bucket',
              '队列',
              <TaskIcon name="layers" color={bucket?.color ?? 'gray'} />,
              bucket?.name ?? '队列',
              !bucket,
            )}
            {chip(
              'due',
              '到期',
              <TaskIcon name="flag" />,
              task.due ? formatDay(task.due) : '到期',
              !task.due,
            )}
            {catalog.cyclesOn &&
              chip(
                'cycle',
                '迭代',
                <TaskIcon name="cycle" />,
                cycle ? cycleTitle(cycle) : '迭代',
                !cycle,
              )}
          </div>
          <h1
            ref={title}
            className="task-title-edit"
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            spellCheck={false}
            aria-label="任务标题"
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                if (e.key === 'Escape') e.currentTarget.textContent = task.title;
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              const value = (e.currentTarget.textContent ?? '').trim();
              if (!value) e.currentTarget.textContent = task.title;
              else if (value !== task.title) void store.patch([task.id], { title: value });
            }}
          >
            {task.title}
          </h1>
          {!detail ? (
            <Skeleton className="task-desc-skeleton">
              <SkeletonBar width="72%" height={12} />
              <SkeletonBar width="48%" height={12} />
            </Skeleton>
          ) : (
            <div className="task-desc-slot">
              {editing ? (
                <textarea
                  className="task-desc-source"
                  value={draft}
                  aria-label="描述（Markdown）"
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    e.stopPropagation();
                    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
                      e.preventDefault();
                      void saveDescription();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => !conflict && void saveDescription()}
                />
              ) : (
                // The preview holds its own link buttons, so it cannot itself be a button.
                // biome-ignore lint/a11y/useSemanticElements: see above; Enter edits like a click.
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="编辑描述"
                  className={detail.body.trim() ? 'task-desc' : 'task-desc empty'}
                  onClick={(e) => {
                    if ((e.target as Element).closest('button')) return;
                    startEditing();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
                    e.preventDefault();
                    startEditing();
                  }}
                >
                  {detail.body.trim() ? (
                    <MarkdownPreview source={detail.body} catalog={catalog} open={props.open} />
                  ) : (
                    '添加描述…'
                  )}
                </div>
              )}
            </div>
          )}
          {!task.parent && (
            <section className="task-section-block">
              <div className="task-block-head">
                <span>子任务</span>
                {kids.length > 0 && (
                  <>
                    <ProgressPie fraction={kidsDone / kids.length} size={13} />
                    <span>
                      {kidsDone}/{kids.length}
                    </span>
                  </>
                )}
                <span className="task-spacer" />
                <button
                  type="button"
                  className="task-icon-btn"
                  onClick={() => setAdding(true)}
                  aria-label="添加子任务"
                >
                  <Icon name="add" />
                </button>
              </div>
              {kids.map((kid) => (
                <div key={kid.id} className={catalog.isOpen(kid) ? 'task-sub' : 'task-sub closed'}>
                  <button
                    type="button"
                    className="task-status-btn"
                    aria-label={catalog.isOpen(kid) ? '标记完成' : '重新打开'}
                    onClick={() => props.setStatus([kid], catalog.isOpen(kid) ? 'done' : 'todo')}
                  >
                    <StatusGlyph status={catalog.status(kid.status)} />
                  </button>
                  <span className="mono task-muted task-small">{catalog.humanId(kid)}</span>
                  <button
                    type="button"
                    className="task-sub-title"
                    onClick={() => props.open(kid.id)}
                  >
                    {kid.title}
                  </button>
                  {kid.priority > 0 && <PriorityGlyph value={kid.priority} />}
                </div>
              ))}
              {adding ? (
                <SubtaskInput
                  onSubmit={async (value) => {
                    await store.run({
                      kind: 'createTask',
                      draft: { title: value, project: task.project, parent: task.id },
                    });
                  }}
                  onDone={() => setAdding(false)}
                />
              ) : (
                kids.length === 0 && (
                  <button type="button" className="task-ghost-btn" onClick={() => setAdding(true)}>
                    <Icon name="add" />
                    添加子任务
                  </button>
                )
              )}
            </section>
          )}
          <section className="task-section-block" aria-label="关系">
            <div className="task-block-head">
              <span>关系</span>
              <span className="task-spacer" />
              <button
                type="button"
                className="task-icon-btn"
                title="被以下任务阻塞"
                aria-label="添加阻塞任务"
                onClick={(e) => props.pick('blockedBy', e.currentTarget)}
              >
                <TaskIcon name="blocked" />
              </button>
              <button
                type="button"
                className="task-icon-btn"
                title="相关任务"
                aria-label="添加相关任务"
                onClick={(e) => props.pick('related', e.currentTarget)}
              >
                <TaskIcon name="link" />
              </button>
            </div>
            {relations.map((r) => (
              <div key={`${r.kind}-${r.task.id}`} className="task-relation">
                <span className="task-muted task-small task-relation-kind">{r.kind}</span>
                <StatusGlyph status={catalog.status(r.task.status)} size={13} />
                <span className="mono task-muted task-small">{catalog.humanId(r.task)}</span>
                <button
                  type="button"
                  className="task-relation-title"
                  onClick={() => props.open(r.task.id)}
                >
                  {r.task.title}
                </button>
                <button
                  type="button"
                  className="task-icon-btn task-relation-x"
                  aria-label={`移除与 ${catalog.humanId(r.task)} 的关系`}
                  onClick={() => unlink(r)}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </section>
          {mentions === null ? (
            <SkeletonRows rows={1} height={28} />
          ) : (
            mentions.length > 0 && (
              <section className="task-section-block" aria-label="提及">
                <div className="task-block-head">
                  <span>提及</span>
                  <span className="task-count">{mentions.length}</span>
                </div>
                {mentions.map((m) => (
                  <button
                    type="button"
                    key={`${m.relativePath}:${m.line}:${m.column}`}
                    className="task-mention"
                    onClick={() =>
                      props.openNote(m.relativePath, {
                        line: m.line,
                        column: m.column,
                        matchLength: `task:${task.id}`.length,
                        expectedText: `task:${task.id}`,
                      })
                    }
                  >
                    <TaskIcon name="note" />
                    <span className="task-mention-file">
                      {m.relativePath.replace(/\.(md|markdown)$/i, '')}
                    </span>
                    <span className="task-mention-preview">
                      {m.preview
                        .replace(/\[((?:\\.|[^\]\\])*)\]\((?:task|project):[^)]*\)/g, '$1')
                        .trim()}
                    </span>
                  </button>
                ))}
              </section>
            )
          )}
          <section className="task-section-block task-activity">
            <div className="task-block-head">
              <span>动态</span>
            </div>
            {events.map((item) =>
              item.kind === 'comment' ? (
                <div key={item.id} className="task-event comment">
                  <div className="task-event-line">
                    <span className="task-event-icon">
                      <TaskIcon name="comment" />
                    </span>
                    <b>评论</b>
                    <span>· {relative(item.at)}</span>
                  </div>
                  <div className="task-comment-body">
                    <MarkdownPreview source={item.body} catalog={catalog} open={props.open} />
                  </div>
                </div>
              ) : (
                <div key={item.event.id} className="task-event">
                  <span className="task-event-icon">
                    {item.event.type === 'status' ? (
                      <StatusGlyph status={catalog.status(String(item.event.to))} size={11} />
                    ) : (
                      <Icon name={item.event.type === 'created' ? 'add' : 'history'} />
                    )}
                  </span>
                  <span>
                    <EventText event={item.event} catalog={catalog} />
                    {item.event.by && (
                      <span className="task-event-by"> · 由 {actorName(item.event.by)}</span>
                    )}{' '}
                    · {relative(item.at)}
                  </span>
                </div>
              ),
            )}
            {catalog.snapshot.settings.comments && (
              <div className="task-composer">
                <textarea
                  value={comment}
                  rows={2}
                  placeholder="写评论… 支持 Markdown 与任务编号"
                  aria-label="评论"
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    e.stopPropagation();
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void postComment();
                    } else if (e.key === 'Escape') e.currentTarget.blur();
                  }}
                />
                <div className="task-composer-foot">
                  <button
                    type="button"
                    className="task-btn"
                    disabled={!comment.trim()}
                    onClick={() => void postComment()}
                  >
                    评论 <kbd>⌘↩</kbd>
                  </button>
                </div>
              </div>
            )}
          </section>
        </article>
        {props.propsOpen && (
          <aside className="task-prop-card" aria-label="任务属性">
            {prop(
              '状态',
              'status',
              <>
                <StatusGlyph status={status} />
                {status.name}
              </>,
              false,
            )}
            {prop(
              '优先级',
              'priority',
              <>
                <PriorityGlyph value={task.priority} />
                {priorityName(task.priority)}
              </>,
              task.priority === 0,
            )}
            {prop(
              '类型',
              'type',
              type ? (
                <>
                  <TaskIcon name="type" color={type.color} />
                  {type.name}
                </>
              ) : (
                '无类型'
              ),
              !type,
            )}
            {prop(
              '标签',
              'label',
              task.labels.length ? (
                <span className="task-prop-tags">
                  {task.labels.map((id) => {
                    const l = catalog.label(id);
                    return (
                      l && (
                        <span key={id} className="task-pill">
                          <i className="task-dot" style={{ background: colorVar(l.color) }} />
                          {l.name}
                        </span>
                      )
                    );
                  })}
                </span>
              ) : (
                '添加标签'
              ),
              !task.labels.length,
            )}
            {prop(
              '项目',
              'project',
              project ? (
                <>
                  <TaskIcon name="folder" color={project.color} />
                  {project.name}
                </>
              ) : (
                '无项目'
              ),
              !project,
            )}
            {prop(
              '队列',
              'bucket',
              bucket ? (
                <>
                  <TaskIcon name="layers" color={bucket.color} />
                  {bucket.name}
                </>
              ) : (
                '无队列'
              ),
              !bucket,
            )}
            {catalog.cyclesOn &&
              prop(
                '迭代',
                'cycle',
                cycle ? (
                  <>
                    <TaskIcon name="cycle" />
                    {cycleTitle(cycle)}
                    <span className="task-muted">{formatRange(cycle.start, cycle.end)}</span>
                  </>
                ) : (
                  '无迭代'
                ),
                !cycle,
              )}
            {prop(
              '到期',
              'due',
              task.due ? (
                <span
                  className={
                    catalog.isOpen(task) && daysUntil(task.due) < 0 ? 'task-date overdue' : ''
                  }
                >
                  {formatDay(task.due)}
                </span>
              ) : (
                '无到期日'
              ),
              !task.due,
            )}
            <div className="task-prop-sep" />
            <div className="task-prop-meta">
              创建于 {relative(task.created)} · 更新于 {relative(task.updated)}
              {task.completed ? ` · 完成于 ${relative(task.completed)}` : ''}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function SubtaskInput({
  onSubmit,
  onDone,
}: {
  onSubmit(title: string): Promise<void>;
  onDone(): void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="task-sub adding">
      <span className="task-status-slot">
        <svg className="task-glyph" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" stroke="var(--task-c-todo)" strokeWidth="1.6" fill="none" />
        </svg>
      </span>
      <input
        value={value}
        autoFocus
        placeholder="子任务标题，Enter 继续添加，Esc 结束"
        aria-label="子任务标题"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value.trim() && onDone()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          e.stopPropagation();
          if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            const title = value.trim();
            setValue('');
            void onSubmit(title);
          } else if (e.key === 'Escape') onDone();
        }}
      />
    </div>
  );
}

function EventText({ event, catalog }: { event: TaskEvent; catalog: Catalog }) {
  switch (event.type) {
    case 'created':
      return <>创建了任务</>;
    case 'status':
      return (
        <>
          将状态从 <b>{catalog.status(String(event.from)).name}</b> 改为{' '}
          <b>{catalog.status(String(event.to)).name}</b>
        </>
      );
    case 'priority':
      return (
        <>
          将优先级设为 <b>{priorityName(Number(event.to))}</b>
        </>
      );
    case 'project':
      return (
        <>
          移动到{' '}
          <b>{catalog.project(typeof event.to === 'string' ? event.to : null)?.name ?? '无项目'}</b>
        </>
      );
    case 'archived':
      return <>归档了任务</>;
    case 'restored':
      return <>恢复了任务</>;
    case 'cycle':
      return (
        <>
          {event.to ? (
            <>
              加入迭代 <b>{String(event.to)}</b>
            </>
          ) : (
            '移出迭代'
          )}
        </>
      );
    default:
      return <>{event.type}</>;
  }
}

/**
 * A small, safe Markdown preview for descriptions and comments: paragraphs, lists, bold,
 * inline code, `[[note]]` names and task IDs. Everything is rendered as React text, never HTML.
 */
function MarkdownPreview({
  source,
  catalog,
  open,
}: {
  source: string;
  catalog: Catalog;
  open(id: string): void;
}) {
  const inline = (text: string, key: string) => {
    const parts = text.split(
      /(\*\*[^*]+\*\*|`[^`]+`|\[(?:\\.|[^\]\\])+\]\(task:[0-9a-z]+\)|\[\[[^\]]+\]\]|\b[A-Z][A-Z0-9]{1,4}-\d+\b)/g,
    );
    return parts.map((part, i) => {
      const k = `${key}-${i}`;
      if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={k}>{part.slice(2, -2)}</b>;
      if (/^`[^`]+`$/.test(part)) return <code key={k}>{part.slice(1, -1)}</code>;
      const md = /^\[(?:\\.|[^\]\\])+\]\(task:([0-9a-z]+)\)$/.exec(part);
      const mdTask = md ? catalog.task(md[1]) : undefined;
      if (mdTask)
        return (
          <button type="button" key={k} className="task-chip-link" onClick={() => open(mdTask.id)}>
            <StatusGlyph status={catalog.status(mdTask.status)} size={12} />
            {catalog.humanId(mdTask)} {mdTask.title}
          </button>
        );
      const link = /^\[\[([^\]]+)\]\]$/.exec(part);
      if (link) {
        const target = /^task:(.+)$/.exec(link[1] ?? '');
        const linked = target ? catalog.task(target[1]) : undefined;
        return linked ? (
          <button type="button" key={k} className="task-chip-link" onClick={() => open(linked.id)}>
            <StatusGlyph status={catalog.status(linked.status)} size={12} />
            {catalog.humanId(linked)}
          </button>
        ) : (
          <span key={k} className="task-note-link">
            {link[1]}
          </span>
        );
      }
      const resolved = /^[A-Z][A-Z0-9]{1,4}-\d+$/.test(part) ? catalog.resolve(part) : undefined;
      if (resolved)
        return (
          <button
            type="button"
            key={k}
            className="task-note-link"
            onClick={() => open(resolved.id)}
          >
            {part}
          </button>
        );
      return part;
    });
  };
  // Blocks and lines are derived from immutable text; their position is their identity.
  /* biome-ignore-start lint/suspicious/noArrayIndexKey: see above */
  return (
    <>
      {source
        .trim()
        .split(/\n{2,}/)
        .map((block, b) => {
          const lines = block.split('\n');
          if (lines.every((l) => /^\s*[-*]\s/.test(l)))
            return (
              <ul key={b}>
                {lines.map((l, i) => (
                  <li key={i}>{inline(l.replace(/^\s*[-*]\s/, ''), `${b}-${i}`)}</li>
                ))}
              </ul>
            );
          return (
            <p key={b}>
              {lines.map((l, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {inline(l, `${b}-${i}`)}
                </span>
              ))}
            </p>
          );
        })}
    </>
  );
  /* biome-ignore-end lint/suspicious/noArrayIndexKey: see above */
}

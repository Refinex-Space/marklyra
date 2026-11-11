import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon.js';
import { useModalFocus } from '../../components/useModalFocus.js';
import type { TaskDraft, TaskFields, TaskTemplate } from '../../services/tasks.js';
import { colorVar, PriorityGlyph, StatusGlyph, TaskIcon } from './glyphs.js';
import { type Catalog, priorityName } from './model/catalog.js';
import { suggestKey, validKey } from './model/view.js';
import { formatDay, formatRange, PickerHost, type PickerKind, usePicker } from './pickers.js';

export function Modal({
  label,
  close,
  children,
  className = 'task-dialog',
  suspend = false,
}: {
  label: string;
  close(): void;
  children: React.ReactNode;
  className?: string;
  /** A picker opened from the dialog lives outside it; let it keep focus. */
  suspend?: boolean;
}) {
  const panel = useModalFocus(true, close, false, suspend);
  return createPortal(
    <div className="task-layer">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
      <div className="task-scrim" onMouseDown={close} />
      <div
        ref={panel as React.RefObject<HTMLDivElement | null>}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  body,
  confirm,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  return (
    <Modal label={title} close={onClose} className="task-dialog small">
      <div className="task-dialog-text">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="task-dialog-foot">
        <span className="task-spacer" />
        {/* The safe choice is first, so it holds the initial focus. */}
        <button type="button" className="task-btn" onClick={onClose}>
          返回
        </button>
        <button
          type="button"
          className={danger ? 'task-btn danger' : 'task-btn primary'}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  );
}

export type DraftState = Required<Pick<TaskDraft, 'title' | 'project'>> & {
  status: string;
  priority: number;
  type: string | null;
  labels: string[];
  bucket: string | null;
  due: string | null;
  cycle: number | null;
  description: string;
  parent: string | null;
  subtasks: string[];
  template: string | null;
};

/** Fills a draft from a template. Typed text wins; the project, parent and cycle stay. */
export function applyTemplate(
  draft: DraftState,
  template: TaskTemplate | undefined,
  catalog: Catalog,
): DraftState {
  if (!template) return { ...draft, template: null, subtasks: [] };
  const allowed = new Set(catalog.statusesFor(draft.project).map((s) => s.id));
  const labels = new Set(catalog.labelsFor(draft.project).map((l) => l.id));
  const buckets = new Set(catalog.bucketsFor(draft.project).map((b) => b.id));
  const type = template.type ?? draft.type;
  // The type's rules apply as if the type had been picked by hand.
  const rule = catalog.type(type);
  return {
    ...draft,
    template: template.id,
    title: draft.title.trim() ? draft.title : template.title,
    description: draft.description.trim() ? draft.description : template.description,
    status: template.status && allowed.has(template.status) ? template.status : draft.status,
    priority: template.priority || draft.priority || rule?.setPriority || 0,
    type,
    labels: [
      ...new Set(
        [...draft.labels, ...template.labels, ...(rule?.addLabels ?? [])].filter((l) =>
          labels.has(l),
        ),
      ),
    ],
    bucket: template.bucket && buckets.has(template.bucket) ? template.bucket : draft.bucket,
    subtasks: draft.parent ? [] : template.subtasks,
  };
}

export function NewTaskDialog({
  catalog,
  initial,
  createMore,
  setCreateMore,
  submit,
  onClose,
}: {
  catalog: Catalog;
  initial: DraftState;
  createMore: boolean;
  setCreateMore(value: boolean): void;
  submit(draft: DraftState): Promise<boolean>;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLInputElement>(null);
  // A template-filled title continues where it ends; WebKit would put the caret first.
  useLayoutEffect(() => {
    const input = title.current;
    if (input) input.setSelectionRange(input.value.length, input.value.length);
  }, []);
  const picker = usePicker();
  const project = catalog.project(draft.project);
  const status = catalog.status(draft.status);
  const type = catalog.type(draft.type);
  const bucket = catalog.bucket(draft.bucket);
  const fields: Partial<TaskFields> = {
    status: draft.status,
    priority: draft.priority,
    type: draft.type,
    labels: draft.labels,
    bucket: draft.bucket,
    due: draft.due,
    cycle: draft.cycle,
    project: draft.project,
  };
  const open = (kind: PickerKind, anchor: Element | null) =>
    picker.open(kind, [], anchor, { ...fields, template: draft.template });
  const template = catalog.template(draft.template);
  const cycle = catalog.cycle(draft.cycle);
  const create = async () => {
    if (!draft.title.trim() || busy) return;
    setBusy(true);
    const ok = await submit(draft);
    setBusy(false);
    if (!ok) return;
    if (createMore) {
      // The next task starts from the same template again.
      setDraft((d) =>
        applyTemplate({ ...d, title: '', description: '' }, catalog.template(d.template), catalog),
      );
      title.current?.focus();
    } else onClose();
  };
  const chip = (
    kind: PickerKind,
    label: string,
    content: React.ReactNode,
    unset: boolean,
    key: string,
  ) => (
    <button
      type="button"
      className={unset ? 'task-dchip unset' : 'task-dchip'}
      title={`${label}（Ctrl+${key}）`}
      data-picker={kind}
      onClick={(e) => open(kind, e.currentTarget)}
    >
      {content}
    </button>
  );
  return (
    <Modal label="新建任务" close={() => !picker.target && onClose()} suspend={!!picker.target}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Ctrl/Alt chip shortcuts and Enter-to-create for every field in the dialog. */}
      <div
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || picker.target) return;
          const map: Record<string, PickerKind> = {
            s: 'status',
            p: 'priority',
            t: 'type',
            b: 'bucket',
            l: 'label',
            d: 'due',
            m: 'project',
            ...(catalog.cyclesOn ? { y: 'cycle' as const } : {}),
          };
          const kind = map[e.key.toLowerCase()];
          if ((e.ctrlKey || e.altKey) && kind) {
            e.preventDefault();
            open(kind, e.currentTarget.querySelector(`[data-picker="${kind}"]`));
          } else if (
            e.key === 'Enter' &&
            (e.metaKey || e.ctrlKey || (e.target as Element).tagName === 'INPUT')
          ) {
            e.preventDefault();
            void create();
          }
        }}
      >
        <div className="task-dialog-head">
          <button
            type="button"
            className="task-crumb"
            data-picker="project"
            onClick={(e) => open('project', e.currentTarget)}
          >
            <TaskIcon name="folder" color={project?.color ?? 'gray'} />
            {project?.name ?? '无项目'}
          </button>
          <Icon name="chevronRight" />
          <span>{draft.parent ? '新建子任务' : '新建任务'}</span>
          <span className="task-spacer" />
          {catalog.snapshot.templates.length > 0 && (
            <button
              type="button"
              className={template ? 'task-dchip' : 'task-dchip unset'}
              data-picker="template"
              title="使用模板"
              onClick={(e) => open('template', e.currentTarget)}
            >
              <TaskIcon name="template" />
              {template?.name ?? '模板'}
            </button>
          )}
          <button type="button" className="task-icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="task-dialog-body">
          <input
            ref={title}
            className="task-dialog-title"
            autoFocus
            value={draft.title}
            placeholder="要做什么？"
            aria-label="任务标题"
            autoComplete="off"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <textarea
            className="task-dialog-desc"
            value={draft.description}
            placeholder="添加描述…"
            aria-label="描述"
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
          {draft.subtasks.length > 0 && (
            <ul className="task-dialog-subtasks" aria-label="将同时创建的子任务">
              {draft.subtasks.map((name, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: template subtasks may repeat a name; the list never reorders.
                <li key={i}>
                  <TaskIcon name="subtask" />
                  <span>{name}</span>
                  <button
                    type="button"
                    className="task-icon-btn"
                    aria-label={`不创建子任务 ${name}`}
                    onClick={() => {
                      setDraft((d) => ({ ...d, subtasks: d.subtasks.filter((_, j) => j !== i) }));
                      // The button disappears; typing continues in the title.
                      title.current?.focus();
                    }}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="task-dchips">
            {chip(
              'status',
              '状态',
              <>
                <StatusGlyph status={status} />
                {status.name}
              </>,
              false,
              'S',
            )}
            {chip(
              'priority',
              '优先级',
              <>
                <PriorityGlyph value={draft.priority} />
                {draft.priority ? priorityName(draft.priority) : '优先级'}
              </>,
              !draft.priority,
              'P',
            )}
            {chip(
              'type',
              '类型',
              <>
                <TaskIcon name="type" color={type?.color ?? 'gray'} />
                {type?.name ?? '类型'}
              </>,
              !type,
              'T',
            )}
            {chip(
              'bucket',
              '队列',
              <>
                <TaskIcon name="layers" color={bucket?.color ?? 'gray'} />
                {bucket?.name ?? '队列'}
              </>,
              !bucket,
              'B',
            )}
            {chip(
              'label',
              '标签',
              draft.labels.length ? (
                draft.labels.map((id) => (
                  <span key={id} className="task-inline">
                    <i
                      className="task-dot"
                      style={{ background: colorVar(catalog.label(id)?.color ?? 'gray') }}
                    />
                    {catalog.label(id)?.name}
                  </span>
                ))
              ) : (
                <>
                  <TaskIcon name="tag" />
                  标签
                </>
              ),
              !draft.labels.length,
              'L',
            )}
            {chip(
              'due',
              '到期',
              <>
                <TaskIcon name="flag" />
                {draft.due ? formatDay(draft.due) : '到期'}
              </>,
              !draft.due,
              'D',
            )}
            {catalog.cyclesOn &&
              chip(
                'cycle',
                '迭代',
                <>
                  <TaskIcon name="cycle" />
                  {cycle
                    ? `${cycle.name ?? `迭代 ${cycle.number}`} · ${formatRange(cycle.start, cycle.end)}`
                    : '迭代'}
                </>,
                !cycle,
                'Y',
              )}
          </div>
        </div>
        <div className="task-dialog-foot">
          <label className="task-switch-label">
            <button
              type="button"
              role="switch"
              className="task-switch"
              aria-checked={createMore}
              aria-label="连续创建"
              onClick={() => setCreateMore(!createMore)}
            />
            连续创建
          </label>
          <span className="task-spacer" />
          <button
            type="button"
            className="task-btn primary"
            disabled={!draft.title.trim() || busy}
            onClick={() => void create()}
          >
            创建任务 <kbd>⌘↩</kbd>
          </button>
        </div>
      </div>
      {picker.target && (
        <PickerHost
          target={picker.target}
          catalog={catalog}
          close={() => {
            picker.close();
            title.current?.focus();
          }}
          commit={(kind, value) =>
            setDraft((d) => {
              if (kind === 'template')
                return applyTemplate(d, catalog.template(value as string | null), catalog);
              if (kind === 'label') {
                const id = String(value);
                const labels = d.labels.includes(id)
                  ? d.labels.filter((l) => l !== id)
                  : [...d.labels, id];
                picker.set((t) => t && { ...t, draft: { ...t.draft, labels } });
                return { ...d, labels };
              }
              if (kind === 'type' && typeof value === 'string') {
                const rule = catalog.type(value);
                return {
                  ...d,
                  type: value,
                  labels: [...new Set([...d.labels, ...(rule?.addLabels ?? [])])],
                  priority: d.priority || rule?.setPriority || 0,
                };
              }
              return { ...d, [kind]: value } as DraftState;
            })
          }
        />
      )}
    </Modal>
  );
}

export function NewProjectDialog({
  catalog,
  submit,
  onClose,
}: {
  catalog: Catalog;
  submit(name: string, key: string): Promise<boolean>;
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const taken = useMemo(
    () =>
      new Set([
        catalog.snapshot.settings.unassignedKey,
        ...catalog.snapshot.projects.flatMap((p) => [p.key, ...p.previousKeys]),
      ]),
    [catalog],
  );
  const effective = keyEdited ? key : name.trim() ? suggestKey(name, taken) : '';
  const problem = !effective
    ? ''
    : !validKey(effective)
      ? '2–5 位大写字母或数字，以字母开头'
      : taken.has(effective)
        ? `${effective} 已被使用`
        : '';
  const valid = name.trim() !== '' && effective !== '' && !problem;
  return (
    <Modal label="新建项目" close={onClose} className="task-dialog small">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (valid && (await submit(name.trim(), effective))) onClose();
        }}
      >
        <div className="task-dialog-head">
          <span>新建项目</span>
          <span className="task-spacer" />
          <button type="button" className="task-icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="task-dialog-body task-form">
          <label>
            项目名称
            <input
              value={name}
              autoFocus
              placeholder="例如 官网改版、写作计划"
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Key
            <span className="task-key-row">
              <input
                className="mono"
                value={effective}
                maxLength={5}
                aria-invalid={!!problem}
                onChange={(e) => {
                  setKeyEdited(true);
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                }}
              />
              <span className={problem ? 'task-key-hint error' : 'task-key-hint'}>
                {problem || (effective ? `${effective}-1, ${effective}-2…` : '')}
              </span>
            </span>
          </label>
        </div>
        <div className="task-dialog-foot">
          <span className="task-spacer" />
          <button type="button" className="task-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="task-btn primary" disabled={!valid}>
            创建项目
          </button>
        </div>
      </form>
    </Modal>
  );
}

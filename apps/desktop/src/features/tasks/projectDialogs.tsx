import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { Project } from '../../services/tasks.js';
import { Modal } from './dialogs.js';
import { colorVar, StatusGlyph, TaskIcon } from './glyphs.js';
import { CATEGORY_ORDER, type Catalog } from './model/catalog.js';
import { validKey } from './model/view.js';

export const PALETTE = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'pink',
  'gray',
] as const;

export function Swatches({ value, onChange }: { value: string; onChange(color: string): void }) {
  return (
    <div className="task-swatches">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          aria-label={c}
          className="task-swatch"
          style={{ background: colorVar(c) }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export interface ProjectChanges {
  name?: string;
  key?: string;
  color?: string;
  statuses?: string[] | 'all';
  labels?: string[] | 'all';
  buckets?: string[] | 'all';
  defaultTemplate?: string | null;
}

/** Name, key, colour and which statuses, labels and buckets the project offers. */
export function EditProjectDialog({
  catalog,
  project,
  submit,
  onClose,
}: {
  catalog: Catalog;
  project: Project;
  submit(changes: ProjectChanges): Promise<boolean>;
  onClose(): void;
}) {
  const snap = catalog.snapshot;
  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [color, setColor] = useState(project.color);
  const [statuses, setStatuses] = useState<string[] | null>(project.statuses);
  const [labels, setLabels] = useState<string[] | null>(project.labels);
  const [buckets, setBuckets] = useState<string[] | null>(project.buckets);
  const [template, setTemplate] = useState<string | null>(project.defaultTemplate);
  const taken = useMemo(
    () =>
      new Set([
        snap.settings.unassignedKey,
        ...snap.projects
          .filter((p) => p.id !== project.id)
          .flatMap((p) => [p.key, ...p.previousKeys]),
      ]),
    [snap, project.id],
  );
  const keyProblem = !validKey(key)
    ? '2–5 位大写字母或数字，以字母开头'
    : taken.has(key)
      ? `${key} 已被使用`
      : '';
  const effectiveStatuses = statuses ?? snap.statuses.map((s) => s.id);
  const categories = effectiveStatuses.map(
    (id) => snap.statuses.find((s) => s.id === id)?.category,
  );
  const statusProblem =
    !categories.some((c) => c && c !== 'completed' && c !== 'cancelled') ||
    !categories.includes('completed')
      ? '至少保留一个未关闭状态和一个已完成状态'
      : '';
  const moving = statuses
    ? catalog.tasks.filter((t) => t.project === project.id && !statuses.includes(t.status)).length
    : 0;
  const toggle = (list: string[] | null, all: string[], id: string) => {
    const current = list ?? all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    return next.length === all.length ? null : next;
  };
  const same = (a: string[] | null, b: string[] | null) => JSON.stringify(a) === JSON.stringify(b);
  const save = async () => {
    const changes: ProjectChanges = {};
    if (name.trim() !== project.name) changes.name = name.trim();
    if (key !== project.key) changes.key = key;
    if (color !== project.color) changes.color = color;
    if (!same(statuses, project.statuses)) changes.statuses = statuses ?? 'all';
    if (!same(labels, project.labels)) changes.labels = labels ?? 'all';
    if (!same(buckets, project.buckets)) changes.buckets = buckets ?? 'all';
    if (template !== project.defaultTemplate) changes.defaultTemplate = template;
    if (!Object.keys(changes).length || (await submit(changes))) onClose();
  };
  const invalid = !name.trim() || !!keyProblem || !!statusProblem;
  return (
    <Modal label="编辑项目" close={onClose} className="task-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) void save();
        }}
      >
        <div className="task-dialog-head">
          <span>编辑项目</span>
          <span className="task-spacer" />
          <button type="button" className="task-icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="task-dialog-body task-form task-project-form">
          <label>
            名称
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Key
            <span className="task-key-row">
              <input
                className="mono"
                value={key}
                maxLength={5}
                aria-invalid={!!keyProblem}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <span className={keyProblem ? 'task-key-hint error' : 'task-key-hint'}>
                {keyProblem || (key !== project.key ? `编号变为 ${key}-1…，旧编号仍能搜到` : '')}
              </span>
            </span>
          </label>
          <div className="task-form-row">
            <span>颜色</span>
            <Swatches value={color} onChange={setColor} />
          </div>
          {snap.templates.length > 0 && (
            <label>
              默认模板
              <select
                className="task-settings-select"
                value={template ?? ''}
                onChange={(e) => setTemplate(e.target.value || null)}
              >
                <option value="">无</option>
                {snap.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="task-limit">
            <legend>状态</legend>
            {[...snap.statuses]
              .sort(
                (a, b) =>
                  CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.order - b.order,
              )
              .map((s) => (
                <label key={s.id} className="task-check-row">
                  <input
                    type="checkbox"
                    checked={effectiveStatuses.includes(s.id)}
                    onChange={() =>
                      setStatuses((l) =>
                        toggle(
                          l,
                          snap.statuses.map((x) => x.id),
                          s.id,
                        ),
                      )
                    }
                  />
                  <StatusGlyph status={s} />
                  {s.name}
                </label>
              ))}
            {(statusProblem || moving > 0) && (
              <p className={statusProblem ? 'task-key-hint error' : 'task-form-note'}>
                {statusProblem || `${moving} 个任务会移到最接近的可用状态`}
              </p>
            )}
          </fieldset>
          <fieldset className="task-limit">
            <legend>标签</legend>
            {snap.labels.map((l) => (
              <label key={l.id} className="task-check-row">
                <input
                  type="checkbox"
                  checked={!labels || labels.includes(l.id)}
                  onChange={() =>
                    setLabels((x) =>
                      toggle(
                        x,
                        snap.labels.map((y) => y.id),
                        l.id,
                      ),
                    )
                  }
                />
                <i className="task-dot" style={{ background: colorVar(l.color) }} />
                {l.name}
              </label>
            ))}
          </fieldset>
          <fieldset className="task-limit">
            <legend>队列</legend>
            {snap.buckets.map((b) => (
              <label key={b.id} className="task-check-row">
                <input
                  type="checkbox"
                  checked={!buckets || buckets.includes(b.id)}
                  onChange={() =>
                    setBuckets((x) =>
                      toggle(
                        x,
                        snap.buckets.map((y) => y.id),
                        b.id,
                      ),
                    )
                  }
                />
                <TaskIcon name="layers" color={b.color} />
                {b.name}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="task-dialog-foot">
          <span className="task-spacer" />
          <button type="button" className="task-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="task-btn primary" disabled={invalid}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Names a new or existing saved view. */
export function ViewNameDialog({
  title,
  initial,
  submit,
  onClose,
}: {
  title: string;
  initial: string;
  submit(name: string): Promise<boolean>;
  onClose(): void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Modal label={title} close={onClose} className="task-dialog small">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await submit(name.trim()))) onClose();
        }}
      >
        <div className="task-dialog-head">
          <span>{title}</span>
        </div>
        <div className="task-dialog-body task-form">
          <label>
            名称
            <input
              value={name}
              autoFocus
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <div className="task-dialog-foot">
          <span className="task-spacer" />
          <button type="button" className="task-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="task-btn primary" disabled={!name.trim()}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

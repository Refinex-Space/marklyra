import { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { MutationResult, TaskMutation, TaskTemplate } from '../../services/tasks.js';
import { colorVar, TaskIcon } from './glyphs.js';
import { type Catalog, PRIORITIES } from './model/catalog.js';
import { cycleTiming, cycleTitle, timingText } from './model/cycle.js';
import { formatRange, isoDay } from './pickers.js';

interface Props {
  catalog: Catalog;
  run(mutation: TaskMutation): Promise<MutationResult | null>;
}
export interface ConfirmLike {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  run(): void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function Segment<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange(value: T): void;
}) {
  return (
    <fieldset className="task-segment" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={v === value}
          onClick={() => v !== value && onChange(v)}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}

export function CyclesPage({ catalog, run }: Props) {
  const s = catalog.snapshot.settings;
  const set = (change: Record<string, unknown>) =>
    void run({ kind: 'updateSettings', set: { ...change, today: isoDay(new Date()) } });
  const active = catalog.activeCycle;
  const next = catalog.upcomingCycle;
  return (
    <div className="task-settings-page">
      <h2>迭代</h2>
      <div className="task-settings-list">
        <div className="task-settings-row">
          <span className="task-settings-grow">使用迭代</span>
          <button
            type="button"
            role="switch"
            className="task-switch"
            aria-checked={s.cyclesEnabled}
            aria-label="使用迭代"
            onClick={() => set({ cyclesEnabled: !s.cyclesEnabled })}
          />
        </div>
        {s.cyclesEnabled && (
          <>
            <div className="task-settings-row">
              <span className="task-settings-grow">
                长度
                <span
                  className="task-info"
                  role="img"
                  aria-label="只影响尚未开始的迭代"
                  title="只影响尚未开始的迭代"
                >
                  <TaskIcon name="info" />
                </span>
              </span>
              <Segment
                label="迭代长度"
                value={s.cycleWeeks}
                options={[1, 2, 3, 4].map((w) => [w, `${w} 周`])}
                onChange={(w) => set({ cycleWeeks: w })}
              />
            </div>
            <div className="task-settings-row">
              <span className="task-settings-grow">起始日</span>
              <Segment
                label="起始日"
                value={s.cycleStartDay}
                options={WEEKDAYS.map((d, i) => [i + 1, d])}
                onChange={(d) => set({ cycleStartDay: d })}
              />
            </div>
          </>
        )}
      </div>
      {s.cyclesEnabled && (active || next) && (
        <div className="task-settings-list">
          {[active, next]
            .filter((c) => c !== undefined)
            .map((c) => (
              <div key={c.number} className="task-settings-row">
                <TaskIcon name="cycle" />
                <span className="task-settings-grow">{cycleTitle(c)}</span>
                <span className="task-muted">{formatRange(c.start, c.end)}</span>
                <span className="task-badge">
                  {c.state === 'upcoming' ? '下一迭代' : timingText(cycleTiming(c))}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function TemplatesPage({
  catalog,
  run,
  confirm,
}: Props & { confirm(request: ConfirmLike): void }) {
  const templates = catalog.snapshot.templates;
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const result = await run({ kind: 'saveTemplate', set: { name: n } });
    const id = result?.created[0];
    if (id) {
      setName('');
      setOpen(id);
    }
  };
  return (
    <div className="task-settings-page">
      <h2>模板</h2>
      <div className="task-settings-list">
        {templates.map((t) => (
          <div key={t.id} className="task-template">
            <div className="task-settings-row">
              <TaskIcon name="template" />
              <button
                type="button"
                className="task-template-name"
                aria-expanded={open === t.id}
                onClick={() => setOpen(open === t.id ? null : t.id)}
              >
                <span>{t.name}</span>
                <span className="task-muted">{templateSummary(t, catalog)}</span>
              </button>
              <button
                type="button"
                className="task-icon-btn"
                aria-label={`删除模板 ${t.name}`}
                title="删除"
                onClick={() => {
                  const users = catalog.snapshot.projects.filter((p) => p.defaultTemplate === t.id);
                  confirm({
                    title: `删除模板「${t.name}」？`,
                    body: users.length
                      ? `${users.map((p) => p.name).join('、')} 将不再有默认模板。已创建的任务不受影响。`
                      : '已创建的任务不受影响。',
                    confirm: '删除模板',
                    danger: true,
                    run: () => void run({ kind: 'deleteTemplate', id: t.id }),
                  });
                }}
              >
                <Icon name="delete" />
              </button>
            </div>
            {open === t.id && <TemplateEditor template={t} catalog={catalog} run={run} />}
          </div>
        ))}
        <div className="task-settings-row adding">
          <Icon name="add" />
          <input
            className="task-settings-name"
            value={name}
            placeholder="新建模板"
            aria-label="新建模板"
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (!e.nativeEvent.isComposing && e.key === 'Enter') void add();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function templateSummary(t: TaskTemplate, catalog: Catalog) {
  return [
    t.title,
    t.type && catalog.type(t.type)?.name,
    t.subtasks.length ? `${t.subtasks.length} 个子任务` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function TemplateEditor({
  template: t,
  catalog,
  run,
}: Props & {
  template: TaskTemplate;
}) {
  const save = (set: Record<string, unknown>) => void run({ kind: 'saveTemplate', id: t.id, set });
  return (
    <div className="task-template-editor">
      <Field label="名称">
        <BlurInput value={t.name} label="模板名称" onSave={(name) => name && save({ name })} />
      </Field>
      <Field label="标题">
        <BlurInput
          value={t.title}
          label="任务标题"
          placeholder="例如 [缺陷] "
          onSave={(title) => save({ title })}
        />
      </Field>
      <Field label="状态">
        <select
          className="task-settings-select"
          aria-label="状态"
          value={t.status ?? ''}
          onChange={(e) => save({ status: e.target.value || null })}
        >
          <option value="">默认</option>
          {catalog.statusesFor(null).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="优先级">
        <select
          className="task-settings-select"
          aria-label="优先级"
          value={t.priority}
          onChange={(e) => save({ priority: Number(e.target.value) })}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="类型">
        <select
          className="task-settings-select"
          aria-label="类型"
          value={t.type ?? ''}
          onChange={(e) => save({ type: e.target.value || null })}
        >
          <option value="">无类型</option>
          {catalog.snapshot.types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="队列">
        <select
          className="task-settings-select"
          aria-label="队列"
          value={t.bucket ?? ''}
          onChange={(e) => save({ bucket: e.target.value || null })}
        >
          <option value="">无队列</option>
          {catalog.snapshot.buckets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      {catalog.snapshot.labels.length > 0 && (
        <Field label="标签">
          <span className="task-template-labels">
            {catalog.snapshot.labels.map((l) => {
              const on = t.labels.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={on ? 'task-dchip' : 'task-dchip unset'}
                  aria-pressed={on}
                  onClick={() =>
                    save({ labels: on ? t.labels.filter((x) => x !== l.id) : [...t.labels, l.id] })
                  }
                >
                  <i className="task-dot" style={{ background: colorVar(l.color) }} />
                  {l.name}
                </button>
              );
            })}
          </span>
        </Field>
      )}
      <Field label="子任务">
        <BlurText
          value={t.subtasks.join('\n')}
          label="子任务，每行一个"
          placeholder="每行一个"
          rows={3}
          onSave={(text) => save({ subtasks: text.split('\n') })}
        />
      </Field>
      <Field label="描述">
        <BlurText
          value={t.description}
          label="描述（Markdown）"
          rows={5}
          onSave={(description) => save({ description })}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="task-template-field">
      <span className="task-template-label">{label}</span>
      {children}
    </div>
  );
}

function BlurInput({
  value,
  label,
  placeholder,
  onSave,
}: {
  value: string;
  label: string;
  placeholder?: string;
  onSave(value: string): void;
}) {
  const [text, setText] = useState(value);
  return (
    <input
      className="task-settings-input wide"
      value={text}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function BlurText({
  value,
  label,
  placeholder,
  rows,
  onSave,
}: {
  value: string;
  label: string;
  placeholder?: string;
  rows: number;
  onSave(value: string): void;
}) {
  const [text, setText] = useState(value);
  return (
    <textarea
      className="task-settings-textarea"
      value={text}
      rows={rows}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

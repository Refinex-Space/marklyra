import { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type {
  Category,
  Dictionary,
  DictionaryKind,
  MutationResult,
  TaskMutation,
} from '../../services/tasks.js';
import { AgentSkillsPage } from './agentSkills.js';
import { colorVar, PriorityGlyph, StatusGlyph, TaskIcon, type TaskIconName } from './glyphs.js';
import { type GuideActions, TaskGuide } from './guide.js';
import { type ImportContext, ImportPage } from './importer.js';
import { CATEGORY_ORDER, type Catalog, PRIORITIES } from './model/catalog.js';
import { validKey } from './model/view.js';
import { PALETTE } from './projectDialogs.js';
import { CyclesPage, TemplatesPage } from './settingsPlan.js';

type Page =
  | 'general'
  | 'statuses'
  | 'labels'
  | 'types'
  | 'buckets'
  | 'templates'
  | 'cycles'
  | 'import'
  | 'agents'
  | 'guide';
const PAGES: [Page, string, TaskIconName][] = [
  ['general', '常规', 'sliders'],
  ['statuses', '状态', 'clock'],
  ['labels', '标签', 'tag'],
  ['types', '类型', 'type'],
  ['buckets', '队列', 'layers'],
  ['templates', '模板', 'template'],
  ['cycles', '迭代', 'cycle'],
  ['import', '导入', 'import'],
  ['agents', '智能体技能', 'spark'],
  ['guide', '使用指南', 'book'],
];
const CATEGORY_NAMES: Record<Category, string> = {
  backlog: '待规划',
  unstarted: '未开始',
  started: '进行中',
  review: '评审',
  completed: '已完成',
  cancelled: '已取消',
};

export interface ConfirmRequest {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  run(): void;
}
interface Props {
  catalog: Catalog;
  run(mutation: TaskMutation): Promise<MutationResult | null>;
  confirm(request: ConfirmRequest): void;
}
type SettingsProps = Props & {
  importContext: ImportContext;
  guideActions: Omit<GuideActions, 'openImport'>;
  initialPage?: Page;
};

function Info({ text }: { text: string }) {
  return (
    <button type="button" className="task-info" aria-label={text}>
      <TaskIcon name="info" />
      <span className="task-info-tip" role="tooltip">
        {text}
      </span>
    </button>
  );
}

export type SettingsPage = Page;
export function TaskSettings({
  catalog,
  run,
  confirm,
  importContext,
  guideActions,
  initialPage = 'statuses',
}: SettingsProps) {
  const [page, setPage] = useState<Page>(initialPage);
  return (
    <div className="task-settings">
      <nav className="task-settings-nav" aria-label="任务设置">
        {PAGES.map(([id, name, icon]) => (
          <button
            key={id}
            type="button"
            className="task-nav-item"
            aria-current={page === id}
            onClick={() => setPage(id)}
          >
            <TaskIcon name={icon} />
            <span className="task-nav-label">{name}</span>
          </button>
        ))}
      </nav>
      <div className="task-settings-body">
        {page === 'general' && <General catalog={catalog} run={run} />}
        {page === 'statuses' && <Statuses catalog={catalog} run={run} confirm={confirm} />}
        {(page === 'labels' || page === 'types' || page === 'buckets') && (
          <Dictionaries kind={page} catalog={catalog} run={run} confirm={confirm} />
        )}
        {page === 'templates' && <TemplatesPage catalog={catalog} run={run} confirm={confirm} />}
        {page === 'cycles' && <CyclesPage catalog={catalog} run={run} />}
        {page === 'import' && (
          <ImportPage catalog={catalog} context={importContext} confirm={confirm} />
        )}
        {page === 'agents' && <AgentSkillsPage />}
        {page === 'guide' && (
          <TaskGuide actions={{ ...guideActions, openImport: () => setPage('import') }} />
        )}
      </div>
    </div>
  );
}

function General({ catalog, run }: Omit<Props, 'confirm'>) {
  const settings = catalog.snapshot.settings;
  const [key, setKey] = useState(settings.unassignedKey);
  const problem =
    key === settings.unassignedKey ? '' : !validKey(key) ? '2–5 位大写字母或数字，以字母开头' : '';
  return (
    <div className="task-settings-page">
      <h2>常规</h2>
      <div className="task-settings-list">
        <div className="task-settings-row">
          <span className="task-settings-grow">
            任务评论 <Info text="关闭后隐藏已有评论，不会删除。" />
          </span>
          <button
            type="button"
            role="switch"
            className="task-switch"
            aria-checked={settings.comments}
            aria-label="任务评论"
            onClick={() =>
              void run({ kind: 'updateSettings', set: { comments: !settings.comments } })
            }
          />
        </div>
        <div className="task-settings-row">
          <span className="task-settings-grow">
            无项目任务的编号 <Info text="不属于任何项目的任务使用这个 key 编号，例如 TASK-1。" />
          </span>
          <input
            className="task-settings-input mono"
            value={key}
            maxLength={5}
            aria-label="无项目任务的 key"
            aria-invalid={!!problem}
            onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onBlur={() => {
              if (key !== settings.unassignedKey && !problem)
                void run({ kind: 'updateSettings', set: { unassignedKey: key } }).then(
                  (r) => !r && setKey(settings.unassignedKey),
                );
              else if (problem) setKey(settings.unassignedKey);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
      </div>
      {problem && <p className="task-key-hint error">{problem}</p>}
    </div>
  );
}

/** A name that saves on Enter or blur; Escape restores it. */
function NameInput({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave(name: string): void;
}) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing && text !== value) setText(value);
  return (
    <input
      className="task-settings-name"
      value={text}
      aria-label={label}
      maxLength={40}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (text.trim() && text.trim() !== value) onSave(text.trim());
        else setText(value);
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

function ColorButton({ color, onChange }: { color: string; onChange(color: string): void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="task-color-wrap">
      <button
        type="button"
        className="task-swatch"
        style={{ background: colorVar(color) }}
        aria-label="更改颜色"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
          <div className="task-scrim clear" onMouseDown={() => setOpen(false)} />
          <div className="task-menu task-color-menu">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === color}
                aria-label={c}
                className="task-swatch"
                style={{ background: colorVar(c) }}
                onClick={() => {
                  setOpen(false);
                  if (c !== color) onChange(c);
                }}
                onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              />
            ))}
          </div>
        </>
      )}
    </span>
  );
}

function AddRow({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd(name: string): Promise<unknown>;
}) {
  const [text, setText] = useState('');
  return (
    <div className="task-settings-row adding">
      <Icon name="add" />
      <input
        className="task-settings-name"
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={40}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.key !== 'Enter' || !text.trim()) return;
          const name = text.trim();
          setText('');
          void onAdd(name);
        }}
      />
    </div>
  );
}

function Statuses({ catalog, run, confirm }: Props) {
  const statuses = catalog.snapshot.statuses;
  const used = (id: string) => catalog.tasks.filter((t) => t.status === id).length;
  return (
    <div className="task-settings-page">
      <h2>
        状态{' '}
        <Info text="类别决定图标，以及任务算作未关闭、已完成还是已取消。内置状态不能修改；可以在任一类别下添加自己的状态。" />
      </h2>
      {(Object.keys(CATEGORY_NAMES) as Category[])
        .sort((a, b) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b])
        .map((category) => (
          <section key={category} className="task-settings-section">
            <h3>{CATEGORY_NAMES[category]}</h3>
            <div className="task-settings-list">
              {statuses
                .filter((s) => s.category === category)
                .map((s) => (
                  <div key={s.id} className="task-settings-row">
                    <StatusGlyph status={s} />
                    {s.builtin ? (
                      <span className="task-settings-grow">{s.name}</span>
                    ) : (
                      <>
                        <span className="task-settings-grow">
                          <NameInput
                            value={s.name}
                            label="状态名称"
                            onSave={(name) =>
                              void run({
                                kind: 'upsertDictionary',
                                dictionary: 'statuses',
                                id: s.id,
                                set: { name },
                              })
                            }
                          />
                        </span>
                        <ColorButton
                          color={s.color}
                          onChange={(color) =>
                            void run({
                              kind: 'upsertDictionary',
                              dictionary: 'statuses',
                              id: s.id,
                              set: { color },
                            })
                          }
                        />
                      </>
                    )}
                    <span className="task-muted task-small">{used(s.id)}</span>
                    {s.builtin ? (
                      <span className="task-settings-lock" title="内置状态">
                        <TaskIcon name="lock" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="task-icon-btn"
                        aria-label={`删除状态 ${s.name}`}
                        onClick={() => {
                          const fallback = statuses.find(
                            (x) => x.builtin && x.category === s.category,
                          );
                          const n = used(s.id);
                          confirm({
                            title: `删除状态「${s.name}」？`,
                            body: n
                              ? `${n} 个任务会移到「${fallback?.name}」。`
                              : '没有任务使用这个状态。',
                            confirm: '删除',
                            danger: true,
                            run: () =>
                              void run({
                                kind: 'deleteDictionary',
                                dictionary: 'statuses',
                                id: s.id,
                              }),
                          });
                        }}
                      >
                        <Icon name="delete" />
                      </button>
                    )}
                  </div>
                ))}
              <AddRow
                placeholder={`在${CATEGORY_NAMES[category]}中添加状态`}
                onAdd={(name) =>
                  run({
                    kind: 'upsertDictionary',
                    dictionary: 'statuses',
                    set: {
                      name,
                      category,
                      color: statuses.find((x) => x.category === category)?.color ?? 'gray',
                    },
                  })
                }
              />
            </div>
          </section>
        ))}
    </div>
  );
}

const TITLES: Record<'labels' | 'types' | 'buckets', [string, string, string]> = {
  labels: ['标签', '改名或删除会同步到所有使用它的任务；任务通过不变的标识引用标签。', '添加标签'],
  types: [
    '类型',
    '每个任务最多一种类型。设置类型时追加它的标签；任务还没有优先级时设为它的默认优先级。',
    '添加类型',
  ],
  buckets: [
    '队列',
    '手动整理任务的通道，例如“现在 / 下一步 / 以后”；列表和看板都可以按队列分组。',
    '添加队列',
  ],
};

function Dictionaries({
  kind,
  catalog,
  run,
  confirm,
}: Props & { kind: 'labels' | 'types' | 'buckets' }) {
  const items: Dictionary[] = catalog.snapshot[kind];
  const [title, info, add] = TITLES[kind];
  const used = (id: string) =>
    catalog.tasks.filter((t) =>
      kind === 'labels'
        ? t.labels.includes(id)
        : kind === 'types'
          ? t.type === id
          : t.bucket === id,
    ).length;
  const upsert = (id: string | undefined, set: Record<string, unknown>) =>
    run({
      kind: 'upsertDictionary',
      dictionary: kind as DictionaryKind,
      ...(id ? { id } : {}),
      set,
    });
  const consequence = (n: number, name: string) =>
    n === 0
      ? '没有任务使用它。'
      : kind === 'labels'
        ? `会从 ${n} 个任务上移除「${name}」。`
        : kind === 'types'
          ? `${n} 个任务会变为无类型。`
          : `${n} 个任务会移出这个队列。`;
  return (
    <div className="task-settings-page">
      <h2>
        {title} <Info text={info} />
      </h2>
      <div className="task-settings-list">
        {items.map((d) => (
          <div key={d.id} className="task-settings-row">
            <ColorButton color={d.color} onChange={(color) => void upsert(d.id, { color })} />
            <span className="task-settings-grow">
              <NameInput
                value={d.name}
                label={`${title}名称`}
                onSave={(name) => void upsert(d.id, { name })}
              />
            </span>
            {kind === 'types' && (
              <TypeRules item={d} catalog={catalog} save={(set) => void upsert(d.id, set)} />
            )}
            <span className="task-muted task-small">{used(d.id)}</span>
            <button
              type="button"
              className="task-icon-btn"
              aria-label={`删除${title} ${d.name}`}
              onClick={() =>
                confirm({
                  title: `删除${title}「${d.name}」？`,
                  body: consequence(used(d.id), d.name),
                  confirm: '删除',
                  danger: true,
                  run: () => void run({ kind: 'deleteDictionary', dictionary: kind, id: d.id }),
                })
              }
            >
              <Icon name="delete" />
            </button>
          </div>
        ))}
        <AddRow
          placeholder={add}
          onAdd={(name) =>
            upsert(undefined, { name, color: PALETTE[items.length % PALETTE.length] })
          }
        />
      </div>
    </div>
  );
}

function TypeRules({
  item,
  catalog,
  save,
}: {
  item: Dictionary;
  catalog: Catalog;
  save(set: Record<string, unknown>): void;
}) {
  const [open, setOpen] = useState(false);
  const labels = catalog.snapshot.labels;
  return (
    <span className="task-type-rules">
      <span className="task-color-wrap">
        <button
          type="button"
          className="task-pill-btn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <TaskIcon name="tag" />
          {item.addLabels.length
            ? item.addLabels.map((id) => catalog.label(id)?.name ?? id).join('、')
            : '追加标签'}
        </button>
        {open && (
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
            <div className="task-scrim clear" onMouseDown={() => setOpen(false)} />
            <div className="task-menu">
              {labels.map((l) => {
                const on = item.addLabels.includes(l.id);
                return (
                  <label key={l.id} className="task-check-row task-option">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        save({
                          addLabels: on
                            ? item.addLabels.filter((x) => x !== l.id)
                            : [...item.addLabels, l.id],
                        })
                      }
                    />
                    <i className="task-dot" style={{ background: colorVar(l.color) }} />
                    {l.name}
                  </label>
                );
              })}
            </div>
          </>
        )}
      </span>
      <label className="task-pill-btn">
        <PriorityGlyph value={item.setPriority} />
        <select
          value={item.setPriority}
          aria-label="默认优先级"
          onChange={(e) => save({ setPriority: Number(e.target.value) })}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.value === 0 ? '不设优先级' : p.name}
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { SkeletonRows } from '../../components/Skeleton.js';
import {
  type ImportKind,
  type ImportOpened,
  type ImportOptions,
  type ImportPreview,
  type ImportReceipt,
  type ImportRow,
  taskErrorMessage,
  taskImports,
} from '../../services/tasks.js';
import { notify } from '../notices/notices.js';
import { Modal } from './dialogs.js';
import { TaskIcon, type TaskIconName } from './glyphs.js';
import type { Catalog } from './model/catalog.js';
import type { ConfirmRequest } from './TaskSettings.js';

/** What the importer needs from the window: the workspace and the note being edited. */
export interface ImportContext {
  workspaceId: string;
  /** Workspace-relative path of the open note, if any. */
  currentNote: string | null;
  /** Its unsaved edits keep its checklist lines from being rewritten. */
  currentNoteDirty: boolean;
}

const SOURCES: { kind: ImportKind; name: string; icon: TaskIconName; tip: string }[] = [
  {
    kind: 'notes',
    name: '笔记中的清单',
    icon: 'note',
    tip: '每个 - [ ] 清单项建为一个任务，原行改为指向它的链接；- [x] 可作为已完成导入。',
  },
  {
    kind: 'csv',
    name: 'CSV 表格',
    icon: 'table',
    tip: 'Linear、Jira、Todoist 等导出的 CSV，按列名识别标题、状态、优先级、标签、项目与父任务。',
  },
  {
    kind: 'github',
    name: 'GitHub Issues',
    icon: 'branch',
    tip: 'gh issue list --state all --json number,title,body,labels,state,stateReason,milestone,url,comments > issues.json',
  },
  {
    kind: 'octarine',
    name: 'Octarine',
    icon: 'layers',
    tip: '选择含 .octarine 的库文件夹。只读取，不修改原目录；保留原编号，可用 WEB-3 这样的旧编号查找。',
  },
];
const kindName = (kind: ImportKind) => SOURCES.find((s) => s.kind === kind)?.name ?? kind;
const kindIcon = (kind: ImportKind) => SOURCES.find((s) => s.kind === kind)?.icon ?? 'import';

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

const when = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Undoing archives what the import created; the notice offers it right after an import. */
async function undoImport(workspaceId: string, receipt: ImportReceipt) {
  try {
    const archived = await taskImports.undo(workspaceId, receipt.id);
    notify(`已撤销导入，归档 ${archived} 个任务`, 'success');
  } catch (error) {
    notify(taskErrorMessage(error), 'error');
  }
}

/** Task settings → 导入: the sources, and every import so far with its undo. */
export function ImportPage({
  catalog,
  context,
  confirm,
}: {
  catalog: Catalog;
  context: ImportContext;
  confirm(request: ConfirmRequest): void;
}) {
  const { workspaceId } = context;
  const [opened, setOpened] = useState<ImportOpened | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ImportReceipt[] | null>(null);
  const [failed, setFailed] = useState(false);
  const generation = catalog.snapshot.generation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: every store change may add or undo an import.
  useEffect(() => {
    let live = true;
    taskImports
      .receipts(workspaceId)
      .then((r) => {
        if (!live) return;
        setReceipts(r);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [workspaceId, generation]);

  const start = async (kind: ImportKind, scope?: 'note' | 'all') => {
    const key = scope ? `${kind}:${scope}` : kind;
    setReading(key);
    try {
      const result =
        kind === 'notes'
          ? await taskImports.notes(workspaceId, scope === 'note' ? context.currentNote : null)
          : await taskImports.pick(workspaceId, kind);
      if (result) setOpened(result);
    } catch (error) {
      notify(taskErrorMessage(error), 'error');
    } finally {
      setReading(null);
    }
  };

  return (
    <div className="task-settings-page">
      <h2>导入</h2>
      <div className="task-settings-list">
        {SOURCES.map((source) => (
          <div key={source.kind} className="task-settings-row task-import-source">
            <TaskIcon name={source.icon} />
            <span className="task-settings-grow">
              {source.name} <Info text={source.tip} />
            </span>
            {source.kind === 'notes' ? (
              <>
                {context.currentNote && (
                  <button
                    type="button"
                    className="task-btn"
                    disabled={reading !== null}
                    aria-busy={reading === 'notes:note'}
                    onClick={() => void start('notes', 'note')}
                    title={context.currentNote}
                  >
                    当前笔记
                  </button>
                )}
                <button
                  type="button"
                  className="task-btn"
                  disabled={reading !== null}
                  aria-busy={reading === 'notes:all'}
                  onClick={() => void start('notes', 'all')}
                >
                  整个工作区
                </button>
              </>
            ) : (
              <button
                type="button"
                className="task-btn"
                disabled={reading !== null}
                aria-busy={reading === source.kind}
                onClick={() => void start(source.kind)}
              >
                {source.kind === 'octarine' ? '选择文件夹…' : '选择文件…'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="task-settings-section task-import-history">
        <h3>导入记录</h3>
        {failed ? (
          <div className="task-settings-empty">导入记录无法读取</div>
        ) : receipts === null ? (
          <SkeletonRows rows={2} height={40} label="正在读取导入记录" />
        ) : receipts.length === 0 ? (
          <div className="task-settings-empty">还没有导入</div>
        ) : (
          <div className="task-settings-list">
            {receipts.map((r) => (
              <div key={r.id} className="task-settings-row" data-undone={r.undone || undefined}>
                <TaskIcon name={kindIcon(r.kind)} />
                <span className="task-settings-grow task-import-label">
                  <span className="task-import-name" title={r.label}>
                    {r.label || kindName(r.kind)}
                  </span>
                  <span className="task-muted mono">{when(r.at)}</span>
                </span>
                <span className="task-muted">{r.tasks.length} 个任务</span>
                {r.undone ? (
                  <span className="task-muted task-import-state">已撤销</span>
                ) : (
                  <button
                    type="button"
                    className="task-btn"
                    disabled={r.tasks.length === 0}
                    onClick={() =>
                      confirm({
                        title: '撤销这次导入？',
                        body: `归档这次导入新建的 ${r.tasks.length} 个任务，之后仍可在已归档中恢复。新建的项目和标签会保留。`,
                        confirm: '撤销导入',
                        danger: true,
                        run: () => void undoImport(workspaceId, r),
                      })
                    }
                  >
                    撤销
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {opened && (
        <ImportDialog
          catalog={catalog}
          context={context}
          opened={opened}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

type Filter = 'all' | ImportRow['outcome'];
const SHOWN = 400;

function ImportDialog({
  catalog,
  context,
  opened,
  onClose,
}: {
  catalog: Catalog;
  context: ImportContext;
  opened: ImportOpened;
  onClose(): void;
}) {
  const { workspaceId } = context;
  const [options, setOptions] = useState<ImportOptions>({
    project: null,
    createLabels: false,
    includeClosed: opened.preview.includeClosedDefault,
  });
  const [preview, setPreview] = useState<ImportPreview>(opened.preview);
  const [filter, setFilter] = useState<Filter>(opened.preview.new > 0 ? 'new' : 'all');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const update = async (next: ImportOptions) => {
    setOptions(next);
    const mine = ++seq.current;
    try {
      const p = await taskImports.preview(workspaceId, opened.token, next);
      if (mine === seq.current) setPreview(p);
    } catch (error) {
      if (mine === seq.current) notify(taskErrorMessage(error), 'error');
    }
  };

  const run = async () => {
    if (busy || preview.new === 0) return;
    setBusy(true);
    try {
      const skip =
        context.currentNote && context.currentNoteDirty ? [context.currentNote] : ([] as string[]);
      const result = await taskImports.apply(workspaceId, opened.token, options, skip);
      onClose();
      notify(`已导入 ${result.created} 个任务`, 'success', {
        actions: [{ label: '撤销', run: () => undoImport(workspaceId, result.receipt) }],
      });
      if (result.unlinkedNotes.length > 0)
        notify(
          `${result.unlinkedNotes.join('、')} 有未保存或新的改动，其中的清单项未改为链接`,
          'warning',
        );
    } catch (error) {
      notify(taskErrorMessage(error), 'error');
      setBusy(false);
    }
  };

  const rows = useMemo(
    () => (filter === 'all' ? preview.rows : preview.rows.filter((r) => r.outcome === filter)),
    [preview, filter],
  );
  const projects = catalog.snapshot.projects.filter((p) => p.state === 'active');
  const labelChoice = preview.unknownLabels.length + preview.labelsToCreate.length > 0;
  const closedChoice =
    options.includeClosed || preview.rows.some((r) => r.reason?.startsWith('已关闭'));
  const tabs: [Filter, string, number][] = [
    ['new', '新建', preview.new],
    ['skip', '跳过', preview.skip],
    ['problem', '需要处理', preview.problem],
  ];

  return (
    <Modal
      label={`导入${kindName(preview.kind)}`}
      close={onClose}
      className="task-dialog task-import"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ⌘↩ shortcut for the primary action. */}
      <div
        className="task-import-frame"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void run();
          }
        }}
      >
        <div className="task-dialog-head">
          <TaskIcon name={kindIcon(preview.kind)} />
          <span>{kindName(preview.kind)}</span>
          <span className="task-crumb-sep">›</span>
          <span className="task-import-source-name" title={preview.label}>
            {preview.label}
          </span>
          <span className="task-spacer" />
          <button type="button" className="task-icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>

        <div className="task-import-options">
          <label className="task-import-field">
            没有项目的任务放入
            <select
              value={options.project ?? ''}
              onChange={(e) => void update({ ...options, project: e.target.value || null })}
            >
              <option value="">无项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {closedChoice && (
            <label className="task-switch-label">
              <button
                type="button"
                role="switch"
                className="task-switch"
                aria-checked={options.includeClosed}
                onClick={() => void update({ ...options, includeClosed: !options.includeClosed })}
              />
              包含已关闭
            </label>
          )}
          {labelChoice && (
            <label className="task-switch-label">
              <button
                type="button"
                role="switch"
                className="task-switch"
                aria-checked={options.createLabels}
                onClick={() => void update({ ...options, createLabels: !options.createLabels })}
              />
              新建未知标签
              <Info
                text={
                  options.createLabels
                    ? `将新建：${preview.labelsToCreate.join('、')}`
                    : `这些标签不会添加：${preview.unknownLabels.join('、')}`
                }
              />
            </label>
          )}
        </div>

        <div className="task-import-tabs" role="tablist" aria-label="导入预览">
          {tabs.map(([id, name, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className="task-import-tab"
              data-outcome={id}
              disabled={count === 0}
              onClick={() => setFilter(filter === id ? 'all' : id)}
            >
              {name}
              <span className="mono">{count}</span>
            </button>
          ))}
          <span className="task-spacer" />
          {(preview.warnings.length > 0 || preview.projectsToCreate.length > 0) && (
            <Info
              text={[
                preview.projectsToCreate.length
                  ? `将新建项目：${preview.projectsToCreate.join('、')}`
                  : '',
                ...preview.warnings,
              ]
                .filter(Boolean)
                .join('\n')}
            />
          )}
        </div>

        <ul className="task-import-rows" aria-label="预览">
          {rows.slice(0, SHOWN).map((r) => (
            <li key={`${r.index}:${r.sourceRef}`} data-outcome={r.outcome}>
              <span className="task-import-mark" aria-hidden="true">
                {r.outcome === 'new' ? '+' : r.outcome === 'skip' ? '=' : '!'}
              </span>
              <span
                className="task-import-title"
                title={r.parent ? `${r.parent} › ${r.title}` : r.title}
              >
                {r.parent && <span className="task-import-parent">{r.parent} › </span>}
                {r.title || <span className="task-muted">无标题</span>}
              </span>
              {r.outcome === 'new' ? (
                <span className="task-import-meta">
                  {r.labels.length > 0 && <span>{r.labels.join('、')}</span>}
                  <span>{r.status}</span>
                  <span>{r.project}</span>
                </span>
              ) : (
                <span className="task-import-meta">{r.reason}</span>
              )}
            </li>
          ))}
          {rows.length > SHOWN && (
            <li className="task-import-more task-muted">另有 {rows.length - SHOWN} 项</li>
          )}
        </ul>

        <div className="task-dialog-foot">
          {preview.kind === 'notes' && preview.new > 0 && (
            <span className="task-muted task-import-consequence">清单项会改为任务链接</span>
          )}
          <span className="task-spacer" />
          <button type="button" className="task-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="task-btn primary"
            disabled={busy || preview.new === 0}
            aria-busy={busy}
            onClick={() => void run()}
            title="⌘↩"
          >
            {preview.new === 0 ? '没有可导入的任务' : `导入 ${preview.new} 个任务`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

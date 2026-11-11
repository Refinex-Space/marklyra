import { useState } from 'react';
import type { Cycle } from '../../services/tasks.js';
import { Modal } from './dialogs.js';
import { colorVar, ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import type { Catalog } from './model/catalog.js';
import { cycleStats, cycleTitle } from './model/cycle.js';
import { formatRange } from './pickers.js';

export function CycleOverview({
  catalog,
  cycle,
  showStatus,
  openTask,
}: {
  catalog: Catalog;
  cycle: Cycle;
  showStatus(status: string): void;
  openTask(id: string): void;
}) {
  const stats = cycleStats(catalog, cycle);
  const fraction = stats.total ? stats.done / stats.total : 0;
  const summary = cycle.state === 'completed' ? cycle.summary : null;
  return (
    <div className="task-overview">
      <section className="task-overview-block" aria-label="进度">
        <div className="task-overview-progress">
          <ProgressPie fraction={fraction} size={22} />
          <span>
            <b>{stats.done}</b> / {stats.total} 已完成
          </span>
          <span className="task-muted">{Math.round(fraction * 100)}%</span>
        </div>
        {stats.total > 0 && !summary && (
          <div className="task-overview-bar" aria-hidden="true">
            {stats.byStatus
              .filter((s) => s.count)
              .map((s) => (
                <i
                  key={s.status.id}
                  style={{ flexGrow: s.count, background: colorVar(s.status.color) }}
                  title={`${s.status.name} ${s.count}`}
                />
              ))}
          </div>
        )}
        <div className="task-cycle-tiles">
          <Tile label="计划内" value={stats.planned} />
          <Tile label="中途加入" value={stats.added} />
          <Tile label="已完成" value={stats.done} />
          <Tile label={summary ? '未完成' : '进行中'} value={stats.open} />
        </div>
      </section>
      {!summary && stats.total > 0 && (
        <section className="task-overview-block" aria-label="按状态">
          <h3 className="task-overview-label">按状态</h3>
          <div className="task-overview-statuses">
            {stats.byStatus
              .filter((s) => s.count)
              .map((s) => (
                <button
                  type="button"
                  key={s.status.id}
                  className="task-overview-status"
                  onClick={() => showStatus(s.status.id)}
                  title={`查看${s.status.name}`}
                >
                  <StatusGlyph status={s.status} />
                  <span>{s.status.name}</span>
                  <b>{s.count}</b>
                </button>
              ))}
          </div>
        </section>
      )}
      {stats.byProject.length > 0 && (
        <section className="task-overview-block" aria-label="按项目">
          <h3 className="task-overview-label">按项目</h3>
          <div className="task-cycle-projects">
            {stats.byProject.map((row) => {
              const p = catalog.project(row.project);
              return (
                <div key={row.project ?? '∅'} className="task-cycle-project">
                  <TaskIcon name="folder" color={p?.color ?? 'gray'} />
                  <span className="task-cycle-project-name">{p?.name ?? '无项目'}</span>
                  <ProgressPie fraction={row.total ? row.done / row.total : 0} size={12} />
                  <span className="task-muted">
                    {row.done} / {row.total}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {summary && summary.unfinished.length > 0 && (
        <section className="task-overview-block" aria-label="未完成">
          <h3 className="task-overview-label">未完成</h3>
          <div className="task-cycle-list">
            {summary.unfinished.map((id) => {
              const t = catalog.task(id);
              if (!t) return null;
              const now = catalog.cycle(t.cycle);
              return (
                <button
                  key={id}
                  type="button"
                  className="task-cycle-row"
                  onClick={() => openTask(id)}
                >
                  <StatusGlyph status={catalog.status(t.status)} />
                  <span className="mono task-muted">{catalog.humanId(t)}</span>
                  <span className="task-cycle-row-title">{t.title}</span>
                  <span className="task-muted">{now ? `→ ${cycleTitle(now)}` : '已移出迭代'}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="task-cycle-tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function CompleteCycleDialog({
  catalog,
  cycle,
  onClose,
  submit,
}: {
  catalog: Catalog;
  cycle: Cycle;
  onClose(): void;
  submit(moves: Record<string, 'next' | 'none'>): Promise<boolean>;
}) {
  const stats = cycleStats(catalog, cycle);
  const [moves, setMoves] = useState<Record<string, 'next' | 'none'>>({});
  const [busy, setBusy] = useState(false);
  const next = catalog.cycle(cycle.number + 1);
  const nextName = next ? cycleTitle(next) : `迭代 ${cycle.number + 1}`;
  const all = (to: 'next' | 'none') =>
    setMoves(Object.fromEntries(stats.unfinished.map((t) => [t.id, to])));
  return (
    <Modal label={`完成${cycleTitle(cycle)}`} close={onClose} className="task-dialog">
      <div className="task-dialog-head">
        <TaskIcon name="cycle" />
        <span>
          完成{cycleTitle(cycle)}
          <span className="task-muted"> · {formatRange(cycle.start, cycle.end)}</span>
        </span>
        <span className="task-spacer" />
      </div>
      <div className="task-dialog-body">
        <div className="task-cycle-tiles">
          <Tile label="计划内" value={stats.planned} />
          <Tile label="已完成" value={stats.done} />
          <Tile label="未完成" value={stats.open} />
        </div>
        {stats.unfinished.length > 0 && (
          <>
            <div className="task-cycle-moves-head">
              <span>未完成的任务</span>
              <span className="task-spacer" />
              <button type="button" className="task-link-btn" onClick={() => all('next')}>
                全部移到{nextName}
              </button>
              <button type="button" className="task-link-btn" onClick={() => all('none')}>
                全部移出
              </button>
            </div>
            <ul className="task-cycle-moves">
              {stats.unfinished.map((t) => {
                const to = moves[t.id] ?? 'next';
                return (
                  <li key={t.id}>
                    <StatusGlyph status={catalog.status(t.status)} />
                    <span className="mono task-muted">{catalog.humanId(t)}</span>
                    <span className="task-cycle-row-title">{t.title}</span>
                    <fieldset className="task-segment" aria-label={`${t.title} 的去向`}>
                      {(
                        [
                          ['next', nextName],
                          ['none', '移出迭代'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={to === value}
                          onClick={() => setMoves((m) => ({ ...m, [t.id]: value }))}
                        >
                          {label}
                        </button>
                      ))}
                    </fieldset>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <div className="task-dialog-foot">
        <span className="task-muted task-dialog-note">
          完成后{cycleTitle(cycle)} 只保留总结，{nextName} 开始。
        </span>
        <span className="task-spacer" />
        <button type="button" className="task-btn" onClick={onClose}>
          返回
        </button>
        <button
          type="button"
          className="task-btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await submit(moves);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          完成迭代
        </button>
      </div>
    </Modal>
  );
}

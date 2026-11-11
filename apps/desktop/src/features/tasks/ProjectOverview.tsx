import { useEffect, useState } from 'react';
import type { Project } from '../../services/tasks.js';
import { colorVar, ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import type { Catalog } from './model/catalog.js';

interface Props {
  catalog: Catalog;
  project: Project;
  /** Saves the description; resolves false when it failed (already reported). */
  saveDescription(body: string): Promise<boolean>;
  /** Opens the task list filtered to one status. */
  showStatus(status: string): void;
}

/** `[[Note]]` and `[[folder/Note|label]]` targets named in the description. */
export function linkedNotes(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const target = (m[1] ?? '').trim();
    if (target && !/^(task|project):/.test(target)) names.add(target);
  }
  return [...names];
}

export function ProjectOverview({ catalog, project, saveDescription, showStatus }: Props) {
  const tasks = catalog.tasks.filter((t) => t.project === project.id && !t.archived);
  const done = tasks.filter((t) => catalog.category(t) === 'completed').length;
  const fraction = tasks.length ? done / tasks.length : 0;
  const statuses = catalog.statusesFor(project.id).map((s) => ({
    status: s,
    count: tasks.filter((t) => t.status === s.id).length,
  }));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description);
  useEffect(() => {
    if (!editing) setDraft(project.description);
  }, [project.description, editing]);
  const save = async () => {
    if (draft === project.description) return setEditing(false);
    if (await saveDescription(draft)) setEditing(false);
  };
  const notes = linkedNotes(project.description);
  return (
    <div className="task-overview">
      <section className="task-overview-block" aria-label="进度">
        <div className="task-overview-progress">
          <ProgressPie fraction={fraction} size={22} />
          <span>
            <b>{done}</b> / {tasks.length} 已完成
          </span>
          <span className="task-muted">{Math.round(fraction * 100)}%</span>
        </div>
        {tasks.length > 0 && (
          <div className="task-overview-bar" aria-hidden="true">
            {statuses
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
        <div className="task-overview-statuses">
          {statuses.map((s) => (
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
      <section className="task-overview-block" aria-label="描述">
        <h3 className="task-overview-label">描述</h3>
        {editing ? (
          <textarea
            className="task-desc-source"
            value={draft}
            autoFocus
            aria-label="项目描述（Markdown）"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              e.stopPropagation();
              if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
                e.preventDefault();
                void save();
              } else if (e.key === 'Escape') e.currentTarget.blur();
            }}
          />
        ) : (
          <button
            type="button"
            className={
              project.description.trim() ? 'task-desc task-overview-desc' : 'task-desc empty'
            }
            onClick={() => setEditing(true)}
          >
            {project.description.trim() || '添加描述…'}
          </button>
        )}
      </section>
      {notes.length > 0 && (
        <section className="task-overview-block" aria-label="相关笔记">
          <h3 className="task-overview-label">相关笔记</h3>
          <div className="task-overview-notes">
            {notes.map((n) => (
              <span key={n} className="task-overview-note">
                <TaskIcon name="note" />
                {n}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

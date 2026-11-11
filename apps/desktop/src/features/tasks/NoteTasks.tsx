import { useEffect, useMemo, useState } from 'react';
import { onTasksChanged, type TaskSnapshot, tasks as taskApi } from '../../services/tasks.js';
import { StatusGlyph } from './glyphs.js';
import { linkedTaskIds } from './model/links.js';
import './note-tasks.css';

/** Tasks the open note links to, below its outline. Nothing shows for a note without task links. */
export function NoteTasks({
  workspaceId,
  markdown,
  open,
}: {
  workspaceId: string | null;
  markdown: string;
  open(id: string): void;
}) {
  const ids = useMemo(() => linkedTaskIds(markdown), [markdown]);
  const wanted = workspaceId !== null && ids.length > 0;
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  useEffect(() => {
    if (!wanted || !workspaceId) return;
    let alive = true;
    const load = () =>
      void taskApi.snapshot(workspaceId).then(
        (s) => alive && setSnapshot(s),
        () => {},
      );
    load();
    const stop = onTasksChanged(load);
    return () => {
      alive = false;
      void stop.then((f) => f());
    };
  }, [wanted, workspaceId]);
  if (!wanted || !snapshot) return null;
  const rows = ids
    .map((id) => snapshot.tasks.find((t) => t.id === id))
    .filter((t) => t !== undefined);
  if (!rows.length) return null;
  const key = (project: string | null) =>
    snapshot.projects.find((p) => p.id === project)?.key ?? snapshot.settings.unassignedKey;
  const status = (id: string) => snapshot.statuses.find((s) => s.id === id) ?? snapshot.statuses[0];
  return (
    <section className="note-tasks" aria-label="本文任务">
      <h3 className="note-tasks-head">本文任务</h3>
      {rows.map((t) => {
        const s = status(t.status);
        const closed = s && (s.category === 'completed' || s.category === 'cancelled');
        return (
          <button
            type="button"
            key={t.id}
            className={closed ? 'note-task closed' : 'note-task'}
            title={`${key(t.project)}-${t.number} · ${s?.name ?? ''}`}
            onClick={() => open(t.id)}
          >
            {s && <StatusGlyph status={s} size={13} />}
            <span className="note-task-title">{t.title}</span>
          </button>
        );
      })}
    </section>
  );
}

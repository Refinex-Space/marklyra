import { useRef, useState } from 'react';
import { taskErrorMessage, tasks } from '../../services/tasks.js';
import { Modal, NewProjectDialog } from './dialogs.js';
import { Catalog } from './model/catalog.js';
import { lastTaskProject } from './model/last-project.js';
import './tasks.css';

export interface TaskConversion {
  title: string;
  workspaceId: string;
  catalog: Catalog;
  current(): boolean;
  convert(project: string | null): Promise<void>;
}

export default function ConvertSelectionDialog({
  request,
  close,
}: {
  request: TaskConversion;
  close(): void;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>(() =>
    request.catalog.snapshot.projects.filter((p) => p.state !== 'archived'),
  );
  const [project, setProject] = useState(
    () => projects.find((p) => p.id === lastTaskProject(request.workspaceId))?.id ?? '',
  );
  const [projectDialog, setProjectDialog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);

  async function run(work: () => Promise<void>) {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      if (!request.current()) throw new Error('原文或选区已变化，请重新选择文字');
      await work();
      return true;
    } catch (failure) {
      setError(taskErrorMessage(failure));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  if (projectDialog)
    return (
      <NewProjectDialog
        catalog={projectDialog}
        error={error}
        onClose={() => {
          if (!busy.current) setProjectDialog(null);
        }}
        submit={(name, key) =>
          run(async () => {
            const result = await tasks.mutate(request.workspaceId, {
              kind: 'createProject',
              name,
              key,
            });
            const id = result.created[0];
            if (!id) throw new Error('未取得新项目编号');
            setProjects((previous) => [...previous, { id, name }]);
            setProject(id);
          })
        }
      />
    );
  return (
    <Modal
      label="所选文字转为任务"
      className="task-dialog small"
      close={() => {
        if (!busy.current) close();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run(() => request.convert(project || null))) close();
        }}
      >
        <div className="task-dialog-head">所选文字转为任务</div>
        <div className="task-dialog-body task-form">
          <p className="task-convert-title">{request.title}</p>
          <label>
            所属项目
            <select
              className="task-btn"
              autoFocus
              value={project}
              disabled={saving}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="">无项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="task-btn"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                setProjectDialog(new Catalog(await tasks.snapshot(request.workspaceId)));
              })
            }
          >
            新建项目
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="task-dialog-foot">
          <span className="task-spacer" />
          <button type="button" className="task-btn" disabled={saving} onClick={close}>
            取消
          </button>
          <button type="submit" className="task-btn primary" disabled={saving}>
            转为任务
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import {
  type ConflictKind,
  type GitConflicts,
  type GitResolution,
  git,
  gitError,
} from '../../services/git.js';
import { basename, dirname, GitDialogFrame } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';
import { OperationBanner } from './GitStatusParts.js';

const SIDES: Record<ConflictKind, [string, string]> = {
  'both-modified': ['已修改', '已修改'],
  'both-added': ['已添加', '已添加'],
  'both-deleted': ['已删除', '已删除'],
  'added-by-us': ['已添加', '—'],
  'added-by-them': ['—', '已添加'],
  'deleted-by-us': ['已删除', '已修改'],
  'deleted-by-them': ['已修改', '已删除'],
};
/** Git names sides us/them by index stage; while rebasing, stage 2 is the upstream, not yours. */
export function perspective(kind: ConflictKind, yoursStage: 2 | 3): ConflictKind {
  if (yoursStage === 2) return kind;
  const swap: Partial<Record<ConflictKind, ConflictKind>> = {
    'added-by-us': 'added-by-them',
    'added-by-them': 'added-by-us',
    'deleted-by-us': 'deleted-by-them',
    'deleted-by-them': 'deleted-by-us',
  };
  return swap[kind] ?? kind;
}
/** Kinds where both sides have text that a three-way merge can combine. */
export const mergeable = (kind: ConflictKind) => kind === 'both-modified' || kind === 'both-added';

export function useConflicts() {
  const { workspace, revision } = useGit();
  const [conflicts, setConflicts] = useState<GitConflicts | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const id = workspace?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after every repository mutation.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setError('');
    void git.conflicts(id).then(
      (value) => {
        if (alive) setConflicts(value);
      },
      (failure: unknown) => {
        if (alive) setError(gitError(failure).message);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, revision, attempt]);
  return { conflicts, error, retry: () => setAttempt((value) => value + 1) };
}

/** The list of conflicted files, IDEA's "Conflicts" dialog. */
export function ConflictsDialog({ active }: { active: boolean }) {
  const context = useGit();
  const { conflicts, error, retry } = useConflicts();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const files = conflicts?.files ?? [];
  useEffect(() => {
    setSelected((set) => {
      const next = new Set([...set].filter((path) => files.some((file) => file.path === path)));
      if (!next.size && files[0]) next.add(files[0].path);
      return next;
    });
  }, [files]);
  const chosen = files.filter((file) => selected.has(file.path));
  const busy = context.busy !== null;
  const stage = conflicts?.yoursStage ?? 2;
  const resolve = (resolution: GitResolution, label: string) =>
    void context.run(
      label,
      async (id) => {
        for (const file of chosen) {
          const kind = perspective(file.kind, stage);
          const effective =
            // A side that deleted the file resolves by deleting it.
            (resolution.kind === 'yours' && ['deleted-by-us', 'added-by-them'].includes(kind)) ||
            (resolution.kind === 'theirs' && ['deleted-by-them', 'added-by-us'].includes(kind)) ||
            kind === 'both-deleted'
              ? ({ kind: 'delete' } as const)
              : resolution;
          await git.resolve(id, file.path, effective);
        }
      },
      {
        touchesWorkTree: true,
        success: () => `已解决 ${chosen.length} 个文件`,
      },
    );
  const yours = conflicts?.yoursLabel ?? '你的';
  const theirs = conflicts?.theirsLabel ?? '他们的';
  const single = chosen.length === 1 ? chosen[0] : undefined;
  return (
    <GitDialogFrame
      title="冲突"
      subtitle={conflicts ? `${files.length} 个文件` : undefined}
      active={active}
      onClose={context.closeDialog}
      size="large"
      footer={
        <>
          <span className="git-footer-note">
            双击文件打开合并工具。选中多个文件可一次接受同一侧。
          </span>
          <span className="git-toolbar-spacer" />
          <button
            type="button"
            className="git-button"
            disabled={busy || !chosen.length}
            onClick={() => resolve({ kind: 'yours' }, '接受你的版本')}
          >
            接受你的
          </button>
          <button
            type="button"
            className="git-button"
            disabled={busy || !chosen.length}
            onClick={() => resolve({ kind: 'theirs' }, '接受他们的版本')}
          >
            接受他们的
          </button>
          <button
            type="button"
            className="git-button git-button-primary"
            disabled={busy || !single || !mergeable(single.kind)}
            onClick={() => single && context.openDialog({ kind: 'merge', path: single.path })}
          >
            合并…
          </button>
        </>
      }
    >
      <OperationBanner />
      {error ? (
        <div className="git-error-state" role="alert">
          <p>{error}</p>
          <button type="button" className="git-button" onClick={retry}>
            重试
          </button>
        </div>
      ) : !conflicts ? (
        <SkeletonRows rows={4} height={30} />
      ) : files.length === 0 ? (
        <div className="git-empty-state">
          <GitGlyph name="check" />
          <p>所有冲突都已解决。</p>
          {conflicts.operation !== 'none' && (
            <p className="git-muted">提交合并或继续变基即可完成操作。</p>
          )}
        </div>
      ) : (
        <table className="git-table git-conflict-table">
          <thead>
            <tr>
              <th scope="col" className="git-col-check">
                <input
                  type="checkbox"
                  aria-label="全选"
                  checked={chosen.length === files.length}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked ? new Set(files.map((file) => file.path)) : new Set(),
                    )
                  }
                />
              </th>
              <th scope="col">名称</th>
              <th scope="col" title="你的版本（本地）">
                你的 · {yours}
              </th>
              <th scope="col" title="他们的版本（传入）">
                他们的 · {theirs}
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const [mine, other] = SIDES[perspective(file.kind, stage)];
              return (
                <tr
                  key={file.path}
                  aria-selected={selected.has(file.path)}
                  onClick={(event) =>
                    setSelected((set) => {
                      if (!(event.ctrlKey || event.metaKey)) return new Set([file.path]);
                      const next = new Set(set);
                      if (next.has(file.path)) next.delete(file.path);
                      else next.add(file.path);
                      return next;
                    })
                  }
                  onDoubleClick={() => {
                    if (mergeable(file.kind))
                      context.openDialog({ kind: 'merge', path: file.path });
                  }}
                >
                  <td className="git-col-check">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${file.path}`}
                      checked={selected.has(file.path)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setSelected((set) => {
                          const next = new Set(set);
                          if (event.target.checked) next.add(file.path);
                          else next.delete(file.path);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    <span className="git-conflict-name">
                      <GitGlyph name="file" />
                      {basename(file.path)}
                    </span>
                    {dirname(file.path) && (
                      <span className="git-file-dir">{dirname(file.path)}</span>
                    )}
                  </td>
                  <td>{mine}</td>
                  <td>{other}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </GitDialogFrame>
  );
}

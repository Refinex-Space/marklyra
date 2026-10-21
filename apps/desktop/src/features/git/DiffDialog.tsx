import { useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { type GitFileChange, git, gitError } from '../../services/git.js';
import { DiffPanel } from './DiffPanel.js';
import { FileList } from './FileList.js';
import { GitDialogFrame } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import type { DiffRequest } from './GitProvider.js';
import { useGit } from './GitProvider.js';

/** Full-window diff of one or more files with previous/next file navigation. */
export function DiffDialog({ request, active }: { request: DiffRequest; active: boolean }) {
  const { closeDialog } = useGit();
  const [index, setIndex] = useState(request.index);
  const files = request.files;
  const entry = files[index] ?? null;
  const multiple = files.length > 1;
  const go = (step: number) =>
    setIndex((value) => Math.max(0, Math.min(files.length - 1, value + step)));
  return (
    <GitDialogFrame
      title={request.title}
      subtitle={entry?.path}
      active={active}
      onClose={closeDialog}
      size="full"
      toolbar={
        multiple ? (
          <div className="git-file-nav">
            <button
              type="button"
              className="git-icon-button"
              aria-label="上一个文件"
              title="上一个文件（Alt+←）"
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <GitGlyph name="arrowLeft" />
            </button>
            <span>
              {index + 1} / {files.length}
            </span>
            <button
              type="button"
              className="git-icon-button"
              aria-label="下一个文件"
              title="下一个文件（Alt+→）"
              disabled={index === files.length - 1}
              onClick={() => go(1)}
            >
              <GitGlyph name="arrowRight" />
            </button>
          </div>
        ) : undefined
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Alt+arrows move between files. */}
      <div
        className={multiple ? 'git-split git-diff-dialog-body' : 'git-diff-dialog-body'}
        onKeyDown={(event) => {
          if (!multiple || !event.altKey) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            go(event.key === 'ArrowLeft' ? -1 : 1);
          }
        }}
      >
        {multiple && (
          <aside className="git-split-side">
            <FileList
              label="文件"
              files={files.map((file) => ({
                path: file.path,
                origPath: file.origPath ?? null,
                status: file.status ?? 'M',
              }))}
              selected={entry?.path ?? null}
              onSelect={(path) => setIndex(files.findIndex((file) => file.path === path))}
            />
          </aside>
        )}
        <DiffPanel
          left={entry?.sides?.left ?? request.left}
          right={entry?.sides?.right ?? request.right}
          entry={entry}
          className="git-split-main"
        />
      </div>
    </GitDialogFrame>
  );
}

/** Files that differ between two revisions (or a revision and the work tree). */
export function CompareDialog(props: { from: string; to: string; title: string; active: boolean }) {
  const { workspace, closeDialog, openDialog } = useGit();
  const [files, setFiles] = useState<GitFileChange[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = workspace?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when retried.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setFiles(null);
    setError('');
    void git.compare(id, props.from, props.to).then(
      (value) => {
        if (!alive) return;
        setFiles(value);
        setSelected(value[0]?.path ?? null);
      },
      (failure: unknown) => {
        if (alive) setError(gitError(failure).message);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, props.from, props.to, attempt]);
  const left = { rev: props.from, label: props.from };
  const right = { rev: props.to, label: props.to === 'WORKTREE' ? '工作树' : props.to };
  const entry = files?.find((file) => file.path === selected) ?? null;
  const sides = (file: GitFileChange) => ({
    left: { ...left, rev: file.status === 'A' ? null : left.rev },
    right: { ...right, rev: file.status === 'D' ? null : right.rev },
  });
  return (
    <GitDialogFrame
      title="比较"
      subtitle={props.title}
      active={props.active}
      onClose={closeDialog}
      size="full"
    >
      <div className="git-split git-diff-dialog-body">
        <aside className="git-split-side">
          <div className="git-side-heading">
            {files ? `${files.length} 个文件不同` : '正在比较'}
          </div>
          {error ? (
            <div className="git-error-state" role="alert">
              <p>{error}</p>
              <button type="button" className="git-button" onClick={() => setAttempt((n) => n + 1)}>
                重试
              </button>
            </div>
          ) : files ? (
            <FileList
              label="不同的文件"
              grouped
              files={files}
              selected={selected}
              onSelect={setSelected}
              onOpen={(path) => {
                const index = files.findIndex((file) => file.path === path);
                const file = files[index];
                if (!file) return;
                openDialog({
                  kind: 'diff',
                  request: {
                    title: props.title,
                    left,
                    right,
                    files: files.map((item) => ({
                      path: item.path,
                      origPath: item.origPath,
                      status: item.status,
                      sides: sides(item),
                    })),
                    index,
                  },
                });
              }}
              empty={<p className="git-empty">两者内容相同</p>}
            />
          ) : (
            <SkeletonRows rows={6} height={26} />
          )}
        </aside>
        <DiffPanel
          className="git-split-main"
          left={entry ? sides(entry).left : left}
          right={entry ? sides(entry).right : right}
          entry={
            entry ? { path: entry.path, origPath: entry.origPath, status: entry.status } : null
          }
        />
      </div>
    </GitDialogFrame>
  );
}

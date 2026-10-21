import { useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { type GitCommitDetails, type GitStash, git, gitError } from '../../services/git.js';
import { FileList } from './FileList.js';
import { relativeTime, shortOid } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';

/** Stashes: put work aside, bring it back, or drop it. */
export function StashTab() {
  const context = useGit();
  const id = context.workspace?.id;
  const [stashes, setStashes] = useState<GitStash[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<GitCommitDetails | null>(null);
  const [message, setMessage] = useState('');
  const [untracked, setUntracked] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after repository mutations.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void git.stashes(id).then(
      (value) => {
        if (!alive) return;
        setStashes(value);
        setError('');
        setSelected((current) =>
          current !== null && value.some((s) => s.index === current)
            ? current
            : (value[0]?.index ?? null),
        );
      },
      (failure: unknown) => {
        if (alive) setError(gitError(failure).message);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, context.revision]);
  const stash = stashes?.find((item) => item.index === selected) ?? null;
  useEffect(() => {
    if (!id || !stash) {
      setDetails(null);
      return;
    }
    let alive = true;
    setDetails(null);
    void git.commitDetails(id, stash.oid).then(
      (value) => {
        if (alive) setDetails(value);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [id, stash]);
  const changes = context.status?.changes.length ?? 0;
  const busy = context.busy !== null;
  const apply = (pop: boolean) => {
    if (!stash) return;
    void context
      .run(pop ? '取回储藏' : '应用储藏', (workspace) => git.unstash(workspace, stash.index, pop), {
        touchesWorkTree: true,
      })
      .then((result) => context.reportUpdate(pop ? '取回储藏' : '应用储藏', result));
  };
  return (
    <div className="git-split git-stash-tab">
      <aside className="git-split-side">
        <form
          className="git-stash-new"
          onSubmit={(event) => {
            event.preventDefault();
            void context
              .run('储藏更改', (workspace) => git.stash(workspace, message.trim(), untracked), {
                touchesWorkTree: true,
                success: () => '已储藏当前更改',
              })
              .then(() => setMessage(''));
          }}
        >
          <input
            className="git-input"
            aria-label="储藏说明"
            placeholder="储藏说明（可选）"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <label className="git-check git-check-small">
            <input
              type="checkbox"
              checked={untracked}
              onChange={(event) => setUntracked(event.target.checked)}
            />
            包括未跟踪的文件
          </label>
          <button
            type="submit"
            className="git-button git-button-primary"
            disabled={busy || !changes}
          >
            储藏 {changes ? `${changes} 个更改` : ''}
          </button>
        </form>
        <div className="git-side-heading">储藏列表</div>
        {error ? (
          <p className="git-field-error">{error}</p>
        ) : !stashes ? (
          <SkeletonRows rows={3} lines={2} height={40} />
        ) : !stashes.length ? (
          <div className="git-empty-state">
            <GitGlyph name="stash" />
            <p>没有储藏</p>
          </div>
        ) : (
          <div className="git-stash-list" role="listbox" aria-label="储藏">
            {stashes.map((item) => (
              <div
                key={item.oid}
                role="option"
                tabIndex={0}
                aria-selected={item.index === selected}
                className="git-stash-row"
                onClick={() => setSelected(item.index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setSelected(item.index);
                }}
              >
                <span className="git-stash-message">{item.message}</span>
                <span className="git-muted">
                  stash@{'{'}
                  {item.index}
                  {'}'} · {relativeTime(item.time)} · {shortOid(item.oid)}
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>
      <section className="git-split-main git-stash-detail">
        {stash ? (
          <>
            <div className="git-pane-toolbar">
              <strong className="git-ellipsis">{stash.message}</strong>
              <span className="git-toolbar-spacer" />
              <button
                type="button"
                className="git-button"
                disabled={busy}
                onClick={() => apply(false)}
              >
                应用
              </button>
              <button
                type="button"
                className="git-button git-button-primary"
                disabled={busy}
                onClick={() => apply(true)}
              >
                取回（应用并删除）
              </button>
              <button
                type="button"
                className="git-button git-button-danger"
                disabled={busy}
                onClick={() =>
                  context.openDialog({
                    kind: 'confirm',
                    title: '删除储藏',
                    message: `删除“${stash.message}”？其中的更改将无法恢复。`,
                    confirm: '删除',
                    danger: true,
                    run: () =>
                      void context.run(
                        '删除储藏',
                        (workspace) => git.dropStash(workspace, stash.index),
                        {
                          success: () => '已删除储藏',
                        },
                      ),
                  })
                }
              >
                删除
              </button>
            </div>
            {details ? (
              <FileList
                label="储藏的文件"
                grouped
                files={details.files}
                selected={null}
                onSelect={() => {}}
                onOpen={(path) => {
                  const index = details.files.findIndex((file) => file.path === path);
                  context.openDialog({
                    kind: 'diff',
                    request: {
                      title: stash.message,
                      left: { rev: `${stash.oid}^`, label: '储藏前' },
                      right: { rev: stash.oid, label: '储藏内容' },
                      files: details.files.map((file) => ({
                        path: file.path,
                        origPath: file.origPath,
                        status: file.status,
                        sides: {
                          left: {
                            rev: file.status === 'A' ? null : `${stash.oid}^`,
                            label: '储藏前',
                          },
                          right: { rev: file.status === 'D' ? null : stash.oid, label: '储藏内容' },
                        },
                      })),
                      index,
                    },
                  });
                }}
              />
            ) : (
              <SkeletonRows rows={4} height={26} />
            )}
          </>
        ) : (
          <p className="git-empty">选择储藏查看其中的文件</p>
        )}
      </section>
    </div>
  );
}

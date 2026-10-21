import { useEffect, useId, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { type GitCommit, type GitRemote, git, gitError } from '../../services/git.js';
import { notify } from '../notices/notices.js';
import { useBranches } from './BranchDialogs.js';
import { GitDialogFrame, relativeTime, shortOid } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';
import { branchNameError, gitNetwork } from './git-preferences.js';

/** Push with a preview of the outgoing commits, as IDEA's push dialog. */
export function PushDialog(props: { branch?: string | undefined; active: boolean }) {
  const context = useGit();
  const repository = context.probe?.repository;
  const branches = useBranches();
  const branch = props.branch ?? repository?.head.branch ?? '';
  const local = branches?.local.find((item) => item.name === branch);
  const remotes: GitRemote[] = repository?.remotes ?? [];
  const upstream = local?.upstream ?? null;
  const upstreamRemote = upstream
    ? remotes.find((r) => upstream.startsWith(`${r.name}/`))
    : undefined;
  const [remote, setRemote] = useState('');
  const [target, setTarget] = useState('');
  const [force, setForce] = useState(false);
  const [tags, setTags] = useState(false);
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const remoteId = useId();
  const targetId = useId();
  useEffect(() => {
    if (!branches) return;
    const initialRemote =
      upstreamRemote?.name ??
      remotes.find((r) => r.name === 'origin')?.name ??
      remotes[0]?.name ??
      '';
    setRemote((value) => value || initialRemote);
    setTarget(
      (value) =>
        value ||
        (upstream && upstreamRemote ? upstream.slice(upstreamRemote.name.length + 1) : branch),
    );
  }, [branches, upstream, upstreamRemote, remotes, branch]);
  const remoteBranch = `${remote}/${target}`;
  const exists = branches?.remote.some((item) => item.fullName === remoteBranch) ?? false;
  const id = context.workspace?.id;
  useEffect(() => {
    if (!id || !branches || !remote || !target || !branch) return;
    let alive = true;
    setCommits(null);
    setError('');
    void git
      .log(id, {
        revisions: exists ? [`${remoteBranch}..${branch}`] : [branch],
        skip: 0,
        limit: exists ? 200 : 30,
      })
      .then(
        (page) => {
          if (alive) setCommits(page.commits);
        },
        (failure: unknown) => {
          if (alive) setError(gitError(failure).message);
        },
      );
    return () => {
      alive = false;
    };
  }, [id, branches, remote, target, branch, exists, remoteBranch]);
  const targetError = branchNameError(target);
  const setUpstream = !upstream || upstream !== remoteBranch;
  const push = async () => {
    setWorking(true);
    try {
      const result = await context.run(
        '推送',
        (workspace) =>
          git.push(workspace, {
            remote,
            branch,
            remoteBranch: target,
            setUpstream,
            force: force ? 'with-lease' : 'none',
            tags,
            network: gitNetwork(context.preferences),
          }),
        { network: true },
      );
      if (result) {
        context.closeDialog();
        if (result.rejected) return;
        const via = result.proxy ? `（经代理 ${result.proxy}）` : '';
        notify(
          result.pushed
            ? `已推送 ${result.pushed} 个提交到 ${remoteBranch}${via}`
            : `${remoteBranch} 已是最新${via}`,
          'success',
        );
      }
    } finally {
      setWorking(false);
    }
  };
  return (
    <GitDialogFrame
      title={`推送提交到 ${remote || '远程'}`}
      active={props.active}
      onClose={context.closeDialog}
      locked={working}
      size="large"
      footer={
        <>
          <label
            className="git-check"
            title="仅当远程分支仍是本地所知的状态时才覆盖（--force-with-lease）"
          >
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
            />
            强制推送（安全模式）
          </label>
          <label className="git-check">
            <input
              type="checkbox"
              checked={tags}
              onChange={(event) => setTags(event.target.checked)}
            />
            推送标签
          </label>
          <span className="git-toolbar-spacer" />
          <button
            type="button"
            className="git-button"
            disabled={working}
            onClick={context.closeDialog}
          >
            取消
          </button>
          <button
            type="button"
            className={`git-button ${force ? 'git-button-danger' : 'git-button-primary'}`}
            disabled={working || !remote || !!targetError || !branch || commits === null}
            onClick={() => void push()}
          >
            {force ? '强制推送' : '推送'}
          </button>
        </>
      }
    >
      {!remotes.length ? (
        <div className="git-error-state">
          <GitGlyph name="remote" />
          <p>仓库还没有远程仓库。添加远程后才能推送。</p>
          <button
            type="button"
            className="git-button git-button-primary"
            onClick={() => context.openDialog({ kind: 'remote', remote: null })}
          >
            添加远程…
          </button>
        </div>
      ) : (
        <div className="git-push">
          <div className="git-push-target">
            <span className="git-push-branch">
              <GitGlyph name="branch" />
              {branch}
            </span>
            <span aria-hidden="true">→</span>
            <select
              id={remoteId}
              className="git-input git-select"
              aria-label="远程"
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
            >
              {remotes.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            <span aria-hidden="true">:</span>
            <input
              id={targetId}
              className="git-input"
              aria-label="远程分支"
              value={target}
              spellCheck={false}
              aria-invalid={!!targetError}
              onChange={(event) => setTarget(event.target.value)}
            />
            {!exists && target && !targetError && (
              <span className="git-chip git-chip-new">新分支</span>
            )}
          </div>
          {targetError && target && <p className="git-field-error">{targetError}</p>}
          {setUpstream && remote && target && (
            <p className="git-field-hint">
              推送后，{branch} 将跟踪 {remoteBranch}。
            </p>
          )}
          <div className="git-push-commits">
            {error ? (
              <p className="git-field-error">{error}</p>
            ) : commits === null ? (
              <SkeletonRows rows={4} lines={2} height={40} />
            ) : commits.length === 0 ? (
              <p className="git-empty">{exists ? '没有需要推送的提交' : '没有提交'}</p>
            ) : (
              <>
                <div className="git-side-heading">
                  {exists
                    ? `${commits.length}${commits.length >= 200 ? '+' : ''} 个提交将被推送`
                    : `远程尚无此分支，将创建 ${remoteBranch}（显示最近 ${commits.length} 个提交）`}
                </div>
                <ul className="git-commit-mini-list">
                  {commits.map((commit) => (
                    <li key={commit.oid}>
                      <GitGlyph name="commit" />
                      <span className="git-commit-subject">{commit.subject}</span>
                      <span className="git-commit-meta">
                        {commit.authorName} · {relativeTime(commit.commitTime)} ·{' '}
                        {shortOid(commit.oid)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </GitDialogFrame>
  );
}

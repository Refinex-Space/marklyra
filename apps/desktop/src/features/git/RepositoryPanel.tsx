import { type ReactNode, useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { type GitProxyReport, type GitRemote, git } from '../../services/git.js';
import { useBranches } from './BranchDialogs.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';
import { RemoteTestResult, useRemoteTest } from './RemoteDialog.js';

function Section(props: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="git-card">
      <header className="git-card-head">
        <div>
          <h3>{props.title}</h3>
          {props.description && <p>{props.description}</p>}
        </div>
        {props.actions && <div className="git-card-actions">{props.actions}</div>}
      </header>
      <div className="git-card-body">{props.children}</div>
    </section>
  );
}

function RemoteRow({ remote }: { remote: GitRemote }) {
  const context = useGit();
  const { result, testing, test } = useRemoteTest();
  return (
    <li className="git-remote-row">
      <div className="git-remote-main">
        <strong>{remote.name}</strong>
        <span className="git-chip">{remote.protocol.toUpperCase()}</span>
        {remote.host && <span className="git-muted">{remote.host}</span>}
        <span className="git-toolbar-spacer" />
        <button
          type="button"
          className="git-button"
          disabled={testing}
          onClick={() => void test(remote.name)}
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button
          type="button"
          className="git-button"
          onClick={() => context.openDialog({ kind: 'remote', remote })}
        >
          编辑
        </button>
        <button
          type="button"
          className="git-button git-button-danger"
          onClick={() =>
            context.openDialog({
              kind: 'confirm',
              title: '移除远程',
              message: `从仓库配置中移除远程“${remote.name}”？远程服务器上的仓库不受影响，对应的远程分支引用会被删除。`,
              confirm: '移除',
              danger: true,
              run: () =>
                void context.run('移除远程', (id) => git.removeRemote(id, remote.name), {
                  success: () => `已移除远程 ${remote.name}`,
                }),
            })
          }
        >
          移除
        </button>
      </div>
      <code className="git-remote-url" title="获取地址">
        {remote.fetchUrl}
      </code>
      {remote.pushUrl !== remote.fetchUrl && (
        <code className="git-remote-url" title="推送地址">
          推送：{remote.pushUrl}
        </code>
      )}
      {remote.hasEmbeddedCredentials && (
        <p className="git-field-warning">
          地址中包含凭据（已在显示时隐藏）。建议移除并改用凭据设置。
        </p>
      )}
      <RemoteTestResult result={result} />
    </li>
  );
}

function IdentityForm() {
  const context = useGit();
  const identity = context.probe?.repository?.identity;
  const [name, setName] = useState(identity?.name ?? '');
  const [email, setEmail] = useState(identity?.email ?? '');
  const [scope, setScope] = useState<'repository' | 'global'>(
    identity?.scope === 'repository' ? 'repository' : 'global',
  );
  useEffect(() => {
    setName(identity?.name ?? '');
    setEmail(identity?.email ?? '');
  }, [identity?.name, identity?.email]);
  const changed =
    name.trim() !== (identity?.name ?? '') || email.trim() !== (identity?.email ?? '');
  const invalid = !name.trim() || !/^[^\s@]+@[^\s@]+$/.test(email.trim());
  return (
    <form
      className="git-identity"
      onSubmit={(event) => {
        event.preventDefault();
        void context.run(
          '设置提交身份',
          (id) => git.setIdentity(id, name.trim(), email.trim(), scope),
          {
            success: () => (scope === 'global' ? '已更新全局提交身份' : '已更新此仓库的提交身份'),
          },
        );
      }}
    >
      <label>
        <span>用户名</span>
        <input
          className="git-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        <span>邮箱</span>
        <input
          className="git-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        <span>保存到</span>
        <select
          className="git-input git-select"
          value={scope}
          onChange={(event) => setScope(event.target.value as 'repository' | 'global')}
        >
          <option value="global">全局（所有仓库）</option>
          <option value="repository">仅此仓库</option>
        </select>
      </label>
      <div className="git-identity-actions">
        <span className="git-muted">
          {identity?.scope === 'none'
            ? '尚未设置，提交前必须填写'
            : `当前来自${{ repository: '此仓库', global: '全局配置', system: '系统配置', none: '' }[identity?.scope ?? 'none']}`}
        </span>
        <button
          type="submit"
          className="git-button git-button-primary"
          disabled={invalid || (!changed && identity?.scope !== 'none')}
        >
          保存
        </button>
      </div>
    </form>
  );
}

function UpstreamPicker() {
  const context = useGit();
  const branches = useBranches();
  const repository = context.probe?.repository;
  const branch = repository?.head.branch;
  if (!branch || !branches) return null;
  const local = branches.local.find((item) => item.name === branch);
  return (
    <label className="git-inline-field">
      <span>跟踪分支</span>
      <select
        className="git-input git-select"
        value={local?.upstream ?? ''}
        onChange={(event) =>
          void context.run(
            '设置跟踪分支',
            (id) => git.setUpstream(id, branch, event.target.value || null),
            {
              success: () =>
                event.target.value
                  ? `${branch} 现在跟踪 ${event.target.value}`
                  : `${branch} 不再跟踪远程分支`,
            },
          )
        }
      >
        <option value="">（不跟踪）</option>
        {branches.remote.map((item) => (
          <option key={item.fullName} value={item.fullName}>
            {item.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProxySummary() {
  const context = useGit();
  const [report, setReport] = useState<GitProxyReport | null>(null);
  const [checking, setChecking] = useState(false);
  const detect = async () => {
    setChecking(true);
    try {
      setReport(await git.detectProxy(context.workspace?.id ?? null));
    } catch {
      setReport(null);
    } finally {
      setChecking(false);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: detect once per workspace.
  useEffect(() => {
    void detect();
  }, [context.workspace?.id]);
  const mode = context.preferences.proxyMode;
  return (
    <div className="git-proxy-report">
      <dl>
        <dt>当前策略</dt>
        <dd>
          {mode === 'auto'
            ? `自动：${report?.effective ? `使用 ${report.effective}` : '未检测到代理，直连'}`
            : mode === 'direct'
              ? '直连（不使用任何代理）'
              : `自定义：${context.preferences.proxyUrl}`}
        </dd>
        <dt>系统代理</dt>
        <dd>{report ? (report.system ?? '未启用') : '—'}</dd>
        <dt>环境变量</dt>
        <dd>{report ? (report.environment ?? '未设置') : '—'}</dd>
        <dt>Git 配置 http.proxy</dt>
        <dd>{report ? (report.gitConfig ?? '未设置') : '—'}</dd>
      </dl>
      <button
        type="button"
        className="git-button"
        disabled={checking}
        onClick={() => void detect()}
      >
        {checking ? '检测中…' : '重新检测'}
      </button>
    </div>
  );
}

/** Repository facts and per-repository settings; shared by the Git view and the settings page. */
export function RepositoryPanel(props: { onOpenSettings?: () => void }) {
  const context = useGit();
  const { probe, workspace } = context;
  if (!workspace)
    return (
      <div className="git-empty-state">
        <GitGlyph name="folder" />
        <p>打开一个文件夹后，可以在这里初始化或管理它的 Git 仓库。</p>
      </div>
    );
  if (!probe) return <SkeletonRows rows={6} lines={2} height={40} />;
  const repository = probe.repository;
  return (
    <div className="git-repository-panel">
      <Section
        title="Git"
        description={
          probe.git ? (
            <>
              {probe.git.version} · <code>{probe.git.path}</code>
            </>
          ) : (
            '未找到可用的 Git'
          )
        }
        actions={
          <button type="button" className="git-button" onClick={() => void context.refresh()}>
            重新检测
          </button>
        }
      >
        {probe.problem && (
          <div className="git-notice" data-kind="error" role="alert">
            <p>{probe.problem.message}</p>
            {probe.problem.code === 'git-missing' && (
              <p className="git-muted">
                Windows 请安装 Git for Windows；macOS 可运行 xcode-select --install 或通过 Homebrew
                安装。安装后点击“重新检测”。
              </p>
            )}
            {probe.problem.code === 'dubious-ownership' && (
              <button
                type="button"
                className="git-button git-button-primary"
                onClick={() =>
                  void context.run('信任仓库目录', (id) => git.trust(id), {
                    success: () => '已将仓库加入 safe.directory',
                  })
                }
              >
                信任此目录
              </button>
            )}
          </div>
        )}
      </Section>
      {probe.git && !probe.problem && !repository && (
        <Section title="仓库" description={`“${workspace.name}”还不是 Git 仓库。`}>
          <p className="git-form-text">
            初始化后可以记录每次修改、对比任意版本，并与 GitHub、Gitee 等远程仓库同步。
          </p>
          <button
            type="button"
            className="git-button git-button-primary"
            onClick={() => context.openDialog({ kind: 'init' })}
          >
            初始化仓库…
          </button>
        </Section>
      )}
      {repository && (
        <>
          <Section title="仓库" description={<code>{repository.root}</code>}>
            <dl className="git-facts">
              <dt>当前分支</dt>
              <dd>
                {repository.head.detached
                  ? `分离 HEAD（${repository.head.oid?.slice(0, 8) ?? ''}）`
                  : (repository.head.branch ?? '—')}
                {repository.head.unborn ? '（尚无提交）' : ''}
              </dd>
              {repository.workspacePrefix && (
                <>
                  <dt>打开的文件夹</dt>
                  <dd>仓库中的 {repository.workspacePrefix}/</dd>
                </>
              )}
              <dt>同步状态</dt>
              <dd>
                {repository.upstream
                  ? `跟踪 ${repository.upstream} · 待推送 ${repository.ahead} · 待拉取 ${repository.behind}`
                  : '没有跟踪的远程分支'}
              </dd>
            </dl>
            <UpstreamPicker />
          </Section>
          <Section
            title="远程仓库"
            description="同步、推送和拉取使用这些地址。地址会在保存前检查格式，并可测试连通性。"
            actions={
              <button
                type="button"
                className="git-button git-button-primary"
                onClick={() => context.openDialog({ kind: 'remote', remote: null })}
              >
                添加远程…
              </button>
            }
          >
            {repository.remotes.length ? (
              <ul className="git-remote-list">
                {repository.remotes.map((remote) => (
                  <RemoteRow key={remote.name} remote={remote} />
                ))}
              </ul>
            ) : (
              <p className="git-muted">
                还没有远程仓库。在 GitHub、Gitee 等平台创建空仓库后，把地址添加到这里。
              </p>
            )}
          </Section>
          <Section title="提交身份" description="写入每个提交的作者信息。">
            <IdentityForm />
          </Section>
        </>
      )}
      {probe.git && (
        <Section
          title="网络"
          description="推送、拉取和测试连接时使用的代理。"
          actions={
            props.onOpenSettings && (
              <button type="button" className="git-button" onClick={props.onOpenSettings}>
                修改网络设置…
              </button>
            )
          }
        >
          <ProxySummary />
        </Section>
      )}
    </div>
  );
}

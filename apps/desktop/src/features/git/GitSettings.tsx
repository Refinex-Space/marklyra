import { useEffect, useId, useState } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import { type GitCredential, git, gitError } from '../../services/git.js';
import {
  Button,
  Card,
  Notice,
  Row,
  Segmented,
  Select,
  Switch,
  TextField,
} from '../export/settings/controls.js';
import { usePreferences } from '../settings/usePreferences.js';
import { useOptionalGit } from './GitProvider.js';
import {
  branchNameError,
  COMMIT_TEMPLATE_LIMIT,
  commitMessage,
  type GitPreferences,
  NETWORK_TIMEOUTS,
  proxyUrlError,
  SYNC_INTERVALS,
} from './git-preferences.js';
import { RepositoryPanel } from './RepositoryPanel.js';
import '../export/settings/export-settings.css';
import './git.css';

function Credentials() {
  const [list, setList] = useState<GitCredential[] | null>(null);
  const [error, setError] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const hostId = useId();
  const userId = useId();
  const tokenId = useId();
  const reload = () =>
    void git.credentials().then(
      (value) => {
        setList(value);
        setError('');
      },
      (failure: unknown) => setError(gitError(failure).message),
    );
  useEffect(reload, []);
  const hostValue = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const hostError =
    hostValue && !/^[a-z0-9.-]+(:\d+)?$/.test(hostValue) ? '主机名格式无效，例如 github.com' : '';
  const save = async () => {
    setSaving(true);
    try {
      await git.saveCredential(hostValue, username.trim(), token);
      setHost('');
      setUsername('');
      setToken('');
      reload();
    } catch (failure) {
      setError(gitError(failure).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {list && list.length > 0 && (
        <ul className="git-credential-list">
          {list.map((item) => (
            <li key={item.host}>
              <strong>{item.host}</strong>
              <span className="git-muted">{item.username}</span>
              <span className="git-toolbar-spacer" />
              <Button
                kind="danger"
                onClick={() =>
                  void git
                    .removeCredential(item.host)
                    .then(reload, (failure: unknown) => setError(gitError(failure).message))
                }
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="git-credential-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (hostValue && !hostError && username.trim() && token) void save();
        }}
      >
        <label htmlFor={hostId}>主机</label>
        <input
          id={hostId}
          className="es-input"
          placeholder="github.com"
          value={host}
          onChange={(event) => setHost(event.target.value)}
        />
        <label htmlFor={userId}>用户名</label>
        <input
          id={userId}
          className="es-input"
          autoComplete="off"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor={tokenId}>访问令牌</label>
        <input
          id={tokenId}
          className="es-input"
          type="password"
          autoComplete="new-password"
          placeholder="个人访问令牌（PAT）"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <button
          type="submit"
          className="es-button es-primary"
          disabled={saving || !hostValue || !!hostError || !username.trim() || !token}
        >
          保存到系统钥匙串
        </button>
      </form>
      {hostError && <p className="es-field-error">{hostError}</p>}
    </>
  );
}

/** Git 同步 settings: synchronization policy, merging, network and display. */
export function GitSettings({ dark }: { dark: boolean }) {
  const [preferences, setPreferences] = usePreferences();
  const context = useOptionalGit();
  const value = preferences.git;
  const [proxyError, setProxyError] = useState('');
  const [branchError, setBranchError] = useState('');
  const templateId = useId();
  const proxyId = useId();
  const branchId = useId();
  const update = (change: Partial<GitPreferences>) =>
    setPreferences((current) => ({ ...current, git: { ...current.git, ...change } }));
  const off = !value.autoSync;
  return (
    <section className="es git-settings" aria-label="Git 同步设置" data-dark={dark}>
      <div className="es-scroll">
        <div className="es-content">
          <header className="es-heading">
            <div>
              <h1>Git 同步</h1>
              <p>
                {
                  '用 Git 为笔记记录完整的版本历史，并与 GitHub、Gitee 等远程仓库双向同步。MarkLyra 使用本机安装的 Git，沿用你已有的凭据管理器、SSH 密钥和 Git 配置。'
                }
              </p>
            </div>
          </header>
          {context?.workspace ? (
            <RepositoryPanel />
          ) : (
            <Notice>
              {desktopAvailable
                ? '在主窗口打开文件夹后，可在这里初始化仓库、查看已识别的远程仓库和提交身份。'
                : '仓库管理需要在桌面应用中使用。'}
            </Notice>
          )}
          <Card
            title="自动同步"
            description="同步依次执行：提交本地更改（可选）→ 拉取并整合远程更新 → 推送。出现冲突时停止并提示解决。"
          >
            <Row
              label="启用自动同步"
              hint="仅对已配置远程仓库的文件夹生效；连续失败时自动放慢重试。"
            >
              <Switch
                label="启用自动同步"
                checked={value.autoSync}
                onChange={(autoSync) => update({ autoSync })}
              />
            </Row>
            <Row label="同步间隔">
              <Select
                label="同步间隔"
                value={String(value.intervalMinutes)}
                disabled={off}
                options={SYNC_INTERVALS.map((minutes) => ({
                  value: String(minutes),
                  label: minutes < 60 ? `每 ${minutes} 分钟` : `每 ${minutes / 60} 小时`,
                }))}
                onChange={(minutes) => update({ intervalMinutes: Number(minutes) })}
              />
            </Row>
            <Row
              label="打开文件夹时同步"
              hint="打开仓库文件夹后立即同步一次，先拿到其他设备上的更改。"
            >
              <Switch
                label="打开文件夹时同步"
                checked={value.syncOnOpen}
                disabled={off}
                onChange={(syncOnOpen) => update({ syncOnOpen })}
              />
            </Row>
            <Row label="保存后同步" hint="最后一次保存约 90 秒后同步；持续编辑时不会频繁提交。">
              <Switch
                label="保存后同步"
                checked={value.syncAfterSave}
                disabled={off}
                onChange={(syncAfterSave) => update({ syncAfterSave })}
              />
            </Row>
            <Row label="同步通知">
              <Select
                label="同步通知"
                value={value.notify}
                options={[
                  { value: 'changes', label: '有拉取、推送或提交时' },
                  { value: 'all', label: '每次同步' },
                  { value: 'errors', label: '仅失败时' },
                ]}
                onChange={(notify) => update({ notify })}
              />
            </Row>
          </Card>
          <Card
            title="提交"
            description="同步时如何记录本地更改。手动提交请使用 Git 视图中的“提交”。"
          >
            <Row
              label="同步时自动提交"
              hint="关闭后，同步只拉取和推送已有提交；未提交的更改会被自动储藏保护。"
            >
              <Switch
                label="同步时自动提交"
                checked={value.autoCommit}
                onChange={(autoCommit) => update({ autoCommit })}
              />
            </Row>
            <Row
              label="提交信息模板"
              htmlFor={templateId}
              hint={`变量：{date} {time} {datetime} {branch} {count} {files}。预览：${commitMessage(
                value.commitTemplate,
                {
                  branch: context?.probe?.repository?.head.branch ?? 'main',
                  files: ['日记/今天.md', 'README.md'],
                },
              )}`}
            >
              <TextField
                id={templateId}
                label="提交信息模板"
                value={value.commitTemplate}
                maxLength={COMMIT_TEMPLATE_LIMIT}
                disabled={!value.autoCommit}
                onCommit={(commitTemplate) => {
                  if (commitTemplate.trim()) update({ commitTemplate });
                }}
              />
            </Row>
          </Card>
          <Card title="拉取与合并" description="“更新项目”与同步都按此方式整合远程更改。">
            <Row
              label="更新方式"
              hint="合并保留分叉历史；变基得到线性历史；仅快进在分叉时停止并提示。"
            >
              <Segmented
                label="更新方式"
                value={value.pullMethod}
                options={[
                  { value: 'merge', label: '合并' },
                  { value: 'rebase', label: '变基' },
                  { value: 'ff-only', label: '仅快进' },
                ]}
                onChange={(pullMethod) => update({ pullMethod })}
              />
            </Row>
            <Row label="冲突处理" hint="自动策略只作用于同一处的冲突修改，不冲突的修改总是合并。">
              <Select
                label="冲突处理"
                value={value.conflictStrategy}
                options={[
                  { value: 'manual', label: '手动解决（打开冲突面板）' },
                  { value: 'local', label: '冲突处优先保留本地' },
                  { value: 'remote', label: '冲突处优先采用远程' },
                ]}
                onChange={(conflictStrategy) => update({ conflictStrategy })}
              />
            </Row>
            <Row
              label="自动储藏本地更改"
              hint="拉取前临时储藏未提交的修改，完成后恢复（--autostash）。"
            >
              <Switch
                label="自动储藏本地更改"
                checked={value.autostash}
                onChange={(autostash) => update({ autostash })}
              />
            </Row>
            <Row label="同步后推送">
              <Switch
                label="同步后推送"
                checked={value.pushAfterSync}
                onChange={(pushAfterSync) => update({ pushAfterSync })}
              />
            </Row>
            <Row label="清理已删除的远程分支" hint="获取时移除远程已不存在的分支引用（--prune）。">
              <Switch
                label="清理已删除的远程分支"
                checked={value.prune}
                onChange={(prune) => update({ prune })}
              />
            </Row>
          </Card>
          <Card
            title="网络与代理"
            description="自动模式按顺序使用：Git 配置的 http.proxy、HTTPS_PROXY 等环境变量、系统代理；都没有时直连。"
          >
            <Row label="代理">
              <Segmented
                label="代理"
                value={value.proxyMode}
                options={[
                  { value: 'auto', label: '自动检测' },
                  { value: 'custom', label: '自定义' },
                  { value: 'direct', label: '不使用' },
                ]}
                onChange={(proxyMode) => {
                  if (proxyMode === 'custom' && proxyUrlError(value.proxyUrl)) {
                    setProxyError('请先填写代理地址');
                    update({ proxyMode: 'auto' });
                    return;
                  }
                  setProxyError('');
                  update({ proxyMode });
                }}
              />
            </Row>
            <Row
              label="代理地址"
              htmlFor={proxyId}
              hint={
                proxyError ? (
                  <span className="es-field-error">{proxyError}</span>
                ) : (
                  '例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080；保存后选择“自定义”。'
                )
              }
            >
              <TextField
                id={proxyId}
                label="代理地址"
                mono
                value={value.proxyUrl}
                invalid={!!proxyError}
                maxLength={512}
                onCommit={(proxyUrl) => {
                  const error = proxyUrl.trim() ? proxyUrlError(proxyUrl) : null;
                  setProxyError(error ?? '');
                  if (error) return;
                  update({
                    proxyUrl: proxyUrl.trim(),
                    ...(proxyUrl.trim()
                      ? { proxyMode: 'custom' as const }
                      : value.proxyMode === 'custom'
                        ? { proxyMode: 'auto' as const }
                        : {}),
                  });
                }}
              />
            </Row>
            <Row
              label="代理失败时直连重试"
              hint="代理不可用（未启动、端口错误）时自动改为直连再试一次。"
            >
              <Switch
                label="代理失败时直连重试"
                checked={value.fallbackDirect}
                onChange={(fallbackDirect) => update({ fallbackDirect })}
              />
            </Row>
            <Row
              label="SSH 远程也走代理"
              hint="通过 ProxyCommand 转发 SSH；若已在 ~/.ssh/config 或 core.sshCommand 中配置则不覆盖。"
            >
              <Switch
                label="SSH 远程也走代理"
                checked={value.proxySsh}
                onChange={(proxySsh) => update({ proxySsh })}
              />
            </Row>
            <Row label="网络超时">
              <Select
                label="网络超时"
                value={String(value.timeoutSeconds)}
                options={NETWORK_TIMEOUTS.map((seconds) => ({
                  value: String(seconds),
                  label: seconds < 120 ? `${seconds} 秒` : `${seconds / 60} 分钟`,
                }))}
                onChange={(seconds) => update({ timeoutSeconds: Number(seconds) })}
              />
            </Row>
          </Card>
          <Card
            title="HTTPS 凭据"
            description="系统未配置 Git 凭据管理器时，可在此保存访问令牌。令牌存放在系统钥匙串中，只在访问对应主机时通过环境传给 Git，不写入仓库配置。"
          >
            {desktopAvailable ? <Credentials /> : <Notice>需要在桌面应用中使用。</Notice>}
          </Card>
          <Card title="差异与显示">
            <Row label="差异布局">
              <Segmented
                label="差异布局"
                value={value.diffLayout}
                options={[
                  { value: 'split', label: '并排' },
                  { value: 'unified', label: '统一' },
                ]}
                onChange={(diffLayout) => update({ diffLayout })}
              />
            </Row>
            <Row label="忽略空白差异">
              <Switch
                label="忽略空白差异"
                checked={value.ignoreWhitespace}
                onChange={(ignoreWhitespace) => update({ ignoreWhitespace })}
              />
            </Row>
            <Row label="折叠未更改的内容">
              <Switch
                label="折叠未更改的内容"
                checked={value.collapseUnchanged}
                onChange={(collapseUnchanged) => update({ collapseUnchanged })}
              />
            </Row>
            <Row
              label="在文件树中标记更改"
              hint="已修改为蓝色、新增为绿色、未跟踪为红褐色、冲突为红色。"
            >
              <Switch
                label="在文件树中标记更改"
                checked={value.fileStatus}
                onChange={(fileStatus) => update({ fileStatus })}
              />
            </Row>
            <Row
              label="新仓库默认分支"
              htmlFor={branchId}
              hint={
                branchError ? (
                  <span className="es-field-error">{branchError}</span>
                ) : (
                  '初始化仓库时使用。'
                )
              }
            >
              <TextField
                id={branchId}
                label="新仓库默认分支"
                value={value.defaultBranch}
                maxLength={100}
                invalid={!!branchError}
                onCommit={(defaultBranch) => {
                  const error = branchNameError(defaultBranch);
                  setBranchError(error ?? '');
                  if (!error) update({ defaultBranch });
                }}
              />
            </Row>
          </Card>
        </div>
      </div>
    </section>
  );
}

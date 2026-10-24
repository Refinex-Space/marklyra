import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { AgentCredentials } from './AgentCredentials.js';
import { AgentDialog } from './AgentDialog.js';
import { AgentIcon } from './AgentIcon.js';
import { agentApi } from './api.js';
import type { AgentCatalog, AgentProfile } from './types.js';
import './ai.css';

export function AgentSettings() {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [phase, setPhase] = useState('');
  const [query, setQuery] = useState('');
  const [remove, setRemove] = useState<AgentProfile | null>(null);
  const [secretProfileId, setSecretProfileId] = useState<string | null>(null);
  const secretProfile = catalog?.profiles.find((profile) => profile.id === secretProfileId);
  const reload = async () => {
    setCatalog(await agentApi.catalog());
  };
  useEffect(() => {
    let live = true;
    void agentApi.catalog().then(
      (value) => {
        if (live) setCatalog(value);
      },
      (error) => {
        if (live) setError(String(error));
      },
    );
    let pendingInstall = false;
    const check = async () => {
      try {
        const status = await agentApi.invoke<{ agentId: string; phase: string } | null>(
          'agent_install_status',
        );
        if (!live) return;
        if (status) {
          pendingInstall = true;
          setBusy(status.agentId);
          setPhase(status.phase);
        } else if (pendingInstall) {
          pendingInstall = false;
          setBusy('');
          setPhase('');
          setCatalog(await agentApi.catalog());
        }
      } catch (error) {
        if (live) setError(String(error));
      }
    };
    void check();
    const timer = setInterval(() => {
      void check();
    }, 1500);
    const unlisten = listen<{ agentId: string; phase: string }>(
      'marklyra:agent-install',
      (event) => {
        if (live) setPhase(event.payload.phase);
      },
    );
    const changed = listen('marklyra:agents-changed', () => {
      void agentApi.catalog().then(
        (value) => {
          if (live) setCatalog(value);
        },
        () => {},
      );
    });
    return () => {
      live = false;
      void changed.then((stop) => stop());
      clearInterval(timer);
      void unlisten.then((stop) => stop());
    };
  }, []);
  const run = async (id: string, operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id);
    setError('');
    setPhase('');
    let succeeded = false;
    try {
      await operation();
      succeeded = true;
    } catch (error) {
      setError(String(error));
    } finally {
      try {
        await reload();
        window.dispatchEvent(new Event('marklyra-agents-changed'));
      } catch (error) {
        setError(String(error));
      }
      setBusy('');
      setPhase('');
    }
    return succeeded;
  };
  const controls = (profile: AgentProfile) => (
    <fieldset className="ai-installed-actions" aria-label={`${profile.name} 管理操作`}>
      <label className="ai-enable-control">
        <span>{profile.enabled ? '已启用' : '已停用'}</span>
        <span className="ai-switch">
          <input
            type="checkbox"
            role="switch"
            aria-checked={profile.enabled}
            aria-label={`启用 ${profile.name}`}
            checked={profile.enabled}
            disabled={!!busy}
            onChange={(event) =>
              void run(profile.id, () =>
                agentApi.saveProfile({ ...profile, enabled: event.target.checked }),
              )
            }
          />
          <span />
        </span>
      </label>
      <button
        type="button"
        disabled={!!busy}
        aria-label={`管理 ${profile.name} 凭据`}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setSecretProfileId(profile.id);
        }}
      >
        凭据
      </button>
      <button
        type="button"
        className="ai-danger"
        disabled={!!busy}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setError('');
          setRemove(profile);
        }}
      >
        {profile.managedPath ? '卸载' : '移除'}
      </button>
    </fieldset>
  );
  const visibleAgents =
    catalog?.agents.filter((agent) =>
      `${agent.name} ${agent.id}`.toLowerCase().includes(query.trim().toLowerCase()),
    ) ?? [];
  return (
    <section className="ai-settings" aria-label="智能体设置">
      <div className="ai-settings-content">
        <header className="ai-settings-heading">
          <div>
            <h1>智能体</h1>
            <p>连接熟悉的助手，在文档旁完成阅读、写作与整理。</p>
          </div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              void run('refresh', async () => {
                setCatalog(await agentApi.catalog(true));
              })
            }
          >
            刷新目录
          </button>
        </header>
        <label className="ai-attention-setting">
          <span>
            <strong>AI 等待授权时提醒我</strong>
            <small>
              窗口在后台时短暂闪烁任务栏图标或跳动 Dock 图标。关闭后仍显示应用内待处理标记。
            </small>
          </span>
          <span className="ai-switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="AI 等待授权时提醒我"
              aria-checked={catalog?.attentionEnabled ?? true}
              checked={catalog?.attentionEnabled ?? true}
              disabled={!catalog || !!busy}
              onChange={(event) => {
                const enabled = event.target.checked;
                void run('attention', () =>
                  agentApi.invoke('agent_set_attention_enabled', { enabled }),
                );
              }}
            />
            <span />
          </span>
        </label>
        <div className="ai-settings-note">
          <strong>本机运行 · 独立管理</strong>
          <p>
            智能体使用各自的账号或 API 凭据。安装优先使用本机代理，程序保存在 MarkLyra
            专属目录。第三方智能体以你的系统用户权限运行；ACP 不提供系统沙箱。
          </p>
        </div>
        <label className="ai-search">
          <span>搜索智能体</span>
          <input
            value={query}
            placeholder="名称，例如 Codex、OpenCode"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}
        <div className="ai-agent-list">
          {!catalog && !error && (
            <SkeletonRows
              className="ai-agent-skeleton"
              rows={3}
              icon={28}
              lines={2}
              height={76}
              label="正在读取智能体目录"
            />
          )}
          {catalog &&
            visibleAgents.map((agent) => {
              const profiles = catalog.profiles.filter((p) => p.agentId === agent.id);
              const single = profiles.length === 1 ? profiles[0] : undefined;
              const local = catalog.localAgents.some((p) => p.agentId === agent.id);
              const available =
                !!agent.distribution.npx || !!agent.distribution.binary?.[catalog.platform];
              return (
                <article className="ai-agent-card" key={agent.id}>
                  <div className="ai-agent-card-main">
                    <AgentIcon id={agent.id} size={28} />
                    <div className="ai-agent-card-copy">
                      <h2>
                        {agent.name}
                        <span className="ai-version">{agent.version}</span>
                      </h2>
                      <p>{descriptions[agent.id] ?? agent.description}</p>
                      <span className="ai-agent-license">
                        {agent.license}
                        {single &&
                          ` · ${single.managedPath ? 'MarkLyra 安装' : '本机程序'} ${single.version ?? ''}`}
                      </span>
                    </div>
                  </div>
                  {single
                    ? controls(single)
                    : profiles.map((profile) => (
                        <div className="ai-installed" key={profile.id}>
                          <div>
                            <span>{profile.name}</span>
                            <small>
                              {profile.managedPath ? 'MarkLyra 安装' : '本机程序'} ·{' '}
                              {profile.version ?? '本机版本'}
                            </small>
                          </div>
                          {controls(profile)}
                        </div>
                      ))}
                  {busy === agent.id ? (
                    <div className="ai-install-progress" role="status">
                      <span>{phase || '正在准备安装…'}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void agentApi
                            .invoke('agent_cancel_install', { agentId: agent.id })
                            .catch((e) => setError(String(e)))
                        }
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    !profiles.length && (
                      <div className="ai-card-actions">
                        {local && (
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => void run(agent.id, () => agentApi.local(agent.id))}
                          >
                            使用本机版本
                          </button>
                        )}
                        <button
                          className="ai-primary"
                          type="button"
                          disabled={!!busy || !available}
                          onClick={() =>
                            void run(agent.id, () => agentApi.install(agent.id, catalog.digest))
                          }
                        >
                          {available ? '安装' : '当前平台无安装包'}
                        </button>
                      </div>
                    )
                  )}
                </article>
              );
            })}
        </div>
        {catalog && !visibleAgents.length && (
          <p className="ai-muted" role="status">
            未找到匹配的智能体，请尝试其他名称。
          </p>
        )}
      </div>
      {remove && (
        <AgentDialog
          title={`${remove.managedPath ? '卸载' : '移除'} ${remove.name}`}
          busy={!!busy}
          close={() => setRemove(null)}
          footer={
            <>
              <button type="button" disabled={!!busy} onClick={() => setRemove(null)}>
                取消
              </button>
              <button
                type="button"
                className="ai-danger"
                disabled={!!busy}
                onClick={() => {
                  void run(remove.id, () => agentApi.uninstall(remove.id)).then((ok) => {
                    if (ok) setRemove(null);
                  });
                }}
              >
                确认{remove.managedPath ? '卸载' : '移除'}
              </button>
            </>
          }
        >
          <p>将移除此智能体的 MarkLyra 配置与保存的凭据，已有会话记录和文档会保留。</p>
          <p className="ai-muted">
            {remove.managedPath
              ? 'MarkLyra 安装的程序也会卸载。'
              : '本机程序及其原有配置不会删除。'}
          </p>
          {error && (
            <p className="ai-error" role="alert">
              {error}
            </p>
          )}
        </AgentDialog>
      )}
      {secretProfile && (
        <AgentCredentials
          key={secretProfile.id}
          profile={secretProfile}
          close={() => setSecretProfileId(null)}
          changed={async () => {
            await reload();
            window.dispatchEvent(new Event('marklyra-agents-changed'));
          }}
        />
      )}
    </section>
  );
}
const descriptions: Record<string, string> = {
  'codex-acp': 'OpenAI 编程助手，通过官方 ACP 适配器连接。',
  cursor: 'Cursor 智能体，沿用 CLI 登录状态。',
  'claude-acp': 'Claude 智能体，通过 ACP 适配器连接。',
  'codebuddy-code': '腾讯云 CodeBuddy，支持文档理解与工作区操作。',
  'glm-acp-agent': '智谱 GLM 智能体，支持 Coding Plan。',
  'github-copilot-cli': 'GitHub Copilot CLI，使用 GitHub 账号登录。',
  'grok-build': 'xAI Grok 智能体与 CLI。',
  kimi: 'Moonshot Kimi CLI。',
  'minimax-code': 'MiniMax Code 智能体。',
  opencode: '开源 OpenCode，可使用已配置的模型服务。',
  qoder: 'Qoder CLI 智能体。',
};

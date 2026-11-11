import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { AgentIcon } from '../ai/AgentIcon.js';
import { notify } from '../notices/notices.js';
import { TaskIcon } from './glyphs.js';

export interface SkillStatus {
  agentId: string;
  name: string;
  path: string;
  installed: boolean;
  ours: boolean;
  current: boolean;
  sharedWith: string[];
}
interface CliStatus {
  path: string;
  installed: boolean;
  ours: boolean;
  current: boolean;
}

function Info({ text }: { text: string }) {
  return (
    <button type="button" className="task-info" aria-label={text}>
      <TaskIcon name="info" />
      <span className="task-info-tip" role="tooltip">
        {text}
      </span>
    </button>
  );
}

/** Shortens the home folder to `~` for display; the full path stays in the tooltip. */
function tilde(path: string) {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~');
}

/** One-click install and removal of the bundled `marklyra-task` skill for each ACP agent. */
export function AgentSkillsPage() {
  const [skills, setSkills] = useState<SkillStatus[] | null>(null);
  const [cli, setCli] = useState<CliStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    setError('');
    setSkills(null);
    invoke<SkillStatus[]>('agent_skills_status').then(setSkills, (e: unknown) =>
      setError(String(e)),
    );
    invoke<CliStatus>('cli_status').then(setCli, () => setCli(null));
  }, []);
  useEffect(load, [load]);

  const change = async (agent: SkillStatus, install: boolean) => {
    setBusy(agent.agentId);
    try {
      const next = await invoke<SkillStatus[]>(
        install ? 'agent_skill_install' : 'agent_skill_uninstall',
        { agentId: agent.agentId },
      );
      setSkills(next);
      notify(install ? `已为 ${agent.name} 安装` : `已从 ${agent.name} 卸载`, 'success');
    } catch (e) {
      notify(String(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const changeCli = async (install: boolean) => {
    setBusy('cli');
    try {
      setCli(await invoke<CliStatus>(install ? 'cli_install' : 'cli_uninstall'));
    } catch (e) {
      notify(String(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const cliForeign = cli?.installed && !cli.ours;

  return (
    <div className="task-settings-page task-skills">
      <h2>智能体技能</h2>
      <section className="task-settings-section">
        <h3>命令行</h3>
        <div className="task-settings-list">
          <div className="task-settings-row task-skill-row">
            <span className="task-skill-mark mono" aria-hidden="true">
              &gt;_
            </span>
            <span className="task-skill-main">
              <span className="task-skill-name">
                marklyra <Info text="本地智能体通过它读写任务，与应用共用同一份任务文件。" />
              </span>
              {cli && (
                <span className="task-skill-path mono" title={cli.path}>
                  {tilde(cli.path)}
                </span>
              )}
            </span>
            {cli && <SkillState installed={cli.installed} ours={cli.ours} current={cli.current} />}
            {cli && !cliForeign && (
              <span className="task-skill-actions">
                {cli.installed && (
                  <button
                    type="button"
                    className="task-btn"
                    disabled={busy !== null}
                    onClick={() => void changeCli(false)}
                    aria-label="卸载命令行"
                  >
                    卸载
                  </button>
                )}
                {!(cli.installed && cli.current) && (
                  <button
                    type="button"
                    className="task-btn primary"
                    disabled={busy !== null}
                    onClick={() => void changeCli(true)}
                    aria-label={cli.installed ? '更新命令行' : '安装命令行'}
                  >
                    {cli.installed ? '更新' : '安装'}
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      </section>
      <section className="task-settings-section">
        <h3 className="task-skill-heading">
          <span className="mono">marklyra-task</span>
          <Info text="让本地智能体在对话中查询、创建、更新与排期任务。MarkLyra AI 面板中输入 /marklyra-task 即可使用，无需安装。" />
        </h3>
        {error ? (
          <div className="task-skill-error" role="alert">
            <span>{error}</span>
            <button type="button" className="task-btn" onClick={load}>
              重试
            </button>
          </div>
        ) : !skills ? (
          <SkeletonRows rows={6} icon={20} lines={2} height={52} className="task-skill-skeleton" />
        ) : (
          <ul className="task-settings-list task-skill-list" aria-label="智能体">
            {skills.map((skill) => {
              const foreign = skill.installed && !skill.ours;
              return (
                <li key={skill.agentId} className="task-settings-row task-skill-row">
                  <AgentIcon id={skill.agentId} size={18} />
                  <span className="task-skill-main">
                    <span className="task-skill-name">{skill.name}</span>
                    <span className="task-skill-sub">
                      <span className="task-skill-path mono" title={skill.path}>
                        {tilde(skill.path)}
                      </span>
                      {!!skill.sharedWith.length && (
                        <span className="task-skill-shared">
                          与 {skill.sharedWith.join('、')} 共用
                        </span>
                      )}
                    </span>
                  </span>
                  <SkillState {...skill} />
                  {!foreign && (
                    <span className="task-skill-actions">
                      {skill.installed && (
                        <button
                          type="button"
                          className="task-btn"
                          disabled={busy !== null}
                          aria-label={`从 ${skill.name} 卸载`}
                          onClick={() => void change(skill, false)}
                        >
                          卸载
                        </button>
                      )}
                      {!(skill.installed && skill.current) && (
                        <button
                          type="button"
                          className="task-btn primary"
                          disabled={busy !== null}
                          aria-label={`${skill.installed ? '更新' : '安装到'} ${skill.name}`}
                          onClick={() => void change(skill, true)}
                        >
                          {skill.installed ? '更新' : '安装'}
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SkillState({
  installed,
  ours,
  current,
}: {
  installed: boolean;
  ours: boolean;
  current: boolean;
}) {
  if (!installed) return null;
  if (!ours)
    return (
      <span className="task-skill-state muted">
        已有同名文件 <Info text="不是 MarkLyra 安装的，不会改动或删除。" />
      </span>
    );
  return current ? (
    <span className="task-skill-state ok">
      <TaskIcon name="check" />
      已安装
    </span>
  ) : (
    <span className="task-skill-state">可更新</span>
  );
}

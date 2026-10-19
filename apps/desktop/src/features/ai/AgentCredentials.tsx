import { useRef, useState } from 'react';
import { AgentDialog } from './AgentDialog.js';
import { agentApi } from './api.js';
import type { AgentProfile } from './types.js';

export function AgentCredentials({
  profile,
  changed,
  close,
}: {
  profile: AgentProfile;
  changed: () => Promise<void>;
  close: () => void;
}) {
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const password = useRef<HTMLInputElement>(null);
  const variable = name.trim();
  const validName = /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(variable);
  const replacing = profile.secretKeys.includes(variable);
  const dismiss = () => {
    setSecret('');
    setName('');
    close();
  };
  const update = async (key: string, value: string | null) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setSecret('');
    let committed = false;
    try {
      await agentApi.setSecret(profile.id, key, value);
      committed = true;
      await changed();
      setMessage(
        value === null ? '凭据已删除，旧连接已断开。' : '凭据已保存，下次连接将使用新值。',
      );
      setRemoving(null);
      setName('');
    } catch (reason) {
      setError(
        committed
          ? `凭据操作已完成，但列表刷新失败，请关闭弹窗后点击“刷新目录”：${String(reason)}`
          : String(reason),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <AgentDialog
      title={`${profile.name} 凭据`}
      busy={busy}
      close={dismiss}
      footer={
        <button type="button" disabled={busy} onClick={dismiss}>
          完成
        </button>
      }
    >
      <p className="ai-credential-description">
        值保存在系统凭据存储中，启动时作为环境变量传给此智能体。变量名区分大小写，请按智能体文档填写。
      </p>
      <section className="ai-credential-section" aria-label="已保存凭据">
        <h3>
          已保存凭据 <span>{profile.secretKeys.length} / 16</span>
        </h3>
        {profile.secretKeys.length ? (
          <ul className="ai-credential-list">
            {profile.secretKeys.map((key) => (
              <li key={key}>
                <div className="ai-credential-identity">
                  <code>{key}</code>
                  <small>已保存 · ••••••••</small>
                </div>
                <div className="ai-credential-actions">
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`替换凭据 ${key}`}
                    onClick={() => {
                      setName(key);
                      setSecret('');
                      setRemoving(null);
                      setError('');
                      setMessage('');
                      password.current?.focus();
                    }}
                  >
                    替换
                  </button>
                  <button
                    type="button"
                    className="ai-danger"
                    disabled={busy}
                    aria-label={`删除凭据 ${key}`}
                    onClick={() => {
                      setRemoving(key);
                      setSecret('');
                      setError('');
                      setMessage('');
                    }}
                  >
                    删除
                  </button>
                </div>
                {removing === key && (
                  <fieldset className="ai-credential-delete" aria-label={`确认删除 ${key}`}>
                    <p>
                      删除后将断开此智能体的现有连接。服务商密钥及智能体自身的登录配置不会被撤销。
                    </p>
                    <div className="ai-credential-actions">
                      <button type="button" disabled={busy} onClick={() => setRemoving(null)}>
                        取消删除
                      </button>
                      <button
                        type="button"
                        className="ai-danger"
                        disabled={busy}
                        onClick={() => void update(key, null)}
                      >
                        确认删除
                      </button>
                    </div>
                  </fieldset>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ai-muted">尚未保存凭据。</p>
        )}
      </section>
      <form
        className="ai-credential-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (validName && secret && !secret.includes('\0')) void update(variable, secret);
        }}
      >
        <h3>{replacing ? '替换凭据' : '添加凭据'}</h3>
        <label>
          环境变量名称
          <input
            value={name}
            disabled={busy}
            maxLength={80}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="按智能体文档填写变量名"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!!name && !validName && (
          <p className="ai-credential-validation">
            以字母或下划线开头，只能包含字母、数字和下划线。
          </p>
        )}
        <label>
          凭据值
          <input
            ref={password}
            type="password"
            value={secret}
            disabled={busy}
            maxLength={16384}
            autoComplete="new-password"
            spellCheck={false}
            placeholder={replacing ? '输入新值，原值不会显示' : '输入凭据值'}
            onChange={(event) => setSecret(event.target.value)}
          />
        </label>
        <p className="ai-credential-description">
          保存或删除后会断开现有连接，下次对话使用新配置。明文不会写入应用配置或在此回显。
        </p>
        <div className="ai-credential-actions">
          <button
            type="submit"
            className="ai-primary"
            disabled={
              busy ||
              !validName ||
              !secret ||
              secret.includes('\0') ||
              (!replacing && profile.secretKeys.length >= 16)
            }
          >
            {busy ? '正在处理…' : replacing ? '保存替换' : '保存凭据'}
          </button>
        </div>
      </form>
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="ai-credential-status" role="status">
          {message}
        </p>
      )}
    </AgentDialog>
  );
}

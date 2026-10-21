import { useState } from 'react';
import { type GitRemote, type GitRemoteTest, git, gitError } from '../../services/git.js';
import { Field, FormDialog } from './BranchDialogs.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';
import { gitNetwork } from './git-preferences.js';
import { remoteNameError, remoteUrlAdvice } from './remote-url.js';

/** Result of `ls-remote` against an address, shown under the URL field. */
export function RemoteTestResult({ result }: { result: GitRemoteTest | null }) {
  if (!result) return null;
  return (
    <div className="git-remote-test" data-ok={result.ok} role="status">
      <GitGlyph name={result.ok ? 'check' : 'conflict'} />
      <span>
        {result.ok
          ? `连接成功 · ${result.branches} 个分支${result.defaultBranch ? ` · 默认分支 ${result.defaultBranch}` : ''} · ${result.elapsedMs} ms`
          : result.message}
        {result.proxy ? ` · 经代理 ${result.proxy}` : result.ok ? ' · 直连' : ''}
      </span>
    </div>
  );
}

export function useRemoteTest() {
  const context = useGit();
  const [result, setResult] = useState<GitRemoteTest | null>(null);
  const [testing, setTesting] = useState(false);
  const test = async (target: string) => {
    const id = context.workspace?.id;
    if (!id || testing) return;
    setTesting(true);
    setResult(null);
    try {
      setResult(await git.testRemote(id, target, gitNetwork(context.preferences)));
    } catch (error) {
      setResult({
        ok: false,
        defaultBranch: null,
        branches: 0,
        elapsedMs: 0,
        proxy: null,
        message: gitError(error).message,
      });
    } finally {
      setTesting(false);
    }
  };
  return { result, testing, test, reset: () => setResult(null) };
}

/** Adds a remote, or edits the URL of an existing one, with address checks and a live test. */
export function RemoteDialog(props: { remote: GitRemote | null; active: boolean }) {
  const context = useGit();
  const existing = props.remote;
  const remotes = context.probe?.repository?.remotes ?? [];
  const [name, setName] = useState(existing?.name ?? (remotes.length ? '' : 'origin'));
  const [url, setUrl] = useState(existing?.fetchUrl ?? '');
  const { result, testing, test, reset } = useRemoteTest();
  const advice = remoteUrlAdvice(url);
  const nameError = existing
    ? null
    : (remoteNameError(name) ?? (remotes.some((r) => r.name === name) ? '已存在同名远程' : null));
  return (
    <FormDialog
      title={existing ? `编辑远程“${existing.name}”` : '添加远程仓库'}
      active={props.active}
      submit={existing ? '保存' : '添加'}
      disabled={!!nameError || !!advice.error || testing}
      onSubmit={async () => {
        let done = false;
        await context.run(
          existing ? '修改远程地址' : '添加远程',
          async (id) => {
            if (existing) await git.setRemoteUrl(id, existing.name, url.trim());
            else await git.addRemote(id, name.trim(), url.trim());
            done = true;
          },
          {
            success: () =>
              existing ? `已更新 ${existing.name} 的地址` : `已添加远程 ${name.trim()}`,
          },
        );
        if (done) context.closeDialog();
      }}
    >
      {!existing && (
        <Field label="名称" error={name ? nameError : null}>
          {(id, hint) => (
            <input
              id={id}
              className="git-input"
              value={name}
              spellCheck={false}
              aria-describedby={hint}
              onChange={(event) => setName(event.target.value.trim())}
            />
          )}
        </Field>
      )}
      <Field
        label="地址"
        error={url ? advice.error : null}
        hint={
          advice.info
            ? `${advice.info.provider ?? advice.info.host ?? '本地'} · ${advice.info.protocol.toUpperCase()}${advice.info.repository ? ` · ${advice.info.repository}` : ''}`
            : '例如 https://github.com/用户/仓库.git 或 git@github.com:用户/仓库.git'
        }
      >
        {(id, hint) => (
          <div className="git-input-row">
            <input
              id={id}
              className="git-input git-mono"
              autoFocus
              value={url}
              spellCheck={false}
              aria-describedby={hint}
              aria-invalid={!!url && !!advice.error}
              onChange={(event) => {
                setUrl(event.target.value);
                reset();
              }}
            />
            <button
              type="button"
              className="git-button"
              disabled={!!advice.error || testing}
              onClick={() => void test(url.trim())}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
          </div>
        )}
      </Field>
      {advice.warnings.map((warning) => (
        <p key={warning} className="git-field-warning">
          {warning}
        </p>
      ))}
      {(advice.suggestion || advice.alternatives.length > 0) && (
        <div className="git-suggestions">
          {advice.suggestion && (
            <button
              type="button"
              className="git-link-button"
              onClick={() => setUrl(advice.suggestion ?? url)}
            >
              使用仓库地址 {advice.suggestion}
            </button>
          )}
          {advice.alternatives.map((item) => (
            <button
              key={item.url}
              type="button"
              className="git-link-button"
              title={item.url}
              onClick={() => {
                setUrl(item.url);
                reset();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <RemoteTestResult result={result} />
    </FormDialog>
  );
}

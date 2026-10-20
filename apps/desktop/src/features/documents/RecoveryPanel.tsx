import { useCallback, useEffect, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { useModalCloseHandoff } from '../../components/useModalCloseHandoff.js';
import {
  fallbackRecovery,
  type RecoveryListing,
  type RecoverySummary,
  recovery,
} from '../../services/recovery.js';
import {
  consumeFallback,
  type FallbackCandidate,
  type FallbackListing,
  listFallbacks,
} from '../../services/recovery-fallback.js';

export function RecoveryPanel({
  close,
  restore,
  report,
  beforeClose,
}: {
  close(focusHandled?: boolean): void;
  beforeClose?:
    | ((returnTarget: HTMLElement | null, signal: AbortSignal) => Promise<void>)
    | undefined;
  restore(draft: RecoverySummary, associate: boolean): void;
  report(message: string): void;
}) {
  const [listing, setListing] = useState<RecoveryListing | null>(null);
  const [error, setError] = useState('');
  const [fallbacks, setFallbacks] = useState<FallbackListing>({ drafts: [], issues: [] });
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const handoff = useModalCloseHandoff({ close, beforeClose, locked: !!removing });
  const { panel, closing } = handoff;
  const refresh = useCallback(async () => {
    try {
      const context = await fallbackRecovery.context();
      setFallbacks(await listFallbacks(localStorage, context));
      setListing(await recovery.list());
      setError('');
    } catch (error) {
      setError(String(error));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const discard = async (draft: RecoverySummary) => {
    const key = `${draft.id}:${draft.version}`;
    if (confirmation !== key) {
      setConfirmation(key);
      return;
    }
    setRemoving(draft.id);
    try {
      await recovery.consume(draft.id, draft.version);
      await refresh();
    } catch (error) {
      setError(String(error));
    } finally {
      setRemoving(null);
      setConfirmation(null);
    }
  };
  const importLocal = async (candidate: FallbackCandidate) => {
    setRemoving(candidate.key);
    try {
      if (localStorage.getItem(candidate.key) !== candidate.expected)
        throw new Error('本地副本已改变，请刷新列表；没有删除任何内容');
      const receipt = await fallbackRecovery.import({
        id: candidate.id,
        version: candidate.version,
        owner: candidate.owner,
        legacyLabel: candidate.legacyLabel,
        content: candidate.content,
      });
      if (!consumeFallback(localStorage, candidate))
        report('已保护所选版本；本地副本后来有变化，较新版本仍保留。');
      else
        report(
          receipt.available
            ? '本地副本已写入原生恢复存储，请选择恢复为新文档或关联原文件。'
            : '此版本此前已导入并处理，没有再次生成副本。',
        );
      await refresh();
    } catch (error) {
      setError(`本地副本保持保留：${String(error)}`);
    } finally {
      setRemoving(null);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        ref={panel}
        className="recovery-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-busy={closing || !!removing}
      >
        <h2 id="recovery-title">恢复未保存的文档</h2>
        <p>恢复副本会保留到内容成功载入并再次保护。关联原文件时会要求重新选择，并核对保存基线。</p>
        {(handoff.error || error) && <p role="alert">{handoff.error || error}</p>}
        {closing && <p role="status">正在返回输入位置…</p>}
        {!!fallbacks.issues.length && <p role="status">{fallbacks.issues.join('；')}</p>}
        {!!fallbacks.drafts.length && (
          <section aria-label="本地同步恢复副本">
            <h3>本地同步副本</h3>
            <p>
              这些副本可能早于原生恢复写入完成。先保护到恢复存储，再选择恢复；活动窗口的副本不能导入。
            </p>
            <ul className="recovery-list">
              {fallbacks.drafts.map((candidate) => (
                <li key={candidate.key}>
                  <strong>{candidate.content.document?.path ?? '未命名文档'}</strong>
                  <span>
                    {candidate.content.text.length.toLocaleString()} UTF-16 字符
                    {candidate.content.document ? ` · ${candidate.content.document.encoding}` : ''}
                  </span>
                  <pre>{candidate.content.text.slice(0, 160)}</pre>
                  {candidate.active ? (
                    <p>该副本仍由运行中的编辑窗口使用。</p>
                  ) : (
                    <button
                      type="button"
                      disabled={!!removing || closing}
                      onClick={() => void importLocal(candidate)}
                    >
                      保护此本地副本
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!listing ? (
          <SkeletonRows rows={2} lines={2} height={64} label="正在读取恢复副本" />
        ) : (
          <>
            {listing.issues.length > 0 && (
              <p role="status">
                {listing.issues.map((issue) => `${issue.file}：${issue.reason}`).join('；')}
              </p>
            )}
            {!listing.drafts.length && <p>没有需要恢复的未保存文档。</p>}
            <ul className="recovery-list">
              {listing.drafts.map((draft) => (
                <li key={draft.id}>
                  <strong>{draft.document?.path ?? '未命名文档'}</strong>
                  <span>
                    {new Date(draft.updatedAt).toLocaleString()} ·{' '}
                    {draft.textBytes.toLocaleString()} 字节
                    {draft.document ? ` · ${draft.document.encoding}` : ''}
                  </span>
                  {draft.active ? (
                    <p>该副本仍由当前运行中的编辑会话使用。</p>
                  ) : (
                    <div>
                      <button
                        type="button"
                        disabled={!!removing || closing}
                        onClick={() => {
                          close();
                          restore(draft, false);
                        }}
                      >
                        恢复为新文档
                      </button>
                      {draft.document && (
                        <button
                          type="button"
                          disabled={!!removing || closing}
                          onClick={() => {
                            close();
                            report('请选择恢复记录对应的原文件');
                            restore(draft, true);
                          }}
                        >
                          选择原文件并恢复
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!!removing || closing}
                        onClick={() => void discard(draft)}
                      >
                        {confirmation === `${draft.id}:${draft.version}`
                          ? '确认放弃此副本'
                          : '放弃此恢复副本'}
                      </button>
                      {confirmation === `${draft.id}:${draft.version}` && (
                        <button
                          type="button"
                          disabled={!!removing || closing}
                          onClick={() => setConfirmation(null)}
                        >
                          取消放弃
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!!listing.savedCopies?.length && (
              <details className="saved-recovery-copies">
                <summary>已保存副本（{listing.savedCopies.length}）</summary>
                <p>
                  这些副本的正文与记录的保存基线一致。进程中断后可能留存；显式清理只移除恢复副本，不修改原文件。
                </p>
                <ul className="recovery-list">
                  {listing.savedCopies.map((draft) => (
                    <li key={draft.id}>
                      <strong>{draft.document?.path ?? '未命名文档'}</strong>
                      <span>
                        {new Date(draft.updatedAt).toLocaleString()} ·{' '}
                        {draft.textBytes.toLocaleString()} 字节
                      </span>
                      {draft.active ? (
                        <p>当前编辑会话仍在使用此副本。</p>
                      ) : (
                        <div>
                          <button
                            type="button"
                            disabled={!!removing || closing}
                            onClick={() => void discard(draft)}
                          >
                            {confirmation === `${draft.id}:${draft.version}`
                              ? '确认移除此副本'
                              : '移除已保存副本'}
                          </button>
                          {confirmation === `${draft.id}:${draft.version}` && (
                            <button
                              type="button"
                              disabled={!!removing || closing}
                              onClick={() => setConfirmation(null)}
                            >
                              取消移除
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        <div>
          <button
            type="button"
            data-modal-close
            disabled={!!removing || closing}
            onClick={() => void handoff.request()}
          >
            关闭
          </button>
          {closing && (
            <button type="button" onClick={handoff.cancel}>
              取消关闭
            </button>
          )}
          {handoff.error && !closing && (
            <button type="button" disabled={!!removing} onClick={handoff.closeWithoutFocus}>
              仅关闭面板
            </button>
          )}
          <button type="button" disabled={!!removing || closing} onClick={() => void refresh()}>
            刷新
          </button>
        </div>
      </section>
    </div>
  );
}

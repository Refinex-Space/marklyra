import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { AgentDialog } from './AgentDialog.js';
import { AgentIcon } from './AgentIcon.js';
import type { HistoryItem, HistoryRemoval } from './history-management.js';
import type { SessionRecord } from './types.js';

type Summary = Omit<SessionRecord, 'messages'>;
export function HistoryPanel({
  records,
  archived,
  setArchived,
  query,
  setQuery,
  back,
  open,
  rename,
  manage,
  remove,
}: {
  records: Summary[];
  archived: boolean;
  setArchived: (value: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
  back: () => void;
  open: (id: string) => Promise<void>;
  rename: (item: Summary) => void;
  manage: (id: string, action: 'archive' | 'restore') => Promise<boolean>;
  remove: (items: HistoryItem[], progress: (completed: number) => void) => Promise<HistoryRemoval>;
}) {
  const [visibleCount, setVisibleCount] = useState(80);
  const [selected, setSelected] = useState(new Set<string>());
  const [pending, setPending] = useState<{ items: HistoryItem[]; all: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const tabRecords = records.filter((item) => item.archived === archived);
  const visible = tabRecords.filter((item) =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selection = visible.filter((item) => selected.has(item.id));
  const allSelected = visible.length > 0 && selection.length === visible.length;
  const changeScope = () => {
    setVisibleCount(80);
    setSelected(new Set());
    setNotice('');
    setError('');
  };
  const confirm = (items: HistoryItem[], all = false) => {
    setPending({ items: items.map(({ id, title, archived }) => ({ id, title, archived })), all });
    setError('');
    setCompleted(0);
    setNotice('');
  };
  const execute = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await remove(pending.items, (value) => {
        if (live.current) setCompleted(value);
      });
      if (!live.current) return;
      setSelected(new Set(result.failed.map(({ item }) => item.id)));
      if (result.failed.length) {
        setPending({ items: result.failed.map(({ item }) => item), all: false });
        setError(
          `已删除 ${result.removed.length} 项，${result.failed.length} 项未完成。${result.failed.map(({ item, error }) => `${item.title}：${error}`).join('\n')}`,
        );
        setCompleted(0);
      } else {
        setPending(null);
        setNotice(`已删除 ${result.removed.length} 个${pending.all ? '归档会话' : '会话'}`);
      }
    } catch (error) {
      if (live.current) setError(String(error));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <div className="ai-history" aria-busy={busy}>
      <div className="ai-history-tabs">
        <button
          type="button"
          aria-pressed={!archived}
          disabled={busy}
          onClick={() => {
            setArchived(false);
            changeScope();
          }}
        >
          会话
        </button>
        <button
          type="button"
          aria-pressed={archived}
          disabled={busy}
          onClick={() => {
            setArchived(true);
            changeScope();
          }}
        >
          已归档
        </button>
        <button type="button" disabled={busy} onClick={back}>
          返回对话
        </button>
      </div>
      <input
        aria-label="搜索 AI 会话"
        placeholder="搜索会话…"
        value={query}
        disabled={busy}
        onChange={(event) => {
          setQuery(event.target.value);
          changeScope();
        }}
      />
      <div className="ai-history-selection">
        <label title={query.trim() ? '全选当前搜索结果' : '全选当前列表'}>
          <input
            type="checkbox"
            aria-label="全选当前列表"
            checked={allSelected}
            disabled={busy || !visible.length}
            ref={(node) => {
              if (node) node.indeterminate = selection.length > 0 && !allSelected;
            }}
            onChange={() => {
              setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.id)));
              setNotice('');
            }}
          />
          <span>全选</span>
        </label>
        <span className="ai-history-count" role="status">
          {selection.length ? `已选 ${selection.length} 项` : `${visible.length} 个会话`}
        </span>
        {selection.length > 0 ? (
          <button
            type="button"
            className="ai-danger"
            disabled={busy}
            onClick={() => confirm(selection)}
          >
            删除所选
          </button>
        ) : (
          archived && (
            <button
              type="button"
              className="ai-danger"
              disabled={busy || !tabRecords.length}
              onClick={() => confirm(tabRecords, true)}
            >
              清空归档
            </button>
          )
        )}
      </div>
      {notice && (
        <p className="ai-history-notice" role="status">
          {notice}
        </p>
      )}
      <div className="ai-history-list">
        {visible.slice(0, visibleCount).map((item) => (
          <article key={item.id} data-selected={selected.has(item.id) || undefined}>
            <input
              type="checkbox"
              aria-label={`选择会话 ${item.title}`}
              checked={selected.has(item.id)}
              disabled={busy}
              onChange={() => {
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
                setNotice('');
              }}
            />
            <button
              type="button"
              className="ai-history-open"
              title={item.title}
              disabled={busy}
              onClick={() => void open(item.id)}
            >
              <AgentIcon id={item.agentId} size={18} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.agentName} · {new Date(item.updatedAt).toLocaleDateString()}
                </small>
              </span>
            </button>
            <div className="ai-history-actions">
              <button
                type="button"
                aria-label="重命名"
                title="重命名"
                disabled={busy}
                onClick={() => rename(item)}
              >
                <Icon name="rename" />
              </button>
              <button
                type="button"
                aria-label={item.archived ? '恢复' : '归档'}
                title={item.archived ? '恢复会话' : '归档会话'}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void manage(item.id, item.archived ? 'restore' : 'archive')
                    .then((success) => {
                      if (live.current && success)
                        setSelected((current) => {
                          const next = new Set(current);
                          next.delete(item.id);
                          return next;
                        });
                    })
                    .finally(() => {
                      if (live.current) setBusy(false);
                    });
                }}
              >
                <Icon name={item.archived ? 'restore' : 'archive'} />
              </button>
              {item.archived && (
                <button
                  type="button"
                  aria-label="彻底移除"
                  title="彻底移除"
                  className="ai-danger"
                  disabled={busy}
                  onClick={() => confirm([item])}
                >
                  <Icon name="delete" />
                </button>
              )}
            </div>
          </article>
        ))}
        {visible.length > visibleCount && (
          <button
            type="button"
            className="ai-history-more"
            disabled={busy}
            onClick={() => setVisibleCount((count) => count + 80)}
          >
            显示更多（还有 {visible.length - visibleCount} 项）
          </button>
        )}
        {!visible.length && (
          <p className="ai-history-empty">
            {query.trim() ? '没有匹配的会话' : archived ? '暂无已归档会话' : '暂无历史会话'}
          </p>
        )}
      </div>
      {pending && (
        <AgentDialog
          title={
            pending.all ? '清空归档' : pending.items.length === 1 ? '彻底移除会话' : '删除所选会话'
          }
          busy={busy}
          close={() => setPending(null)}
          footer={
            <>
              <button type="button" disabled={busy} onClick={() => setPending(null)}>
                取消
              </button>
              <button
                type="button"
                className="ai-danger"
                disabled={busy}
                onClick={() => void execute()}
              >
                {busy
                  ? `正在删除 ${completed}/${pending.items.length}…`
                  : error
                    ? `重试删除 ${pending.items.length} 项`
                    : pending.all
                      ? '清空归档'
                      : '彻底移除'}
              </button>
            </>
          }
        >
          <p>
            {pending.all
              ? `将永久删除当前工作区全部 ${pending.items.length} 个归档会话，不受搜索筛选影响。`
              : `将永久删除选中的 ${pending.items.length} 个会话及其本地附件。`}
            此操作无法撤销。
          </p>
          <p className="ai-history-delete-note">文档文件会保留；智能体自身保存的历史由其管理。</p>
          <ul className="ai-history-delete-list">
            {pending.items.slice(0, 5).map((item) => (
              <li key={item.id} title={item.title}>
                {item.title}
              </li>
            ))}
            {pending.items.length > 5 && <li>另有 {pending.items.length - 5} 个会话</li>}
          </ul>
          {error && (
            <p className="ai-error ai-history-delete-error" role="alert">
              {error}
            </p>
          )}
        </AgentDialog>
      )}
    </div>
  );
}

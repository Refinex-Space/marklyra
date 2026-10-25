import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { type KnowledgeSession, knowledge } from '../../services/knowledge.js';
import type { WorkspaceMatchPosition } from '../../services/workspaces.js';
import type { GraphNode, GraphReference, GraphSnapshot, ReferencePage } from './model.js';

const states: Record<string, string> = {
  resolved: '已解析',
  missing: '未找到目标',
  ambiguous: '同名歧义',
  blocked: '超出支持或访问范围',
  external: '外部链接',
  pending: '正在索引',
};
export function GraphDetails(props: {
  node: GraphNode | null;
  data: GraphSnapshot | null;
  session: KnowledgeSession | null;
  generation: number;
  pinned: boolean;
  complete: boolean;
  onOpen: (path: string, match?: WorkspaceMatchPosition) => void;
  onFocus: (path: string) => void;
  onPin: () => void;
  onMove: () => void;
  onLocate: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [incoming, setIncoming] = useState(false),
    [offset, setOffset] = useState(0),
    [page, setPage] = useState<ReferencePage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true),
    owner = useRef(props.session?.requestId);
  owner.current = props.session?.requestId;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const node = props.node,
    source = node?.path ?? props.data?.edges.find((e) => e.target === node?.id)?.source ?? null;
  useEffect(() => {
    if (!node?.id) return;
    setOffset(0);
    setIncoming(false);
    setPage(null);
  }, [node?.id]);
  const workspaceId = props.session?.workspaceId,
    requestId = props.session?.requestId;
  const notePath = node?.path,
    destination = node && !node.path ? node.title : undefined;
  const currentGeneration = useRef(props.generation);
  currentGeneration.current = props.generation;
  useEffect(() => {
    let live = true;
    const generation = props.generation;
    setError('');
    setPage(null);
    if (!source || !workspaceId || !requestId) return;
    setLoading(true);
    void knowledge
      .references({ workspaceId, requestId }, source, incoming && !!notePath, offset, destination)
      .then(
        (value) => {
          if (live && generation === currentGeneration.current) setPage(value);
        },
        (reason) => {
          if (live) setError(String(reason));
        },
      )
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [source, workspaceId, requestId, notePath, incoming, offset, destination, props.generation]);
  const openTarget = async (reference: GraphReference) => {
    const session = props.session;
    if (!reference.target || !session) return;
    try {
      const match =
        reference.fragment && !reference.anchorMissing
          ? await knowledge.anchor(session, reference.target, reference.fragment)
          : null;
      if (alive.current && owner.current === session.requestId)
        props.onOpen(reference.target, match ?? undefined);
    } catch (reason) {
      if (alive.current) props.onError(String(reason));
    }
  };
  if (!node)
    return (
      <aside className="knowledge-details" aria-label="关系详情">
        <div className="knowledge-detail-empty">
          <span className="knowledge-detail-symbol">◎</span>
          <h3>沿着关系阅读</h3>
          <p>选择一个节点，查看引用来源与去向。</p>
          <p>双击节点或按 Enter 打开文档。</p>
        </div>
      </aside>
    );
  const items = page?.items ?? [];
  return (
    <aside className="knowledge-details" aria-label="关系详情">
      <header className="knowledge-detail-header">
        <div className="knowledge-detail-caption">
          <span className={`knowledge-node-state ${node.state}`}>
            {node.path
              ? '文档'
              : node.state === 'ambiguous'
                ? '同名歧义'
                : props.complete
                  ? '未解析目标'
                  : '等待索引'}
          </span>
          <button
            type="button"
            className="knowledge-detail-close"
            aria-label="收起关系详情"
            title="收起关系详情"
            onClick={props.onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="knowledge-note-heading">
          <h3 title={node.title}>{node.title}</h3>
          {node.path && (
            <p className="knowledge-note-path" title={node.path}>
              {node.path}
            </p>
          )}
          {node.state === 'stale' && (
            <p role="status">此文档尚未重新索引，关系来自上次已知内容。</p>
          )}
        </div>
        {node.path ? (
          <div className="knowledge-detail-actions">
            <div className="knowledge-detail-primary">
              <button type="button" onClick={() => props.onOpen(node.path as string)}>
                打开文档 ↗
              </button>
              <button type="button" onClick={() => props.onFocus(node.path as string)}>
                以此为中心
              </button>
            </div>
            <div className="knowledge-detail-secondary">
              <button type="button" onClick={props.onPin} aria-pressed={props.pinned}>
                {props.pinned ? '取消固定' : '固定位置'}
              </button>
              <button type="button" onClick={props.onMove}>
                移动到…
              </button>
              <button type="button" onClick={props.onLocate}>
                定位节点
              </button>
            </div>
          </div>
        ) : (
          <p>图谱不会自动创建文件或修改链接。请在来源文档中核对目标路径。</p>
        )}
      </header>
      <div
        className="knowledge-relation-tabs"
        role="tablist"
        aria-label="关系方向"
        onKeyDown={(event) => {
          if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && node.path) {
            event.preventDefault();
            setIncoming(!incoming);
            setOffset(0);
            event.currentTarget
              .querySelector<HTMLButtonElement>(
                incoming ? '#knowledge-outgoing' : '#knowledge-incoming',
              )
              ?.focus();
          }
        }}
      >
        <button
          type="button"
          role="tab"
          id="knowledge-outgoing"
          aria-controls="knowledge-references"
          tabIndex={incoming ? -1 : 0}
          aria-selected={!incoming}
          onClick={() => {
            setIncoming(false);
            setOffset(0);
          }}
        >
          出链
        </button>
        <button
          type="button"
          role="tab"
          id="knowledge-incoming"
          aria-controls="knowledge-references"
          tabIndex={incoming ? 0 : -1}
          aria-selected={incoming}
          disabled={!node.path}
          onClick={() => {
            setIncoming(true);
            setOffset(0);
          }}
        >
          入链
        </button>
        <span>{page?.total ?? '—'} 处引用</span>
      </div>
      <div
        className="knowledge-reference-list"
        role="tabpanel"
        id="knowledge-references"
        aria-labelledby={incoming ? 'knowledge-incoming' : 'knowledge-outgoing'}
        aria-busy={loading}
      >
        {error && <p role="alert">{error}</p>}
        {loading && <p className="knowledge-muted">读取引用位置…</p>}
        {!loading && page?.total === 0 && (
          <p className="knowledge-muted">
            {incoming ? '尚未发现引用此文档的链接。' : '此文档没有已索引的链接。'}
          </p>
        )}
        {items.map((reference) => {
          const path = incoming ? reference.source : (reference.target ?? reference.destination);
          const document = props.data?.nodes.find((item) => item.path === path);
          let title = document?.title ?? path.split(/[\\/]/).at(-1) ?? path;
          if (/^https?:\/\//i.test(path)) {
            try {
              title = new URL(path).hostname;
            } catch {
              /* Keep the literal destination. */
            }
          }
          return (
            <article
              className="knowledge-reference"
              key={`${reference.source}:${reference.line}:${reference.column}`}
            >
              {incoming || reference.target ? (
                <button
                  type="button"
                  className="knowledge-reference-title"
                  title={path}
                  onClick={() =>
                    incoming
                      ? props.onOpen(reference.source, reference)
                      : void openTarget(reference)
                  }
                >
                  <Icon name="document" />
                  <span>{title}</span>
                </button>
              ) : (
                <span className="knowledge-reference-title unresolved" title={path}>
                  <Icon name="document" />
                  <span>{title}</span>
                </span>
              )}
              <p className="knowledge-reference-path" title={path}>
                {path}
              </p>
              <p className="knowledge-reference-preview">{reference.preview}</p>
              <div className="knowledge-reference-meta">
                <span>
                  {reference.anchorMissing
                    ? '锚点未找到'
                    : (states[reference.status] ?? reference.status)}
                </span>
                <button type="button" onClick={() => props.onOpen(reference.source, reference)}>
                  定位原文 · {reference.line} 行
                </button>
              </div>
              {reference.candidates.length === 32 && (
                <p className="knowledge-muted">候选项最多显示 32 个，请在原文使用完整路径。</p>
              )}
              {reference.candidates.length > 0 && (
                <ul>
                  {reference.candidates.map((path) => (
                    <li key={path}>
                      <button type="button" onClick={() => props.onOpen(path)}>
                        {path}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      {page && page.total > 50 && (
        <footer className="knowledge-reference-pages">
          <button
            type="button"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            上一页
          </button>
          <span>
            {offset + 1}–{Math.min(page.total, offset + 50)}
          </span>
          <button
            type="button"
            disabled={offset + 50 >= page.total}
            onClick={() => setOffset(offset + 50)}
          >
            下一页
          </button>
        </footer>
      )}
    </aside>
  );
}

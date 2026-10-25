import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { knowledge } from '../../services/knowledge.js';
import type { WorkspaceFolder, WorkspaceMatchPosition } from '../../services/workspaces.js';
import { GraphDetails } from './GraphDetails.js';
import { defaultQuery, type GraphView, validView } from './model.js';
import { darkPalette, GraphRenderer, lightPalette } from './renderer.js';
import { useKnowledge } from './useKnowledge.js';
import './knowledge-graph.css';

export default function KnowledgeGraph(props: {
  workspace: WorkspaceFolder;
  currentPath: string | null;
  dirty: boolean;
  dark: boolean;
  themeKey: string;
  onClose: () => void;
  onOpen: (workspaceId: string, path: string, match?: WorkspaceMatchPosition) => void;
}) {
  const model = useKnowledge(props.workspace, props.currentPath);
  const current = useRef(model);
  current.current = model;
  const shell = useRef<HTMLElement>(null),
    mount = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const renderer = useRef<GraphRenderer | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null),
    [filters, setFilters] = useState(false),
    [narrow, setNarrow] = useState(false);
  const [particles, setParticles] = useState(false),
    [moving, setMoving] = useState<string | null>(null),
    [pinRevision, setPinRevision] = useState(0),
    [listPage, setListPage] = useState(0);
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null),
    [draft, setDraft] = useState(model.query.filter);
  const composing = useRef(false),
    particleValue = useRef(particles),
    moveTarget = useRef(moving),
    saved = useRef(''),
    pendingSave = useRef(''),
    scene = useRef<string | null>(null);
  particleValue.current = particles;
  moveTarget.current = moving;
  const select = useRef(setSelected);
  select.current = setSelected;
  const open = useRef(props.onOpen);
  open.current = props.onOpen;
  const dataRef = useRef(model.data);
  dataRef.current = model.data;
  const darkRef = useRef(props.dark),
    selectedRef = useRef(selected);
  darkRef.current = props.dark;
  selectedRef.current = selected;
  const view = (): GraphView => ({
    version: 1,
    query: current.current.query,
    particles: particleValue.current,
    ...(renderer.current?.capture() ?? { positions: {}, camera: null }),
  });
  const persist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!renderer.current || !current.current.ready) return;
    const value = view(),
      serialized = JSON.stringify(value);
    if (serialized === saved.current || serialized === pendingSave.current) return;
    pendingSave.current = serialized;
    void current.current
      .save(value)
      .then((success) => {
        if (success) saved.current = serialized;
      })
      .finally(() => {
        if (pendingSave.current === serialized) pendingSave.current = '';
      });
  };
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 400);
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const scheduleRef = useRef(scheduleSave);
  scheduleRef.current = scheduleSave;
  const openNode = (id: string) => {
    const node = dataRef.current?.nodes.find((n) => n.id === id);
    if (node?.path) {
      persistRef.current();
      open.current(props.workspace.id, node.path);
    }
  };
  const openNodeRef = useRef(openNode);
  openNodeRef.current = openNode;

  useEffect(() => {
    shell.current?.focus({ preventScroll: true });
    const root = shell.current;
    if (!root) return;
    const observer = new ResizeObserver(() => setNarrow(root.clientWidth < 760));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!model.ready || !mount.current) return;
    let instance: GraphRenderer;
    try {
      instance = new GraphRenderer(
        mount.current,
        {
          select: (id) => {
            select.current(id);
            setContext(null);
          },
          open: (id) => openNodeRef.current(id),
          changed: () => scheduleRef.current(),
          error: (message) => current.current.setError(message),
          context: (id, point) => {
            const bounds = shell.current?.getBoundingClientRect();
            if (bounds)
              setContext({
                id,
                x: Math.min(point.x - bounds.left, Math.max(0, bounds.width - 180)),
                y: Math.min(point.y - bounds.top, Math.max(0, bounds.height - 180)),
              });
          },
          place: (point) => {
            const id = moveTarget.current;
            if (!id) return false;
            instance.moveNode(id, point.x, point.y);
            setMoving(null);
            return true;
          },
        },
        darkRef.current ? darkPalette : lightPalette,
      );
      if (current.current.restored) {
        instance.restore(current.current.restored);
        setParticles(current.current.restored.particles);
      }
      renderer.current = instance;
    } catch (error) {
      current.current.setError(String(error));
      return;
    }
    return () => {
      persistRef.current();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      instance.destroy();
      if (renderer.current === instance) renderer.current = null;
    };
  }, [model.ready]);
  useEffect(() => {
    const instance = renderer.current;
    if (!instance || !model.data) return;
    const key = JSON.stringify(current.current.query),
      changed = scene.current !== null && scene.current !== key;
    scene.current = key;
    instance.setData(model.data, changed);
    if (selectedRef.current && !model.data.nodes.some((n) => n.id === selectedRef.current))
      setSelected(null);
    setListPage(0);
  }, [model.data]);
  useEffect(() => {
    renderer.current?.select(selected);
  }, [selected]);
  useEffect(() => {
    const instance = renderer.current,
      element = mount.current;
    if (!model.ready || !instance || !element) return;
    const base = props.dark ? darkPalette : lightPalette;
    let frame = 0,
      last = '';
    const apply = () => {
      const styles = getComputedStyle(element),
        palette = {
          ...base,
          background: styles.getPropertyValue('--surface').trim() || base.background,
          text: styles.getPropertyValue('--text').trim() || base.text,
          focus: styles.getPropertyValue('--focus').trim() || base.focus,
        };
      const value = JSON.stringify(palette);
      if (value !== last) {
        last = value;
        instance.theme(palette);
      }
    };
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme'],
    });
    const shell = element.closest('.shell');
    if (shell)
      observer.observe(shell, { attributes: true, attributeFilter: ['style', 'data-theme-name'] });
    apply();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [props.dark, model.ready]);
  useEffect(() => {
    renderer.current?.setParticles(particles);
    if (model.ready) scheduleRef.current();
  }, [particles, model.ready]);
  useEffect(() => {
    setDraft(model.query.filter);
  }, [model.query.filter]);
  useEffect(() => {
    if (context)
      shell.current?.querySelector<HTMLButtonElement>('.knowledge-context button')?.focus();
  }, [context]);
  const node = model.data?.nodes.find((n) => n.id === selected) ?? null;
  let pinned = false;
  if (node && renderer.current) {
    try {
      pinned = renderer.current.position(node.id).pinned;
    } catch {
      /* New data has not reached the drawing effect yet. */
    }
  }
  const pin = () => {
    if (node) {
      renderer.current?.pin(node.id);
      setPinRevision(pinRevision + 1);
      setContext(null);
    }
  };
  const focus = (path: string) => {
    model.setQuery((q) => ({ ...q, focus: path }));
    setSelected(path);
    setContext(null);
  };
  const close = () => {
    persist();
    props.onClose();
  };
  const importView = async () => {
    const session = model.owner.current;
    if (!session) return;
    try {
      const value = await knowledge.importView(session);
      if (!value || !session.alive) return;
      if (!validView(value)) throw new Error('视图设置无效');
      model.acceptView();
      renderer.current?.restore(value);
      model.setQuery(value.query);
      setParticles(value.particles);
      saved.current = '';
      scheduleSave();
    } catch (error) {
      model.setWarning(String(error));
    }
  };
  const exportView = async () => {
    const session = model.owner.current;
    if (!session) return;
    try {
      await knowledge.exportView(session, view());
    } catch (error) {
      model.setWarning(String(error));
    }
  };
  const error = model.error || model.status?.error;
  const visibleNodes = model.data?.nodes ?? [],
    pageNodes = visibleNodes.slice(listPage * 40, (listPage + 1) * 40);
  const centerTitle = model.query.focus
    ? (model.data?.nodes.find((n) => n.path === model.query.focus)?.title ?? model.query.focus)
    : props.workspace.name;
  return (
    <section
      ref={shell}
      className="knowledge-workbench"
      aria-label="知识图谱"
      tabIndex={-1}
      data-narrow={narrow || undefined}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          search.current?.focus();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (context) setContext(null);
          else if (moving) setMoving(null);
          else if (filters) setFilters(false);
          else close();
          return;
        }
        const target = event.target as HTMLElement;
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          target.closest('input,select,textarea,button')
        )
          return;
        if (event.key === 'Enter' && selected) {
          event.preventDefault();
          openNode(selected);
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          renderer.current?.pan(
            event.key === 'ArrowLeft' ? -0.08 : event.key === 'ArrowRight' ? 0.08 : 0,
            event.key === 'ArrowUp' ? -0.08 : event.key === 'ArrowDown' ? 0.08 : 0,
          );
        }
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          renderer.current?.zoom(0.8);
        }
        if (event.key === '-') {
          event.preventDefault();
          renderer.current?.zoom(1.25);
        }
        if (event.key === '0') {
          event.preventDefault();
          renderer.current?.fit();
          scheduleSave();
        }
      }}
    >
      <header className="knowledge-header">
        <button
          className="knowledge-back"
          type="button"
          onClick={close}
          aria-label="返回文档"
          title="返回文档（Esc）"
        >
          ←
        </button>
        <div className="knowledge-heading">
          <strong>知识图谱</strong>
          <span title={centerTitle}>{centerTitle}</span>
        </div>
        <fieldset className="knowledge-scope" aria-label="图谱范围">
          <button
            type="button"
            aria-pressed={model.query.focus !== null}
            disabled={!props.currentPath && !model.query.focus}
            onClick={() => model.setQuery((q) => ({ ...q, focus: props.currentPath ?? q.focus }))}
          >
            局部
          </button>
          <button
            type="button"
            aria-pressed={model.query.focus === null}
            onClick={() => model.setQuery((q) => ({ ...q, focus: null }))}
          >
            全目录
          </button>
        </fieldset>
        <button
          className="knowledge-filter-button"
          type="button"
          aria-expanded={filters}
          onClick={() => setFilters((v) => !v)}
        >
          筛选
        </button>
      </header>
      <div className="knowledge-search">
        <Icon name="search" />
        <input
          ref={search}
          aria-label="搜索图谱"
          placeholder="搜索文档标题或路径"
          value={draft}
          maxLength={256}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            const value = event.currentTarget.value;
            model.setQuery((q) => ({ ...q, filter: value }));
          }}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDraft(value);
            if (!composing.current && !(event.nativeEvent as InputEvent).isComposing)
              model.setQuery((q) => ({ ...q, filter: value }));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && visibleNodes[0]) {
              setSelected(visibleNodes[0].id);
              renderer.current?.center(visibleNodes[0].id);
              mount.current?.focus();
            }
          }}
        />
        {draft && (
          <button
            type="button"
            aria-label="清除图谱搜索"
            onClick={() => {
              setDraft('');
              model.setQuery((q) => ({ ...q, filter: '' }));
            }}
          >
            ×
          </button>
        )}
      </div>
      {filters && (
        <div className="knowledge-filters">
          <label>
            关系层级
            <select
              aria-label="关系层级"
              value={model.query.depth}
              disabled={!model.query.focus}
              onChange={(e) => model.setQuery((q) => ({ ...q, depth: Number(e.target.value) }))}
            >
              <option value={1}>一跳</option>
              <option value={2}>两跳</option>
            </select>
          </label>
          <label>
            目录
            <input
              aria-label="筛选目录"
              placeholder="相对路径"
              value={model.query.folder}
              onChange={(e) => model.setQuery((q) => ({ ...q, folder: e.target.value }))}
            />
          </label>
          <label>
            标签
            <input
              aria-label="筛选标签"
              placeholder="标签名称"
              value={model.query.tag}
              onChange={(e) => model.setQuery((q) => ({ ...q, tag: e.target.value }))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={model.query.showMissing}
              onChange={(e) => model.setQuery((q) => ({ ...q, showMissing: e.target.checked }))}
            />
            未解析目标
          </label>
          <label>
            <input
              type="checkbox"
              checked={model.query.showOrphans}
              onChange={(e) => model.setQuery((q) => ({ ...q, showOrphans: e.target.checked }))}
            />
            孤立文档
          </label>
          <label>
            <input
              type="checkbox"
              checked={particles}
              onChange={(e) => setParticles(e.target.checked)}
            />
            引用方向动效
          </label>
          <label>
            显示预算
            <select
              aria-label="显示预算"
              value={model.query.limit}
              onChange={(e) => model.setQuery((q) => ({ ...q, limit: Number(e.target.value) }))}
            >
              <option value={500}>500 节点</option>
              <option value={2000}>2,000 节点</option>
              <option value={5000}>5,000 节点</option>
            </select>
          </label>
          <div className="knowledge-settings-actions">
            <button type="button" disabled={!model.ready} onClick={() => void exportView()}>
              导出视图
            </button>
            <button type="button" disabled={!model.ready} onClick={() => void importView()}>
              导入视图
            </button>
            <button
              type="button"
              disabled={!model.ready || model.status?.working}
              onClick={model.refresh}
            >
              重建索引
            </button>
            <button
              type="button"
              onClick={() => {
                model.acceptView();
                model.setQuery({ ...defaultQuery, focus: props.currentPath });
                setParticles(false);
                renderer.current?.fit();
                saved.current = '';
                scheduleSave();
              }}
            >
              重置视图
            </button>
          </div>
        </div>
      )}
      {props.dirty && (
        <div className="knowledge-notice">
          当前文档有未保存修改，图谱显示磁盘上已保存的关系。
          <button type="button" onClick={close}>
            返回文档
          </button>
        </div>
      )}
      {model.warning && (
        <div className="knowledge-notice" role="status">
          {model.warning}
        </div>
      )}
      {error && (
        <div className="knowledge-notice knowledge-error" role="alert">
          {error}
          <button type="button" onClick={model.retry}>
            重新连接
          </button>
        </div>
      )}
      <div className="knowledge-body">
        <div className="knowledge-visual">
          <div
            ref={mount}
            className="knowledge-canvas"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: this custom graph viewport supports keyboard pan, zoom, fit and opening the selected node; the document list is its text alternative.
            tabIndex={0}
            role="application"
            aria-label="图谱画布"
            aria-describedby="knowledge-keys"
          />
          {!model.data && (
            <div className="knowledge-empty" role="status">
              <span className="knowledge-loading-dot" />
              <strong>正在建立文档关系</strong>
              <p>
                {model.status
                  ? `已检查 ${model.status.scanned.toLocaleString()} 篇文档`
                  : '连接本地索引…'}
              </p>
              <small>可以随时返回文档，索引会暂停并保留进度。</small>
            </div>
          )}
          {model.data && !visibleNodes.length && (
            <div className="knowledge-empty">
              <strong>
                {model.query.filter || model.query.folder || model.query.tag
                  ? '没有符合筛选条件的文档'
                  : '这里还没有可显示的文档'}
              </strong>
              <p>图谱根据 Markdown 链接与双链建立关系。</p>
              {(model.query.filter || model.query.folder || model.query.tag) && (
                <button
                  type="button"
                  onClick={() => model.setQuery((q) => ({ ...q, filter: '', folder: '', tag: '' }))}
                >
                  清除筛选
                </button>
              )}
            </div>
          )}
          {moving && (
            <div className="knowledge-move-prompt" role="status">
              点击画布选择新位置
              <button type="button" onClick={() => setMoving(null)}>
                取消
              </button>
            </div>
          )}
          <div className="knowledge-canvas-tools" role="toolbar" aria-label="图谱导航">
            <button
              type="button"
              title="放大"
              aria-label="放大图谱"
              onClick={() => renderer.current?.zoom(0.8)}
            >
              +
            </button>
            <button
              type="button"
              title="缩小"
              aria-label="缩小图谱"
              onClick={() => renderer.current?.zoom(1.25)}
            >
              −
            </button>
            <button
              type="button"
              title="适应视图"
              aria-label="适应图谱"
              onClick={() => {
                renderer.current?.fit();
                scheduleSave();
              }}
            >
              ⊡
            </button>
          </div>
          <div className="knowledge-pan-tools" role="toolbar" aria-label="无需拖动的平移">
            <button
              type="button"
              aria-label="向左平移"
              onClick={() => renderer.current?.pan(-0.1, 0)}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="向上平移"
              onClick={() => renderer.current?.pan(0, -0.1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="向下平移"
              onClick={() => renderer.current?.pan(0, 0.1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label="向右平移"
              onClick={() => renderer.current?.pan(0.1, 0)}
            >
              →
            </button>
          </div>
          <span className="knowledge-keys" id="knowledge-keys">
            拖动节点 · 滚轮缩放 · Enter 打开 · 方向键平移
          </span>
        </div>
        <GraphDetails
          node={node}
          data={model.data}
          session={model.owner.current}
          generation={model.data?.generation ?? 0}
          complete={model.status?.complete ?? false}
          pinned={pinned}
          onOpen={(path, match) => {
            persist();
            props.onOpen(props.workspace.id, path, match);
          }}
          onFocus={focus}
          onPin={pin}
          onMove={() => {
            setMoving(selected);
            setContext(null);
            mount.current?.focus();
          }}
          onLocate={() => {
            if (selected) renderer.current?.center(selected);
          }}
          onError={model.setError}
        />
      </div>
      <details className="knowledge-node-browser">
        <summary>文档列表 · {visibleNodes.length.toLocaleString()} 个可见节点</summary>
        <div className="knowledge-node-list">
          {pageNodes.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={selected === item.id}
              title={item.path ?? item.title}
              onClick={() => {
                setSelected(item.id);
                renderer.current?.center(item.id);
              }}
              onDoubleClick={() => openNode(item.id)}
            >
              <span className={`knowledge-node-dot ${item.state}`} />
              <span>{item.title}</span>
              <small>{item.path ?? '未解析目标'}</small>
            </button>
          ))}
        </div>
        {visibleNodes.length > 40 && (
          <div className="knowledge-list-pages">
            <button type="button" disabled={!listPage} onClick={() => setListPage((v) => v - 1)}>
              上一页
            </button>
            <span>
              {listPage + 1} / {Math.ceil(visibleNodes.length / 40)}
            </span>
            <button
              type="button"
              disabled={(listPage + 1) * 40 >= visibleNodes.length}
              onClick={() => setListPage((v) => v + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </details>
      <footer className="knowledge-footer" role="status">
        <span className={model.status?.working ? 'knowledge-status-busy' : ''}>
          {model.status?.working
            ? `正在索引 · 已检查 ${model.status.scanned.toLocaleString()} 篇`
            : model.status?.complete
              ? '索引已更新'
              : '索引尚未完整'}
        </span>
        <span>
          {visibleNodes.filter((n) => n.path).length.toLocaleString()} /{' '}
          {(model.data?.totalNotes ?? 0).toLocaleString()} 篇 ·{' '}
          {(model.data?.edges.length ?? 0).toLocaleString()} 条可见关系
        </span>
        {model.data?.truncated && (
          <span className="knowledge-limit">已达到显示预算，可缩小范围</span>
        )}
        {!!model.status?.unreadable && <span>{model.status.unreadable} 篇暂无法读取</span>}
        {model.status && !model.status.watcher && <span>监听不可用，使用有限校验</span>}
      </footer>
      {context && (
        <div
          className="knowledge-context"
          role="menu"
          style={{ left: context.x, top: context.y }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setContext(null);
          }}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => openNode(context.id)}
            disabled={!node?.path}
          >
            打开文档
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!node?.path}
            onClick={() => node?.path && focus(node.path)}
          >
            以此为中心
          </button>
          <button type="button" role="menuitem" disabled={!node?.path} onClick={pin}>
            {pinned ? '取消固定' : '固定位置'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMoving(context.id);
              setContext(null);
            }}
          >
            移动到…
          </button>
        </div>
      )}
    </section>
  );
}

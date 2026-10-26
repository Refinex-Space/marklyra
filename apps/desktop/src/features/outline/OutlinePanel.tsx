import type { OutlineEntry } from '@marklyra/editor-runtime';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ShellGlyph } from '../../components/ShellGlyph.js';
import {
  type OutlineNode,
  outlineMatch,
  outlineTree,
  visibleCurrentHeading,
  visibleOutline,
} from './outline-tree.js';
import './outline.css';

interface Props {
  entries: readonly OutlineEntry[];
  disabled: boolean;
  jump: (id: string) => Promise<void>;
  currentId?: string | null;
  collapsible?: boolean;
  onCollapsibleChange?: (value: boolean) => Promise<void>;
}

export function OutlinePanel({
  entries,
  disabled,
  jump,
  currentId,
  collapsible: controlled,
  onCollapsibleChange,
}: Props) {
  const tree = useMemo(() => outlineTree(entries), [entries]);
  const branches = useMemo(
    () => visibleOutline(tree, new Set()).filter((node) => node.children.length),
    [tree],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [localCollapsible, setLocalCollapsible] = useState(true);
  const collapsible = controlled ?? localCollapsible;
  const [savingCollapse, setSavingCollapse] = useState(false);
  const setCollapsible = async (value: boolean) => {
    if (savingCollapse) return;
    if (!onCollapsibleChange) {
      setLocalCollapsible(value);
      return;
    }
    setSavingCollapse(true);
    try {
      await onCollapsibleChange(value);
    } finally {
      setSavingCollapse(false);
    }
  };
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [filterSelected, setFilterSelected] = useState<string | null>(null);
  const treeId = useId();
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  const menuOrigin = useRef<HTMLElement | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const wheelAt = useRef(0);
  const focusedBranch = useRef<string | null>(null);
  const restoreBranch = useRef<string | null>(null);
  const restoreBranchFocus = useCallback(() => {
    const id = restoreBranch.current;
    if (!id || !document.hasFocus()) return;
    restoreBranch.current = null;
    if (document.activeElement === document.body)
      rows.current.get(id)?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    if (!collapsible && focusedBranch.current && document.activeElement === document.body) {
      restoreBranch.current = focusedBranch.current;
      restoreBranchFocus();
    }
  }, [collapsible, restoreBranchFocus]);
  useEffect(() => {
    window.addEventListener('focus', restoreBranchFocus);
    return () => window.removeEventListener('focus', restoreBranchFocus);
  }, [restoreBranchFocus]);

  const filtering = filterOpen && filter.trim().length > 0;
  const displayedTree = filtering
    ? entries
        .filter((entry) => outlineMatch(entry.text, filter))
        .map((entry) => ({ ...entry, children: [] }))
    : tree;
  const effectiveCollapsed = collapsible && !filtering ? collapsed : new Set<string>();
  const visible = visibleOutline(displayedTree, effectiveCollapsed);
  const active = filtering
    ? null
    : currentId === undefined
      ? selected
      : visibleCurrentHeading(displayedTree, effectiveCollapsed, currentId);
  useEffect(() => {
    if (!active || Date.now() - wheelAt.current < 100) return;
    const row = rows.current.get(active)?.firstElementChild;
    const scroller = row?.closest('.sidebar-panel');
    if (!row || !(scroller instanceof HTMLElement)) return;
    const bounds = row.getBoundingClientRect(),
      area = scroller.getBoundingClientRect();
    if (bounds.top < area.top) scroller.scrollTop += bounds.top - area.top - 200;
    else if (bounds.bottom > area.bottom) scroller.scrollTop += bounds.bottom - area.bottom + 200;
  }, [active]);
  const focusable = visible.some((item) => item.id === focused) ? focused : visible[0]?.id;
  useEffect(() => {
    if (filterOpen) filterInput.current?.focus();
  }, [filterOpen]);
  useEffect(() => {
    if (!menuPosition) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        setMenuPosition(null);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, [menuPosition]);
  useEffect(() => {
    if (disabled) setMenuPosition(null);
  }, [disabled]);
  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const activate = async (id: string) => {
    if (disabled) return;
    await jump(id);
    setSelected(id);
  };
  const activateFiltered = async (id: string) => {
    const input = filterInput.current;
    let interrupted = false;
    const cancel = () => {
      interrupted = true;
    };
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('keydown', cancel, true);
    try {
      await activate(id);
      // The filter keeps its input focused after Enter. A later user
      // action revokes this restoration while an asynchronous host jump waits.
      if (!interrupted && input?.isConnected && document.hasFocus()) input.focus();
    } finally {
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('keydown', cancel, true);
    }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>, node: OutlineNode, parent?: string) => {
    if (disabled || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const index = visible.findIndex((item) => item.id === node.id);
    let next: string | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = visible[index + 1]?.id;
        break;
      case 'ArrowUp':
        next = visible[index - 1]?.id;
        break;
      case 'Home':
        next = visible[0]?.id;
        break;
      case 'End':
        next = visible.at(-1)?.id;
        break;
      case 'ArrowRight':
        if (collapsible && node.children.length && collapsed.has(node.id)) toggle(node.id);
        else next = node.children[0]?.id;
        break;
      case 'ArrowLeft':
        if (collapsible && node.children.length && !collapsed.has(node.id)) toggle(node.id);
        else next = parent;
        break;
      case 'Enter':
      case ' ':
        void activate(node.id);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next) rows.current.get(next)?.focus();
  };
  const render = (nodes: readonly OutlineNode[], depth: number, parent?: string) =>
    nodes.map((node, index) => (
      <div
        key={node.id}
        ref={(element) => {
          if (element) rows.current.set(node.id, element);
          else rows.current.delete(node.id);
        }}
        className="outline-item"
        id={`${treeId}-${node.id}`}
        data-filter-selected={filterOpen && filterSelected === node.id ? 'true' : undefined}
        role="treeitem"
        data-outline-id={node.id}
        aria-label={node.text || '未命名标题'}
        aria-level={depth + 1}
        aria-posinset={index + 1}
        aria-setsize={nodes.length}
        aria-expanded={
          collapsible && node.children.length ? !effectiveCollapsed.has(node.id) : undefined
        }
        aria-selected={node.id === active}
        aria-disabled={disabled}
        tabIndex={!disabled && node.id === focusable ? 0 : -1}
        title={node.text}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setFocused(node.id);
        }}
        onKeyDown={(event) => key(event, node, parent)}
        onClick={(event) => {
          event.stopPropagation();
          void activate(node.id);
        }}
      >
        <div
          className="outline-row"
          style={{ paddingInlineStart: `${Math.max(0, node.level - 1)}em` }}
        >
          {collapsible && !filtering && node.children.length ? (
            <button
              type="button"
              className="outline-disclosure"
              aria-label={`${collapsed.has(node.id) ? '展开' : '折叠'} ${node.text || '未命名标题'}`}
              tabIndex={-1}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.id);
              }}
            >
              <ShellGlyph
                name={collapsed.has(node.id) ? 'outlineRight' : 'outlineDown'}
                hoverName="outlineDown"
              />
            </button>
          ) : collapsible && !filtering ? (
            <span className="outline-leaf" aria-hidden="true" />
          ) : null}
          <span className="outline-label">
            {(() => {
              const match = filtering ? outlineMatch(node.text, filter) : null;
              return match ? (
                <>
                  {node.text.slice(0, match.from)}
                  <strong>{node.text.slice(match.from, match.to)}</strong>
                  {node.text.slice(match.to)}
                </>
              ) : (
                node.text || '未命名标题'
              );
            })()}
          </span>
        </div>
        {!!node.children.length && !effectiveCollapsed.has(node.id) && (
          // biome-ignore lint/a11y/useSemanticElements: ARIA tree groups contain nested treeitems, not form controls.
          <div role="group">{render(node.children, depth + 1, node.id)}</div>
        )}
      </div>
    ));

  return (
    <section
      className="outline-panel"
      aria-label="大纲导航"
      onFocusCapture={(event) => {
        focusedBranch.current =
          (event.target as Element).closest<HTMLElement>('[data-outline-id]')?.dataset.outlineId ??
          null;
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.relatedTarget !== document.body &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          focusedBranch.current = null;
          restoreBranch.current = null;
        }
      }}
      onWheel={() => {
        wheelAt.current = Date.now();
      }}
      onContextMenu={(event) => {
        if (disabled) return;
        event.preventDefault();
        menuOrigin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setMenuPosition({
          x: Math.max(4, Math.min(event.clientX, window.innerWidth - 190)),
          y: Math.max(4, Math.min(event.clientY, window.innerHeight - 240)),
        });
      }}
      onKeyDown={(event) => {
        if (disabled || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')))
          return;
        event.preventDefault();
        const target = event.target as HTMLElement;
        const bounds = target.getBoundingClientRect();
        menuOrigin.current = target;
        setMenuPosition({
          x: Math.max(4, Math.min(bounds.left + 20, window.innerWidth - 190)),
          y: Math.max(4, Math.min(bounds.bottom, window.innerHeight - 240)),
        });
      }}
    >
      {filterOpen && (
        <div className="outline-filter">
          <input
            ref={filterInput}
            type="search"
            aria-label="筛选大纲"
            aria-controls={treeId}
            aria-activedescendant={
              filterOpen && visible.some((node) => node.id === filterSelected)
                ? `${treeId}-${filterSelected}`
                : undefined
            }
            placeholder="筛选"
            value={filter}
            disabled={disabled}
            onChange={(event) => {
              setFilter(event.target.value);
              setFilterSelected(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                (event.key === 'ArrowDown' || event.key === 'ArrowUp')
              ) {
                event.preventDefault();
                event.stopPropagation();
                const index = visible.findIndex((node) => node.id === filterSelected);
                const next =
                  index < 0
                    ? (visible.find((node) => node.id === currentId) ?? visible[0])
                    : visible[index + (event.key === 'ArrowDown' ? 1 : -1)];
                if (next) {
                  setFilterSelected(next.id);
                  rows.current.get(next.id)?.scrollIntoView({ block: 'nearest' });
                }
              } else if (
                event.key === 'Enter' &&
                filterSelected &&
                visible.some((node) => node.id === filterSelected)
              ) {
                event.preventDefault();
                event.stopPropagation();
                void activateFiltered(filterSelected);
              }
              if (event.key === 'Escape') {
                setFilterOpen(false);
                setFilter('');
                setFilterSelected(null);
                rows.current.get(focusable ?? '')?.focus();
              }
            }}
          />
          <button
            type="button"
            aria-label="关闭大纲筛选"
            onClick={() => {
              setFilterOpen(false);
              setFilter('');
              setFilterSelected(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      {entries.length ? (
        <div id={treeId} role="tree" aria-label="文档标题">
          {render(displayedTree, 0)}
          {filtering && visible.length === 0 && (
            <p className="outline-filter-empty" role="status">
              无匹配标题。
            </p>
          )}
        </div>
      ) : (
        <p className="outline-empty">大纲为空。</p>
      )}
      {menuPosition && (
        <div
          className="outline-context-menu"
          role="menu"
          aria-label="大纲操作"
          ref={menu}
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setMenuPosition(null);
              menuOrigin.current?.focus();
              return;
            }
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            );
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? buttons[0]
                : event.key === 'End'
                  ? buttons.at(-1)
                  : event.key === 'ArrowDown'
                    ? buttons[(current + 1) % buttons.length]
                    : event.key === 'ArrowUp'
                      ? buttons[(current + buttons.length - 1) % buttons.length]
                      : null;
            if (next) {
              event.preventDefault();
              next.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={filterOpen}
            onClick={() => {
              setMenuPosition(null);
              setFilterOpen(!filterOpen);
              setFilter('');
              setFilterSelected(null);
            }}
          >
            筛选
          </button>
          {collapsible && !!branches.length && (
            <>
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCollapsed(new Set());
                  setMenuPosition(null);
                  menuOrigin.current?.focus();
                }}
              >
                全部展开
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCollapsed(new Set(branches.map((node) => node.id)));
                  setMenuPosition(null);
                  menuOrigin.current?.focus();
                }}
              >
                全部折叠
              </button>
            </>
          )}
          <hr />
          <button
            type="button"
            role="menuitemradio"
            disabled={savingCollapse}
            aria-checked={collapsible}
            onClick={() => {
              void setCollapsible(true);
              setMenuPosition(null);
              menuOrigin.current?.focus();
            }}
          >
            可折叠大纲
          </button>
          <button
            type="button"
            role="menuitemradio"
            disabled={savingCollapse}
            aria-checked={!collapsible}
            onClick={() => {
              void setCollapsible(false);
              setMenuPosition(null);
              menuOrigin.current?.focus();
            }}
          >
            平铺大纲
          </button>
        </div>
      )}
    </section>
  );
}

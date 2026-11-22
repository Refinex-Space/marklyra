import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../components/Icon.js';
import { type Site, sites } from '../../services/sites.js';
import { Menu, type MenuEntry } from './Layer.js';
import type { SiteCatalog } from './model/catalog.js';
import { searchSites } from './model/catalog.js';
import { colorValue, GROUP_COLORS } from './model/colors.js';
import type { SearchEngine } from './model/engines.js';
import { letterMark } from './model/letter.js';
import { shortcut } from './model/platform.js';
import { classifyQuery } from './model/query.js';
import { displayHost } from './model/url.js';
import { SiteMark } from './SiteMark.js';

export interface SearchBoxHandle {
  focus(): void;
}

type Row =
  | { key: string; type: 'site'; site: Site }
  | { key: string; type: 'url'; url: string }
  | { key: string; type: 'search'; engine: SearchEngine; query: string; url: string };

/** A stable colour per engine, so each is told apart before its own icon exists. */
const engineColor = (engine: SearchEngine) => {
  let hash = 0;
  for (const ch of engine.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return colorValue(GROUP_COLORS[hash % (GROUP_COLORS.length - 1)] ?? 'gray');
};

const engineIcons = new Map<string, string>();

export function EngineMark({
  engine,
  small = false,
  workspaceId,
}: {
  engine: SearchEngine;
  small?: boolean;
  workspaceId?: string;
}) {
  const [src, setSrc] = useState<string | null>(engineIcons.get(engine.template) ?? null);
  useEffect(() => {
    if (!workspaceId || engineIcons.has(engine.template)) return;
    let alive = true;
    void sites.engineIcon(workspaceId, engine.template).then(
      (icon) => {
        const bytes = Uint8Array.from(atob(icon.base64), (char) => char.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: icon.mime }));
        engineIcons.set(engine.template, url);
        if (alive) setSrc(url);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [engine.template, workspaceId]);
  if (src) {
    return <img className={`site-engine-mark${small ? ' small' : ''}`} src={src} alt="" />;
  }
  return (
    <span
      className={`site-engine-mark${small ? ' small' : ''}`}
      style={{ background: engineColor(engine) }}
      aria-hidden="true"
    >
      {letterMark(engine.name)}
    </span>
  );
}

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const word = query.trim().split(/\s+/)[0]?.toLowerCase();
  const at = word ? text.toLowerCase().indexOf(word) : -1;
  if (at < 0 || !word) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + word.length)}</mark>
      {text.slice(at + word.length)}
    </>
  );
}

/**
 * The page's search field: Enter opens an address or searches with the chosen engine in the
 * system browser; matching saved sites are offered first. Text typed through an input method
 * is never acted on until the composition ends.
 */
export function SearchBox({
  catalog,
  engines,
  defaultEngine,
  workspaceId,
  handle,
  onOpenSite,
  onOpenUrl,
  error,
  onManageEngines,
}: {
  catalog: SiteCatalog | null;
  engines: readonly SearchEngine[];
  defaultEngine: string;
  workspaceId?: string;
  handle: React.Ref<SearchBoxHandle>;
  onOpenSite(site: Site): void;
  /** Resolves to a message when the address could not be opened. */
  onOpenUrl(url: string, what: string): Promise<string | null>;
  error: string | null;
  onManageEngines?: (() => void) | undefined;
}) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [composing, setComposing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useImperativeHandle(handle, () => ({ focus: () => input.current?.focus() }), []);

  const engine = engines.find((e) => e.id === (picked ?? defaultEngine)) ?? engines[0];
  // The default engine can change in settings while this view is open.
  useEffect(() => {
    if (picked && !engines.some((e) => e.id === picked)) setPicked(null);
  }, [engines, picked]);

  const rows = useMemo<Row[]>(() => {
    // Nothing is offered while a composition is in flight: the text is not final yet.
    if (!text.trim() || composing || !engine) return [];
    const result: Row[] = [];
    for (const site of searchSites(catalog?.items ?? [], text, 5))
      result.push({ key: `site:${site.id}`, type: 'site', site });
    const action = classifyQuery(text, engines, engine);
    if (action?.kind === 'url') result.push({ key: 'url', type: 'url', url: action.url });
    const search = action?.kind === 'search' ? action : classifyQuery(text, engines, engine, true);
    if (search?.kind === 'search')
      result.push({
        key: `search:${search.engine.id}`,
        type: 'search',
        engine: search.engine,
        query: search.query,
        url: search.url,
      });
    return result;
  }, [text, composing, catalog, engines, engine]);
  const open = focused && rows.length > 0;
  const current = rows[Math.min(active, rows.length - 1)];

  const finish = (message: string | null) => {
    setFailure(message);
    if (!message) {
      setText('');
      setPicked(null);
      setActive(0);
    }
  };
  const run = async (row: Row) => {
    if (row.type === 'site') {
      onOpenSite(row.site);
      finish(null);
    } else
      finish(
        await onOpenUrl(row.url, row.type === 'url' ? '打开网址' : `用${row.engine.name}搜索`),
      );
  };
  const forceSearch = async () => {
    if (!engine || !text.trim()) return;
    const action = classifyQuery(text, engines, engine, true);
    if (action?.kind === 'search')
      finish(await onOpenUrl(action.url, `用${action.engine.name}搜索`));
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!rows.length) return;
      event.preventDefault();
      setActive((value) =>
        event.key === 'ArrowDown' ? Math.min(rows.length - 1, value + 1) : Math.max(0, value - 1),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) void forceSearch();
      else if (current) void run(current);
    } else if (event.key === 'Escape') {
      if (text) {
        event.preventDefault();
        event.stopPropagation();
        setText('');
        setFailure(null);
      } else input.current?.blur();
    }
  };

  const entries: MenuEntry[] = [
    ...engines.map((e) => ({
      id: e.id,
      label: e.name,
      leading: <EngineMark engine={e} small {...(workspaceId ? { workspaceId } : {})} />,
      checked: e.id === engine?.id,
      ...(e.id === engine?.id ? {} : { hint: e.keyword }),
    })),
    ...(onManageEngines
      ? [
          { separator: true } as const,
          { id: '#manage', label: '管理搜索引擎…', icon: 'settings' as const },
        ]
      : []),
  ];
  const message = failure ?? error;

  if (!engine) return null;
  return (
    <div className="site-search-wrap">
      <search className="site-search" aria-label="搜索或打开网址">
        <button
          type="button"
          className="site-engine"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          aria-label={`搜索引擎：${engine.name}`}
          title="选择本次搜索使用的引擎"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu({ x: box.left, y: box.bottom + 6 });
          }}
        >
          <EngineMark engine={engine} {...(workspaceId ? { workspaceId } : {})} />
          <Icon name="chevronDown" />
        </button>
        <span className="site-search-sep" aria-hidden="true" />
        <input
          ref={input}
          className="site-search-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${ids}-list`}
          aria-activedescendant={open && current ? `${ids}-${current.key}` : undefined}
          aria-autocomplete="list"
          aria-label="搜索或输入网址"
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={`用${engine.name}搜索，或输入网址`}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setFailure(null);
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={keyDown}
        />
        {!text && <kbd className="site-kbd">/</kbd>}
        <button
          type="button"
          className="site-search-go"
          tabIndex={0}
          aria-label="搜索"
          disabled={!current}
          // Keeps the field focused so the suggestions do not vanish before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => current && void run(current)}
        >
          <Icon name="arrowRight" />
        </button>
      </search>
      {open && (
        <div className="site-suggest" role="listbox" id={`${ids}-list`} aria-label="建议">
          {rows.map((row, index) => (
            <div
              key={row.key}
              id={`${ids}-${row.key}`}
              role="option"
              tabIndex={-1}
              aria-selected={row === current}
              className="site-suggest-row"
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => void run(row)}
              onKeyDown={() => {}}
            >
              {row.type === 'site' ? (
                <>
                  <SiteMark
                    title={row.site.title}
                    color={
                      (row.site.group && catalog?.groupById.get(row.site.group)?.color) || 'gray'
                    }
                    size="sm"
                  />
                  <span className="site-suggest-title">
                    <Highlight text={row.site.title} query={text} />
                  </span>
                  <span className="site-suggest-sub">{displayHost(row.site.url)}</span>
                  <span className="site-suggest-kind">已收藏</span>
                </>
              ) : row.type === 'url' ? (
                <>
                  <span className="site-suggest-icon">
                    <Icon name="link" />
                  </span>
                  <span className="site-suggest-title">打开 {displayHost(row.url)}</span>
                  <span className="site-suggest-sub">{row.url}</span>
                </>
              ) : (
                <>
                  <EngineMark engine={row.engine} small {...(workspaceId ? { workspaceId } : {})} />
                  <span className="site-suggest-title">
                    用{row.engine.name}搜索“{row.query}”
                  </span>
                  <span className="site-suggest-sub" />
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="site-search-error" role={message ? 'alert' : undefined}>
        {message}
      </p>
      <p className="site-search-hints">
        <span>
          <kbd>Shift+Tab</kbd> 聚焦引擎按钮
        </span>
        {engines
          .filter((e) => e.id !== engine.id)
          .slice(0, 1)
          .map((e) => (
            <span key={e.id}>
              <kbd>{e.keyword} 关键词</kbd> 临时用{e.name}
            </span>
          ))}
        <span>
          <kbd>{shortcut('↵')}</kbd> 强制搜索
        </span>
      </p>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          label="搜索引擎"
          entries={entries}
          onClose={() => {
            setMenu(null);
            input.current?.focus();
          }}
          onPick={(id) => {
            setMenu(null);
            if (id === '#manage') onManageEngines?.();
            else {
              setPicked(id === defaultEngine ? null : id);
              input.current?.focus();
            }
          }}
        />
      )}
    </div>
  );
}

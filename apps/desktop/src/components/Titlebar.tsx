import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import appIcon from '../../src-tauri/icons/32x32.png';
import type { StatisticsUnit } from '../features/settings/preferences.js';
import { editorChrome } from '../services/ui-chrome.js';
import { Icon } from './Icon.js';
import './titlebar.css';

/** Below this width the menu titles collapse into one menu button. */
const COMPACT_MENU_WIDTH = 940;
const MAX_TITLE_WIDTH = 600;
const statisticsOrder: readonly StatisticsUnit[] = [
  'readingMinutes',
  'lines',
  'words',
  'characters',
];
const statisticsUnits: Record<StatisticsUnit, string> = {
  readingMinutes: '分钟',
  lines: '行',
  words: '词',
  characters: '字符',
};

export interface TitlebarStatistics {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
}

export interface TitlebarProps {
  title: string;
  dirty: boolean;
  /** The document has a file location, matching the macOS file proxy icon. */
  hasFile: boolean;
  /** Present when the saved file can be renamed: the title then opens the rename popover. */
  onRename?: ((anchor: HTMLElement) => void) | undefined;
  /** The rename popover is open on this title. */
  renaming?: boolean;
  statistics: TitlebarStatistics | null;
  statisticsUnit: StatisticsUnit;
  onStatisticsUnit: (unit: StatisticsUnit) => void;
  alwaysShowWordCount: boolean;
  sidebarOpen: boolean;
  outlineOpen: boolean;
  aiOpen: boolean;
  onSidebar: () => void;
  onOutline: () => void;
  onAi: () => void;
  sourceMode: boolean;
  onExitSource: () => void;
  /** The inline settings page replaces document controls and the title. */
  settingsOpen: boolean;
  fullscreen: boolean;
  /** Reading area bounds in viewport coordinates; the title centres over them. */
  contentLeft: number;
  contentRight: number;
  /** Painted width of the left sidebar column behind the titlebar. */
  sidebarWidth: number;
  disabled: boolean;
  onError: (message: string) => void;
}

function statisticsText(statistics: TitlebarStatistics | null, unit: StatisticsUnit) {
  const values = statistics ?? { words: 0, characters: 0, lines: 0, readingMinutes: 0 };
  return `${values[unit].toLocaleString()} ${statisticsUnits[unit]}`;
}

export function Titlebar(props: TitlebarProps) {
  const {
    title,
    statistics,
    statisticsUnit,
    onStatisticsUnit,
    sourceMode,
    settingsOpen,
    fullscreen,
    contentLeft,
    contentRight,
  } = props;
  // Hosts recreate their message callback on every render; effects must not restart for it.
  const errorHandler = useRef(props.onError);
  errorHandler.current = props.onError;
  const onError = useCallback((message: string) => errorHandler.current(message), []);
  const root = useRef<HTMLElement>(null);
  const leading = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [compact, setCompact] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const [titleFrame, setTitleFrame] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void editorChrome.menuTitles().then(
      (value) => {
        if (alive) setTitles(value);
      },
      (error: unknown) => {
        if (alive) onError(`应用菜单读取失败：${String(error)}`);
      },
    );
    return () => {
      alive = false;
    };
  }, [onError]);

  useEffect(() => {
    let alive = true;
    const current = getCurrentWindow();
    const refresh = () =>
      void current.isMaximized().then(
        (value) => {
          if (alive) setMaximized(value === true);
        },
        (error: unknown) => {
          if (alive) onError(`无法读取窗口状态：${String(error)}`);
        },
      );
    refresh();
    const stops = [
      current.onResized(refresh),
      current.onFocusChanged(({ payload }) => {
        if (alive) setFocused(payload);
      }),
    ];
    return () => {
      alive = false;
      for (const stop of stops) void stop.then((unlisten) => unlisten());
    };
  }, [onError]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Title text and controls change the measured safe area.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      setCompact(width < COMPACT_MENU_WIDTH);
      const center = (contentLeft + contentRight) / 2;
      const menuRight = leading.current?.getBoundingClientRect().right ?? 0;
      const actionsLeft = actions.current?.getBoundingClientRect().left ?? width;
      const safeLeft = Math.max(contentLeft + 8, menuRight + 12);
      const safeRight = Math.min(contentRight - 8, actionsLeft - 8);
      const available = Math.min(
        MAX_TITLE_WIDTH,
        Math.max(0, 2 * Math.min(center - safeLeft, safeRight - center)),
      );
      setTitleFrame((previous) => {
        const next = available >= 40 ? { left: center - available / 2, width: available } : null;
        return previous?.left === next?.left && previous?.width === next?.width ? previous : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    contentLeft,
    contentRight,
    titles,
    compact,
    sourceMode,
    settingsOpen,
    title,
    statistics,
    statisticsUnit,
  ]);

  const popup = useCallback(
    (index: number | null, anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect();
      void editorChrome
        .popupMenu(index, rect.left, rect.bottom, document.documentElement.clientWidth)
        .catch((error: unknown) => onError(`无法打开应用菜单：${String(error)}`));
    },
    [onError],
  );

  const menuKeys = (event: ReactKeyboardEvent<HTMLElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      event.preventDefault();
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      popup(index, items[index] as HTMLElement);
    }
  };

  if (fullscreen) {
    return props.alwaysShowWordCount && !sourceMode && !settingsOpen ? (
      <div className="titlebar-fullscreen-statistics">
        <StatisticsControl
          statistics={statistics}
          unit={statisticsUnit}
          onUnit={onStatisticsUnit}
          onError={onError}
        />
      </div>
    ) : null;
  }

  const controls = !settingsOpen;
  const style = { '--titlebar-sidebar-width': `${props.sidebarWidth}px` } as CSSProperties;
  return (
    <header
      ref={root}
      className="titlebar"
      data-tauri-drag-region=""
      data-focused={focused}
      data-settings={settingsOpen || undefined}
      style={style}
    >
      <div className="titlebar-leading" ref={leading}>
        <button
          type="button"
          className="titlebar-app"
          aria-label="MarkLyra"
          title="MarkLyra"
          aria-haspopup="menu"
          onClick={(event) => popup(0, event.currentTarget)}
        >
          <img src={appIcon} alt="" draggable={false} width={16} height={16} />
        </button>
        {compact ? (
          <button
            type="button"
            className="titlebar-menu titlebar-menu-compact"
            aria-label="菜单"
            title="菜单"
            aria-haspopup="menu"
            onClick={(event) => popup(null, event.currentTarget)}
          >
            <Icon name="menu" />
          </button>
        ) : (
          <div className="titlebar-menus" role="menubar" aria-label="应用菜单" onKeyDown={menuKeys}>
            {titles.slice(1).map((label, offset) => (
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="titlebar-menu"
                key={label}
                tabIndex={offset === 0 ? 0 : -1}
                onClick={(event) => popup(offset + 1, event.currentTarget)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {controls && titleFrame && (
        <div
          className="titlebar-title"
          style={{ left: titleFrame.left, width: titleFrame.width }}
          title={title}
        >
          {props.onRename ? (
            <button
              type="button"
              className="titlebar-title-button"
              aria-label={`重命名文稿：${title}`}
              aria-haspopup="dialog"
              aria-expanded={props.renaming === true}
              data-open={props.renaming || undefined}
              onClick={(event) => props.onRename?.(event.currentTarget)}
            >
              {props.hasFile && (
                <span className="titlebar-proxy" aria-hidden="true">
                  <Icon name="document" />
                </span>
              )}
              <span className="titlebar-name">{title}</span>
              {props.dirty && (
                <span className="titlebar-dirty" role="img" aria-label="未保存" title="未保存" />
              )}
              <span className="titlebar-title-chevron" aria-hidden="true">
                <Icon name="chevronDown" />
              </span>
            </button>
          ) : (
            <>
              {props.hasFile && (
                <span className="titlebar-proxy" aria-hidden="true">
                  <Icon name="document" />
                </span>
              )}
              <span className="titlebar-name">{title}</span>
              {props.dirty && (
                <span className="titlebar-dirty" role="img" aria-label="未保存" title="未保存" />
              )}
            </>
          )}
        </div>
      )}
      <div className="titlebar-trailing">
        {controls && (
          <div className="titlebar-actions" ref={actions}>
            {sourceMode ? (
              <button
                type="button"
                className="titlebar-source"
                aria-label="退出源代码模式"
                aria-pressed="true"
                onClick={props.onExitSource}
              >
                Source Mode ×
              </button>
            ) : (
              <>
                <StatisticsControl
                  statistics={statistics}
                  unit={statisticsUnit}
                  onUnit={onStatisticsUnit}
                  onError={onError}
                />
                <button
                  type="button"
                  className="titlebar-action"
                  aria-label="显示/隐藏文档目录"
                  title="显示/隐藏文档目录"
                  aria-pressed={props.outlineOpen}
                  disabled={props.disabled}
                  onClick={props.onOutline}
                >
                  <span className="titlebar-glyph titlebar-glyph-outline" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="titlebar-action"
                  aria-label="侧边栏"
                  title="侧边栏"
                  aria-expanded={props.sidebarOpen}
                  onClick={props.onSidebar}
                >
                  <span className="titlebar-glyph titlebar-glyph-sidebar" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="titlebar-action"
                  aria-label="AI 助手"
                  title="AI 助手"
                  data-accent=""
                  aria-pressed={props.aiOpen}
                  onClick={props.onAi}
                >
                  <Icon name="ai" />
                </button>
              </>
            )}
          </div>
        )}
        <CaptionButtons maximized={maximized} onError={onError} />
      </div>
    </header>
  );
}

function StatisticsControl(props: {
  statistics: TitlebarStatistics | null;
  unit: StatisticsUnit;
  onUnit: (unit: StatisticsUnit) => void;
  onError: (message: string) => void;
}) {
  const { statistics, unit, onUnit } = props;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const label = statisticsText(statistics, unit);
  const values = statistics ?? { words: 0, characters: 0, lines: 0, readingMinutes: 0 };

  useEffect(() => {
    if (!open) return;
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        if (!button.current?.contains(event.target)) setOpen(false);
      }
    };
    const blur = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('blur', blur);
    };
  }, [open]);

  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="titlebar-statistics">
      <button
        type="button"
        ref={button}
        className="titlebar-statistics-button"
        aria-label={`字数统计：${label}`}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div
          className="titlebar-popover"
          role="menu"
          aria-label="字数统计"
          ref={menu}
          onKeyDown={keys}
        >
          {statisticsOrder.map((entry) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={entry === unit}
              key={entry}
              onClick={() => {
                setOpen(false);
                onUnit(entry);
                button.current?.focus();
              }}
            >
              <span className="titlebar-popover-check" aria-hidden="true">
                {entry === unit && <Icon name="check" />}
              </span>
              {`${values[entry]} ${statisticsUnits[entry]}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CaptionButtons(props: { maximized: boolean; onError: (message: string) => void }) {
  const { maximized, onError } = props;
  const run = (work: Promise<unknown>, what: string) =>
    void work.catch((error: unknown) => onError(`${what}失败：${String(error)}`));
  return (
    <div className="titlebar-caption" role="toolbar" aria-label="窗口控制">
      <button
        type="button"
        className="titlebar-caption-button"
        aria-label="最小化"
        title="最小化"
        onClick={() => run(getCurrentWindow().minimize(), '最小化窗口')}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button
        type="button"
        className="titlebar-caption-button"
        aria-label={maximized ? '还原' : '最大化'}
        title={maximized ? '还原' : '最大化'}
        onClick={() => run(getCurrentWindow().toggleMaximize(), '切换窗口大小')}
      >
        {maximized ? (
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.5 2.5v-2h7v7h-2 M0.5 2.5h7v7h-7z" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0.5 0.5h9v9h-9z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="titlebar-caption-button titlebar-caption-close"
        aria-label="关闭"
        title="关闭"
        onClick={() => run(getCurrentWindow().close(), '关闭窗口')}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10 M10 0L0 10" />
        </svg>
      </button>
    </div>
  );
}

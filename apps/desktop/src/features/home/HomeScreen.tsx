import { listen } from '@tauri-apps/api/event';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { SkeletonRows } from '../../components/Skeleton.js';
import { displayPath } from '../../services/display-path.js';
import { desktopAvailable } from '../../services/documents.js';
import { type RecentFile, recentFiles } from '../../services/recent.js';
import { relativeTime } from '../quick-open/quick-open-model.js';
import './home-screen.css';

const SHOWN = 6;

/** A greeting that follows the clock, in the voice of a quiet notebook. */
export function greeting(hour: number): { title: string; hint: string } {
  if (hour >= 5 && hour < 11)
    return {
      title: '早上好，开始新的一天',
      hint: '从上次停下的地方继续，或写下今天的第一个想法。',
    };
  if (hour >= 11 && hour < 14)
    return { title: '午安，来点灵感', hint: '从上次停下的地方继续，或开始写点新东西。' };
  if (hour >= 14 && hour < 18)
    return { title: '下午好，继续推进', hint: '回到手头的笔记，或为新的想法留一页。' };
  if (hour >= 18 && hour < 23)
    return { title: '晚上好，收拢今天的思路', hint: '整理今天的记录，或为明天先写几行。' };
  return { title: '夜深了，记下最后的想法', hint: '写完就休息吧，笔记会替你记住。' };
}

const stem = (name: string) => name.replace(/\.(md|markdown|mdx|mkd|mdown|txt|text)$/i, '');
function where(entry: RecentFile): string {
  const parts = displayPath(entry.path).replaceAll('\\', '/').split('/').filter(Boolean);
  return parts.slice(-3, -1).join(' › ');
}

export interface HomeScreenProps {
  /** ⌘ instead of Ctrl in the shortcut hints. */
  mac: boolean;
  /** Start writing a new note in this window. */
  onNew(): void;
  /** Open the search window on its notes tab. */
  onOpenNote(): void;
  onOpenRecent(id: string): void;
  /** The complete recent-files list. */
  onViewAll(): void;
  /** Today's 日程, when it is enabled and a folder is open. */
  today?: ReactNode;
}

/** What the window shows before any document is open: where to start and what was last open. */
export function HomeScreen(props: HomeScreenProps) {
  const { mac, onNew, onOpenNote, onOpenRecent, onViewAll, today } = props;
  const [entries, setEntries] = useState<RecentFile[] | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const { title, hint } = greeting(new Date().getHours());
  const mod = mac ? '⌘' : 'Ctrl';

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void recentFiles.list().then(
        (listing) => {
          if (alive) setEntries(listing.entries);
        },
        () => {
          if (alive) setEntries([]);
        },
      );
    refresh();
    const stop = desktopAvailable ? listen('recent-files-changed', refresh) : null;
    return () => {
      alive = false;
      void stop?.then((unlisten) => unlisten());
    };
  }, []);
  // Keyboard focus rests on the home itself so Enter starts a note and Tab reaches the buttons.
  // A control the person focused while the app was loading keeps its focus.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) root.current?.focus({ preventScroll: true });
  }, []);

  const recent = [...(entries ?? [])].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focus target for Enter, not a form control.
    <div
      className="home-screen"
      ref={root}
      tabIndex={-1}
      role="region"
      aria-label="开始"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault();
          onNew();
        }
      }}
    >
      <div className="home-column">
        <header className="home-header">
          <div className="home-heading">
            <h1>{title}</h1>
            <p>{hint}</p>
          </div>
          <div className="home-actions">
            <button type="button" className="home-action" onClick={onNew}>
              <span>新建笔记</span>
              <kbd>{mac ? `${mod}N` : `${mod} N`}</kbd>
            </button>
            <button type="button" className="home-action" onClick={onOpenNote}>
              <span>打开笔记</span>
              <kbd>{mac ? `${mod}⇧P` : `${mod} Shift P`}</kbd>
            </button>
          </div>
        </header>
        {today}
        <section className="home-section" aria-labelledby="home-recent">
          <div className="home-section-head">
            <h2 id="home-recent">最近查看</h2>
            {recent.length > 0 && (
              <button type="button" className="home-link" onClick={onViewAll}>
                查看全部
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            entries === null ? (
              <SkeletonRows
                className="home-recent home-recent-skeleton"
                rows={3}
                icon
                height={40}
                label="正在读取最近查看"
              />
            ) : (
              <div className="home-empty">最近打开的笔记会显示在这里。</div>
            )
          ) : (
            <ul className="home-recent">
              {recent.slice(0, SHOWN).map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(entry.id)}
                    title={displayPath(entry.path)}
                  >
                    <span className="home-recent-icon" aria-hidden="true">
                      <Icon name="document" />
                    </span>
                    <span className="home-recent-name">{stem(entry.name)}</span>
                    <span className="home-recent-where">{where(entry)}</span>
                    <time
                      className="home-recent-time"
                      dateTime={new Date(entry.lastOpenedAt).toISOString()}
                    >
                      {relativeTime(entry.lastOpenedAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

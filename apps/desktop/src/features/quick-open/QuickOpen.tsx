import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../components/Icon.js';
import { SkeletonRows } from '../../components/Skeleton.js';
import {
  arrange,
  flatten,
  type QuickItem,
  type QuickTab,
  quickTabs,
  segments,
} from './quick-open-model.js';
import './quick-open.css';

export interface QuickOpenProps {
  initialTab: QuickTab;
  /** Actions, workspace and settings entries; always ready. */
  items: readonly QuickItem[];
  /** Notes of the open folder and recent files; null while they are being read. */
  notes: readonly QuickItem[] | null;
  /** Why the note list may be incomplete. */
  notesHint?: string;
  /** Days understood from the query (今天, 下周一, 10-21); absent when 日程 is unavailable. */
  dates?: ((query: string, tab: QuickTab) => QuickItem[]) | undefined;
  /** Closes the window; the host decides where focus goes. */
  onClose(): void;
}

/** One search window for notes and commands: type to filter, ↑↓ to move, Enter to open. */
export function QuickOpen(props: QuickOpenProps) {
  const { initialTab, items, notes, notesHint, dates, onClose } = props;
  const tabs = useMemo(
    () => (dates ? quickTabs : quickTabs.filter((entry) => entry.id !== 'date')),
    [dates],
  );
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<QuickTab>(initialTab);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const composing = useRef(false);

  const groups = useMemo(
    () => arrange([...(dates?.(query, tab) ?? []), ...(notes ?? []), ...items], query, tab),
    [dates, notes, items, query, tab],
  );
  const flat = useMemo(() => flatten(groups), [groups]);
  const loadingNotes = notes === null && (tab === 'note' || tab === 'all');

  useEffect(() => {
    input.current?.focus();
  }, []);
  // A new list starts at its first entry; the entry under the pointer is not remembered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: query and tab are what reset the selection.
  useEffect(() => setActive(0), [query, tab]);
  // Keep the entry the keyboard moved to in view; a new list re-renders the same rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list and selection are what move the entry.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, groups]);

  const run = (index: number) => {
    const result = flat[index];
    if (!result) return;
    onClose();
    result.item.run();
  };
  const step = (delta: number) => {
    if (flat.length) setActive((value) => (value + delta + flat.length) % flat.length);
  };
  const cycleTab = (delta: number) => {
    const index = tabs.findIndex((entry) => entry.id === tab);
    setTab(tabs[(index + delta + tabs.length) % tabs.length]?.id ?? 'all');
  };
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        step(-1);
        break;
      case 'Home':
      case 'End':
        // Caret movement inside the field stays with the field; the list follows only with Ctrl.
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          setActive(event.key === 'Home' ? 0 : Math.max(0, flat.length - 1));
        }
        break;
      case 'Enter':
        event.preventDefault();
        run(active);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
      case 'Tab':
        event.preventDefault();
        cycleTab(event.shiftKey ? -1 : 1);
        break;
    }
  };

  let index = -1;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a press on the scrim only dismisses; Escape is the keyboard path.
    <div
      className="quick-open-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="quick-open"
        role="dialog"
        aria-modal="true"
        aria-label="快速打开"
        onKeyDown={keys}
      >
        <label className="quick-open-field">
          <Icon name="search" />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-open-list"
            aria-activedescendant={flat[active] ? `quick-open-${flat[active].item.id}` : undefined}
            aria-label="输入命令或搜索"
            placeholder={
              dates ? '输入命令、搜索笔记或日期（如 明天、下周一、10-21）…' : '输入命令或搜索笔记…'
            }
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
          />
        </label>
        <div className="quick-open-tabs" role="tablist" aria-label="范围">
          {tabs.map((entry) => (
            <button
              type="button"
              role="tab"
              key={entry.id}
              tabIndex={-1}
              aria-selected={entry.id === tab}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="quick-open-list" id="quick-open-list" role="listbox" ref={list}>
          {groups.map((group) => (
            <div className="quick-open-group" key={group.kind} role="presentation">
              <div className="quick-open-heading" role="presentation">
                {group.label}
              </div>
              {group.results.map((result) => {
                index += 1;
                const position = index;
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: options are chosen from the combobox field with the arrow keys and Enter.
                  <div
                    key={result.item.id}
                    id={`quick-open-${result.item.id}`}
                    className="quick-open-row"
                    role="option"
                    tabIndex={-1}
                    aria-selected={position === active}
                    onMouseMove={() => position !== active && setActive(position)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => run(position)}
                  >
                    <span className="quick-open-icon" aria-hidden="true">
                      <Icon name={result.item.icon} />
                    </span>
                    <span className="quick-open-title">
                      {segments(result.item.title, result.ranges).map((part, at) =>
                        part.hit ? (
                          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional and never reorder.
                          <mark key={at}>{part.text}</mark>
                        ) : (
                          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional and never reorder.
                          <span key={at}>{part.text}</span>
                        ),
                      )}
                    </span>
                    {result.item.detail && (
                      <span className="quick-open-detail">{result.item.detail}</span>
                    )}
                    {result.item.shortcut && (
                      <kbd className="quick-open-shortcut">{result.item.shortcut}</kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {!flat.length &&
            (loadingNotes ? (
              <SkeletonRows rows={5} icon label="正在读取笔记" />
            ) : (
              <div className="quick-open-empty" role="status">
                {query.trim() ? '没有匹配的结果' : '这里还没有内容'}
              </div>
            ))}
          {loadingNotes && flat.length > 0 && <SkeletonRows rows={2} icon label="正在读取笔记" />}
          {notesHint && (tab === 'note' || tab === 'all') && (
            <div className="quick-open-hint">{notesHint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

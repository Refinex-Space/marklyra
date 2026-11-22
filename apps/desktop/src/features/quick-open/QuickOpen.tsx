import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
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
  /** Closes the window; the host decides where focus goes. */
  onClose(): void;
}

/** One search window for notes and commands: type to filter, ↑↓ to move, Enter to open. */
export function QuickOpen(props: QuickOpenProps) {
  const { initialTab, items, notes, notesHint, onClose } = props;
  const tabs = quickTabs;
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<QuickTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const composing = useRef(false);

  const groups = useMemo(
    () => arrange([...(notes ?? []), ...items], query, tab),
    [notes, items, query, tab],
  );
  const flat = useMemo(() => flatten(groups), [groups]);
  const firstId = flat[0]?.item.id;
  const activeId = selectedId ?? firstId;
  const active = flat.findIndex(({ item }) => item.id === activeId);
  const current = flat[active]?.item;
  const loadingNotes = notes === null && (tab === 'note' || tab === 'all');

  useEffect(() => {
    input.current?.focus();
  }, []);
  // On first opening, recent notes take priority as soon as they load. A query or tab
  // change (null) selects its first available match even while notes are pending.
  useLayoutEffect(() => {
    if (selectedId == null && firstId && (selectedId === null || !loadingNotes))
      setSelectedId(firstId);
  }, [firstId, loadingNotes, selectedId]);
  // Keep the entry the keyboard moved to in view; a new list re-renders the same rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list and selection are what move the entry.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, groups]);

  const run = (item: QuickItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };
  const step = (delta: number) => {
    if (!flat.length) return;
    const from = active < 0 && delta < 0 ? 0 : active;
    setSelectedId(flat[(from + delta + flat.length) % flat.length]?.item.id);
  };
  const chooseTab = (next: QuickTab) => {
    if (tab === next) return;
    setSelectedId(null);
    setTab(next);
  };
  const cycleTab = (delta: number) => {
    const index = tabs.findIndex((entry) => entry.id === tab);
    chooseTab(tabs[(index + delta + tabs.length) % tabs.length]?.id ?? 'all');
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
          setSelectedId((event.key === 'Home' ? flat[0] : flat.at(-1))?.item.id);
        }
        break;
      case 'Enter':
        event.preventDefault();
        run(current);
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
            aria-activedescendant={current ? `quick-open-${current.id}` : undefined}
            aria-label="输入命令或搜索"
            placeholder="输入命令或搜索笔记…"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setSelectedId(null);
              setQuery(event.target.value);
            }}
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
              onClick={() => chooseTab(entry.id)}
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
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: options are chosen from the combobox field with the arrow keys and Enter.
                  <div
                    key={result.item.id}
                    id={`quick-open-${result.item.id}`}
                    className="quick-open-row"
                    role="option"
                    tabIndex={-1}
                    aria-selected={result.item.id === current?.id}
                    onMouseMove={() => setSelectedId(result.item.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => run(result.item)}
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

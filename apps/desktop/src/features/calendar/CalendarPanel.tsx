import { LogicalPosition } from '@tauri-apps/api/dpi';
import { Menu } from '@tauri-apps/api/menu';
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../components/Icon.js';
import type { DailyLocation } from '../../services/daily.js';
import { desktopAvailable } from '../../services/documents.js';
import type { EntryAction } from '../../services/entry-actions.js';
import { type FileSidebarPlatform, revealLabel } from '../file-explorer/file-preferences.js';
import { WorkspaceEntryMenu } from '../file-explorer/WorkspaceEntryMenu.js';
import { type Agenda, orderedAgenda, parseAgenda } from './daily-agenda.js';
import {
  addDays,
  addMonths,
  dayLabel,
  daysInMonth,
  formatDayKey,
  lunarCellLabel,
  lunarLabel,
  monthGrid,
  monthLabel,
  parseDayKey,
  relativeDayLabel,
  startOfWeek,
  weekday,
  weekdayName,
  weekdayOrder,
  weekKey,
  weekLabel,
  weekRow,
} from './daily-dates.js';
import {
  type CalendarView,
  type DailyPreferences,
  effectiveWeekStart,
} from './daily-preferences.js';
import { type DayNote, useDailyNotes } from './useDailyNotes.js';
import './calendar.css';

export interface CalendarPanelProps {
  location: DailyLocation;
  preferences: DailyPreferences;
  onPreferencesChange(next: DailyPreferences): void;
  today: string;
  /** The day or week whose note (or unsaved draft) is open in the editor. */
  activeKey: string | null;
  /** Editor text of the open note, so its marks follow typing before it is saved. */
  liveText?: { key: string; text: string } | null | undefined;
  refresh: number;
  platform: FileSidebarPlatform;
  disabled: boolean;
  onOpen(key: string): void;
  onEntryAction(relativePath: string, action: EntryAction): void;
}
interface MenuItem {
  id: string;
  label: string;
  run?: (() => void) | undefined;
}
interface MenuRequest {
  x: number;
  y: number;
  items: (MenuItem | 'separator')[];
  version: number;
}

function sameMonth(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7);
}
/** Keeps the day of month where possible: 31 Jan + 1 month is 28/29 Feb. */
function shiftMonth(key: string, months: number): string {
  const parts = parseDayKey(key);
  if (!parts) return key;
  const next = addMonths(parts.year, parts.month, months);
  return formatDayKey({ ...next, day: Math.min(parts.day, daysInMonth(next.year, next.month)) });
}
function agendaSummary(agenda: Agenda | null): string {
  if (!agenda) return '已记录';
  if (!agenda.open && !agenda.done) return '已记录';
  return agenda.open
    ? `${agenda.open} 项待办，已完成 ${agenda.done}`
    : `${agenda.done} 项已全部完成`;
}

export function CalendarPanel({
  location,
  preferences,
  onPreferencesChange,
  today,
  activeKey,
  liveText,
  refresh,
  platform,
  disabled,
  onOpen,
  onEntryAction,
}: CalendarPanelProps) {
  const weekStart = effectiveWeekStart(preferences.weekStart);
  const view = preferences.calendarView;
  const activeDay = activeKey && parseDayKey(activeKey) ? activeKey : null;
  const [cursor, setCursor] = useState(activeDay ?? today);
  const [picker, setPicker] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  const focusCursor = useRef(false);
  const menuVersion = useRef(0);

  // Follow a note opened elsewhere (quick open, menu), and carry “today” over midnight.
  useEffect(() => {
    if (activeDay) setCursor(activeDay);
  }, [activeDay]);
  const previousToday = useRef(today);
  useEffect(() => {
    const before = previousToday.current;
    previousToday.current = today;
    if (before !== today) setCursor((value) => (value === before ? today : value));
  }, [today]);
  useEffect(() => {
    if (!focusCursor.current) return;
    focusCursor.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-key="${cursor}"]`)?.focus();
  }, [cursor]);

  const cursorParts = parseDayKey(cursor) ?? { year: 1970, month: 1, day: 1 };
  const rowStart = startOfWeek(cursor, weekStart);
  const weeks = useMemo(
    () =>
      view === 'month'
        ? monthGrid(cursorParts.year, cursorParts.month, weekStart)
        : [weekRow(rowStart, weekStart)],
    [view, cursorParts.year, cursorParts.month, rowStart, weekStart],
  );
  const keys = useMemo(() => {
    if (view === 'collapsed') return [today];
    const days = weeks.flatMap((week) => week.days.map((day) => day.key));
    return preferences.weekly ? [...days, ...weeks.map((week) => week.week)] : days;
  }, [view, weeks, today, preferences.weekly]);
  const { notes, status, error, retry } = useDailyNotes(
    preferences.enabled ? location : null,
    keys,
    refresh,
  );
  const liveAgenda = useMemo(
    () => (liveText ? { key: liveText.key, agenda: parseAgenda(liveText.text) } : null),
    [liveText?.key, liveText?.text, liveText],
  );
  const lookup = (key: string): { note: DayNote | undefined; agenda: Agenda | null } => {
    const note = notes.get(key);
    if (note && liveAgenda?.key === key) return { note, agenda: liveAgenda.agenda };
    return { note, agenda: note?.agenda ?? null };
  };

  const changeView = (next: CalendarView) =>
    onPreferencesChange({
      ...preferences,
      calendarView: next,
      expandedView: next === 'collapsed' ? preferences.expandedView : next,
    });
  const step = (direction: -1 | 1) =>
    setCursor((value) =>
      view === 'month' ? shiftMonth(value, direction) : addDays(value, direction * 7),
    );
  const showsToday =
    view === 'collapsed' ||
    (view === 'month' ? sameMonth(cursor, today) : rowStart === startOfWeek(today, weekStart));
  const title =
    view === 'collapsed'
      ? '日程'
      : view === 'month'
        ? monthLabel(cursorParts.year, cursorParts.month)
        : rowStart === startOfWeek(today, weekStart)
          ? `本周 · ${weekLabel(weekKey(today)).replace(/^\d+年/, '')}`
          : weekLabel(weekKey(addDays(rowStart, 3)));

  const tooltip = (key: string) => {
    const lines = [`${dayLabel(key, true)} · ${relativeDayLabel(key, today)}`];
    const lunar = preferences.lunar === 'off' ? '' : lunarLabel(key);
    if (lunar) lines.push(lunar);
    const { note, agenda } = lookup(key);
    if (!note)
      lines.push(key === activeKey ? '正在编辑，输入内容后保存' : '尚无日程，点击开始记录');
    else {
      lines.push(agendaSummary(agenda));
      for (const item of orderedAgenda(agenda?.items ?? [])
        .filter((value) => value.checked !== true)
        .slice(0, 5))
        lines.push(
          `${item.start ? `${item.start}${item.end ? `–${item.end}` : ''}` : '·'} ${item.text}`,
        );
    }
    return lines.join('\n');
  };
  const accessibleLabel = (key: string) => {
    const { note, agenda } = lookup(key);
    return [
      dayLabel(key, true),
      key === today ? '今天' : '',
      note ? `有日程，${agendaSummary(agenda)}` : '无日程',
    ]
      .filter(Boolean)
      .join('，');
  };

  const open = (key: string, event?: MouseEvent) => {
    if (disabled) return;
    const note = notes.get(key);
    if (note && event && (event.ctrlKey || event.metaKey)) {
      onEntryAction(note.relativePath, 'open-new');
      return;
    }
    setCursor(parseDayKey(key) ? key : cursor);
    onOpen(key);
  };
  const showMenu = async (key: string, x: number, y: number) => {
    if (disabled) return;
    const note = notes.get(key);
    const ticket = ++menuVersion.current;
    const items: (MenuItem | 'separator')[] = [
      { id: 'open', label: note ? '打开' : '开始记录', run: () => open(key) },
      ...(note
        ? [
            {
              id: 'open-new',
              label: '在新窗口中打开',
              run: () => onEntryAction(note.relativePath, 'open-new'),
            },
            'separator' as const,
            {
              id: 'copy-path',
              label: '复制文件路径',
              run: () => onEntryAction(note.relativePath, 'copy-path'),
            },
            {
              id: 'reveal',
              label: revealLabel(platform),
              run: () => onEntryAction(note.relativePath, 'reveal'),
            },
          ]
        : []),
    ];
    setMenu(null);
    if (desktopAvailable && platform === 'macos') {
      try {
        const native = await Menu.new({
          items: items.map((item) =>
            item === 'separator'
              ? { item: 'Separator' as const }
              : { id: item.id, text: item.label, enabled: !!item.run, action: () => item.run?.() },
          ),
        });
        if (menuVersion.current !== ticket) return void native.close();
        await native.popup(new LogicalPosition(x, y));
        return;
      } catch {
        // Browser doubles have no native menus; fall back to the shared web menu.
      }
    }
    if (menuVersion.current === ticket) setMenu({ x, y, items, version: ticket });
  };
  const dismissMenu = useCallback(() => setMenu(null), []);

  const onGridKey = (event: KeyboardEvent<HTMLTableElement>) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      Home: () => startOfWeek(cursor, weekStart),
      End: () => addDays(startOfWeek(cursor, weekStart), 6),
      PageUp: () => shiftMonth(cursor, event.shiftKey ? -12 : -1),
      PageDown: () => shiftMonth(cursor, event.shiftKey ? 12 : 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusCursor.current = true;
    setCursor(move());
  };

  const pickerYear = picker ?? cursorParts.year;
  const order = weekdayOrder(weekStart);
  const weekNumbers = preferences.showWeekNumbers;
  const errorText = `无法读取日程目录：${error}`;
  const todayAgenda = lookup(today);

  return (
    <section
      className="daily-calendar"
      data-view={view}
      data-week-numbers={weekNumbers || undefined}
      aria-label="日程日历"
    >
      <header className="daily-calendar-header">
        {view === 'collapsed' ? (
          <span className="daily-calendar-title">日程</span>
        ) : (
          <button
            type="button"
            className="daily-calendar-title"
            aria-expanded={picker !== null}
            aria-label={`${title}，选择年月`}
            onClick={() => setPicker(picker === null ? cursorParts.year : null)}
          >
            {title}
            <Icon name={picker === null ? 'chevronDown' : 'chevronUp'} />
          </button>
        )}
        <div className="daily-calendar-actions">
          {status === 'error' && (
            <button
              type="button"
              className="daily-calendar-warning"
              title={`${errorText}\n点击重试`}
              aria-label={`${errorText}。重试`}
              onClick={retry}
            >
              <Icon name="warning" />
            </button>
          )}
          {view !== 'collapsed' && (
            <>
              <button
                type="button"
                aria-label={view === 'month' ? '上个月' : '上一周'}
                title={view === 'month' ? '上个月' : '上一周'}
                onClick={() => step(-1)}
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                type="button"
                aria-label={view === 'month' ? '下个月' : '下一周'}
                title={view === 'month' ? '下个月' : '下一周'}
                onClick={() => step(1)}
              >
                <Icon name="chevronRight" />
              </button>
              {!showsToday && (
                <button
                  type="button"
                  className="daily-calendar-today"
                  title="回到今天"
                  onClick={() => {
                    setPicker(null);
                    setCursor(today);
                  }}
                >
                  今天
                </button>
              )}
              <button
                type="button"
                aria-label={view === 'month' ? '切换为周视图' : '切换为月视图'}
                title={view === 'month' ? '切换为周视图' : '切换为月视图'}
                onClick={() => changeView(view === 'month' ? 'week' : 'month')}
              >
                <Icon name={view === 'month' ? 'calendarWeek' : 'calendar'} />
              </button>
            </>
          )}
          <button
            type="button"
            aria-expanded={view !== 'collapsed'}
            aria-label={view === 'collapsed' ? '展开日历' : '收起日历'}
            title={view === 'collapsed' ? '展开日历' : '收起日历'}
            onClick={() =>
              changeView(view === 'collapsed' ? preferences.expandedView : 'collapsed')
            }
          >
            <Icon name={view === 'collapsed' ? 'chevronUp' : 'chevronDown'} />
          </button>
        </div>
      </header>
      {view === 'collapsed' && (
        <button
          type="button"
          className="daily-calendar-summary"
          data-selected={activeKey === today || undefined}
          title={tooltip(today)}
          disabled={disabled}
          onClick={() => open(today)}
        >
          <span>今天 · {dayLabel(today)}</span>
          {todayAgenda.note && todayAgenda.agenda?.open ? (
            <span className="daily-calendar-summary-count">{todayAgenda.agenda.open} 项待办</span>
          ) : null}
        </button>
      )}
      {view !== 'collapsed' && picker !== null && (
        <div className="daily-calendar-picker">
          <div className="daily-calendar-picker-year">
            <button type="button" aria-label="上一年" onClick={() => setPicker(pickerYear - 1)}>
              <Icon name="chevronLeft" />
            </button>
            <span>{pickerYear}年</span>
            <button type="button" aria-label="下一年" onClick={() => setPicker(pickerYear + 1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
          <div className="daily-calendar-months">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <button
                type="button"
                key={month}
                aria-pressed={pickerYear === cursorParts.year && month === cursorParts.month}
                data-current={
                  `${pickerYear}-${String(month).padStart(2, '0')}` === today.slice(0, 7) ||
                  undefined
                }
                onClick={() => {
                  setPicker(null);
                  setCursor(
                    formatDayKey({
                      year: pickerYear,
                      month,
                      day: Math.min(cursorParts.day, daysInMonth(pickerYear, month)),
                    }),
                  );
                }}
              >
                {month}月
              </button>
            ))}
          </div>
        </div>
      )}
      {view !== 'collapsed' && picker === null && (
        // A real table carries the row/column relations; arrows move between the day buttons.
        <table className="daily-calendar-grid" aria-label={title} ref={grid} onKeyDown={onGridKey}>
          <thead>
            <tr className="daily-calendar-row daily-calendar-weekdays">
              {weekNumbers && (
                <th scope="col" className="daily-calendar-week" title="ISO 周数" abbr="周数">
                  周
                </th>
              )}
              {order.map((day) => (
                <th scope="col" key={day} data-weekend={day === 0 || day === 6 || undefined}>
                  {weekdayName(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr className="daily-calendar-row" key={week.week}>
                {weekNumbers && (
                  <th scope="row" className="daily-calendar-week" title={weekLabel(week.week)}>
                    {preferences.weekly ? (
                      <button
                        type="button"
                        data-note={notes.has(week.week) || undefined}
                        data-selected={activeKey === week.week || undefined}
                        aria-label={`${weekLabel(week.week)}，打开周记`}
                        title={`${weekLabel(week.week)}，打开周记`}
                        tabIndex={-1}
                        onClick={() => open(week.week)}
                      >
                        {week.number}
                      </button>
                    ) : (
                      week.number
                    )}
                  </th>
                )}
                {week.days.map((day) => {
                  const { note, agenda } = lookup(day.key);
                  const mark =
                    preferences.markOpenTasks && agenda?.open
                      ? 'open'
                      : preferences.markNotes && note
                        ? 'note'
                        : undefined;
                  return (
                    <td key={day.key}>
                      <button
                        type="button"
                        className="daily-day"
                        data-key={day.key}
                        data-today={day.key === today || undefined}
                        data-selected={day.key === activeKey || undefined}
                        data-outside={(view === 'month' && !day.inMonth) || undefined}
                        data-weekend={[0, 6].includes(weekday(day.key)) || undefined}
                        aria-current={day.key === today ? 'date' : undefined}
                        aria-pressed={day.key === activeKey}
                        aria-label={accessibleLabel(day.key)}
                        aria-disabled={disabled || undefined}
                        title={tooltip(day.key)}
                        tabIndex={day.key === cursor ? 0 : -1}
                        onFocus={() => setCursor(day.key)}
                        onClick={(event) => open(day.key, event)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          void showMenu(day.key, event.clientX, event.clientY);
                        }}
                      >
                        <span className="daily-day-number">{day.day}</span>
                        {preferences.lunar === 'cell' && (
                          <span className="daily-day-lunar">{lunarCellLabel(day.key)}</span>
                        )}
                        <span className="daily-day-mark" data-mark={mark} aria-hidden="true" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <WorkspaceEntryMenu request={menu} dismiss={dismissMenu} />
    </section>
  );
}

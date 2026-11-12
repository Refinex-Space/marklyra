import { LogicalPosition } from '@tauri-apps/api/dpi';
import { Menu } from '@tauri-apps/api/menu';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { desktopAvailable } from '../../services/documents.js';
import type { TaskMeta } from '../../services/tasks.js';
import type { FileSidebarPlatform } from '../file-explorer/file-preferences.js';
import { WorkspaceEntryMenu } from '../file-explorer/WorkspaceEntryMenu.js';
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
} from './calendar-dates.js';
import {
  type CalendarPreferences,
  type CalendarView,
  effectiveWeekStart,
} from './calendar-preferences.js';
import type { TaskAgenda } from './useTaskAgenda.js';
import './calendar.css';

export interface CalendarPanelProps {
  agenda: TaskAgenda;
  preferences: CalendarPreferences;
  onPreferencesChange(next: CalendarPreferences): void;
  today: string;
  /** The day whose due tasks the workbench is showing. */
  activeDay: string | null;
  platform: FileSidebarPlatform;
  disabled: boolean;
  /** Shows the tasks due that day in the workbench. */
  onOpenDay(day: string): void;
  /** Starts a new task due that day. */
  onNewTask(day: string): void;
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
interface DayTasks {
  tasks: readonly TaskMeta[];
  open: readonly TaskMeta[];
  done: number;
}
function daySummary({ open, done }: DayTasks): string {
  if (!open.length) return `${done} 项到期任务已全部完成`;
  return done ? `${open.length} 项未完成，已完成 ${done}` : `${open.length} 项未完成`;
}

export function CalendarPanel({
  agenda,
  preferences,
  onPreferencesChange,
  today,
  activeDay,
  platform,
  disabled,
  onOpenDay,
  onNewTask,
}: CalendarPanelProps) {
  const weekStart = effectiveWeekStart(preferences.weekStart);
  const view = preferences.calendarView;
  const { catalog, status, error, retry } = agenda;
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
  const lookup = (key: string): DayTasks => {
    const due = agenda.byDay.get(key) ?? [];
    const open = catalog ? due.filter((task) => catalog.isOpen(task)) : [];
    return { tasks: due, open, done: due.length - open.length };
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
      ? '日历'
      : view === 'month'
        ? monthLabel(cursorParts.year, cursorParts.month)
        : rowStart === startOfWeek(today, weekStart)
          ? `本周 · ${weekLabel(weekKey(today)).replace(/^\d+年/, '')}`
          : weekLabel(weekKey(addDays(rowStart, 3)));

  const tooltip = (key: string) => {
    const lines = [`${dayLabel(key, true)} · ${relativeDayLabel(key, today)}`];
    const lunar = preferences.lunar === 'off' ? '' : lunarLabel(key);
    if (lunar) lines.push(lunar);
    const day = lookup(key);
    if (!day.tasks.length) lines.push('没有到期的任务');
    else {
      lines.push(daySummary(day));
      for (const task of day.open.slice(0, 5))
        lines.push(`${catalog?.humanId(task) ?? ''} ${task.title}`.trim());
      if (day.open.length > 5) lines.push(`…另有 ${day.open.length - 5} 项`);
    }
    return lines.join('\n');
  };
  const accessibleLabel = (key: string) => {
    const day = lookup(key);
    return [
      dayLabel(key, true),
      key === today ? '今天' : '',
      day.tasks.length ? daySummary(day) : '没有到期的任务',
    ]
      .filter(Boolean)
      .join('，');
  };

  const open = (key: string) => {
    if (disabled) return;
    setCursor(key);
    onOpenDay(key);
  };
  const showMenu = async (key: string, x: number, y: number) => {
    if (disabled) return;
    const ticket = ++menuVersion.current;
    const items: (MenuItem | 'separator')[] = [
      { id: 'open', label: '查看当天任务', run: () => open(key) },
      { id: 'new', label: '新建当天到期的任务', run: () => onNewTask(key) },
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
  const errorText = `无法读取任务：${error}`;
  const todayTasks = lookup(today);

  return (
    <section
      className="daily-calendar"
      data-view={view}
      data-week-numbers={weekNumbers || undefined}
      aria-label="日历"
    >
      <header className="daily-calendar-header">
        {view === 'collapsed' ? (
          <span className="daily-calendar-title">日历</span>
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
          data-selected={activeDay === today || undefined}
          title={tooltip(today)}
          disabled={disabled}
          onClick={() => open(today)}
        >
          <span>今天 · {dayLabel(today)}</span>
          {todayTasks.open.length ? (
            <span className="daily-calendar-summary-count">{todayTasks.open.length} 项到期</span>
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
                    {week.number}
                  </th>
                )}
                {week.days.map((day) => {
                  const due = lookup(day.key);
                  const mark = !preferences.markTasks
                    ? undefined
                    : due.open.length
                      ? day.key < today
                        ? 'overdue'
                        : 'open'
                      : due.tasks.length
                        ? 'done'
                        : undefined;
                  return (
                    <td key={day.key}>
                      <button
                        type="button"
                        className="daily-day"
                        data-key={day.key}
                        data-today={day.key === today || undefined}
                        data-selected={day.key === activeDay || undefined}
                        data-outside={(view === 'month' && !day.inMonth) || undefined}
                        data-weekend={[0, 6].includes(weekday(day.key)) || undefined}
                        aria-current={day.key === today ? 'date' : undefined}
                        aria-pressed={day.key === activeDay}
                        aria-label={accessibleLabel(day.key)}
                        aria-disabled={disabled || undefined}
                        title={tooltip(day.key)}
                        tabIndex={day.key === cursor ? 0 : -1}
                        onFocus={() => setCursor(day.key)}
                        onClick={() => open(day.key)}
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

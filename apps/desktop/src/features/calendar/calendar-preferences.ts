import { systemWeekStart, type WeekStart } from './calendar-dates.js';

export type CalendarView = 'month' | 'week' | 'collapsed';
export type WeekStartPreference = 'system' | 'monday' | 'sunday';
export type LunarDisplay = 'off' | 'hover' | 'cell';
/** The sidebar calendar: a view of task due dates, stored with the shell preferences. */
export interface CalendarPreferences {
  enabled: boolean;
  calendarView: CalendarView;
  /** The expanded form to return to when the collapsed calendar is reopened. */
  expandedView: Exclude<CalendarView, 'collapsed'>;
  weekStart: WeekStartPreference;
  showWeekNumbers: boolean;
  /** Dots under days that have tasks due. */
  markTasks: boolean;
  lunar: LunarDisplay;
}
export const defaultCalendarPreferences: Readonly<CalendarPreferences> = Object.freeze({
  enabled: true,
  calendarView: 'week',
  expandedView: 'week',
  weekStart: 'system',
  showWeekNumbers: true,
  markTasks: true,
  lunar: 'hover',
});

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
/** Also reads the retired 日程 settings, so the calendar keeps its form after the update. */
export function normalizeCalendarPreferences(value: unknown): CalendarPreferences {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const defaults = defaultCalendarPreferences;
  const flag = (key: string, fallback: boolean) =>
    typeof input[key] === 'boolean' ? (input[key] as boolean) : fallback;
  return {
    enabled: flag('enabled', defaults.enabled),
    calendarView: pick(
      input.calendarView,
      ['month', 'week', 'collapsed'] as const,
      defaults.calendarView,
    ),
    expandedView: pick(input.expandedView, ['month', 'week'] as const, defaults.expandedView),
    weekStart: pick(input.weekStart, ['system', 'monday', 'sunday'] as const, defaults.weekStart),
    showWeekNumbers: flag('showWeekNumbers', defaults.showWeekNumbers),
    markTasks: flag('markTasks', flag('markOpenTasks', defaults.markTasks)),
    lunar: pick(input.lunar, ['off', 'hover', 'cell'] as const, defaults.lunar),
  };
}

export function effectiveWeekStart(preference: WeekStartPreference): WeekStart {
  if (preference === 'monday') return 1;
  if (preference === 'sunday') return 0;
  return systemWeekStart();
}

import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isoWeek,
  lunarCellLabel,
  lunarLabel,
  monthGrid,
  parseDayKey,
  parseWeekKey,
  relativeDayLabel,
  startOfWeek,
  todayKey,
  weekday,
  weekKey,
  weekMonday,
  weekRow,
} from '../src/features/calendar/calendar-dates.js';
import {
  defaultCalendarPreferences,
  normalizeCalendarPreferences,
} from '../src/features/calendar/calendar-preferences.js';
import { normalizePreferences } from '../src/features/settings/preferences.js';
import { Catalog } from '../src/features/tasks/model/catalog.js';
import { matches, parseQuery } from '../src/features/tasks/model/query.js';
import type { TaskMeta, TaskSnapshot } from '../src/services/tasks.js';

describe('calendar date keys', () => {
  it('validates real dates and counts days across months, leap years and DST', () => {
    expect(parseDayKey('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseDayKey('2026-02-29')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('26-10-21')).toBeNull();
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    // Spans both European and US daylight-saving changes without skipping a date.
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(weekday('2026-10-21')).toBe(3);
    expect(todayKey(new Date(2026, 9, 21, 23, 59))).toBe('2026-10-21');
  });

  it('numbers ISO weeks by their Thursday, including year boundaries', () => {
    expect(weekKey('2026-10-21')).toBe('2026-W43');
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 });
    expect(parseWeekKey('2026-W53')).toEqual({ year: 2026, week: 53 });
    expect(parseWeekKey('2021-W53')).toBeNull();
    expect(weekMonday('2026-W43')).toBe('2026-10-19');
    expect(weekMonday('2026-W01')).toBe('2025-12-29');
  });

  it('lays a month out in six rows starting on the chosen weekday', () => {
    const monday = monthGrid(2026, 10, 1);
    expect(monday).toHaveLength(6);
    expect(monday[0]?.days[0]?.key).toBe('2026-09-28');
    expect(monday[0]?.number).toBe(40);
    expect(monday[0]?.days.filter((day) => day.inMonth).map((day) => day.day)).toEqual([
      1, 2, 3, 4,
    ]);
    const sunday = monthGrid(2026, 10, 0);
    expect(sunday[0]?.days[0]?.key).toBe('2026-09-27');
    // A Sunday-first row is named after the ISO week of its Monday.
    expect(sunday[0]?.week).toBe('2026-W40');
    expect(weekRow('2026-10-21', 1).days.map((day) => day.day)).toEqual([
      19, 20, 21, 22, 23, 24, 25,
    ]);
    expect(startOfWeek('2026-10-25', 1)).toBe('2026-10-19');
    expect(startOfWeek('2026-10-25', 0)).toBe('2026-10-25');
    expect(startOfWeek('2026-10-25', 6)).toBe('2026-10-24');
  });

  it('labels relative days and the Chinese calendar offline', () => {
    expect(relativeDayLabel('2026-10-20', '2026-10-21')).toBe('昨天');
    expect(relativeDayLabel('2026-10-28', '2026-10-21')).toBe('7 天后');
    expect(lunarLabel('2026-10-21')).toBe('农历九月十二');
    expect(lunarCellLabel('2026-10-10')).toBe('九月');
    expect(lunarCellLabel('2025-07-25')).toBe('闰六月');
    expect(lunarCellLabel('2026-03-01')).toBe('十三');
  });
});

describe('calendar preferences', () => {
  it('carries the display choices of the retired 日程 settings over', () => {
    expect(normalizePreferences({}).calendar).toEqual(defaultCalendarPreferences);
    const migrated = normalizePreferences({
      daily: {
        enabled: false,
        folder: 'Journal',
        template: '## 待办',
        calendarView: 'month',
        expandedView: 'month',
        weekStart: 'sunday',
        showWeekNumbers: false,
        markOpenTasks: false,
        lunar: 'cell',
        weekly: true,
      },
    }).calendar;
    expect(migrated).toEqual({
      enabled: false,
      calendarView: 'month',
      expandedView: 'month',
      weekStart: 'sunday',
      showWeekNumbers: false,
      markTasks: false,
      lunar: 'cell',
    });
    // Once saved under its own name, the old entry no longer matters.
    expect(
      normalizePreferences({ calendar: { lunar: 'off' }, daily: { lunar: 'cell' } }).calendar.lunar,
    ).toBe('off');
    expect(
      normalizeCalendarPreferences({ calendarView: 'year', expandedView: 'collapsed', lunar: 1 }),
    ).toMatchObject({ calendarView: 'week', expandedView: 'week', lunar: 'hover' });
  });
});

describe('tasks by due day', () => {
  it('filters on one calendar day', () => {
    const task = (id: string, due: string | null) =>
      ({
        id,
        title: id,
        status: 'todo',
        priority: 0,
        labels: [],
        due,
        archived: false,
      }) as unknown as TaskMeta;
    const catalog = new Catalog({
      statuses: [{ id: 'todo', name: '待办', category: 'unstarted', color: 'todo', order: 0 }],
      projects: [],
      labels: [],
      types: [],
      buckets: [],
      cycles: [],
      templates: [],
      views: [],
      tasks: [task('a', '2026-11-12'), task('b', '2026-11-13'), task('c', null)],
    } as unknown as TaskSnapshot);
    const query = parseQuery('due:2026-11-12');
    expect(
      catalog.snapshot.tasks.filter((t) => matches(t, query, catalog)).map((t) => t.id),
    ).toEqual(['a']);
  });
});

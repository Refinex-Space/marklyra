import { describe, expect, it } from 'vitest';
import { orderedAgenda, parseAgenda } from '../src/features/daily/daily-agenda.js';
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
} from '../src/features/daily/daily-dates.js';
import {
  applyDailyTemplate,
  dailyFolderError,
  dailyKeyForPath,
  dailyRelativePath,
  defaultDailyPreferences,
  normalizeDailyPreferences,
  workspaceRelativePath,
} from '../src/features/daily/daily-preferences.js';
import { parseDateQuery } from '../src/features/daily/date-query.js';
import { dateQuickItems } from '../src/features/daily/quick-dates.js';
import { arrange, type QuickItem } from '../src/features/quick-open/quick-open-model.js';
import { normalizePreferences } from '../src/features/settings/preferences.js';

describe('daily date keys', () => {
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

describe('date queries', () => {
  const today = '2026-10-21'; // Wednesday
  const query = (text: string, weekStart: 0 | 1 = 1) => parseDateQuery(text, today, weekStart);
  it.each([
    ['今天', '2026-10-21'],
    ['明天', '2026-10-22'],
    ['昨天', '2026-10-20'],
    ['后天', '2026-10-23'],
    ['周五', '2026-10-23'],
    ['周三', '2026-10-21'],
    ['星期一', '2026-10-26'],
    ['下周一', '2026-10-26'],
    ['上周五', '2026-10-16'],
    ['本周日', '2026-10-25'],
    ['3天后', '2026-10-24'],
    ['-2', '2026-10-19'],
    ['+10d', '2026-10-31'],
    ['10-25', '2026-10-25'],
    ['10月25日', '2026-10-25'],
    ['25号', '2026-10-25'],
    ['2027/1/5', '2027-01-05'],
    ['2027年1月5日', '2027-01-05'],
    ['20270105', '2027-01-05'],
    ['tomorrow', '2026-10-22'],
    ['friday', '2026-10-23'],
  ])('%s → %s', (text, key) => {
    expect(query(text)?.key).toBe(key);
  });
  it('follows the week start for 本周/下周 and rejects impossible dates', () => {
    expect(query('本周日', 0)?.key).toBe('2026-10-18');
    expect(query('2-30')).toBeNull();
    expect(query('会议纪要')).toBeNull();
    expect(query('')).toBeNull();
  });
  it('offers quick-open entries only for recognised dates or the 日期 tab', () => {
    const opened: string[] = [];
    const options = {
      today,
      weekStart: 1 as const,
      weekly: true,
      open: (key: string) => opened.push(key),
    };
    expect(dateQuickItems('note', 'all', options)).toEqual([]);
    expect(dateQuickItems('', 'all', options)).toEqual([]);
    const [tomorrow] = dateQuickItems('明天', 'all', options);
    expect(tomorrow?.title).toBe('10月22日 周四');
    tomorrow?.run();
    expect(opened).toEqual(['2026-10-22']);
    expect(dateQuickItems('', 'date', options).map((item) => item.detail)).toEqual([
      '今天',
      '昨天',
      '明天',
      '下周一',
      '本周周记',
    ]);
    // Generated dates bypass fuzzy matching and lead the list.
    const note: QuickItem = {
      id: 'n',
      kind: 'note',
      title: '明天的计划',
      icon: 'document',
      run() {},
    };
    const groups = arrange([note, ...dateQuickItems('明天', 'all', options)], '明天', 'all');
    expect(groups.map((group) => group.kind)).toEqual(['date', 'note']);
  });
});

describe('agenda parsing', () => {
  it('reads tasks and timed items, skipping front matter and fenced code', () => {
    const text = [
      '---',
      'title: x',
      '- [ ] not a task in front matter',
      '---',
      '## 知识库',
      '- [ ] 09:30-10:00 站会',
      '- [x] 已完成',
      '  * [X] 嵌套完成',
      '> - [ ] 引用里的待办',
      '- 14:00 评审会',
      '- 普通条目',
      '```yaml',
      '- [ ] 代码里的',
      '      ```',
      '- [ ] 缩进围栏结束后的待办',
      '1. [ ] 有序待办',
    ].join('\r\n');
    const agenda = parseAgenda(text);
    expect(agenda.open).toBe(4);
    expect(agenda.done).toBe(2);
    expect(
      agenda.items.map((item) => [item.line, item.checked, item.start ?? '', item.text]),
    ).toEqual([
      [6, false, '09:30', '站会'],
      [7, true, '', '已完成'],
      [8, true, '', '嵌套完成'],
      [9, false, '', '引用里的待办'],
      [10, null, '14:00', '评审会'],
      [15, false, '', '缩进围栏结束后的待办'],
      [16, false, '', '有序待办'],
    ]);
    expect(agenda.items[0]?.end).toBe('10:00');
    expect(agenda.items[0]?.column).toBe(7);
    expect(orderedAgenda(agenda.items).map((item) => item.line)).toEqual([6, 10, 7, 8, 9, 15, 16]);
  });
  it('ignores invalid times and keeps them as text', () => {
    const [item] = parseAgenda('- [ ] 25:00 不是时间').items;
    expect(item?.start).toBeUndefined();
    expect(item?.text).toBe('25:00 不是时间');
  });
});

describe('daily locations and preferences', () => {
  it('builds the same paths as the host and maps them back', () => {
    expect(dailyRelativePath('Daily', 'nested', '2026-10-21')).toBe('Daily/2026/10/2026-10-21.md');
    expect(dailyRelativePath('Daily', 'nested', '2026-W43')).toBe('Daily/2026/2026-W43.md');
    expect(dailyRelativePath('笔记/日程', 'flat', '2026-10-21')).toBe('笔记/日程/2026-10-21.md');
    expect(dailyKeyForPath('daily/2026/10/2026-10-21.md', 'Daily', 'nested')).toBe('2026-10-21');
    expect(dailyKeyForPath('Daily/2026/2026-10-21.md', 'Daily', 'nested')).toBeNull();
    expect(dailyKeyForPath('Daily/2026/2026-W43.md', 'Daily', 'nested')).toBe('2026-W43');
    expect(dailyKeyForPath('Daily/2026-10-21.md', 'Daily', 'flat')).toBe('2026-10-21');
    expect(dailyKeyForPath('Other/2026-10-21.md', 'Daily', 'flat')).toBeNull();
    expect(workspaceRelativePath('D:\\vault\\', 'd:\\Vault\\Daily\\a.md')).toBe('Daily/a.md');
    expect(workspaceRelativePath('/vault', '/vault2/a.md')).toBeNull();
  });
  it.each([
    '',
    '/Daily',
    'C:/Daily',
    'Daily\\x',
    'a//b',
    '../Daily',
    '.daily',
    'a/.hidden',
    'node_modules',
    ' Daily',
  ])('rejects the folder %j', (folder) => {
    expect(dailyFolderError(folder)).not.toBeNull();
  });
  it('accepts nested and Chinese folders', () => {
    expect(dailyFolderError('Daily')).toBeNull();
    expect(dailyFolderError('笔记/日程')).toBeNull();
  });
  it('normalizes stored values and keeps defaults for anything invalid', () => {
    expect(normalizePreferences({}).daily).toEqual(defaultDailyPreferences);
    expect(
      normalizeDailyPreferences({
        enabled: false,
        folder: '../x',
        layout: 'flat',
        calendarView: 'month',
        expandedView: 'collapsed',
        weekStart: 'sunday',
        lunar: 'cell',
        weekly: 'yes',
      }),
    ).toMatchObject({
      enabled: false,
      folder: 'Daily',
      layout: 'flat',
      calendarView: 'month',
      expandedView: 'week',
      weekStart: 'sunday',
      lunar: 'cell',
      weekly: false,
    });
  });
  it('fills template variables for the day', () => {
    expect(
      applyDailyTemplate('# {{title}}\n{{date}} {{weekday}} {{week}} {{unknown}}', '2026-10-21'),
    ).toBe('# 10月21日 周三\n2026-10-21 周三 2026-W43 {{unknown}}');
  });
});

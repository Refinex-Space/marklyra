/**
 * Calendar arithmetic on local date keys. A key is `YYYY-MM-DD`; days are counted
 * through UTC so that daylight-saving shifts can never skip or repeat a date.
 */
export type WeekStart = 0 | 1 | 6;
export interface DayParts {
  year: number;
  month: number;
  day: number;
}
export interface CalendarDay {
  key: string;
  day: number;
  inMonth: boolean;
}
export interface CalendarWeek {
  /** ISO 8601 week key of the row, e.g. `2026-W43`. */
  week: string;
  number: number;
  days: CalendarDay[];
}

const DAY_MS = 86_400_000;
const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export function formatDayKey({ year, month, day }: DayParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}
export function parseDayKey(key: string): DayParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
    return null;
  return { year, month, day };
}
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function todayKey(now = new Date()): string {
  return formatDayKey({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
function serial(key: string): number {
  const parts = parseDayKey(key);
  if (!parts) throw new RangeError(`Invalid date key: ${key}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
}
function fromSerial(value: number): string {
  const date = new Date(value * DAY_MS);
  return formatDayKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}
export function addDays(key: string, days: number): string {
  return fromSerial(serial(key) + days);
}
export function daysBetween(from: string, to: string): number {
  return serial(to) - serial(from);
}
/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: string): number {
  return (((serial(key) + 4) % 7) + 7) % 7;
}
export function addMonths(year: number, month: number, months: number) {
  const index = year * 12 + month - 1 + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
export function startOfWeek(key: string, weekStart: WeekStart): string {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7));
}

export function isoWeek(key: string): { year: number; week: number } {
  // The ISO week belongs to the year of its Thursday.
  const thursday = addDays(key, 3 - ((weekday(key) + 6) % 7));
  const year = Number(thursday.slice(0, 4));
  return { year, week: Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1 };
}
export function weekKey(key: string): string {
  const { year, week } = isoWeek(key);
  return `${pad(year, 4)}-W${pad(week)}`;
}
export function parseWeekKey(key: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return null;
  const [year, week] = [Number(match[1]), Number(match[2])];
  if (year < 1000 || week < 1 || week > isoWeek(`${year}-12-28`).week) return null;
  return { year, week };
}
/** Monday of an ISO week key. */
export function weekMonday(key: string): string {
  const parsed = parseWeekKey(key);
  if (!parsed) throw new RangeError(`Invalid week key: ${key}`);
  const january4 = `${pad(parsed.year, 4)}-01-04`;
  return addDays(startOfWeek(january4, 1), (parsed.week - 1) * 7);
}

function calendarWeek(first: string, month?: number): CalendarWeek {
  const days = Array.from({ length: 7 }, (_, index) => {
    const key = addDays(first, index);
    const parts = parseDayKey(key) as DayParts;
    return { key, day: parts.day, inMonth: month === undefined || parts.month === month };
  });
  // Rows always contain exactly one Monday; it names the row's ISO week.
  const monday = days.find((day) => weekday(day.key) === 1)?.key ?? first;
  const iso = isoWeek(monday);
  return { week: weekKey(monday), number: iso.week, days };
}
/** Six rows, so the panel height never changes between months. */
export function monthGrid(year: number, month: number, weekStart: WeekStart): CalendarWeek[] {
  const first = startOfWeek(formatDayKey({ year, month, day: 1 }), weekStart);
  return Array.from({ length: 6 }, (_, row) => calendarWeek(addDays(first, row * 7), month));
}
export function weekRow(key: string, weekStart: WeekStart): CalendarWeek {
  return calendarWeek(startOfWeek(key, weekStart));
}
export function weekdayOrder(weekStart: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);
}

/** `firstDay` follows Intl.Locale week info: 1 = Monday … 7 = Sunday. */
export function systemWeekStart(locale?: string): WeekStart {
  try {
    const resolved = new Intl.Locale(
      locale ?? (typeof navigator === 'undefined' ? 'zh-CN' : navigator.language),
    ) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = (resolved.getWeekInfo?.() ?? resolved.weekInfo)?.firstDay;
    if (firstDay === 7) return 0;
    if (firstDay === 6) return 6;
  } catch {
    /* Older engines lack week info; ISO weeks start on Monday. */
  }
  return 1;
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? '';
}
export function monthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}
export function dayLabel(key: string, withYear = false): string {
  const parts = parseDayKey(key);
  if (!parts) return key;
  return `${withYear ? `${parts.year}年` : ''}${parts.month}月${parts.day}日 周${weekdayName(weekday(key))}`;
}
export function weekLabel(key: string): string {
  const parsed = parseWeekKey(key);
  return parsed ? `${parsed.year}年第${parsed.week}周` : key;
}
export function relativeDayLabel(key: string, today: string): string {
  const offset = daysBetween(today, key);
  if (offset === 0) return '今天';
  if (offset === -1) return '昨天';
  if (offset === 1) return '明天';
  if (offset === -2) return '前天';
  if (offset === 2) return '后天';
  return offset < 0 ? `${-offset} 天前` : `${offset} 天后`;
}

const LUNAR_DAYS = ['初', '十', '廿', '三'];
const LUNAR_DIGITS = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function lunarDay(day: number): string {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  return `${LUNAR_DAYS[Math.floor(day / 10)]}${LUNAR_DIGITS[day % 10]}`;
}
let lunarFormatter: Intl.DateTimeFormat | null | undefined;
/** Offline Chinese calendar labels from the engine's ICU data; empty when unsupported. */
export function lunarParts(key: string): { month: string; day: string } | null {
  const parts = parseDayKey(key);
  if (!parts) return null;
  try {
    lunarFormatter ??= new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    });
    if (!lunarFormatter.resolvedOptions().calendar.startsWith('chinese')) return null;
    const formatted = lunarFormatter.formatToParts(
      new Date(parts.year, parts.month - 1, parts.day, 12),
    );
    const month = formatted.find((part) => part.type === 'month')?.value;
    const day = Number(formatted.find((part) => part.type === 'day')?.value);
    if (!month || !Number.isInteger(day) || day < 1 || day > 30) return null;
    return { month, day: lunarDay(day) };
  } catch {
    lunarFormatter = null;
    return null;
  }
}
export function lunarLabel(key: string): string {
  const parts = lunarParts(key);
  return parts ? `农历${parts.month}${parts.day}` : '';
}
/** Compact cell text: the month name on its first day, otherwise the day. */
export function lunarCellLabel(key: string): string {
  const parts = lunarParts(key);
  if (!parts) return '';
  return parts.day === '初一' ? parts.month : parts.day;
}

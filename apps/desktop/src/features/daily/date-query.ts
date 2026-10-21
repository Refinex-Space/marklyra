import {
  addDays,
  daysInMonth,
  formatDayKey,
  parseDayKey,
  startOfWeek,
  type WeekStart,
  weekday,
} from './daily-dates.js';

export interface DateQueryResult {
  key: string;
  /** How the query was understood, e.g. “下周一”. */
  phrase: string;
}

const WEEKDAYS: Record<string, number> = {
  日: 0,
  天: 0,
  七: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};
const ENGLISH_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const RELATIVE: Record<string, [number, string]> = {
  今天: [0, '今天'],
  今日: [0, '今天'],
  today: [0, '今天'],
  明天: [1, '明天'],
  明日: [1, '明天'],
  tomorrow: [1, '明天'],
  后天: [2, '后天'],
  昨天: [-1, '昨天'],
  昨日: [-1, '昨天'],
  yesterday: [-1, '昨天'],
  前天: [-2, '前天'],
};

function valid(year: number, month: number, day: number): string | null {
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return formatDayKey({ year, month, day });
}

/**
 * Understands the dates people actually type: 今天/明天/昨天, 周五/下周一/上周三,
 * 3天后/-2, 10-21, 10月21日, 21号, 2026-10-21 and 2026/10/21. Plain weekdays mean
 * the nearest one from today onward; 本周/下周/上周 follow the week start setting.
 */
export function parseDateQuery(
  raw: string,
  today: string,
  weekStart: WeekStart,
): DateQueryResult | null {
  const query = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!query || !parseDayKey(today)) return null;
  const relative = RELATIVE[query];
  if (relative) return { key: addDays(today, relative[0]), phrase: relative[1] };

  const signed = /^([+-])(\d{1,4})d?$/.exec(query);
  const worded = /^(\d{1,4})天(后|前)$/.exec(query);
  if (signed || worded) {
    const days = signed
      ? (signed[1] === '-' ? -1 : 1) * Number(signed[2])
      : (worded?.[2] === '前' ? -1 : 1) * Number(worded?.[1]);
    if (days === 0) return { key: today, phrase: '今天' };
    return {
      key: addDays(today, days),
      phrase: days < 0 ? `${-days} 天前` : `${days} 天后`,
    };
  }

  const named = /^(上|下|这|本)?(?:个)?(?:周|星期|礼拜)([一二三四五六日天七])$/.exec(query);
  const english = ENGLISH_WEEKDAYS.findIndex((name) => query === name || query.startsWith(name));
  if (named || (english >= 0 && /^[a-z]+$/.test(query) && query.length >= 3)) {
    const target = named ? (WEEKDAYS[named[2] ?? ''] ?? 0) : english;
    const scope = named?.[1];
    const label = `周${'日一二三四五六'[target]}`;
    if (!scope) {
      const ahead = (target - weekday(today) + 7) % 7;
      return { key: addDays(today, ahead), phrase: ahead === 0 ? `今天（${label}）` : label };
    }
    const shift = scope === '上' ? -7 : scope === '下' ? 7 : 0;
    const start = addDays(startOfWeek(today, weekStart), shift);
    const key = addDays(start, (target - weekStart + 7) % 7);
    return { key, phrase: `${scope === '这' ? '本' : scope}${label}` };
  }

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const full = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日号]?$/.exec(query);
  if (full) {
    const key = valid(Number(full[1]), Number(full[2]), Number(full[3]));
    return key ? { key, phrase: key } : null;
  }
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(query);
  if (compact) {
    const key = valid(Number(compact[1]), Number(compact[2]), Number(compact[3]));
    return key ? { key, phrase: key } : null;
  }
  const monthDay = /^(\d{1,2})[-/.月](\d{1,2})[日号]?$/.exec(query);
  if (monthDay) {
    const key = valid(year, Number(monthDay[1]), Number(monthDay[2]));
    return key ? { key, phrase: `${Number(monthDay[1])}月${Number(monthDay[2])}日` } : null;
  }
  const dayOnly = /^(\d{1,2})[日号]$/.exec(query);
  if (dayOnly) {
    const key = valid(year, month, Number(dayOnly[1]));
    return key ? { key, phrase: `本月${Number(dayOnly[1])}日` } : null;
  }
  return null;
}

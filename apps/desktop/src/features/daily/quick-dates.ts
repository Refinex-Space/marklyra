import type { QuickItem, QuickTab } from '../quick-open/quick-open-model.js';
import {
  addDays,
  dayLabel,
  startOfWeek,
  type WeekStart,
  weekKey,
  weekLabel,
} from './daily-dates.js';
import { parseDateQuery } from './date-query.js';

/**
 * Quick-open entries for days: the date the query names, or — on the 日期 tab with an
 * empty query — the usual destinations.
 */
export function dateQuickItems(
  query: string,
  tab: QuickTab,
  options: { today: string; weekStart: WeekStart; weekly: boolean; open(key: string): void },
): QuickItem[] {
  if (tab !== 'all' && tab !== 'date') return [];
  const { today, weekStart, weekly, open } = options;
  const item = (key: string, detail: string): QuickItem => ({
    id: `date:${key}`,
    kind: 'date',
    title: key.includes('W')
      ? weekLabel(key)
      : dayLabel(key, key.slice(0, 4) !== today.slice(0, 4)),
    detail,
    icon: 'calendar',
    run: () => open(key),
  });
  if (query.trim()) {
    const found = parseDateQuery(query, today, weekStart);
    return found ? [item(found.key, found.phrase)] : [];
  }
  if (tab !== 'date') return [];
  const nextMonday = addDays(startOfWeek(today, 1), 7);
  return [
    item(today, '今天'),
    item(addDays(today, -1), '昨天'),
    item(addDays(today, 1), '明天'),
    item(nextMonday, '下周一'),
    ...(weekly ? [item(weekKey(today), '本周周记')] : []),
  ];
}

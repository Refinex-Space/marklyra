import {
  dayLabel,
  lunarLabel,
  parseDayKey,
  parseWeekKey,
  systemWeekStart,
  type WeekStart,
  weekday,
  weekdayName,
  weekKey,
} from './daily-dates.js';

export type DailyLayout = 'nested' | 'flat';
export type CalendarView = 'month' | 'week' | 'collapsed';
export type WeekStartPreference = 'system' | 'monday' | 'sunday';
export type LunarDisplay = 'off' | 'hover' | 'cell';
export interface DailyPreferences {
  enabled: boolean;
  /** Workspace-relative folder with `/` separators. */
  folder: string;
  layout: DailyLayout;
  /** Text for a new day; never written until the day has real content. */
  template: string;
  calendarView: CalendarView;
  /** The expanded form to return to when the collapsed calendar is reopened. */
  expandedView: Exclude<CalendarView, 'collapsed'>;
  weekStart: WeekStartPreference;
  showWeekNumbers: boolean;
  markNotes: boolean;
  markOpenTasks: boolean;
  lunar: LunarDisplay;
  weekly: boolean;
}
export const DAILY_TEMPLATE_LIMIT = 4000;
export const defaultDailyPreferences: Readonly<DailyPreferences> = Object.freeze({
  enabled: true,
  folder: 'Daily',
  layout: 'nested',
  template: '',
  calendarView: 'week',
  expandedView: 'week',
  weekStart: 'system',
  showWeekNumbers: true,
  markNotes: true,
  markOpenTasks: true,
  lunar: 'hover',
  weekly: false,
});

/** Mirrors the host's rule; the host validates again before touching the disk. */
export function dailyFolderError(folder: string): string | null {
  if (!folder) return '请填写日程目录';
  if (/^[\\/]|^[a-zA-Z]:/.test(folder) || folder.includes('\\') || folder.includes(':'))
    return '日程目录必须是工作区内的相对路径，并使用 / 分隔';
  for (const segment of folder.split('/')) {
    if (!segment) return '日程目录不能包含空的路径段';
    if (segment === '.' || segment === '..') return '日程目录不能包含 . 或 ..';
    if (segment.startsWith('.')) return '日程目录不能以 . 开头（隐藏目录不会出现在文件树中）';
    if (segment === 'node_modules') return '日程目录不能使用 node_modules';
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are rejected.
    if (/[\u0000-\u001f\u007f]/.test(segment)) return '日程目录不能包含控制字符';
    if (segment !== segment.trim()) return '日程目录的路径段首尾不能有空格';
  }
  return null;
}

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
export function normalizeDailyPreferences(value: unknown): DailyPreferences {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const defaults = defaultDailyPreferences;
  const folder = typeof input.folder === 'string' ? input.folder : defaults.folder;
  const expandedView = pick(input.expandedView, ['month', 'week'] as const, defaults.expandedView);
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    folder: dailyFolderError(folder) ? defaults.folder : folder,
    layout: pick(input.layout, ['nested', 'flat'] as const, defaults.layout),
    template:
      typeof input.template === 'string' && input.template.length <= DAILY_TEMPLATE_LIMIT
        ? input.template
        : defaults.template,
    calendarView: pick(
      input.calendarView,
      ['month', 'week', 'collapsed'] as const,
      defaults.calendarView,
    ),
    expandedView,
    weekStart: pick(input.weekStart, ['system', 'monday', 'sunday'] as const, defaults.weekStart),
    showWeekNumbers:
      typeof input.showWeekNumbers === 'boolean' ? input.showWeekNumbers : defaults.showWeekNumbers,
    markNotes: typeof input.markNotes === 'boolean' ? input.markNotes : defaults.markNotes,
    markOpenTasks:
      typeof input.markOpenTasks === 'boolean' ? input.markOpenTasks : defaults.markOpenTasks,
    lunar: pick(input.lunar, ['off', 'hover', 'cell'] as const, defaults.lunar),
    weekly: input.weekly === true,
  };
}

export function effectiveWeekStart(preference: WeekStartPreference): WeekStart {
  if (preference === 'monday') return 1;
  if (preference === 'sunday') return 0;
  return systemWeekStart();
}

/** Same rule as the host: `Daily/2026/10/2026-10-21.md`, weeks `Daily/2026/2026-W43.md`. */
export function dailyRelativePath(folder: string, layout: DailyLayout, key: string): string {
  const year = key.slice(0, 4);
  if (layout === 'flat') return `${folder}/${key}.md`;
  return parseDayKey(key)
    ? `${folder}/${year}/${key.slice(5, 7)}/${key}.md`
    : `${folder}/${year}/${key}.md`;
}

/** The day or week a workspace-relative path belongs to, if it is exactly that note's path. */
export function dailyKeyForPath(
  relativePath: string,
  folder: string,
  layout: DailyLayout,
): string | null {
  const name = relativePath.split('/').at(-1) ?? '';
  const key = /^(.+)\.md$/i.exec(name)?.[1];
  if (!key || (!parseDayKey(key) && !parseWeekKey(key))) return null;
  // Windows and default macOS volumes compare names without case.
  return dailyRelativePath(folder, layout, key).toLowerCase() === relativePath.toLowerCase()
    ? key
    : null;
}
/** A path under a workspace root as `/`-separated relative path, or null when outside. */
export function workspaceRelativePath(root: string, path: string): string | null {
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/\/+$/, '');
  const base = normalize(root);
  const full = normalize(path);
  if (full.length <= base.length + 1) return null;
  if (full.slice(0, base.length).toLowerCase() !== base.toLowerCase()) return null;
  if (full[base.length] !== '/') return null;
  return full.slice(base.length + 1);
}

/** `{{date}}` `{{weekday}}` `{{week}}` `{{title}}` `{{lunar}}`; unknown names stay literal. */
export function applyDailyTemplate(template: string, key: string): string {
  if (!template || !parseDayKey(key)) return template;
  const values: Record<string, string> = {
    date: key,
    weekday: `周${weekdayName(weekday(key))}`,
    week: weekKey(key),
    title: dayLabel(key),
    lunar: lunarLabel(key),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => values[name] ?? whole);
}

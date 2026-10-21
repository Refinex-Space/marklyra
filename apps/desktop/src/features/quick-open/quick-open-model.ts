import type { IconName } from '../../components/Icon.js';

/** What the quick-open window can list. A tab is a filter over these kinds. */
export type QuickKind = 'note' | 'date' | 'action' | 'workspace' | 'setting';
export type QuickTab = 'all' | QuickKind;

export const quickTabs: readonly { id: QuickTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'action', label: '操作' },
  { id: 'note', label: '笔记' },
  { id: 'date', label: '日期' },
  { id: 'workspace', label: '工作区' },
  { id: 'setting', label: '设置' },
];
export const quickGroupLabels: Record<QuickKind, string> = {
  note: '笔记',
  date: '日程',
  action: '操作',
  workspace: '工作区',
  setting: '设置',
};
/** The "all" tab shows a few of each kind; a dedicated tab shows more. */
const ALL_LIMITS: Record<QuickKind, number> = {
  date: 4,
  note: 8,
  action: 6,
  workspace: 4,
  setting: 4,
};
const TAB_LIMIT = 100;
// A recognised date is an explicit intent, so it leads.
const ORDER: readonly QuickKind[] = ['date', 'note', 'action', 'workspace', 'setting'];

export interface QuickItem {
  /** Stable within one list; used as the option id. */
  id: string;
  kind: QuickKind;
  title: string;
  /** Muted trailing text: a note's folder, an action's context. */
  detail?: string;
  /** Extra words that also match (English names, pinyin aliases). */
  keywords?: string;
  /** Display-only accelerator such as "Ctrl+Shift+S". */
  shortcut?: string;
  icon: IconName;
  run(): void;
}
export type Range = readonly [start: number, end: number];
export interface QuickResult {
  item: QuickItem;
  /** Matched stretches of `item.title`, for highlighting. */
  ranges: Range[];
}
export interface QuickGroup {
  kind: QuickKind;
  label: string;
  results: QuickResult[];
}

function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

interface Hit {
  score: number;
  ranges: Range[];
}
/** One query word against one text: a substring beats a scattered subsequence. */
function hit(word: string, text: string): Hit | null {
  const at = text.indexOf(word);
  if (at >= 0) {
    const boundary = at === 0 || /[\s/._\-›>（(]/.test(text[at - 1] ?? '');
    return {
      score: 200 - Math.min(at, 100) + (at === 0 ? 60 : 0) + (boundary ? 25 : 0) + word.length,
      ranges: [[at, at + word.length]],
    };
  }
  if (word.length < 2) return null;
  const ranges: Range[] = [];
  let from = 0;
  let gaps = 0;
  for (const character of word) {
    const index = text.indexOf(character, from);
    if (index < 0) return null;
    if (index > from) gaps += index - from;
    const last = ranges.at(-1);
    if (last && last[1] === index) ranges[ranges.length - 1] = [last[0], index + 1];
    else ranges.push([index, index + 1]);
    from = index + 1;
  }
  return { score: Math.max(1, 60 - gaps), ranges };
}

/** Every word must hit the title, detail or keywords; the title weighs most. */
export function scoreItem(
  item: QuickItem,
  query: string,
): { score: number; ranges: Range[] } | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { score: 0, ranges: [] };
  const title = fold(item.title);
  const other = fold(`${item.detail ?? ''} ${item.keywords ?? ''}`);
  let score = 0;
  const ranges: Range[] = [];
  for (const word of words) {
    const inTitle = hit(word, title);
    if (inTitle) {
      score += inTitle.score * 2;
      ranges.push(...inTitle.ranges);
      continue;
    }
    const elsewhere = hit(word, other);
    if (!elsewhere) return null;
    score += elsewhere.score;
  }
  return { score, ranges: mergeRanges(ranges) };
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Rank and group what to show. Without a query every kind keeps the order it was given (recent
 * notes first); with one, each kind is ordered by score and ties keep the given order.
 */
export function arrange(items: readonly QuickItem[], query: string, tab: QuickTab): QuickGroup[] {
  const scored = new Map<QuickKind, { result: QuickResult; score: number; order: number }[]>();
  items.forEach((item, order) => {
    if (tab !== 'all' && item.kind !== tab) return;
    // Date entries are generated from the query itself; their titles need not contain it.
    const found = item.kind === 'date' ? { score: 0, ranges: [] } : scoreItem(item, query);
    if (!found) return;
    const list = scored.get(item.kind) ?? [];
    list.push({ result: { item, ranges: found.ranges }, score: found.score, order });
    scored.set(item.kind, list);
  });
  const groups: QuickGroup[] = [];
  for (const kind of ORDER) {
    const list = scored.get(kind);
    if (!list?.length) continue;
    if (query.trim() && kind !== 'date')
      list.sort((a, b) => b.score - a.score || a.order - b.order);
    const limit = tab === 'all' ? ALL_LIMITS[kind] : TAB_LIMIT;
    groups.push({
      kind,
      label: quickGroupLabels[kind],
      results: list.slice(0, limit).map((entry) => entry.result),
    });
  }
  return groups;
}

/** The flat keyboard order of a grouped list. */
export function flatten(groups: readonly QuickGroup[]): QuickResult[] {
  return groups.flatMap((group) => group.results);
}

/** Split a title into plain and highlighted runs. */
export function segments(text: string, ranges: readonly Range[]): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    // Folding can change length for a few characters; clamp to the real text.
    const from = Math.min(start, text.length);
    const to = Math.min(end, text.length);
    if (to <= from) continue;
    if (from > cursor) parts.push({ text: text.slice(cursor, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    cursor = to;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

/** "Ctrl+Shift+S" on Windows, "⌘⇧S" on macOS, from the menu's own accelerator text. */
export function shortcutLabel(accelerator: string, mac: boolean): string {
  const keys = accelerator.split('+');
  if (!mac) return keys.map((key) => (key === 'CmdOrCtrl' ? 'Ctrl' : key)).join('+');
  const symbols: Record<string, string> = {
    CmdOrCtrl: '⌘',
    Cmd: '⌘',
    Ctrl: '⌃',
    Shift: '⇧',
    Alt: '⌥',
    Minus: '−',
  };
  return keys.map((key) => symbols[key] ?? key).join('');
}

/** "刚刚", "5 分钟前", "昨天", "3 天前", else the date. */
export function relativeTime(then: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - new Date(then).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const date = new Date(then);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

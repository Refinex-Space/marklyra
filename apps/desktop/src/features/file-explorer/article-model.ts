import type { WorkspaceDocument, WorkspaceEntry } from '../../services/workspaces.js';
import type { FileSidebarPlatform, FileSortType } from './file-preferences.js';

const isSpace = (character: string | undefined) =>
  character !== undefined && character.trim() === '';
const isLineBoundary = (character: string | undefined) =>
  character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029';

// A bounded display projection, independently implemented from the recorded behavior vectors.
function plainSummary(text: string, strict: boolean): string {
  let blocks = '';
  for (let index = 0; index < text.length; ) {
    if (index === 0 || isLineBoundary(text[index - 1])) {
      let whitespaceEnd = index;
      while (isSpace(text[whitespaceEnd])) whitespaceEnd++;
      const marker = (value: string | undefined) =>
        value === '>' || value === '\n' || (!strict && value === '#');
      let end = whitespaceEnd;
      if (marker(text[end])) {
        while (marker(text[end])) end++;
      } else {
        const lastBreak = text.lastIndexOf('\n', whitespaceEnd - 1);
        if (lastBreak >= index) end = lastBreak + 1;
        else {
          end = index;
          while (
            isSpace(text[end]) ||
            (text[end] !== undefined && '-=*`'.includes(text[end] ?? ''))
          )
            end++;
          if (end - index < 3) end = index;
        }
      }
      if (end > index) {
        index = end;
        continue;
      }
    }
    blocks += text[index++];
  }
  if (strict) {
    let headings = '';
    for (let index = 0; index < blocks.length; ) {
      if (index === 0 || isLineBoundary(blocks[index - 1])) {
        let end = index;
        while (isSpace(blocks[end])) end++;
        const hashStart = end;
        while (blocks[end] === '#') end++;
        if (end > hashStart && isSpace(blocks[end])) {
          while (isSpace(blocks[end])) end++;
          index = end;
          continue;
        }
      }
      headings += blocks[index++];
    }
    blocks = headings;
  }
  let inline = '';
  const formatting = (value: string | undefined) => value !== undefined && '*_`$='.includes(value);
  for (let index = 0; index < blocks.length; ) {
    let end = index;
    while (isSpace(blocks[end])) end++;
    if (formatting(blocks[end])) {
      while (formatting(blocks[end])) end++;
      while (isSpace(blocks[end])) end++;
      inline += ' ';
      index = end;
    } else inline += blocks[index++];
  }
  let result = '';
  for (let index = 0; index < inline.length; ) {
    if (inline[index] === '[') {
      const labelEnd = inline.indexOf(']', index + 1);
      const destinationEnd = inline.indexOf(')', labelEnd + 2);
      if (labelEnd > index + 1 && inline[labelEnd + 1] === '(' && destinationEnd >= 0) {
        result += inline.slice(index + 1, labelEnd);
        index = destinationEnd + 1;
        continue;
      }
    }
    result += inline[index++];
  }
  return result;
}

/** Plain display text only. Metadata and embedded markup never execute. */
export function articleSummary(source: string, strict = false): string {
  const clean = (text: string) => plainSummary(text, strict);
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '\n') continue;
    let end = index;
    while (end > start && source[end - 1] === '\r') end--;
    lines.push(source.slice(start, end));
    while (source[index + 1] === '\n') index++;
    start = index + 1;
  }
  lines.push(source.slice(start));
  if (lines[0] !== '---') return clean(source);
  const closing = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closing < 0) return clean(source);
  const selected: string[] = [];
  for (let index = 1; index < closing; index++) {
    const line = lines[index] ?? '';
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    if (!['title', 'subtitle', 'overview', 'summary', 'description', 'excerpt'].includes(key))
      continue;
    let value = line.slice(separator + 1);
    if (!value) continue;
    // This is the observed limited metadata projection, including its continuation across ---.
    for (let next = index + 1; next < lines.length; next++) {
      if (lines[next]?.includes(':')) break;
      value += `\n${lines[next] ?? ''}`;
    }
    if (value) selected.push(value.trim());
  }
  if (selected.length < 3) selected.push(clean(lines.slice(closing + 1).join('\n') || source));
  return selected.join('\n');
}

const months = [
  'jan',
  'feb',
  'mar',
  'april',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
function chunks(value: string): string[] {
  const result: string[] = [];
  let current = '',
    previous = '';
  for (const character of value.toLowerCase()) {
    const kind = /[0-9]/.test(character)
      ? 'number'
      : /[.,\s+-]/u.test(character)
        ? 'separator'
        : 'text';
    if (previous && previous !== kind) {
      result.push(current);
      current = '';
    }
    current += character;
    previous = kind;
  }
  if (current) result.push(current);
  return result;
}
/** Text order follows the person's language, as the localeCompare helpers do. */
export type TextCompare = (left: string, right: string) => number;
const localeText: TextCompare = (left, right) => left.localeCompare(right);
export function naturalFileCompare(
  left: string,
  right: string,
  compareText: TextCompare = localeText,
): number {
  const a = chunks(left),
    b = chunks(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index] ?? '',
      y = b[index] ?? '';
    if (x === y) continue;
    const xn = /^[0-9]/.test(x),
      yn = /^[0-9]/.test(y);
    let comparison: number;
    if (xn && yn) comparison = Number(x) - Number(y);
    else if (xn !== yn) comparison = xn ? 1 : -1;
    else {
      const month = (value: string) => {
        const short = months.indexOf(value);
        return short >= 0 ? short : monthNames.indexOf(value);
      };
      const xm = month(x),
        ym = month(y);
      comparison = xm >= 0 && ym >= 0 ? xm - ym : compareText(x, y);
    }
    if (comparison !== 0 && !Number.isNaN(comparison)) return comparison;
  }
  return a.length - b.length;
}

type SortableFile = { name: string; modifiedAt?: number | null; createdAt?: number | null };
export function compareFiles(
  left: SortableFile,
  right: SortableFile,
  sort: FileSortType,
  windows = false,
  compareText: TextCompare = localeText,
): number {
  if (sort < 0)
    return compareFiles(
      right,
      left,
      (sort === -10 ? 0 : -sort) as FileSortType,
      windows,
      compareText,
    );
  const mode = Math.abs(sort);
  let comparison: number;
  if (mode === 2 || mode === 3) {
    const key = mode === 2 ? 'modifiedAt' : 'createdAt';
    comparison = Number(left[key]) - Number(right[key]);
  } else if (mode === 1) {
    const a = left.name.toLowerCase(),
      b = right.name.toLowerCase();
    const stem = (name: string) => {
      const dot = name.indexOf('.');
      return dot >= 0 && dot < name.length - 1 ? name.slice(0, dot) : name;
    };
    const x = stem(a) === stem(b) ? a : stem(a),
      y = stem(a) === stem(b) ? b : stem(b);
    comparison = windows ? (left.name === right.name ? 0 : x <= y ? -1 : 1) : compareText(x, y);
  } else comparison = naturalFileCompare(left.name, right.name, compareText);
  return comparison;
}
export function sortedDirectory(
  entries: readonly WorkspaceEntry[],
  sort: FileSortType,
  noGroup: boolean,
  windows: boolean,
): WorkspaceEntry[] {
  return [...entries].sort((a, b) => {
    if (!noGroup && a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return compareFiles(a, b, sort, windows);
  });
}
export interface ArticleGroup {
  folderRelativePath: string;
  entries: WorkspaceDocument[];
}
export function groupedArticles(
  entries: readonly WorkspaceDocument[],
  sort: FileSortType,
  noGroup: boolean,
  windows: boolean,
): ArticleGroup[] {
  if (noGroup)
    return [
      {
        folderRelativePath: '',
        entries: [...entries].sort((a, b) => compareFiles(a, b, sort, windows)),
      },
    ];
  const groups = new Map<string, WorkspaceDocument[]>();
  for (const entry of entries) {
    let group = groups.get(entry.folderRelativePath);
    if (!group) {
      group = [];
      groups.set(entry.folderRelativePath, group);
    }
    group.push(entry);
  }
  return [...groups].map(([folderRelativePath, group]) => ({
    folderRelativePath,
    entries: group.sort((a, b) => compareFiles(a, b, sort, windows)),
  }));
}

export function naturalModifiedDate(timestamp: number | null, now = new Date()): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 30) return 'just now';
  if (seconds < 60) return '1 minutes ago';
  if (seconds < 3600) return `${Math.floor((seconds + 30) / 60)} minutes ago`;
  const two = (value: number) => String(value).padStart(2, '0');
  if (seconds < 18000 && now.getDay() === date.getDay())
    return `${two(date.getHours())}:${two(date.getMinutes())}`;
  if (seconds < 172800 && now.getDay() === (date.getDay() + 1) % 7) return 'Yesterday';
  if (seconds < 518400) return `${Math.floor(seconds / 86400)} days ago`;
  if (now.getFullYear() === date.getFullYear())
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]} ${two(date.getDate())}`;
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Whether `active` is a document somewhere below the folder `relative` of `root`. */
export function workspacePathIsInside(
  root: string,
  relative: string,
  active: string | undefined,
  platform: FileSidebarPlatform = 'browser',
): boolean {
  if (active === undefined || relative === '') return false;
  const normalize = (path: string) =>
    platform === 'windows'
      ? path.replaceAll('\\', '/')
      : platform === 'macos'
        ? path.toLowerCase().normalize('NFD')
        : path;
  return normalize(active).startsWith(
    `${normalize(root).replace(/\/+$/, '')}/${normalize(relative)}/`,
  );
}

export function workspacePathIsActive(
  root: string,
  relative: string,
  active: string | undefined,
  platform: FileSidebarPlatform = 'browser',
): boolean {
  const normalize = (path: string) =>
    platform === 'windows'
      ? path.replaceAll('\\', '/')
      : platform === 'macos'
        ? path.toLowerCase().normalize('NFD')
        : path;
  return (
    active !== undefined &&
    normalize(active) === normalize(`${normalize(root).replace(/\/+$/, '')}/${relative}`)
  );
}

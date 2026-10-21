/** A GFM task, or a list item that starts with a time (`09:30 站会`). */
export interface AgendaItem {
  /** One-based source line, for jumping to the item. */
  line: number;
  /** One-based source column of the item text. */
  column: number;
  /** `null` for a timed list item that is not a task. */
  checked: boolean | null;
  text: string;
  start?: string;
  end?: string;
}
export interface Agenda {
  items: AgendaItem[];
  open: number;
  done: number;
}

const ITEM =
  /^(?:[ \t]*>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[([ xX])\](?:[ \t]+|$))?(.*)$/;
const TIME =
  /^([01]?\d|2[0-3])[:：]([0-5]\d)(?:[ \t]*[-–~～至][ \t]*([01]?\d|2[0-4])[:：]([0-5]\d))?(?=[ \t]|$)/;

function clock(hour: string | undefined, minute: string | undefined): string | undefined {
  if (hour === undefined || minute === undefined) return undefined;
  if (Number(hour) === 24 && Number(minute) !== 0) return undefined;
  return `${hour.padStart(2, '0')}:${minute}`;
}

/**
 * Reads tasks without a Markdown parser: front matter and fenced code are skipped,
 * and a fence closes at a matching marker of any indentation, as the editor does.
 */
export function parseAgenda(text: string): Agenda {
  const items: AgendaItem[] = [];
  let open = 0;
  let done = 0;
  let fence: { marker: string; length: number } | undefined;
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  let index = 0;
  if (lines[0] === '---') {
    const end = lines.findIndex((line, at) => at > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(line));
    if (end > 0) index = end + 1;
  }
  for (; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (fence) {
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (close?.[0] === fence.marker && close.length >= fence.length) fence = undefined;
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening?.[1] && !(opening[1][0] === '`' && opening[2]?.includes('`'))) {
      fence = { marker: opening[1][0] ?? '`', length: opening[1].length };
      continue;
    }
    const match = ITEM.exec(line);
    if (!match) continue;
    const [, state, rest = ''] = match;
    const checked = state === undefined ? null : state !== ' ';
    const body = rest.trim();
    const time = TIME.exec(body);
    const start = time ? clock(time[1], time[2]) : undefined;
    const end = time ? clock(time[3], time[4]) : undefined;
    if (checked === null && !start) continue;
    const label = (start && time ? body.slice(time[0].length) : body).trim();
    items.push({
      line: index + 1,
      column: line.length - rest.trimStart().length + 1,
      checked,
      text: label,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    });
    if (checked === true) done++;
    else if (checked === false) open++;
  }
  return { items, open, done };
}

/** Timed items first by time, then the rest in document order. */
export function orderedAgenda(items: readonly AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    if (a.start && b.start) return a.start.localeCompare(b.start) || a.line - b.line;
    if (a.start) return -1;
    if (b.start) return 1;
    return a.line - b.line;
  });
}

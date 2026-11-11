/**
 * Markdown typing helpers for plain text areas. Each returns the smallest replacement
 * (`from`..`to` becomes `text`) plus the selection afterwards, so callers can apply it as
 * one native insertion and keep the browser's own undo history.
 */
export interface TextEdit {
  from: number;
  to: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const LIST = /^([ \t]*)([-+*]|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;
const QUOTE = /^([ \t]*(?:>[ \t]?)+)/;

const lineStart = (value: string, at: number) => value.lastIndexOf('\n', at - 1) + 1;
const lineEnd = (value: string, at: number) => {
  const end = value.indexOf('\n', at);
  return end < 0 ? value.length : end;
};

/** Toggles an inline marker (`**`, `*`, `~~`, `` ` ``) around the selection. */
export function toggleWrap(value: string, start: number, end: number, marker: string): TextEdit {
  const n = marker.length;
  const selected = value.slice(start, end);
  // Already wrapped just outside the selection: unwrap.
  if (value.slice(start - n, start) === marker && value.slice(end, end + n) === marker)
    return {
      from: start - n,
      to: end + n,
      text: selected,
      selectionStart: start - n,
      selectionEnd: end - n,
    };
  // The selection itself includes the markers: unwrap.
  if (selected.length >= 2 * n && selected.startsWith(marker) && selected.endsWith(marker))
    return {
      from: start,
      to: end,
      text: selected.slice(n, -n),
      selectionStart: start,
      selectionEnd: end - 2 * n,
    };
  // Markers belong outside surrounding spaces, or Markdown will not render them.
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const inner = selected.slice(lead, selected.length - trail);
  return {
    from: start,
    to: end,
    text: `${selected.slice(0, lead)}${marker}${inner}${marker}${selected.slice(selected.length - trail)}`,
    selectionStart: start + lead + n,
    selectionEnd: start + lead + n + inner.length,
  };
}

const URL_LIKE = /^(?:https?:\/\/|mailto:)\S+$/i;

/** `[selection](|)`, or `[|](url)` when the selection is itself a URL. */
export function insertLink(value: string, start: number, end: number): TextEdit {
  const selected = value.slice(start, end);
  if (URL_LIKE.test(selected))
    return {
      from: start,
      to: end,
      text: `[](${selected})`,
      selectionStart: start + 1,
      selectionEnd: start + 1,
    };
  const caret = start + selected.length + 3;
  return {
    from: start,
    to: end,
    text: `[${selected}]()`,
    selectionStart: selected ? caret : start + 1,
    selectionEnd: selected ? caret : start + 1,
  };
}

/** Pasting a URL over selected words links them instead of replacing them. */
export function pasteLink(
  value: string,
  start: number,
  end: number,
  pasted: string,
): TextEdit | null {
  const url = pasted.trim();
  const selected = value.slice(start, end);
  if (!selected || selected.includes('\n') || !URL_LIKE.test(url) || URL_LIKE.test(selected))
    return null;
  const text = `[${selected}](${url})`;
  return {
    from: start,
    to: end,
    text,
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  };
}

/**
 * Enter inside a list item or quote continues it; Enter on an empty item ends the list.
 * Returns null where a plain newline is right.
 */
export function continueBlock(value: string, start: number, end: number): TextEdit | null {
  const from = lineStart(value, start);
  const line = value.slice(from, lineEnd(value, start));
  const list = LIST.exec(line);
  const quote = list ? null : QUOTE.exec(line);
  const prefix = list?.[0] ?? quote?.[0];
  if (!prefix || start - from < prefix.length) return null;
  if (!line.slice(prefix.length).trim() && start === end) {
    // An empty item: leave the list (or one quote level) instead of adding another.
    return { from, to: from + line.length, text: '', selectionStart: from, selectionEnd: from };
  }
  let next = prefix;
  if (list) {
    const [, indent = '', bullet = '', number, delimiter = '.', gap = ' ', check] = list;
    const marker = number !== undefined ? `${Number(number) + 1}${delimiter}` : bullet;
    next = `${indent}${marker}${gap}${check ? '[ ] ' : ''}`;
  }
  const text = `\n${next}`;
  return {
    from: start,
    to: end,
    text,
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  };
}

/**
 * Tab / Shift+Tab nest or un-nest the list items the selection touches. Returns null
 * outside lists, where Tab keeps moving focus.
 */
export function indentList(
  value: string,
  start: number,
  end: number,
  outdent: boolean,
): TextEdit | null {
  const from = lineStart(value, start);
  const to = lineEnd(value, end > start && value[end - 1] === '\n' ? end - 1 : end);
  const lines = value.slice(from, to).split('\n');
  if (!lines.every((line) => LIST.test(line) || !line.trim())) return null;
  let shiftFirst = 0;
  let shiftAll = 0;
  const next = lines.map((line, i) => {
    if (!line.trim()) return line;
    let changed = line;
    if (!outdent) changed = `  ${line}`;
    else if (line.startsWith('\t')) changed = line.slice(1);
    else changed = line.replace(/^ {1,2}/, '');
    const delta = changed.length - line.length;
    if (i === 0) shiftFirst = delta;
    shiftAll += delta;
    return changed;
  });
  if (!shiftAll) return null;
  const text = next.join('\n');
  return {
    from,
    to,
    text,
    selectionStart: Math.max(from, start + shiftFirst),
    selectionEnd: Math.max(from, end + shiftAll),
  };
}

/** The source offset of the `[ ]` mark's inner character on each task-list line, in order. */
export function checkboxOffsets(source: string): number[] {
  const result: number[] = [];
  let fence: string | null = null;
  let at = 0;
  for (const line of source.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length)))
      fence = fence ? null : marker;
    else if (!fence) {
      const match = LIST.exec(line);
      if (match?.[6]) result.push(at + match[0].indexOf('[') + 1);
    }
    at += line.length + 1;
  }
  return result;
}

/** Flips one checkbox by replacing exactly its inner character. */
export function toggleCheckbox(source: string, offset: number): string | null {
  const mark = source[offset];
  if (source[offset - 1] !== '[' || source[offset + 1] !== ']') return null;
  if (mark !== ' ' && mark !== 'x' && mark !== 'X') return null;
  return `${source.slice(0, offset)}${mark === ' ' ? 'x' : ' '}${source.slice(offset + 1)}`;
}

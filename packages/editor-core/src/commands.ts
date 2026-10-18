import { mapSelection } from './transaction.js';
import type { EditorCommand, EditorState, Patch, Selection, Transaction } from './types.js';
import { TransactionError } from './types.js';

interface SourceLine {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly ending: string;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function lineAt(source: string, position: number): SourceLine {
  let from = position;
  if (source[from - 1] === '\r' && source[from] === '\n') from -= 1;
  while (from > 0 && source[from - 1] !== '\n' && source[from - 1] !== '\r') from -= 1;
  let to = from;
  while (to < source.length && source[to] !== '\n' && source[to] !== '\r') to += 1;
  const ending = source.startsWith('\r\n', to) ? '\r\n' : (source[to] ?? '');
  return { from, to, text: source.slice(from, to), ending };
}

function localEnding(source: string, line: SourceLine): string {
  if (line.ending) return line.ending;
  for (let index = line.from - 1; index >= 0; index -= 1) {
    if (source[index] === '\n') return source[index - 1] === '\r' ? '\r\n' : '\n';
    if (source[index] === '\r') return '\r';
  }
  return '\n';
}

/** A conservative fence/front-matter guard, not a Markdown parser. */
function isLiteralLine(source: string, line: SourceLine): boolean {
  const preceding = source
    .slice(0, line.from)
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\r|\n/);
  let frontMatter = preceding[0] === '---';
  let fence: { marker: string; length: number } | undefined;
  for (let index = 0; index < preceding.length; index += 1) {
    const text = preceding[index] ?? '';
    if (frontMatter) {
      if (index > 0 && /^(?:---|\.\.\.)\s*$/.test(text)) frontMatter = false;
      continue;
    }
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (!match?.[1]) continue;
    const marker = match[1][0] ?? '';
    if (fence) {
      if (marker === fence.marker && match[1].length >= fence.length && !match[2]?.trim())
        fence = undefined;
    } else if (marker !== '`' || !match[2]?.includes('`')) {
      fence = { marker, length: match[1].length };
    }
  }
  return frontMatter || fence !== undefined;
}

function selectionFromRange(from: number, to: number, original: Selection): Selection {
  return original.anchor <= original.head ? { anchor: from, head: to } : { anchor: to, head: from };
}

function replaceSelection(state: EditorState, insert: string, group?: string): Transaction {
  const from = Math.min(state.selection.anchor, state.selection.head);
  const to = Math.max(state.selection.anchor, state.selection.head);
  const selection = { anchor: from + insert.length, head: from + insert.length };
  return {
    baseRevision: state.revision,
    patches: [{ from, to, insert }],
    selection,
    ...(group === undefined ? {} : { group }),
  };
}

function paragraph(state: EditorState): Transaction {
  const from = Math.min(state.selection.anchor, state.selection.head);
  const to = Math.max(state.selection.anchor, state.selection.head);
  const line = lineAt(state.source, from);
  const ending = localEnding(state.source, line);
  if (isLiteralLine(state.source, line)) return replaceSelection(state, ending);
  const bom = line.from === 0 && line.text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = line.text.slice(bom.length);
  const quote = /^[ \t]*(?:>[ \t]?)+/.exec(text)?.[0] ?? '';
  const remainder = text.slice(quote.length);
  const list = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/.exec(remainder);
  const marker = list?.[2];
  const listPrefix = list?.[0] ?? '';
  const prefixLength = bom.length + quote.length + listPrefix.length;
  if (list && marker && from >= line.from + prefixLength) {
    if (from === to && !remainder.slice(listPrefix.length).trim()) {
      const patch = {
        from: line.from + bom.length + quote.length,
        to: line.to,
        insert: list[1] ?? '',
      };
      const cursor = patch.from + patch.insert.length;
      return {
        baseRevision: state.revision,
        patches: [patch],
        selection: { anchor: cursor, head: cursor },
      };
    }
    const numbered = /^(\d+)([.)])$/.exec(marker);
    const nextMarker = numbered?.[1]
      ? `${(BigInt(numbered[1]) + 1n).toString().padStart(numbered[1].length, '0')}${numbered[2] ?? '.'}`
      : marker;
    const task = list[4]?.replace(/\[[xX]\]/, '[ ]') ?? '';
    return replaceSelection(
      state,
      ending + quote + (list[1] ?? '') + nextMarker + (list[3] ?? ' ') + task,
    );
  }
  if (quote && from >= line.from + bom.length + quote.length) {
    if (from === to && !remainder.trim()) {
      const replacement = quote.replace(/>[ \t]?$/, '');
      const patch = { from: line.from + bom.length, to: line.to, insert: replacement };
      const cursor = patch.from + patch.insert.length;
      return {
        baseRevision: state.revision,
        patches: [patch],
        selection: { anchor: cursor, head: cursor },
      };
    }
    return replaceSelection(state, ending + quote);
  }
  return replaceSelection(state, ending);
}

function deletion(state: EditorState, direction: 'backward' | 'forward'): Transaction | undefined {
  if (state.selection.anchor !== state.selection.head) return replaceSelection(state, '');
  const position = state.selection.head;
  if (
    (direction === 'backward' && position === 0) ||
    (direction === 'forward' && position === state.source.length)
  )
    return undefined;
  const segment = segmenter
    .segment(state.source)
    .containing(direction === 'backward' ? position - 1 : position);
  if (!segment) return undefined;
  const from = Math.min(position, segment.index);
  const to = Math.max(position, segment.index + segment.segment.length);
  return {
    baseRevision: state.revision,
    patches: [{ from, to, insert: '' }],
    selection: { anchor: from, head: from },
  };
}

function toggleMark(state: EditorState, marker: string): Transaction {
  if (!marker || /\s/.test(marker))
    throw new TransactionError('Inline marker must be non-empty and contain no whitespace');
  const from = Math.min(state.selection.anchor, state.selection.head);
  const to = Math.max(state.selection.anchor, state.selection.head);
  const selected = state.source.slice(from, to);
  let patches: Patch[];
  let selection: Selection;
  if (
    from >= marker.length &&
    state.source.slice(from - marker.length, from) === marker &&
    state.source.slice(to, to + marker.length) === marker
  ) {
    patches = [
      { from: from - marker.length, to: from, insert: '' },
      { from: to, to: to + marker.length, insert: '' },
    ];
    selection = selectionFromRange(from - marker.length, to - marker.length, state.selection);
  } else if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    patches = [
      { from, to: from + marker.length, insert: '' },
      { from: to - marker.length, to, insert: '' },
    ];
    selection = selectionFromRange(from, to - marker.length * 2, state.selection);
  } else {
    // A collapsed selection needs a single insertion, not ambiguous equal-offset patches.
    patches =
      from === to
        ? [{ from, to, insert: marker + marker }]
        : [
            { from, to: from, insert: marker },
            { from: to, to, insert: marker },
          ];
    selection = selectionFromRange(from + marker.length, to + marker.length, state.selection);
  }
  return { baseRevision: state.revision, patches, selection };
}

function heading(state: EditorState, level: number): Transaction {
  if (!Number.isInteger(level) || level < 0 || level > 6)
    throw new TransactionError('Heading level must be between 0 and 6');
  const start = Math.min(state.selection.anchor, state.selection.head);
  const end = Math.max(state.selection.anchor, state.selection.head);
  const patches: Patch[] = [];
  let line = lineAt(state.source, start);
  do {
    if (!isLiteralLine(state.source, line)) {
      const prefix = /^(?:\uFEFF)?(?:[ \t]*(?:>[ \t]?)+)? {0,3}/.exec(line.text)?.[0] ?? '';
      const current = /^#{1,6}(?:[ \t]+|$)/.exec(line.text.slice(prefix.length))?.[0] ?? '';
      const insert = level === 0 ? '' : `${'#'.repeat(level)} `;
      if (current !== insert)
        patches.push({
          from: line.from + prefix.length,
          to: line.from + prefix.length + current.length,
          insert,
        });
    }
    const next = line.to + line.ending.length;
    if (!line.ending || next >= end) break;
    line = lineAt(state.source, next);
  } while (line.from < end);
  return {
    baseRevision: state.revision,
    patches,
    selection: mapSelection(state.selection, patches),
  };
}

function indentation(state: EditorState, outdent: boolean): Transaction {
  const start = Math.min(state.selection.anchor, state.selection.head);
  const end = Math.max(state.selection.anchor, state.selection.head);
  const patches: Patch[] = [];
  let line = lineAt(state.source, start);
  do {
    const bomLength = line.from === 0 && line.text.startsWith('\uFEFF') ? 1 : 0;
    const from = line.from + bomLength;
    if (outdent) {
      const indentation = /^(?:\t| {1,4})/.exec(line.text.slice(bomLength))?.[0];
      if (indentation) patches.push({ from, to: from + indentation.length, insert: '' });
    } else {
      patches.push({ from, to: from, insert: '\t' });
    }
    const next = line.to + line.ending.length;
    if (!line.ending || next >= end) break;
    line = lineAt(state.source, next);
  } while (line.from < end);
  return {
    baseRevision: state.revision,
    patches,
    selection: mapSelection(state.selection, patches),
  };
}

/** Pure command planning. Undo/redo are session operations and produce no transaction. */
export function commandTransaction(
  state: EditorState,
  command: EditorCommand,
): Transaction | undefined {
  switch (command.type) {
    case 'insertText':
      return replaceSelection(
        state,
        command.text,
        state.selection.anchor === state.selection.head && !/[\r\n]/.test(command.text)
          ? 'typing'
          : undefined,
      );
    case 'deleteBackward':
      return deletion(state, 'backward');
    case 'deleteForward':
      return deletion(state, 'forward');
    case 'insertParagraph':
      return paragraph(state);
    case 'insertLineBreak':
      return replaceSelection(
        state,
        localEnding(
          state.source,
          lineAt(state.source, Math.min(state.selection.anchor, state.selection.head)),
        ),
      );
    case 'indent':
      return indentation(state, false);
    case 'outdent':
      return indentation(state, true);
    case 'toggleMark':
      return toggleMark(state, command.marker);
    case 'heading':
      return heading(state, command.level);
    case 'undo':
    case 'redo':
      return undefined;
  }
}

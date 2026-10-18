import { assertPosition } from './transaction.js';
import type { Patch } from './types.js';

/** An exact, complete syntax component proved by the editing adapter. This is
 * not proof that a Markdown-looking line actually belongs to a list or quote. */
export interface SourceMirrorCompletePrefix {
  readonly patchIndex: number;
  readonly canonical: { readonly from: number; readonly to: number };
  readonly role: 'indent' | 'quote' | 'list-marker';
}

const horizontal = /^[ \t]*$/u;
const quote = /^[ \t]*(?:>[ \t]*)+$/u;
const marker = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?$/u;

/** Validate the preceding syntax with a linear scan; a repeated-whitespace
 * regex would allow exponential backtracking on an invalid long prefix. */
function prefixContext(text: string): boolean {
  let cursor = 0;
  while (cursor < text.length) {
    while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;
    if (cursor === text.length) return true;
    if (text[cursor] === '>') {
      cursor++;
      continue;
    }
    if (/[-+*]/u.test(text[cursor] ?? '')) cursor++;
    else {
      const start = cursor;
      while (cursor < text.length && text.charCodeAt(cursor) >= 48 && text.charCodeAt(cursor) <= 57)
        cursor++;
      if (cursor === start || (text[cursor] !== '.' && text[cursor] !== ')')) return false;
      cursor++;
    }
    if (cursor < text.length && text[cursor] !== ' ' && text[cursor] !== '\t') return false;
    while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;
    if (
      text[cursor] === '[' &&
      [' ', 'x', 'X'].includes(text[cursor + 1] ?? '') &&
      text[cursor + 2] === ']'
    ) {
      cursor += 3;
      if (cursor < text.length && text[cursor] !== ' ' && text[cursor] !== '\t') return false;
    }
  }
  return true;
}

function component(text: string, role: SourceMirrorCompletePrefix['role']): boolean {
  if (role === 'indent') return text.length > 0 && horizontal.test(text);
  if (role === 'quote') return quote.test(text);
  if (role === 'list-marker') return marker.test(text);
  return false;
}

/** Both canonical and mapped raw spans must contain syntax only. The caller
 * remains responsible for the model role and complete component boundaries. */
export function isCompletePrefix(
  source: string,
  from: number,
  to: number,
  role: SourceMirrorCompletePrefix['role'],
): boolean {
  assertPosition(source, from);
  assertPosition(source, to);
  if (from >= to || !component(source.slice(from, to), role)) return false;
  const lineFrom =
    Math.max(source.lastIndexOf('\n', from - 1), source.lastIndexOf('\r', from - 1)) + 1;
  return prefixContext(source.slice(lineFrom, from));
}

export function completePrefixIndexes(
  canonical: string,
  patches: readonly Patch[],
  receipts: readonly SourceMirrorCompletePrefix[],
  bom: number,
): ReadonlyMap<number, SourceMirrorCompletePrefix['role']> {
  if (!Array.isArray(receipts) || receipts.length > 16_384)
    throw new Error('Complete prefix authorization exceeds its budget');
  const indexes = new Map<number, SourceMirrorCompletePrefix['role']>();
  for (const receipt of receipts) {
    if (!receipt || !Number.isSafeInteger(receipt.patchIndex))
      throw new Error('Invalid complete prefix authorization');
    const patch = patches[receipt.patchIndex];
    if (
      !patch ||
      indexes.has(receipt.patchIndex) ||
      !receipt.canonical ||
      receipt.canonical.from !== patch.from ||
      receipt.canonical.to !== patch.to ||
      patch.from < bom ||
      !isCompletePrefix(canonical.slice(bom), patch.from - bom, patch.to - bom, receipt.role) ||
      (patch.insert !== '' && !component(patch.insert, receipt.role))
    )
      throw new Error('Complete prefix authorization does not match its syntax patch');
    indexes.set(receipt.patchIndex, receipt.role);
  }
  return indexes;
}

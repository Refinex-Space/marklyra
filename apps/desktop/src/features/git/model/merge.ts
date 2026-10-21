/**
 * Three-way merge model for the merge tool: diff3 chunking, per-chunk decisions and the merged
 * result. Pure TypeScript, no DOM.
 */
import { type DiffChunk, diffLines, normalizeWhitespace, splitLines } from './diff.js';

export type MergeChunkKind = 'unchanged' | 'yours' | 'theirs' | 'both-same' | 'conflict';

/** Half-open line ranges; chunks are in order and cover all three files fully. */
export interface MergeChunk {
  kind: MergeChunkKind;
  base: [number, number];
  yours: [number, number];
  theirs: [number, number];
}

interface Hunk {
  baseStart: number;
  baseEnd: number;
  /** Side length minus base length. */
  delta: number;
}

function hunks(chunks: readonly DiffChunk[]): Hunk[] {
  return chunks
    .filter((chunk) => chunk.kind === 'change')
    .map((chunk) => ({
      baseStart: chunk.leftStart,
      baseEnd: chunk.leftEnd,
      delta: chunk.rightEnd - chunk.rightStart - (chunk.leftEnd - chunk.leftStart),
    }));
}

function sameLines(
  a: readonly string[],
  [aStart, aEnd]: readonly [number, number],
  b: readonly string[],
  [bStart, bEnd]: readonly [number, number],
  ignoreWhitespace: boolean,
): boolean {
  if (aEnd - aStart !== bEnd - bStart) return false;
  for (let t = 0; t < aEnd - aStart; t++) {
    const x = a[aStart + t] ?? '';
    const y = b[bStart + t] ?? '';
    if (ignoreWhitespace ? normalizeWhitespace(x) !== normalizeWhitespace(y) : x !== y) {
      return false;
    }
  }
  return true;
}

/**
 * diff3: diffs base->yours and base->theirs, then groups hunks whose base ranges overlap or touch.
 * A group changed on one side only takes that side; changed identically on both sides is
 * 'both-same'; anything else is a 'conflict'.
 */
export function merge3(
  base: readonly string[],
  yours: readonly string[],
  theirs: readonly string[],
  options?: { ignoreWhitespace?: boolean },
): MergeChunk[] {
  const ignoreWhitespace = options?.ignoreWhitespace === true;
  const diffOptions = { ignoreWhitespace };
  const a = hunks(diffLines(base, yours, diffOptions));
  const b = hunks(diffLines(base, theirs, diffOptions));
  const out: MergeChunk[] = [];
  let i = 0;
  let j = 0;
  let basePos = 0;
  let deltaA = 0;
  let deltaB = 0;
  const unchanged = (to: number): void => {
    if (to <= basePos) return;
    out.push({
      kind: 'unchanged',
      base: [basePos, to],
      yours: [basePos + deltaA, to + deltaA],
      theirs: [basePos + deltaB, to + deltaB],
    });
  };
  while (i < a.length || j < b.length) {
    const lo = Math.min(
      a[i]?.baseStart ?? Number.POSITIVE_INFINITY,
      b[j]?.baseStart ?? Number.POSITIVE_INFINITY,
    );
    let hi = lo;
    let groupA = 0;
    let groupB = 0;
    let usedA = false;
    let usedB = false;
    for (let grew = true; grew; ) {
      grew = false;
      for (let h = a[i]; h && h.baseStart <= hi; h = a[i]) {
        hi = Math.max(hi, h.baseEnd);
        groupA += h.delta;
        usedA = true;
        grew = true;
        i++;
      }
      for (let h = b[j]; h && h.baseStart <= hi; h = b[j]) {
        hi = Math.max(hi, h.baseEnd);
        groupB += h.delta;
        usedB = true;
        grew = true;
        j++;
      }
    }
    unchanged(lo);
    const yoursRange: [number, number] = [lo + deltaA, hi + deltaA + groupA];
    const theirsRange: [number, number] = [lo + deltaB, hi + deltaB + groupB];
    let kind: MergeChunkKind = usedA ? 'yours' : 'theirs';
    if (usedA && usedB) {
      kind = sameLines(yours, yoursRange, theirs, theirsRange, ignoreWhitespace)
        ? 'both-same'
        : 'conflict';
    }
    out.push({ kind, base: [lo, hi], yours: yoursRange, theirs: theirsRange });
    deltaA += groupA;
    deltaB += groupB;
    basePos = hi;
  }
  unchanged(base.length);
  return out;
}

export type Decision =
  | { kind: 'base' }
  | { kind: 'yours' }
  | { kind: 'theirs' }
  /** Keep both, yours first. */
  | { kind: 'yours-theirs' }
  /** Keep both, theirs first. */
  | { kind: 'theirs-yours' }
  | { kind: 'custom'; lines: string[] };

/** The decision a non-conflicting chunk resolves to by itself; null for conflicts. */
export function naturalDecision(chunk: MergeChunk): Decision | null {
  switch (chunk.kind) {
    case 'unchanged':
      return { kind: 'base' };
    case 'yours':
    case 'both-same':
      return { kind: 'yours' };
    case 'theirs':
      return { kind: 'theirs' };
    case 'conflict':
      return null;
  }
}

/** Non-conflicting chunks get their natural decision; conflicts get null (unresolved). */
export function initialDecisions(chunks: readonly MergeChunk[]): (Decision | null)[] {
  return chunks.map(naturalDecision);
}

/** Natural decisions for non-conflicting chunks, keeping the existing decisions of conflicts. */
export function applyNonConflicting(
  chunks: readonly MergeChunk[],
  decisions: readonly (Decision | null)[],
): (Decision | null)[] {
  return chunks.map((chunk, index) =>
    chunk.kind === 'conflict' ? (decisions[index] ?? null) : naturalDecision(chunk),
  );
}

/** Lines a chunk contributes to the result; unresolved (null) contributes the base lines. */
export function chunkResult(
  chunk: MergeChunk,
  decision: Decision | null,
  base: readonly string[],
  yours: readonly string[],
  theirs: readonly string[],
): string[] {
  const ofYours = (): string[] => yours.slice(chunk.yours[0], chunk.yours[1]);
  const ofTheirs = (): string[] => theirs.slice(chunk.theirs[0], chunk.theirs[1]);
  if (decision === null) return base.slice(chunk.base[0], chunk.base[1]);
  switch (decision.kind) {
    case 'base':
      return base.slice(chunk.base[0], chunk.base[1]);
    case 'yours':
      return ofYours();
    case 'theirs':
      return ofTheirs();
    case 'yours-theirs':
      return [...ofYours(), ...ofTheirs()];
    case 'theirs-yours':
      return [...ofTheirs(), ...ofYours()];
    case 'custom':
      return [...decision.lines];
  }
}

export function mergeResult(
  chunks: readonly MergeChunk[],
  decisions: readonly (Decision | null)[],
  base: readonly string[],
  yours: readonly string[],
  theirs: readonly string[],
): string[] {
  const out: string[] = [];
  chunks.forEach((chunk, index) => {
    for (const line of chunkResult(chunk, decisions[index] ?? null, base, yours, theirs)) {
      out.push(line);
    }
  });
  return out;
}

/** Chunks without a decision (missing entries count as unresolved). */
export function unresolvedCount(
  chunks: readonly MergeChunk[],
  decisions: readonly (Decision | null)[],
): number {
  let count = 0;
  chunks.forEach((_, index) => {
    if ((decisions[index] ?? null) === null) count++;
  });
  return count;
}

type Marker = 'start' | 'base' | 'separator' | 'end';

const MARKER_SIZE = 7;

function markerOf(line: string): Marker | null {
  const head = line.slice(0, MARKER_SIZE);
  const rest = line.slice(MARKER_SIZE);
  if (head === '=======') return rest.trim() === '' ? 'separator' : null;
  if (rest !== '' && !/^\s/.test(rest)) return null;
  if (head === '<<<<<<<') return 'start';
  if (head === '|||||||') return 'base';
  if (head === '>>>>>>>') return 'end';
  return null;
}

/**
 * Parses a file containing conflict markers (`<<<<<<<` / `|||||||` / `=======` / `>>>>>>>`) into
 * yours/base/theirs line arrays. Lines outside conflicts go to all three. A conflict without a
 * `|||||||` section contributes no base lines. A `=======` line outside a conflict or inside the
 * theirs section is ordinary content (Markdown setext underline). Returns null for malformed
 * markers: nesting, a stray `|||||||`/`>>>>>>>`, a missing separator or an unterminated conflict.
 */
export function parseConflictMarkers(
  text: string,
): { yours: string[]; base: string[]; theirs: string[]; conflicts: number } | null {
  const yours: string[] = [];
  const base: string[] = [];
  const theirs: string[] = [];
  let conflicts = 0;
  let state: 'outside' | 'yours' | 'base' | 'theirs' = 'outside';
  for (const line of splitLines(text)) {
    const marker = markerOf(line);
    switch (state) {
      case 'outside':
        if (marker === 'start') state = 'yours';
        else if (marker === 'base' || marker === 'end') return null;
        else {
          yours.push(line);
          base.push(line);
          theirs.push(line);
        }
        break;
      case 'yours':
        if (marker === 'base') state = 'base';
        else if (marker === 'separator') state = 'theirs';
        else if (marker !== null) return null;
        else yours.push(line);
        break;
      case 'base':
        if (marker === 'separator') state = 'theirs';
        else if (marker !== null) return null;
        else base.push(line);
        break;
      case 'theirs':
        if (marker === 'end') {
          state = 'outside';
          conflicts++;
        } else if (marker === 'start' || marker === 'base') return null;
        else theirs.push(line);
        break;
    }
  }
  return state === 'outside' ? { yours, base, theirs, conflicts } : null;
}

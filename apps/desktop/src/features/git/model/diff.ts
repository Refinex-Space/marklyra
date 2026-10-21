/**
 * Line and intra-line diffing for the Git views. Pure TypeScript, no DOM.
 *
 * Lines are anchored with a histogram diff (git's `--histogram`: match the rarest common lines
 * first, recurse around them), regions without a usable anchor fall back to a cost-capped Myers
 * O(ND) diff, and a region that is still too expensive is reported as one change. Pure insertions
 * and deletions are then slid along repeated lines so that their edges sit on blank lines.
 */

/** Splits text into lines without terminators; '\r\n' and '\n' both end a line; a final terminator does not create an extra empty line. '' -> []. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface DiffOptions {
  /** Compare lines with all whitespace removed; rows still show the original text. */
  ignoreWhitespace?: boolean;
}

/** Half-open line ranges. 'equal' chunks have equal lengths. Consecutive chunks cover both sides fully and in order. */
export interface DiffChunk {
  kind: 'equal' | 'change';
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
}

/** Lines (or tokens) occurring more often than this in a region are never used as anchors. */
const MAX_CHAIN = 64;
/** Total anchor-search work after which remaining regions are reported as whole changes. */
const HISTOGRAM_BUDGET = 50_000_000;
/** Myers fallback limits: edit distance and (n + m) * d work. */
const MYERS_MAX_D = 2_000;
const MYERS_BUDGET = 20_000_000;

/** Normalizes a line for whitespace-insensitive comparison. */
export function normalizeWhitespace(line: string): string {
  return line.replace(/\s+/g, '');
}

interface Keyed {
  a: Int32Array;
  b: Int32Array;
  /** Per key id: 1 when the line is blank (after normalization). */
  blank: Uint8Array;
  keyCount: number;
}

function keyLines(
  left: readonly string[],
  right: readonly string[],
  normalize: ((line: string) => string) | null,
): Keyed {
  const ids = new Map<string, number>();
  const blank: number[] = [];
  const intern = (lines: readonly string[]): Int32Array => {
    const out = new Int32Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? '';
      const key = normalize ? normalize(raw) : raw;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
        blank.push(key.trim() === '' ? 1 : 0);
      }
      out[i] = id;
    }
    return out;
  };
  const a = intern(left);
  const b = intern(right);
  return { a, b, blank: Uint8Array.from(blank), keyCount: ids.size };
}

function mark(flags: Uint8Array, from: number, to: number): void {
  flags.fill(1, from, to);
}

/**
 * Greedy Myers over a[lo1, hi1) x b[lo2, hi2). Marks changed entries and returns true, or returns
 * false without touching the flags when the edit distance exceeds the cost cap.
 */
function myers(
  a: Int32Array,
  lo1: number,
  hi1: number,
  b: Int32Array,
  lo2: number,
  hi2: number,
  ca: Uint8Array,
  cb: Uint8Array,
): boolean {
  const n = hi1 - lo1;
  const m = hi2 - lo2;
  const total = n + m;
  const limit = Math.min(total, MYERS_MAX_D, Math.floor(MYERS_BUDGET / Math.max(1, total)));
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    for (let k = -d; k <= d; k += 2) {
      const below = v[off + k - 1] ?? 0;
      const above = v[off + k + 1] ?? 0;
      let x = k === -d || (k !== d && below < above) ? above : below + 1;
      let y = x - k;
      while (x < n && y < m && a[lo1 + x] === b[lo2 + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        backtrack(trace, d, n, m, lo1, lo2, ca, cb);
        return true;
      }
    }
    trace.push(v.slice(off - d, off + d + 1));
  }
  return false;
}

function backtrack(
  trace: readonly Int32Array[],
  depth: number,
  n: number,
  m: number,
  lo1: number,
  lo2: number,
  ca: Uint8Array,
  cb: Uint8Array,
): void {
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d--) {
    const prev = trace[d - 1];
    if (!prev) return;
    const at = (k: number): number => prev[k + d - 1] ?? -1;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = at(pk);
    const py = px - pk;
    if (down) cb[lo2 + py] = 1;
    else ca[lo1 + px] = 1;
    x = px;
    y = py;
  }
}

/** Diffs two key sequences; returns per-entry "changed" flags for both sides. */
function diffKeys(
  a: Int32Array,
  b: Int32Array,
  keyCount: number,
): { ca: Uint8Array; cb: Uint8Array } {
  const ca = new Uint8Array(a.length);
  const cb = new Uint8Array(b.length);
  const stamp = new Int32Array(keyCount).fill(-1);
  const count = new Int32Array(keyCount);
  const head = new Int32Array(keyCount);
  const next = new Int32Array(a.length);
  let generation = 0;
  let work = 0;
  const stack: number[] = [0, a.length, 0, b.length];
  while (stack.length > 0) {
    let hi2 = stack.pop() ?? 0;
    let lo2 = stack.pop() ?? 0;
    let hi1 = stack.pop() ?? 0;
    let lo1 = stack.pop() ?? 0;
    while (lo1 < hi1 && lo2 < hi2 && a[lo1] === b[lo2]) {
      lo1++;
      lo2++;
    }
    while (lo1 < hi1 && lo2 < hi2 && a[hi1 - 1] === b[hi2 - 1]) {
      hi1--;
      hi2--;
    }
    if (lo1 === hi1 || lo2 === hi2 || work > HISTOGRAM_BUDGET) {
      mark(ca, lo1, hi1);
      mark(cb, lo2, hi2);
      continue;
    }
    generation++;
    for (let i = hi1 - 1; i >= lo1; i--) {
      const k = a[i] ?? 0;
      if (stamp[k] !== generation) {
        stamp[k] = generation;
        count[k] = 0;
        head[k] = -1;
      }
      next[i] = head[k] ?? -1;
      head[k] = i;
      count[k] = (count[k] ?? 0) + 1;
    }
    work += hi1 - lo1 + hi2 - lo2;
    let common = false;
    let bestCount = MAX_CHAIN + 1;
    let bestLength = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let s1 = 0;
    let e1 = 0;
    let s2 = 0;
    let e2 = 0;
    let j = lo2;
    while (j < hi2) {
      const k = b[j] ?? 0;
      let jNext = j + 1;
      if (stamp[k] === generation) {
        common = true;
        const c = count[k] ?? 0;
        if (c <= bestCount) {
          for (let i = head[k] ?? -1; i !== -1; i = next[i] ?? -1) {
            let rc = c;
            let as = i;
            let bs = j;
            while (as > lo1 && bs > lo2 && a[as - 1] === b[bs - 1]) {
              as--;
              bs--;
              const cc = count[a[as] ?? 0] ?? 0;
              if (cc < rc) rc = cc;
            }
            let ae = i + 1;
            let be = j + 1;
            while (ae < hi1 && be < hi2 && a[ae] === b[be]) {
              const cc = count[a[ae] ?? 0] ?? 0;
              if (cc < rc) rc = cc;
              ae++;
              be++;
            }
            work += ae - as;
            // Rarest, then longest, then most central (keeps the recursion balanced).
            const distance = Math.abs(as + ae - lo1 - hi1) + Math.abs(bs + be - lo2 - hi2);
            if (
              rc < bestCount ||
              (rc === bestCount &&
                (ae - as > bestLength || (ae - as === bestLength && distance < bestDistance)))
            ) {
              bestCount = rc;
              bestLength = ae - as;
              bestDistance = distance;
              s1 = as;
              e1 = ae;
              s2 = bs;
              e2 = be;
            }
            if (be > jNext) jNext = be;
          }
        }
      }
      j = jNext;
    }
    if (bestLength === 0) {
      // No common line at all, or only very frequent ones: Myers, else one coarse change.
      if (!common || !myers(a, lo1, hi1, b, lo2, hi2, ca, cb)) {
        mark(ca, lo1, hi1);
        mark(cb, lo2, hi2);
      }
      work += (hi1 - lo1 + hi2 - lo2) * 4;
      continue;
    }
    stack.push(lo1, s1, lo2, s2, e1, hi1, e2, hi2);
  }
  return { ca, cb };
}

function buildChunks(ca: Uint8Array, cb: Uint8Array): DiffChunk[] {
  const n = ca.length;
  const m = cb.length;
  const chunks: DiffChunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const si = i;
    const sj = j;
    if (i < n && j < m && !ca[i] && !cb[j]) {
      while (i < n && j < m && !ca[i] && !cb[j]) {
        i++;
        j++;
      }
      chunks.push({ kind: 'equal', leftStart: si, leftEnd: i, rightStart: sj, rightEnd: j });
      continue;
    }
    while (i < n && ca[i]) i++;
    while (j < m && cb[j]) j++;
    if (i === si && j === sj) {
      // Inconsistent flags (cannot happen); keep the result correct by giving up on the rest.
      i = n;
      j = m;
    }
    chunks.push({ kind: 'change', leftStart: si, leftEnd: i, rightStart: sj, rightEnd: j });
  }
  return chunks;
}

/** Removes empty chunks and merges neighbours of the same kind. */
function normalizeChunks(chunks: readonly DiffChunk[]): DiffChunk[] {
  const out: DiffChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.leftStart === chunk.leftEnd && chunk.rightStart === chunk.rightEnd) continue;
    const last = out[out.length - 1];
    if (last && last.kind === chunk.kind) {
      last.leftEnd = chunk.leftEnd;
      last.rightEnd = chunk.rightEnd;
    } else {
      out.push({ ...chunk });
    }
  }
  return out;
}

/**
 * Slides pure insertions/deletions along repeated lines so that, where possible, the group starts
 * right after a blank line (or the file start) and ends with a blank line (or the file end);
 * otherwise it slides down as far as possible, like git.
 */
function slideChunks(chunks: DiffChunk[], keyed: Keyed): void {
  const isBlank = (key: number | undefined): boolean => key !== undefined && !!keyed.blank[key];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (chunk?.kind !== 'change') continue;
    const insertion = chunk.leftStart === chunk.leftEnd;
    const deletion = chunk.rightStart === chunk.rightEnd;
    if (insertion === deletion) continue;
    const keys = insertion ? keyed.b : keyed.a;
    const start = insertion ? chunk.rightStart : chunk.leftStart;
    const end = insertion ? chunk.rightEnd : chunk.leftEnd;
    const prev = chunks[index - 1];
    const next = chunks[index + 1];
    const prevLength = prev?.kind === 'equal' ? prev.leftEnd - prev.leftStart : 0;
    const nextLength = next?.kind === 'equal' ? next.leftEnd - next.leftStart : 0;
    let up = 0;
    while (up < prevLength && keys[start - 1 - up] === keys[end - 1 - up]) up++;
    let down = 0;
    while (down < nextLength && keys[start + down] === keys[end + down]) down++;
    if (up === 0 && down === 0) continue;
    const size = keys.length;
    const score = (s: number, e: number): number =>
      (s === 0 || isBlank(keys[s - 1]) ? 1 : 0) + (e === size || isBlank(keys[e - 1]) ? 1 : 0);
    let best = 0;
    let bestScore = -1;
    for (let shift = -up; shift <= down; shift++) {
      const value = score(start + shift, end + shift);
      if (value >= bestScore) {
        bestScore = value;
        best = shift;
      }
    }
    if (best === 0) continue;
    // Lines leave one neighbouring equal run and join the other, which may not exist yet.
    let before = prev;
    if (before?.kind !== 'equal') {
      before = emptyEqual(chunk.leftStart, chunk.rightStart);
      chunks.splice(index++, 0, before);
    }
    let after = next;
    if (after?.kind !== 'equal') {
      after = emptyEqual(chunk.leftEnd, chunk.rightEnd);
      chunks.splice(index + 1, 0, after);
    }
    chunk.leftStart += best;
    chunk.leftEnd += best;
    chunk.rightStart += best;
    chunk.rightEnd += best;
    before.leftEnd += best;
    before.rightEnd += best;
    after.leftStart += best;
    after.rightStart += best;
  }
}

function emptyEqual(left: number, right: number): DiffChunk {
  return { kind: 'equal', leftStart: left, leftEnd: left, rightStart: right, rightEnd: right };
}

function linesDiff(keyed: Keyed): DiffChunk[] {
  const { ca, cb } = diffKeys(keyed.a, keyed.b, keyed.keyCount);
  const chunks = buildChunks(ca, cb);
  slideChunks(chunks, keyed);
  return normalizeChunks(chunks);
}

export function diffLines(
  left: readonly string[],
  right: readonly string[],
  options?: DiffOptions,
): DiffChunk[] {
  return linesDiff(keyLines(left, right, options?.ignoreWhitespace ? normalizeWhitespace : null));
}

export interface DiffStats {
  additions: number;
  deletions: number;
  /** Number of change chunks. */
  changes: number;
}

export function diffStats(chunks: readonly DiffChunk[]): DiffStats {
  let additions = 0;
  let deletions = 0;
  let changes = 0;
  for (const chunk of chunks) {
    if (chunk.kind !== 'change') continue;
    additions += chunk.rightEnd - chunk.rightStart;
    deletions += chunk.leftEnd - chunk.leftStart;
    changes++;
  }
  return { additions, deletions, changes };
}

/** Rows for a side-by-side view; a change chunk pairs lines index-by-index, the shorter side padded with null. */
export interface SplitRow {
  kind: 'equal' | 'change' | 'fold';
  left: number | null;
  right: number | null;
  chunk: number;
  /** For 'fold': number of hidden lines (per side). */
  hidden?: number;
  /** For 'fold': id to put in the `expanded` set to show the lines. */
  foldId?: number;
}

/** Rows for a unified view: deletions of a change chunk first, then insertions. */
export interface UnifiedRow {
  kind: 'equal' | 'delete' | 'insert' | 'fold';
  left: number | null;
  right: number | null;
  chunk: number;
  hidden?: number;
  foldId?: number;
}

/** A fold never hides fewer lines than this; shorter gaps are shown in full. */
export const FOLD_MIN_HIDDEN = 2;

/**
 * Fold ids are the index of the folded equal chunk (an equal chunk has at most one fold: the
 * lines between its leading and trailing context).
 */
export function foldIdOf(chunkIndex: number): number {
  return chunkIndex;
}

interface FoldPlan {
  head: number;
  hidden: number;
}

function planFold(
  chunks: readonly DiffChunk[],
  index: number,
  context: number | null,
  expanded: ReadonlySet<number> | undefined,
): FoldPlan | null {
  const chunk = chunks[index];
  if (!chunk || context === null || expanded?.has(foldIdOf(index))) return null;
  const length = chunk.leftEnd - chunk.leftStart;
  const keep = Math.max(0, Math.floor(context));
  const head = chunks[index - 1]?.kind === 'change' ? Math.min(keep, length) : 0;
  const tail = chunks[index + 1]?.kind === 'change' ? Math.min(keep, length - head) : 0;
  const hidden = length - head - tail;
  return hidden >= FOLD_MIN_HIDDEN ? { head, hidden } : null;
}

/**
 * Walks the visible lines of an equal chunk: `line(offset)` for shown lines, `fold(offset, hidden)`
 * once for the collapsed run.
 */
function walkEqual(
  chunks: readonly DiffChunk[],
  index: number,
  context: number | null,
  expanded: ReadonlySet<number> | undefined,
  line: (offset: number) => void,
  fold: (offset: number, hidden: number) => void,
): void {
  const chunk = chunks[index];
  if (!chunk) return;
  const length = chunk.leftEnd - chunk.leftStart;
  const plan = planFold(chunks, index, context, expanded);
  if (!plan) {
    for (let t = 0; t < length; t++) line(t);
    return;
  }
  for (let t = 0; t < plan.head; t++) line(t);
  fold(plan.head, plan.hidden);
  for (let t = plan.head + plan.hidden; t < length; t++) line(t);
}

/** context: lines kept around changes inside equal chunks; null = no folding. */
export function splitRows(
  chunks: readonly DiffChunk[],
  context: number | null,
  expanded?: ReadonlySet<number>,
): SplitRow[] {
  const rows: SplitRow[] = [];
  chunks.forEach((chunk, index) => {
    if (chunk.kind === 'equal') {
      walkEqual(
        chunks,
        index,
        context,
        expanded,
        (t) =>
          rows.push({
            kind: 'equal',
            left: chunk.leftStart + t,
            right: chunk.rightStart + t,
            chunk: index,
          }),
        (t, hidden) =>
          rows.push({
            kind: 'fold',
            left: chunk.leftStart + t,
            right: chunk.rightStart + t,
            chunk: index,
            hidden,
            foldId: foldIdOf(index),
          }),
      );
      return;
    }
    const leftLength = chunk.leftEnd - chunk.leftStart;
    const rightLength = chunk.rightEnd - chunk.rightStart;
    for (let t = 0; t < Math.max(leftLength, rightLength); t++) {
      rows.push({
        kind: 'change',
        left: t < leftLength ? chunk.leftStart + t : null,
        right: t < rightLength ? chunk.rightStart + t : null,
        chunk: index,
      });
    }
  });
  return rows;
}

export function unifiedRows(
  chunks: readonly DiffChunk[],
  context: number | null,
  expanded?: ReadonlySet<number>,
): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  chunks.forEach((chunk, index) => {
    if (chunk.kind === 'equal') {
      walkEqual(
        chunks,
        index,
        context,
        expanded,
        (t) =>
          rows.push({
            kind: 'equal',
            left: chunk.leftStart + t,
            right: chunk.rightStart + t,
            chunk: index,
          }),
        (t, hidden) =>
          rows.push({
            kind: 'fold',
            left: chunk.leftStart + t,
            right: chunk.rightStart + t,
            chunk: index,
            hidden,
            foldId: foldIdOf(index),
          }),
      );
      return;
    }
    for (let line = chunk.leftStart; line < chunk.leftEnd; line++) {
      rows.push({ kind: 'delete', left: line, right: null, chunk: index });
    }
    for (let line = chunk.rightStart; line < chunk.rightEnd; line++) {
      rows.push({ kind: 'insert', left: null, right: line, chunk: index });
    }
  });
  return rows;
}

export interface Segment {
  text: string;
  changed: boolean;
}

/** Below this share of common characters a line pair is highlighted as a whole. */
const INLINE_MIN_COMMON = 0.3;
/** Lines longer than this are not diffed token by token. */
const INLINE_MAX_LENGTH = 10_000;

const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const TOKEN = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}\\p{M}_])+|\\s+|[\\s\\S]`, 'gu');

/** Words, single CJK characters, whitespace runs and single punctuation characters. */
export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function whole(text: string, changed: boolean): Segment[] {
  return text === '' ? [] : [{ text, changed }];
}

function toSegments(tokens: readonly string[], flags: Uint8Array): Segment[] {
  const out: Segment[] = [];
  tokens.forEach((text, index) => {
    const changed = !!flags[index];
    const last = out[out.length - 1];
    if (last && last.changed === changed) last.text += text;
    else out.push({ text, changed });
  });
  return out;
}

/** Intra-line highlighting for a changed line pair; segments cover each line fully. */
export function inlineDiff(left: string, right: string): { left: Segment[]; right: Segment[] } {
  if (left === right) return { left: whole(left, false), right: whole(right, false) };
  if (
    left === '' ||
    right === '' ||
    left.length > INLINE_MAX_LENGTH ||
    right.length > INLINE_MAX_LENGTH
  ) {
    return { left: whole(left, true), right: whole(right, true) };
  }
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const keyed = keyLines(leftTokens, rightTokens, null);
  const { ca, cb } = diffKeys(keyed.a, keyed.b, keyed.keyCount);
  // Whitespace-only matches between two changes read better as part of the change.
  const chunks = buildChunks(ca, cb);
  chunks.forEach((chunk, index) => {
    if (chunk.kind !== 'equal' || index === 0 || index === chunks.length - 1) return;
    for (let t = chunk.leftStart; t < chunk.leftEnd; t++) {
      if ((leftTokens[t] ?? '').trim() !== '') return;
    }
    mark(ca, chunk.leftStart, chunk.leftEnd);
    mark(cb, chunk.rightStart, chunk.rightEnd);
  });
  let common = 0;
  leftTokens.forEach((token, index) => {
    if (!ca[index]) common += token.length;
  });
  if ((2 * common) / (left.length + right.length) < INLINE_MIN_COMMON) {
    return { left: whole(left, true), right: whole(right, true) };
  }
  return { left: toSegments(leftTokens, ca), right: toSegments(rightTokens, cb) };
}

/** Index into chunks of change chunks, for next/previous navigation. */
export function changeIndexes(chunks: readonly DiffChunk[]): number[] {
  const out: number[] = [];
  chunks.forEach((chunk, index) => {
    if (chunk.kind === 'change') out.push(index);
  });
  return out;
}

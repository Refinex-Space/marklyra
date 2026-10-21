import { diffChars } from 'diff';
import { headingCorrespondences } from './source-mirror-headings.js';
import {
  completePrefixIndexes,
  isCompletePrefix,
  type SourceMirrorCompletePrefix,
} from './source-mirror-prefixes.js';
import { type Correspondence, updateEqualCorrespondence } from './source-mirror-ranges.js';
import { tableDelimiterDash, tableDelimiterRuns } from './source-mirror-tables.js';
import {
  applyTransaction,
  assertPosition,
  assertWellFormedText,
  createState,
} from './transaction.js';
import type { Patch, PositionAffinity } from './types.js';

export interface SourceMirrorOptions {
  readonly diffTimeoutMs?: number;
  readonly maxEditLength?: number;
  /** Whether a leading U+FEFF is a file prefix or literal document content. */
  readonly sourceBOM?: 'metadata' | 'text';
  readonly canonicalBOM?: 'metadata' | 'text';
  /** Fallback for inserting the first newline only; observed local endings always win. */
  readonly defaultLineEnding?: '\n' | '\r\n';
}
type DiffLimits = Required<Pick<SourceMirrorOptions, 'diffTimeoutMs' | 'maxEditLength'>>;

export interface SourceMirrorUpdate {
  readonly source: string;
  /** UTF-16 ranges in the source before this update. */
  readonly patches: readonly Patch[];
}

/** Explicit authorization from a trusted serializer adapter. Core verifies the
 * checkpoint, coordinate space, full patch replay and source correspondence;
 * it cannot prove that the adapter's model/serializer semantics are unchanged. */
export interface SourceMirrorCanonicalProjection {
  readonly baseProjectionEpoch: number;
  readonly baseCanonical: string;
  readonly patches: readonly Patch[];
}
export interface SourceMirrorRebase extends SourceMirrorCanonicalProjection {
  readonly baseStateId: number;
}

export type SourceMirrorHint =
  | {
      readonly kind: 'edit';
      readonly baseStateId: number;
      readonly baseCanonical: string;
      readonly baseProjectionEpoch?: number;
      /** Ordered non-overlapping UTF-16 patches in the actual previous canonical string. */
      readonly patches: readonly Patch[];
      /** Exact model-proved complete syntax components. Only these ranges may
       * consume their full raw normalization gap; ordinary text stays narrow. */
      readonly completePrefixes?: readonly SourceMirrorCompletePrefix[];
      /** Optional serializer-only change after the primary edit. Its exact base
       * is the primary patch result; only primary patches may modify raw text. */
      readonly canonicalProjection?: SourceMirrorCanonicalProjection;
      /** Serializer-proven domains for inferred patch placement; absent means precise input ranges. */
      readonly placementRanges?: readonly { readonly from: number; readonly to: number }[];
      /** Original coincident insertion fragments. These add placement checks;
       * they never replace or narrow the merged patch's existing domains. */
      readonly placementChecks?: readonly {
        readonly patch: Patch;
        readonly range: { readonly from: number; readonly to: number };
      }[];
    }
  | {
      readonly kind: 'history';
      readonly baseStateId: number;
      readonly targetStateId: number;
      readonly baseProjectionEpoch?: number;
      /** Must start at this exact target's journal canonical, never a text match
       * to another checkpoint. The adapter must verify the target model first. */
      readonly canonicalProjection?: SourceMirrorCanonicalProjection;
    };

export class SourceMirrorError extends Error {
  override readonly name = 'SourceMirrorError';
  constructor(
    readonly code:
      | 'DIFF_LIMIT'
      | 'UNSUPPORTED_NORMALIZATION'
      | 'INCONSISTENT_MAPPING'
      | 'AMBIGUOUS_EDIT'
      | 'STALE_STATE'
      | 'INVALID_HINT',
    message: string,
  ) {
    super(message);
  }
}

interface NormalizedText {
  readonly original: string;
  readonly text: string;
  readonly bom: number;
  readonly crlf: readonly { raw: number; normalized: number }[];
}

interface MirrorHistory {
  readonly sourceForward: readonly Patch[];
  readonly sourceInverse: readonly Patch[];
  readonly canonicalForward: readonly Patch[];
  readonly canonicalInverse: readonly Patch[];
}
interface MirrorHistoryCandidate {
  source: string;
  canonical: string;
  patches?: readonly Patch[];
  canonicalPatches?: readonly Patch[];
}

function normalize(original: string, bomPolicy: 'metadata' | 'text'): NormalizedText {
  assertWellFormedText(original);
  const bom = bomPolicy === 'metadata' && original.startsWith('\uFEFF') ? 1 : 0;
  const crlf: { raw: number; normalized: number }[] = [];
  let removed = 0;
  for (const match of original.matchAll(/\r\n/g)) {
    crlf.push({ raw: match.index, normalized: match.index - bom - removed });
    removed++;
  }
  return { original, text: original.slice(bom).replace(/\r\n|\r/g, '\n'), bom, crlf };
}

function countBefore<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const value = values[middle];
    if (value !== undefined && predicate(value)) low = middle + 1;
    else high = middle;
  }
  return low;
}

function physicalOffset(
  text: NormalizedText,
  offset: number,
  affinity: PositionAffinity = 'right',
): number {
  if (offset === 0 && text.bom && affinity === 'left') return 0;
  return text.bom + offset + countBefore(text.crlf, (ending) => ending.normalized < offset);
}

function logicalOffset(text: NormalizedText, offset: number): number {
  assertPosition(text.original, offset);
  if (offset <= text.bom) return 0;
  const before = countBefore(text.crlf, (ending) => ending.raw + 1 < offset);
  const next = text.crlf[before];
  if (next && offset === next.raw + 1)
    throw new RangeError(`Position ${offset} splits a CRLF sequence`);
  return offset - text.bom - before;
}

function apply(source: string, patches: readonly Patch[]): string {
  return applyTransaction(createState(source, { anchor: 0, head: 0 }, 0), {
    baseRevision: 0,
    patches,
    selection: { anchor: 0, head: 0 },
  }).source;
}

/** Own history text without retaining a tiny slice's entire previous document. */
function ownText(text: string): string {
  if (!text.length) return '';
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += 4096) {
    const codes: number[] = [];
    for (let at = start; at < Math.min(start + 4096, text.length); at++)
      codes.push(text.charCodeAt(at));
    chunks.push(String.fromCharCode(...codes));
  }
  return chunks.join('');
}

function ownPatches(patches: readonly Patch[]): Patch[] {
  return patches.map((patch) => ({ ...patch, insert: ownText(patch.insert) }));
}

function hasSplitEnding(source: string, patches: readonly Patch[]): boolean {
  return patches.some((patch) =>
    [patch.from, patch.to].some((at) => source[at - 1] === '\r' && source[at] === '\n'),
  );
}

function inverse(source: string, patches: readonly Patch[]): Patch[] {
  const result: Patch[] = [];
  let shift = 0;
  for (const patch of patches) {
    const from = patch.from + shift;
    const next = {
      from,
      to: from + patch.insert.length,
      insert: source.slice(patch.from, patch.to),
    };
    const previous = result.at(-1);
    if (previous && previous.to === next.from) {
      result[result.length - 1] = {
        from: previous.from,
        to: next.to,
        insert: previous.insert + next.insert,
      };
    } else result.push(next);
    shift += patch.insert.length - (patch.to - patch.from);
  }
  return result;
}

function codePointBefore(text: string, end: number): number {
  const last = text.charCodeAt(end - 1);
  return last >= 0xdc00 && last <= 0xdfff ? end - 2 : end - 1;
}

/** Prefix/suffix trimming is only a fast path; nontrivial alignment is jsdiff's algorithm. */
function textDiff(before: string, after: string, options: DiffLimits): Patch[] {
  if (before === after) return [];
  let from = 0;
  while (
    from < before.length &&
    from < after.length &&
    before.codePointAt(from) === after.codePointAt(from)
  ) {
    from += (before.codePointAt(from) ?? 0) > 0xffff ? 2 : 1;
  }
  let beforeEnd = before.length,
    afterEnd = after.length;
  while (beforeEnd > from && afterEnd > from) {
    const a = codePointBefore(before, beforeEnd),
      b = codePointBefore(after, afterEnd);
    if (before.slice(a, beforeEnd) !== after.slice(b, afterEnd)) break;
    beforeEnd = a;
    afterEnd = b;
  }
  if (from === beforeEnd || from === afterEnd)
    return [{ from, to: beforeEnd, insert: after.slice(from, afterEnd) }];
  const changes = diffChars(before.slice(from, beforeEnd), after.slice(from, afterEnd), {
    timeout: options.diffTimeoutMs,
    maxEditLength: options.maxEditLength,
  });
  if (!changes)
    throw new SourceMirrorError(
      'DIFF_LIMIT',
      'Canonical diff exceeded its configured budget; source has not changed',
    );
  const patches: Patch[] = [];
  let cursor = from;
  let pending: { from: number; to: number; insert: string } | undefined;
  for (const change of changes) {
    if (!change.added && !change.removed) {
      if (pending) patches.push(pending);
      pending = undefined;
      cursor += change.value.length;
    } else {
      pending ??= { from: cursor, to: cursor, insert: '' };
      if (change.removed) {
        cursor += change.value.length;
        pending.to = cursor;
      } else pending.insert += change.value;
    }
  }
  if (pending) patches.push(pending);
  return patches;
}

/** Exact UTF-16 text changes, without SourceMirror's intentional EOL projection. */
export function diffText(
  before: string,
  after: string,
  options: SourceMirrorOptions = {},
): readonly Patch[] {
  assertWellFormedText(before);
  assertWellFormedText(after);
  const limits = {
    diffTimeoutMs: options.diffTimeoutMs ?? 250,
    maxEditLength: options.maxEditLength ?? 100_000,
  };
  if (
    !Number.isFinite(limits.diffTimeoutMs) ||
    limits.diffTimeoutMs <= 0 ||
    !Number.isSafeInteger(limits.maxEditLength) ||
    limits.maxEditLength < 0
  )
    throw new RangeError('Invalid text diff limits');
  const groups: { from: number; to: number; changes: Patch[] }[] = [];
  for (const patch of textDiff(before, after, limits)) {
    let from = patch.from,
      to = patch.to;
    if (before[from - 1] === '\r' && before[from] === '\n') from--;
    if (before[to - 1] === '\r' && before[to] === '\n') to++;
    const previous = groups.at(-1);
    if (previous && from <= previous.to) {
      previous.to = Math.max(previous.to, to);
      previous.changes.push(patch);
    } else groups.push({ from, to, changes: [patch] });
  }
  return Object.freeze(
    groups.map((group) =>
      Object.freeze({
        from: group.from,
        to: group.to,
        insert: apply(
          before.slice(group.from, group.to),
          group.changes.map((patch) => ({
            from: patch.from - group.from,
            to: patch.to - group.from,
            insert: patch.insert,
          })),
        ),
      }),
    ),
  );
}

const listNumber = Symbol('list-number');
const listBullet = Symbol('list-bullet');

function listPrefixes(text: string): Map<number, { to: number; key: symbol }> {
  const result = new Map<number, { to: number; key: symbol }>();
  let fence: { marker: string; length: number } | undefined;
  let frontMatter = false;
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const value = line[0].replace(/\n$/, '');
    if (line.index === 0 && value === '---') {
      frontMatter = true;
      continue;
    }
    if (frontMatter) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(value)) frontMatter = false;
      continue;
    }
    if (fence) {
      // The serializer closes a fence at any indentation (and rewrites it to
      // column 0), so a deeply indented closer must end the fence here too.
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(value)?.[1];
      if (close?.[0] === fence.marker && close.length >= fence.length) fence = undefined;
      continue;
    }
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(value);
    if (delimiter?.[1]) {
      fence = { marker: delimiter[1][0] ?? '`', length: delimiter[1].length };
      continue;
    }
    const prefix = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(\d+)[.)]|([-+*]))(?=[ \t])/.exec(value);
    if (!prefix) continue;
    const end = line.index + prefix[0].length;
    if (prefix[1]) result.set(end - 1 - prefix[1].length, { to: end - 1, key: listNumber });
    else result.set(end - 1, { to: end, key: listBullet });
  }
  return result;
}

function isWhitespace(text: string, offset: number): boolean {
  return text[offset] === ' ' || text[offset] === '\t' || text[offset] === '\n';
}

function correspond(
  source: string,
  canonical: string,
  options: Required<SourceMirrorOptions>,
): Correspondence[] {
  const result: Correspondence[] = [];
  // These builder ranges are private to this correspondence pass. Extend the
  // last equal span in place instead of allocating once per matched code point.
  const append = (
    sourceFrom: number,
    sourceTo: number,
    canonicalFrom: number,
    canonicalTo: number,
    equal: boolean,
  ) => {
    const previous = result.at(-1);
    if (
      previous?.equal &&
      equal &&
      previous.sourceTo === sourceFrom &&
      previous.canonicalTo === canonicalFrom
    ) {
      previous.sourceTo = sourceTo;
      previous.canonicalTo = canonicalTo;
    } else result.push({ sourceFrom, sourceTo, canonicalFrom, canonicalTo, equal });
  };
  if (source === canonical)
    return [
      {
        sourceFrom: 0,
        sourceTo: source.length,
        canonicalFrom: 0,
        canonicalTo: canonical.length,
        equal: true,
      },
    ];
  const sourcePrefixes = listPrefixes(source),
    canonicalPrefixes = listPrefixes(canonical);
  const headings = headingCorrespondences(source, canonical);
  if (source.includes('|') && canonical.includes('|')) {
    for (const [from, alias] of tableDelimiterRuns(source)) sourcePrefixes.set(from, alias);
    for (const [from, alias] of tableDelimiterRuns(canonical)) canonicalPrefixes.set(from, alias);
  }
  let a = 0,
    b = 0;
  const consumeHeading = () => {
    const heading = headings.get(a);
    if (!heading || heading.canonicalFrom !== b) return false;
    for (const span of heading.spans)
      append(span.sourceFrom, span.sourceTo, span.canonicalFrom, span.canonicalTo, span.equal);
    a = heading.sourceTo;
    b = heading.canonicalTo;
    return true;
  };
  while (a < source.length || b < canonical.length) {
    if (consumeHeading()) continue;
    const fromA = a,
      fromB = b;
    while (isWhitespace(source, a)) a++;
    while (isWhitespace(canonical, b)) b++;
    // Whitespace is aligned only inside its own gap. A global LCS can otherwise
    // match added padding spaces instead of retaining a nearby table delimiter.
    let previous = 0,
      shift = 0;
    for (const patch of textDiff(source.slice(fromA, a), canonical.slice(fromB, b), options)) {
      if (previous < patch.from)
        append(
          fromA + previous,
          fromA + patch.from,
          fromB + previous + shift,
          fromB + patch.from + shift,
          true,
        );
      append(
        fromA + patch.from,
        fromA + patch.to,
        fromB + patch.from + shift,
        fromB + patch.from + shift + patch.insert.length,
        false,
      );
      previous = patch.to;
      shift += patch.insert.length - (patch.to - patch.from);
    }
    if (fromA + previous < a || fromB + previous + shift < b)
      append(fromA + previous, a, fromB + previous + shift, b, true);
    if (a === source.length && b === canonical.length) break;
    if (consumeHeading()) continue;
    let sourcePrefix = sourcePrefixes.get(a),
      canonicalPrefix = canonicalPrefixes.get(b);
    // A conservative lexical shield can suppress a table alias on one side.
    // Equal literal dashes must still align; unequal widths require both roles.
    if (sourcePrefix?.key !== canonicalPrefix?.key) {
      if (sourcePrefix?.key === tableDelimiterDash) sourcePrefix = undefined;
      if (canonicalPrefix?.key === tableDelimiterDash) canonicalPrefix = undefined;
    }
    if (!sourcePrefix && !canonicalPrefix) {
      const runA = a,
        runB = b;
      // Copy equal non-whitespace runs as one span. Stop before any list alias,
      // including a prefix attached directly to a quote marker (">009. item").
      while (
        a < source.length &&
        b < canonical.length &&
        !isWhitespace(source, a) &&
        !isWhitespace(canonical, b) &&
        !sourcePrefixes.has(a) &&
        !canonicalPrefixes.has(b) &&
        source.codePointAt(a) === canonical.codePointAt(b)
      ) {
        const width = (source.codePointAt(a) ?? 0) > 0xffff ? 2 : 1;
        a += width;
        b += width;
      }
      if (a > runA) {
        append(runA, a, runB, b, true);
        continue;
      }
    }
    const endA =
      sourcePrefix?.to ??
      Math.min(source.length, a + ((source.codePointAt(a) ?? 0) > 0xffff ? 2 : 1));
    const endB =
      canonicalPrefix?.to ??
      Math.min(canonical.length, b + ((canonical.codePointAt(b) ?? 0) > 0xffff ? 2 : 1));
    const sourceKey = sourcePrefix?.key ?? source.slice(a, endA),
      canonicalKey = canonicalPrefix?.key ?? canonical.slice(b, endB);
    if (sourceKey !== canonicalKey || !sourceKey)
      throw new SourceMirrorError(
        'UNSUPPORTED_NORMALIZATION',
        `Unverified serializer normalization at source [${a},${endA}) / canonical [${b},${endB}); exact source retained`,
      );
    append(a, endA, b, endB, source.slice(a, endA) === canonical.slice(b, endB));
    a = endA;
    b = endB;
  }
  if (!result.length) append(0, 0, 0, 0, true);
  return result;
}

function mappedOffset(
  ranges: readonly Correspondence[],
  position: number,
  affinity: PositionAffinity,
  reverse = false,
): number {
  // Endpoints are monotonic in both coordinate spaces. Include every touching
  // range at a boundary: zero-width normalization spans are not bijections.
  const first = countBefore(
    ranges,
    (range) => (reverse ? range.sourceTo : range.canonicalTo) < position,
  );
  let left = Infinity,
    right = -Infinity;
  for (let index = first; index < ranges.length; index++) {
    const range = ranges[index];
    if (!range) break;
    const from = reverse ? range.sourceFrom : range.canonicalFrom;
    if (from > position) break;
    const to = reverse ? range.sourceTo : range.canonicalTo;
    const targetFrom = reverse ? range.canonicalFrom : range.sourceFrom;
    const targetTo = reverse ? range.canonicalTo : range.sourceTo;
    let low = targetFrom,
      high = targetTo;
    if (range.equal) low = high = targetFrom + position - from;
    else if (from !== to && position === from) high = low;
    else if (from !== to && position === to) low = high;
    left = Math.min(left, low);
    right = Math.max(right, high);
  }
  if (left === Infinity)
    throw new SourceMirrorError('INCONSISTENT_MAPPING', 'No correspondence for document position');
  return affinity === 'left' ? left : right;
}

function localEnding(source: string, at: number, fallback: '\n' | '\r\n'): string {
  for (let index = at; index < source.length; index++) {
    if (source[index] === '\r') return source[index + 1] === '\n' ? '\r\n' : '\r';
    if (source[index] === '\n') return index > 0 && source[index - 1] === '\r' ? '\r\n' : '\n';
  }
  for (let index = at - 1; index >= 0; index--) {
    if (source[index] === '\n') return source[index - 1] === '\r' ? '\r\n' : '\n';
    if (source[index] === '\r') return '\r';
  }
  return fallback;
}

/** Mirrors verified canonical changes onto preserved raw source. It never saves an AST. */
export class SourceMirror {
  #source: NormalizedText;
  #canonical: NormalizedText;
  #historyCanonical: string;
  #projectionEpoch = 0;
  #projectionAware = false;
  #ranges: Correspondence[];
  #history: MirrorHistory[] = [];
  #cursor = 0;
  #serial = 0;
  #ids = [0];
  readonly #options: Required<SourceMirrorOptions>;

  constructor(rawSource: string, renderedCanonical: string, options: SourceMirrorOptions = {}) {
    this.#options = {
      diffTimeoutMs: options.diffTimeoutMs ?? 250,
      maxEditLength: options.maxEditLength ?? 100_000,
      sourceBOM: options.sourceBOM ?? 'metadata',
      canonicalBOM: options.canonicalBOM ?? 'metadata',
      defaultLineEnding: options.defaultLineEnding ?? '\n',
    };
    if (!['\n', '\r\n'].includes(this.#options.defaultLineEnding))
      throw TypeError('Invalid default line ending');
    if (
      !['metadata', 'text'].includes(this.#options.sourceBOM) ||
      !['metadata', 'text'].includes(this.#options.canonicalBOM)
    )
      throw new TypeError('SourceMirror BOM policies must be metadata or text');
    if (
      !Number.isFinite(this.#options.diffTimeoutMs) ||
      this.#options.diffTimeoutMs <= 0 ||
      !Number.isSafeInteger(this.#options.maxEditLength) ||
      this.#options.maxEditLength < 0
    ) {
      throw new RangeError(
        'SourceMirror diff limits must be finite positive timeout and non-negative integer edit length',
      );
    }
    this.#source = normalize(rawSource, this.#options.sourceBOM);
    this.#canonical = normalize(renderedCanonical, this.#options.canonicalBOM);
    this.#ranges = correspond(this.#source.text, this.#canonical.text, this.#options);
    this.#historyCanonical = renderedCanonical;
  }

  get stateId(): number {
    return this.#ids[this.#cursor] ?? -1;
  }

  get source(): string {
    return this.#source.original;
  }
  get canonical(): string {
    return this.#canonical.original;
  }
  get projectionEpoch(): number {
    return this.#projectionEpoch;
  }

  /** Change only the active serializer coordinates. No raw edit, content ID,
   * history cursor or redo change. After opting in, updates must bind the epoch.
   * This is not a general whitespace/Markdown semantic-normalization validator. */
  rebaseCanonical(nextCanonical: string, receipt: SourceMirrorRebase): SourceMirrorUpdate {
    if (receipt.baseStateId !== this.stateId)
      throw new SourceMirrorError('STALE_STATE', 'Source mirror checkpoint changed');
    const next = this.projectedCanonical(this.canonical, nextCanonical, receipt);
    const ranges = correspond(this.#source.text, next.text, this.#options);
    const epoch = this.nextProjectionEpoch();
    this.#canonical = next;
    this.#ranges = ranges;
    this.#projectionEpoch = epoch;
    this.#projectionAware = true;
    return this.result([]);
  }

  reset(rawSource: string, renderedCanonical: string): void {
    const source = normalize(rawSource, this.#options.sourceBOM),
      canonical = normalize(renderedCanonical, this.#options.canonicalBOM);
    const ranges = correspond(source.text, canonical.text, this.#options);
    const epoch = this.#projectionAware ? this.nextProjectionEpoch() : this.#projectionEpoch;
    this.#source = source;
    this.#canonical = canonical;
    this.#historyCanonical = renderedCanonical;
    this.#ranges = ranges;
    this.#history = [];
    this.#cursor = 0;
    this.#ids = [++this.#serial];
    this.#projectionEpoch = epoch;
  }

  /** Adopt an explicitly authorized external version without clearing editor history. */
  adoptExternal(rawSource: string, renderedCanonical: string): SourceMirrorUpdate {
    const source = normalize(rawSource, this.#options.sourceBOM),
      next = normalize(renderedCanonical, this.#options.canonicalBOM);
    const ranges = correspond(source.text, next.text, this.#options);
    const patches = diffText(this.source, rawSource, this.#options);
    const canonicalPatches = diffText(this.canonical, renderedCanonical, this.#options);
    return this.commit(source, next, ranges, patches, canonicalPatches);
  }

  canonicalToSource(offset: number, affinity: PositionAffinity = 'right'): number {
    const normalized = logicalOffset(this.#canonical, offset);
    return physicalOffset(this.#source, mappedOffset(this.#ranges, normalized, affinity), affinity);
  }

  /** Project raw UTF-16 positions into the current runtime serializer's coordinate space. */
  sourceToCanonical(position: number, affinity: PositionAffinity = 'right'): number {
    const normalized = logicalOffset(this.#source, position);
    return physicalOffset(
      this.#canonical,
      mappedOffset(this.#ranges, normalized, affinity, true),
      affinity,
    );
  }

  update(nextCanonical: string, hint?: SourceMirrorHint): SourceMirrorUpdate {
    if (hint && hint.baseStateId !== this.stateId)
      throw new SourceMirrorError('STALE_STATE', 'Source mirror checkpoint changed');
    if (!hint && nextCanonical === this.canonical) return this.result([]);
    const epoch = hint?.baseProjectionEpoch ?? hint?.canonicalProjection?.baseProjectionEpoch;
    if (
      (epoch !== undefined && epoch !== this.#projectionEpoch) ||
      (this.#projectionAware && epoch === undefined)
    )
      throw new SourceMirrorError(
        'STALE_STATE',
        'Source mirror projection epoch changed or is missing',
      );
    const next = normalize(nextCanonical, this.#options.canonicalBOM);
    if (hint?.kind === 'history') {
      const target = this.#ids.indexOf(hint.targetStateId);
      if (target < 0) throw new SourceMirrorError('INVALID_HINT', 'Unknown history checkpoint');
      const restored = this.restoreCandidate(target);
      const projection = hint.canonicalProjection;
      if (projection) this.projectedCanonical(restored.canonical, nextCanonical, projection);
      else if (restored.canonical !== nextCanonical)
        throw new SourceMirrorError('INVALID_HINT', 'History checkpoint does not match canonical');
      return this.restore(
        target,
        restored,
        next,
        projection ? this.nextProjectionEpoch() : this.#projectionEpoch,
        this.#projectionAware || projection !== undefined,
      );
    }
    const projection = hint?.canonicalProjection;
    let prefixIndexes: ReadonlyMap<number, SourceMirrorCompletePrefix['role']> | undefined;
    let canonicalPatches: readonly Patch[];
    if (hint?.kind === 'edit') {
      if (hint.baseCanonical !== this.canonical)
        throw new SourceMirrorError('STALE_STATE', 'Canonical base changed');
      // Validate the supplied coordinate space before normalizing any ranges.
      for (const patch of hint.patches) {
        logicalOffset(this.#canonical, patch.from);
        logicalOffset(this.#canonical, patch.to);
        assertWellFormedText(patch.insert);
      }
      if (hint.completePrefixes) {
        try {
          prefixIndexes = completePrefixIndexes(
            this.canonical,
            hint.patches,
            hint.completePrefixes,
            this.#canonical.bom,
          );
        } catch (error) {
          throw new SourceMirrorError('INVALID_HINT', String(error));
        }
        if (prefixIndexes.size && (hint.placementRanges || hint.placementChecks))
          throw new SourceMirrorError(
            'INVALID_HINT',
            'Complete prefix components require exact placement without inferred domains',
          );
      }
      const primary = apply(this.canonical, hint.patches);
      if (projection) this.projectedCanonical(primary, nextCanonical, projection);
      else if (primary !== nextCanonical)
        throw new SourceMirrorError('INVALID_HINT', 'Canonical patches do not produce next state');
      canonicalPatches = hint.patches.map((patch) => ({
        from: logicalOffset(this.#canonical, patch.from),
        to: logicalOffset(this.#canonical, patch.to),
        insert: patch.insert.replace(/\r\n|\r/g, '\n'),
      }));
      if (hint.placementRanges) {
        const domains = hint.placementRanges.map((range) => ({
          from: logicalOffset(this.#canonical, range.from),
          to: logicalOffset(this.#canonical, range.to),
        }));
        for (const patch of canonicalPatches)
          if (!domains.some((range) => range.from <= patch.from && range.to >= patch.to))
            throw new SourceMirrorError(
              'INVALID_HINT',
              'Patch is outside serializer placement domains',
            );
        if (hint.placementChecks) {
          const checks = hint.placementChecks.map(({ patch, range }) => {
            assertWellFormedText(patch.insert);
            return {
              patch: {
                from: logicalOffset(this.#canonical, patch.from),
                to: logicalOffset(this.#canonical, patch.to),
                insert: patch.insert.replace(/\r\n|\r/g, '\n'),
              },
              range: {
                from: logicalOffset(this.#canonical, range.from),
                to: logicalOffset(this.#canonical, range.to),
              },
            };
          });
          this.assertPlacementChecks(canonicalPatches, domains, checks);
        }
        this.assertUnambiguous(canonicalPatches, domains);
      }
      if (hint.placementChecks && !hint.placementRanges)
        throw new SourceMirrorError('INVALID_HINT', 'Insertion placement checks require domains');
      const primaryText = projection
        ? normalize(primary, this.#options.canonicalBOM).text
        : next.text;
      if (apply(this.#canonical.text, canonicalPatches) !== primaryText)
        throw new SourceMirrorError(
          'INVALID_HINT',
          'Canonical normalization changes the patch base',
        );
    } else {
      canonicalPatches = textDiff(this.#canonical.text, next.text, this.#options);
      this.assertUnambiguous(canonicalPatches);
    }
    const patches = this.project(canonicalPatches, prefixIndexes);
    const source = normalize(apply(this.source, patches), this.#options.sourceBOM);
    const ranges = projection
      ? correspond(source.text, next.text, this.#options)
      : this.nextCorrespondence(source, next, patches, canonicalPatches);
    const physicalPatches = projection
      ? diffText(this.canonical, nextCanonical, this.#options)
      : hint?.kind === 'edit'
        ? hint.patches
        : textDiff(this.canonical, nextCanonical, this.#options);
    const projectionEpoch = projection ? this.nextProjectionEpoch() : this.#projectionEpoch;
    return this.commit(
      source,
      next,
      ranges,
      patches,
      physicalPatches,
      projectionEpoch,
      this.#projectionAware || projection !== undefined,
    );
  }

  private commit(
    source: NormalizedText,
    next: NormalizedText,
    ranges: Correspondence[],
    patches: readonly Patch[],
    physicalPatches: readonly Patch[],
    projectionEpoch = this.#projectionEpoch,
    projectionAware = this.#projectionAware,
  ): SourceMirrorUpdate {
    // Active edit patches still project raw. Journal edges must instead start
    // from the unchanged history anchor, including any authorized projection gap.
    const journalPatches =
      this.#historyCanonical === this.canonical
        ? physicalPatches
        : diffText(this.#historyCanonical, next.original, this.#options);
    const entry = {
      sourceForward: ownPatches(patches),
      sourceInverse: ownPatches(inverse(this.source, patches)),
      canonicalForward: ownPatches(journalPatches),
      canonicalInverse: ownPatches(inverse(this.#historyCanonical, journalPatches)),
    };
    this.#history.splice(this.#cursor);
    this.#ids.splice(this.#cursor + 1);
    this.#history.push(entry);
    this.#ids.push(++this.#serial);
    this.#cursor++;
    this.#source = source;
    this.#canonical = next;
    this.#historyCanonical = next.original;
    this.#ranges = ranges;
    this.#projectionEpoch = projectionEpoch;
    this.#projectionAware = projectionAware;
    return this.result(patches);
  }

  private restore(
    target: number,
    candidate: MirrorHistoryCandidate,
    next: NormalizedText,
    projectionEpoch: number,
    projectionAware: boolean,
  ): SourceMirrorUpdate {
    const { source: raw, patches: knownPatches, canonicalPatches } = candidate;
    const source = normalize(raw, this.#options.sourceBOM);
    const ranges =
      this.canonical === this.#historyCanonical &&
      candidate.canonical === next.original &&
      knownPatches &&
      canonicalPatches &&
      !hasSplitEnding(this.canonical, canonicalPatches)
        ? this.nextCorrespondence(
            source,
            next,
            knownPatches,
            canonicalPatches.map((patch) => ({
              from: logicalOffset(this.#canonical, patch.from),
              to: logicalOffset(this.#canonical, patch.to),
              insert: patch.insert.replace(/\r\n|\r/g, '\n'),
            })),
          )
        : correspond(source.text, next.text, this.#options);
    const patches = knownPatches ?? textDiff(this.source, raw, this.#options);
    this.#source = source;
    this.#canonical = next;
    this.#historyCanonical = candidate.canonical;
    this.#ranges = ranges;
    this.#cursor = target;
    this.#projectionEpoch = projectionEpoch;
    this.#projectionAware = projectionAware;
    return this.result(patches);
  }

  private nextProjectionEpoch(): number {
    const epoch = this.#projectionEpoch + 1;
    if (!Number.isSafeInteger(epoch))
      throw new SourceMirrorError('STALE_STATE', 'Source mirror projection epoch exhausted');
    return epoch;
  }

  private projectedCanonical(
    base: string,
    nextCanonical: string,
    receipt: SourceMirrorCanonicalProjection,
  ): NormalizedText {
    if (receipt.baseProjectionEpoch !== this.#projectionEpoch)
      throw new SourceMirrorError('STALE_STATE', 'Source mirror projection epoch changed');
    if (receipt.baseCanonical !== base)
      throw new SourceMirrorError('INVALID_HINT', 'Projection does not match its canonical anchor');
    const normalized = normalize(base, this.#options.canonicalBOM);
    for (const patch of receipt.patches) {
      logicalOffset(normalized, patch.from);
      logicalOffset(normalized, patch.to);
      assertWellFormedText(patch.insert);
    }
    if (apply(base, receipt.patches) !== nextCanonical)
      throw new SourceMirrorError(
        'INVALID_HINT',
        'Projection patches do not produce next canonical',
      );
    return normalize(nextCanonical, this.#options.canonicalBOM);
  }

  private nextCorrespondence(
    source: NormalizedText,
    canonical: NormalizedText,
    rawPatches: readonly Patch[],
    normalizedCanonicalPatches: readonly Patch[],
  ): Correspondence[] {
    if (source.text === this.#source.text && canonical.text === this.#canonical.text)
      return this.#ranges;
    // A valid inverse may split a CRLF newly formed by joining old CR with
    // inserted LF. That physical history is exact, but has no logical offset.
    if (hasSplitEnding(this.source, rawPatches))
      return correspond(source.text, canonical.text, this.#options);
    const updated = updateEqualCorrespondence(
      this.#ranges,
      this.#canonical.text,
      normalizedCanonicalPatches,
      rawPatches.map((patch) => ({
        from: logicalOffset(this.#source, patch.from),
        to: logicalOffset(this.#source, patch.to),
        insert: patch.insert.replace(/\r\n|\r/g, '\n'),
      })),
    );
    return updated ?? correspond(source.text, canonical.text, this.#options);
  }

  /** Explore equivalent adjacent edit placements only; never run a second whole-document diff. */
  private assertPlacementChecks(
    patches: readonly Patch[],
    domains: readonly { from: number; to: number }[],
    checks: readonly { patch: Patch; range: { from: number; to: number } }[],
  ): void {
    const invalid = () =>
      new SourceMirrorError('INVALID_HINT', 'Invalid coincident insertion proof');
    if (checks.length < 2) throw invalid();
    let previous = -1;
    for (let index = 0; index < checks.length; ) {
      const first = checks[index];
      if (!first || first.patch.from <= previous) throw invalid();
      const at = first.patch.from;
      let end = index,
        insert = '';
      while (end < checks.length && checks[end]?.patch.from === at) {
        const check = checks[end];
        if (!check) throw invalid();
        const { patch, range } = check;
        if (
          patch.to !== at ||
          !patch.insert ||
          range.from > at ||
          range.to < at ||
          !domains.some((domain) => domain.from === range.from && domain.to === range.to)
        )
          throw invalid();
        insert += patch.insert;
        end++;
      }
      if (
        end - index < 2 ||
        !patches.some((patch) => patch.from === at && patch.to === at && patch.insert === insert)
      )
        throw invalid();
      // Preserve each original fragment's ambiguity check on the unchanged raw
      // source correspondence. Checking only the concatenated string is weaker.
      for (let part = index; part < end; part++) {
        const check = checks[part];
        if (!check) throw invalid();
        this.assertUnambiguous([check.patch], [check.range]);
      }
      previous = at;
      index = end;
    }
  }

  private assertUnambiguous(
    patches: readonly Patch[],
    domains?: readonly { from: number; to: number }[],
  ): void {
    // A leading BOM is never an editable canonical character, so it cannot
    // distinguish equivalent placements in an otherwise identical document.
    if (this.source.slice(this.#source.bom) === this.canonical.slice(this.#canonical.bom)) return;
    const before = this.#canonical.text;
    const uniqueDomains = domains ?? [{ from: 0, to: before.length }];
    const inspected = new Set<string>();
    for (const domain of uniqueDomains) {
      const key = `${domain.from}:${domain.to}`;
      if (inspected.has(key)) continue;
      inspected.add(key);
      const group = patches.filter((patch) => patch.from >= domain.from && patch.to <= domain.to);
      if (group.length < 2) continue;
      const from = group[0]?.from ?? 0,
        to = group.at(-1)?.to ?? 0;
      if (to - from > 4096)
        throw new SourceMirrorError(
          'AMBIGUOUS_EDIT',
          'Compound edit exceeds bounded placement proof; provide exact ranges',
        );
      const original = before.slice(from, to);
      const changed = apply(
        original,
        group.map((patch) => ({
          from: patch.from - from,
          to: patch.to - from,
          insert: patch.insert,
        })),
      );
      const reverse = (value: string) => Array.from(value).reverse().join('');
      const alternative = textDiff(reverse(original), reverse(changed), this.#options)
        .map((patch) => ({
          from: to - patch.to,
          to: to - patch.from,
          insert: reverse(patch.insert),
        }))
        .reverse();
      this.comparePlacements(this.project(group), this.project(alternative));
    }
    for (let index = 0; index < patches.length; index++) {
      const patch = patches[index];
      if (!patch) continue;
      const domain = domains?.find((range) => range.from <= patch.from && range.to >= patch.to);
      const leftLimit = Math.max(patches[index - 1]?.to ?? 0, domain?.from ?? 0);
      const rightLimit = Math.min(
        patches[index + 1]?.from ?? before.length,
        domain?.to ?? before.length,
      );
      const baseline = this.project([patch]);
      let probes = 0;
      for (const direction of [-1, 1]) {
        let candidate = { ...patch };
        while (true) {
          const { from, to, insert } = candidate;
          if (direction < 0) {
            if (from <= leftLimit) break;
            const previous = before[from - 1] ?? '';
            if (insert ? before[to - 1] !== insert.at(-1) : previous !== before[to - 1]) break;
            candidate = {
              from: from - 1,
              to: to - 1,
              insert: insert ? previous + insert.slice(0, -1) : '',
            };
          } else {
            if (to >= rightLimit) break;
            const following = before[to] ?? '';
            if (insert ? before[from] !== insert[0] : following !== before[from]) break;
            candidate = {
              from: from + 1,
              to: to + 1,
              insert: insert ? insert.slice(1) + following : '',
            };
          }
          if (++probes > 4096)
            throw new SourceMirrorError(
              'AMBIGUOUS_EDIT',
              'Repeated edit exceeds placement proof budget; provide an edit hint',
            );
          try {
            assertPosition(before, candidate.from);
            assertPosition(before, candidate.to);
          } catch {
            continue;
          }
          const alternate = this.project([candidate]);
          this.comparePlacements(baseline, alternate);
        }
      }
    }
  }

  private comparePlacements(baseline: readonly Patch[], alternate: readonly Patch[]): void {
    const rawFrom = Math.min(baseline[0]?.from ?? 0, alternate[0]?.from ?? 0);
    const rawTo = Math.max(baseline.at(-1)?.to ?? 0, alternate.at(-1)?.to ?? 0);
    const slice = this.source.slice(rawFrom, rawTo);
    const local = (values: readonly Patch[]) =>
      values.map((value) => ({
        from: value.from - rawFrom,
        to: value.to - rawFrom,
        insert: value.insert,
      }));
    if (apply(slice, local(baseline)) !== apply(slice, local(alternate)))
      throw new SourceMirrorError(
        'AMBIGUOUS_EDIT',
        'Repeated canonical text has different raw-source edit placements; provide an edit hint',
      );
  }

  private result(patches: readonly Patch[]): SourceMirrorUpdate {
    return Object.freeze({
      source: this.source,
      patches: Object.freeze(patches.map((patch) => Object.freeze({ ...patch }))),
    });
  }

  private restoreCandidate(target: number): MirrorHistoryCandidate {
    let source = this.source,
      canonical = this.#historyCanonical;
    for (let index = this.#cursor - 1; index >= target; index--) {
      const entry = this.#history[index];
      if (!entry)
        throw new SourceMirrorError('INCONSISTENT_MAPPING', 'Missing inverse mirror history');
      source = apply(source, entry.sourceInverse);
      canonical = apply(canonical, entry.canonicalInverse);
    }
    for (let index = this.#cursor; index < target; index++) {
      const entry = this.#history[index];
      if (!entry)
        throw new SourceMirrorError('INCONSISTENT_MAPPING', 'Missing forward mirror history');
      source = apply(source, entry.sourceForward);
      canonical = apply(canonical, entry.canonicalForward);
    }
    // Adjacent history already contains exact physical raw ranges. Re-diffing
    // can choose another placement in repeated text and needlessly scans it all.
    const patches =
      target === this.#cursor - 1
        ? this.#history[target]?.sourceInverse
        : target === this.#cursor + 1
          ? this.#history[this.#cursor]?.sourceForward
          : target === this.#cursor
            ? []
            : undefined;
    const canonicalPatches =
      target === this.#cursor - 1
        ? this.#history[target]?.canonicalInverse
        : target === this.#cursor + 1
          ? this.#history[this.#cursor]?.canonicalForward
          : target === this.#cursor
            ? []
            : undefined;
    return {
      source,
      canonical,
      ...(patches === undefined ? {} : { patches }),
      ...(canonicalPatches === undefined ? {} : { canonicalPatches }),
    };
  }

  private project(
    changes: readonly Patch[],
    completePrefixes?: ReadonlyMap<number, SourceMirrorCompletePrefix['role']>,
  ): Patch[] {
    const groups: {
      from: number;
      to: number;
      changes: Patch[];
      prefix?: SourceMirrorCompletePrefix['role'];
    }[] = [];
    for (const [index, change] of changes.entries()) {
      const prefix = completePrefixes?.get(index);
      if (prefix) {
        groups.push({ from: change.from, to: change.to, changes: [change], prefix });
        continue;
      }
      let from = change.from,
        to = change.to;
      for (const range of this.#ranges) {
        if (range.equal) continue;
        const insideStart = from > range.canonicalFrom && from < range.canonicalTo;
        const insideEnd = to > range.canonicalFrom && to < range.canonicalTo;
        const usesVirtualSeparator =
          change.from === change.to &&
          change.insert.length > 0 &&
          from === range.canonicalTo &&
          range.sourceFrom === range.sourceTo &&
          range.canonicalFrom < range.canonicalTo &&
          this.#canonical.text.slice(range.canonicalFrom, range.canonicalTo).includes('\n') &&
          (from === this.#canonical.text.length || change.insert.includes('\n'));
        if (insideStart || usesVirtualSeparator) from = Math.min(from, range.canonicalFrom);
        if (insideEnd) to = Math.max(to, range.canonicalTo);
      }
      const previous = groups.at(-1);
      if (previous && !previous.prefix && from <= previous.to) {
        previous.to = Math.max(previous.to, to);
        previous.changes.push(change);
      } else groups.push({ from, to, changes: [change] });
    }
    const patches: Patch[] = [];
    for (const group of groups) {
      const insertsBeforeHiddenTrailingSpace =
        group.from === group.to &&
        this.#ranges.some(
          (range) =>
            range.canonicalFrom === group.from &&
            range.canonicalTo === group.from &&
            /^[ \t]+$/.test(this.#source.text.slice(range.sourceFrom, range.sourceTo)) &&
            (range.sourceTo === this.#source.text.length ||
              this.#source.text[range.sourceTo] === '\n'),
        );
      const from = physicalOffset(
        this.#source,
        mappedOffset(
          this.#ranges,
          group.from,
          !group.prefix &&
            ((group.from === 0 && group.to > group.from) || insertsBeforeHiddenTrailingSpace)
            ? 'left'
            : 'right',
        ),
      );
      const to =
        group.from === group.to
          ? from
          : physicalOffset(
              this.#source,
              mappedOffset(
                this.#ranges,
                group.to,
                group.prefix || (group.to === this.#canonical.text.length && group.to > group.from)
                  ? 'right'
                  : 'left',
              ),
            );
      const canonicalSlice = this.#canonical.text.slice(group.from, group.to);
      const replacement = apply(
        canonicalSlice,
        group.changes.map((change) => ({
          from: change.from - group.from,
          to: change.to - group.from,
          insert: change.insert,
        })),
      );
      const insert = replacement.replace(
        /\n/g,
        localEnding(this.source, from, this.#options.defaultLineEnding),
      );
      if (
        group.prefix &&
        !isCompletePrefix(
          this.source.slice(this.#source.bom),
          from - this.#source.bom,
          to - this.#source.bom,
          group.prefix,
        )
      )
        throw new SourceMirrorError(
          'INVALID_HINT',
          'Complete syntax prefix maps outside its raw component',
        );
      if (to < from)
        throw new SourceMirrorError(
          'INCONSISTENT_MAPPING',
          'Canonical edit maps to a reversed source range',
        );
      const previous = patches.at(-1);
      if (previous && previous.to > from)
        throw new SourceMirrorError('INVALID_HINT', 'Complete prefix overlaps another raw edit');
      if (previous && previous.to === from)
        patches[patches.length - 1] = { from: previous.from, to, insert: previous.insert + insert };
      else patches.push({ from, to, insert });
    }
    // Raw CR and LF can have represented two separate logical line endings
    // before this edit. Joining their surviving sides must not silently turn
    // them into one CRLF. Add the disambiguating LF inside the edited patch;
    // preserve every untouched byte, while accepting that one adjacent EOL's
    // representation necessarily becomes CRLF. History restores exact bytes.
    return patches.map((patch) => {
      if (patch.from === patch.to && !patch.insert) return patch;
      let insert = patch.insert;
      const before = this.source[patch.from - 1],
        after = this.source[patch.to];
      if (before === '\r' && (insert.startsWith('\n') || (!insert && after === '\n')))
        insert = `\n${insert}`;
      if (insert.endsWith('\r') && after === '\n') insert += '\n';
      return insert === patch.insert ? patch : { ...patch, insert };
    });
  }
}

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  changeIndexes,
  type DiffChunk,
  diffLines,
  diffStats,
  FOLD_MIN_HIDDEN,
  inlineDiff,
  normalizeWhitespace,
  type Segment,
  splitLines,
  splitRows,
  tokenize,
  unifiedRows,
} from '../src/features/git/model/diff.js';

/** Checks the structural contract and that right can be rebuilt from left + chunks. */
function assertValid(
  left: readonly string[],
  right: readonly string[],
  chunks: readonly DiffChunk[],
  ignoreWhitespace = false,
): void {
  let l = 0;
  let r = 0;
  const rebuilt: string[] = [];
  chunks.forEach((chunk, index) => {
    expect(chunk.leftStart).toBe(l);
    expect(chunk.rightStart).toBe(r);
    expect(chunk.leftEnd).toBeGreaterThanOrEqual(chunk.leftStart);
    expect(chunk.rightEnd).toBeGreaterThanOrEqual(chunk.rightStart);
    expect(chunk.leftEnd - chunk.leftStart + chunk.rightEnd - chunk.rightStart).toBeGreaterThan(0);
    if (index > 0) expect(chunks[index - 1]?.kind).not.toBe(chunk.kind);
    if (chunk.kind === 'equal') {
      expect(chunk.leftEnd - chunk.leftStart).toBe(chunk.rightEnd - chunk.rightStart);
      const a = left.slice(chunk.leftStart, chunk.leftEnd);
      const b = right.slice(chunk.rightStart, chunk.rightEnd);
      const key = (lines: string[]) => (ignoreWhitespace ? lines.map(normalizeWhitespace) : lines);
      expect(key(a)).toEqual(key(b));
      rebuilt.push(...b);
    } else {
      rebuilt.push(...right.slice(chunk.rightStart, chunk.rightEnd));
    }
    l = chunk.leftEnd;
    r = chunk.rightEnd;
  });
  expect(l).toBe(left.length);
  expect(r).toBe(right.length);
  expect(rebuilt).toEqual(right);
}

const segmentsText = (segments: readonly Segment[]): string => segments.map((s) => s.text).join('');

describe('splitLines', () => {
  it('handles empty text and terminators', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('a')).toEqual(['a']);
    expect(splitLines('a\n')).toEqual(['a']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(splitLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('keeps blank lines and lone carriage returns', () => {
    expect(splitLines('\n')).toEqual(['']);
    expect(splitLines('\n\n')).toEqual(['', '']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
    expect(splitLines('\r\n')).toEqual(['']);
    expect(splitLines('a\rb')).toEqual(['a\rb']);
  });
});

describe('diffLines', () => {
  it('returns no chunks for two empty files', () => {
    expect(diffLines([], [])).toEqual([]);
  });

  it('returns one equal chunk for identical input', () => {
    expect(diffLines(['a', 'b'], ['a', 'b'])).toEqual([
      { kind: 'equal', leftStart: 0, leftEnd: 2, rightStart: 0, rightEnd: 2 },
    ]);
  });

  it('describes pure insertions and deletions', () => {
    expect(diffLines([], ['a'])).toEqual([
      { kind: 'change', leftStart: 0, leftEnd: 0, rightStart: 0, rightEnd: 1 },
    ]);
    expect(diffLines(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { kind: 'equal', leftStart: 0, leftEnd: 1, rightStart: 0, rightEnd: 1 },
      { kind: 'change', leftStart: 1, leftEnd: 2, rightStart: 1, rightEnd: 1 },
      { kind: 'equal', leftStart: 2, leftEnd: 3, rightStart: 1, rightEnd: 2 },
    ]);
  });

  it('merges an adjacent deletion and insertion into one change chunk', () => {
    const chunks = diffLines(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'd']);
    expect(chunks).toEqual([
      { kind: 'equal', leftStart: 0, leftEnd: 1, rightStart: 0, rightEnd: 1 },
      { kind: 'change', leftStart: 1, leftEnd: 3, rightStart: 1, rightEnd: 3 },
      { kind: 'equal', leftStart: 3, leftEnd: 4, rightStart: 3, rightEnd: 4 },
    ]);
  });

  it('reports a completely different file as one change', () => {
    expect(diffLines(['a', 'b'], ['c', 'd', 'e'])).toEqual([
      { kind: 'change', leftStart: 0, leftEnd: 2, rightStart: 0, rightEnd: 3 },
    ]);
  });

  it('aligns on unique lines rather than on frequent ones', () => {
    const left = ['fn a() {', '  x();', '}', '', 'fn b() {', '  y();', '}'];
    const right = ['fn b() {', '  y();', '}'];
    const chunks = diffLines(left, right);
    assertValid(left, right, chunks);
    expect(chunks).toEqual([
      { kind: 'change', leftStart: 0, leftEnd: 4, rightStart: 0, rightEnd: 0 },
      { kind: 'equal', leftStart: 4, leftEnd: 7, rightStart: 0, rightEnd: 3 },
    ]);
  });

  it('slides an inserted block so that it starts after a blank line', () => {
    const left = ['fn a() {', '}', '', 'fn c() {', '}'];
    const right = ['fn a() {', '}', '', 'fn b() {', '}', '', 'fn c() {', '}'];
    const chunks = diffLines(left, right);
    assertValid(left, right, chunks);
    const change = chunks.find((chunk) => chunk.kind === 'change');
    expect(change).toMatchObject({ leftStart: 3, leftEnd: 3, rightStart: 3, rightEnd: 6 });
    expect(right.slice(3, 6)).toEqual(['fn b() {', '}', '']);
  });

  it('slides an ambiguous insertion down when no blank line helps', () => {
    const chunks = diffLines(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b', 'a', 'b']);
    expect(chunks).toEqual([
      { kind: 'equal', leftStart: 0, leftEnd: 4, rightStart: 0, rightEnd: 4 },
      { kind: 'change', leftStart: 4, leftEnd: 4, rightStart: 4, rightEnd: 6 },
    ]);
  });

  it('handles regions made only of very frequent lines', () => {
    const left: string[] = Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? '}' : ''));
    const right = [...left];
    right.splice(150, 0, 'new');
    right.splice(40, 1);
    const chunks = diffLines(left, right);
    assertValid(left, right, chunks);
    expect(diffStats(chunks)).toEqual({ additions: 1, deletions: 1, changes: 2 });
  });

  it('ignores whitespace when asked but keeps line identity', () => {
    const left = ['if (a) {', '  b();', '}'];
    const right = ['if(a){', '\tb( );', '}', 'c'];
    expect(diffLines(left, right).filter((c) => c.kind === 'change')).toHaveLength(2);
    const chunks = diffLines(left, right, { ignoreWhitespace: true });
    assertValid(left, right, chunks, true);
    expect(chunks).toEqual([
      { kind: 'equal', leftStart: 0, leftEnd: 3, rightStart: 0, rightEnd: 3 },
      { kind: 'change', leftStart: 3, leftEnd: 3, rightStart: 3, rightEnd: 4 },
    ]);
  });

  it('keeps the contract for random inputs (property)', () => {
    const line = fc.constantFrom('a', 'b', 'c', '', ' ', '}', 'x y', 'x  y', '中文');
    fc.assert(
      fc.property(
        fc.array(line, { maxLength: 40 }),
        fc.array(line, { maxLength: 40 }),
        fc.boolean(),
        (left, right, ignoreWhitespace) => {
          assertValid(left, right, diffLines(left, right, { ignoreWhitespace }), ignoreWhitespace);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps the contract for edits of a common base (property)', () => {
    const edit = fc.record({
      at: fc.nat(),
      remove: fc.nat({ max: 4 }),
      insert: fc.array(fc.constantFrom('new', '', '}', 'line 3'), { maxLength: 4 }),
    });
    fc.assert(
      fc.property(fc.nat({ max: 120 }), fc.array(edit, { maxLength: 8 }), (size, edits) => {
        const left = Array.from({ length: size }, (_, i) => (i % 7 === 0 ? '' : `line ${i}`));
        const right = [...left];
        for (const { at, remove, insert } of edits) {
          right.splice(at % (right.length + 1), remove, ...insert);
        }
        const chunks = diffLines(left, right);
        assertValid(left, right, chunks);
        const stats = diffStats(chunks);
        expect(stats.additions - stats.deletions).toBe(right.length - left.length);
      }),
      { numRuns: 300 },
    );
  });

  it('diffs a 10k-line file with 200 scattered edits quickly', () => {
    const left = Array.from({ length: 10_000 }, (_, i) =>
      i % 10 === 9 ? '' : `const value${i} = compute(${i});`,
    );
    const right = [...left];
    for (let e = 0; e < 200; e++) {
      const at = (e * 7919) % right.length;
      if (e % 3 === 0) right.splice(at, 1);
      else if (e % 3 === 1) right.splice(at, 0, `inserted ${e}`);
      else right[at] = `changed ${e}`;
    }
    diffLines(left, right);
    const started = performance.now();
    const chunks = diffLines(left, right);
    const elapsed = performance.now() - started;
    assertValid(left, right, chunks);
    expect(diffStats(chunks).changes).toBeGreaterThan(150);
    expect(elapsed).toBeLessThan(250);
  });

  it('stays fast and correct for huge, unrelated or repetitive files', () => {
    const left = Array.from({ length: 30_000 }, (_, i) => `left ${i % 50}`);
    const right = Array.from({ length: 30_000 }, (_, i) => `left ${(i * 7) % 50}`);
    const started = performance.now();
    const chunks = diffLines(left, right);
    const elapsed = performance.now() - started;
    assertValid(left, right, chunks);
    expect(elapsed).toBeLessThan(3_000);
    const unrelated = diffLines(
      Array.from({ length: 30_000 }, (_, i) => `a${i}`),
      Array.from({ length: 30_000 }, (_, i) => `b${i}`),
    );
    expect(unrelated).toHaveLength(1);
  });
});

describe('diffStats and changeIndexes', () => {
  it('counts lines and change chunks', () => {
    const chunks = diffLines(['a', 'b', 'c', 'd', 'e'], ['a', 'x', 'c', 'e', 'f', 'g']);
    expect(diffStats(chunks)).toEqual({ additions: 3, deletions: 2, changes: 3 });
    expect(changeIndexes(chunks)).toEqual([1, 3, 5]);
    expect(diffStats([])).toEqual({ additions: 0, deletions: 0, changes: 0 });
  });
});

describe('rows', () => {
  const left = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const right = [...left];
  right[2] = 'changed';
  right.splice(15, 1, 'x', 'y');
  const chunks = diffLines(left, right);

  it('pairs change lines side by side, padding the shorter side', () => {
    const rows = splitRows(chunks, null);
    expect(rows).toHaveLength(21);
    const change = rows.filter((row) => row.kind === 'change');
    expect(change).toEqual([
      { kind: 'change', left: 2, right: 2, chunk: 1 },
      { kind: 'change', left: 15, right: 15, chunk: 3 },
      { kind: 'change', left: null, right: 16, chunk: 3 },
    ]);
  });

  it('lists deletions before insertions in the unified view', () => {
    const rows = unifiedRows(chunks, null);
    expect(rows).toHaveLength(23);
    expect(rows.filter((row) => row.chunk === 3)).toEqual([
      { kind: 'delete', left: 15, right: null, chunk: 3 },
      { kind: 'insert', left: null, right: 15, chunk: 3 },
      { kind: 'insert', left: null, right: 16, chunk: 3 },
    ]);
    expect(rows[0]).toEqual({ kind: 'equal', left: 0, right: 0, chunk: 0 });
  });

  it('folds long equal runs around context and expands them by id', () => {
    const rows = splitRows(chunks, 3);
    expect(rows.map((row) => row.kind)).toEqual([
      'equal',
      'equal',
      'change',
      'equal',
      'equal',
      'equal',
      'fold',
      'equal',
      'equal',
      'equal',
      'change',
      'change',
      'equal',
      'equal',
      'equal',
      'equal',
    ]);
    const folds = rows.filter((row) => row.kind === 'fold');
    expect(folds).toEqual([{ kind: 'fold', left: 6, right: 6, chunk: 2, hidden: 6, foldId: 2 }]);
    // The trailing run has 4 lines: 3 context + 1 line, too short to be worth a fold.
    expect(FOLD_MIN_HIDDEN).toBeGreaterThan(1);
    expect(rows.slice(-4)).toEqual(
      [16, 17, 18, 19].map((l) => ({
        kind: 'equal',
        left: l,
        right: l + 1,
        chunk: 4,
      })),
    );
    const expanded = splitRows(chunks, 3, new Set([2]));
    expect(expanded.some((row) => row.kind === 'fold')).toBe(false);
    expect(expanded).toEqual(splitRows(chunks, null));
  });

  it('folds leading context fully and keeps unified folds in step', () => {
    const many = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const edited = [...many.slice(0, 29), 'end'];
    const c = diffLines(many, edited);
    const rows = unifiedRows(c, 2);
    expect(rows[0]).toEqual({ kind: 'fold', left: 0, right: 0, chunk: 0, hidden: 27, foldId: 0 });
    expect(rows.slice(1).map((row) => row.kind)).toEqual(['equal', 'equal', 'delete', 'insert']);
    expect(unifiedRows(c, 2, new Set([0]))).toEqual(unifiedRows(c, null));
    expect(unifiedRows(c, 0)[1]).toEqual({ kind: 'delete', left: 29, right: null, chunk: 1 });
  });

  it('folds an unchanged file into a single row', () => {
    const same = diffLines(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(splitRows(same, 3)).toEqual([
      { kind: 'fold', left: 0, right: 0, chunk: 0, hidden: 3, foldId: 0 },
    ]);
  });
});

describe('inlineDiff', () => {
  it('tokenizes words, CJK characters, whitespace and punctuation', () => {
    expect(tokenize('foo_bar1, 中文abc  x!')).toEqual([
      'foo_bar1',
      ',',
      ' ',
      '中',
      '文',
      'abc',
      '  ',
      'x',
      '!',
    ]);
  });

  it('highlights only the changed word', () => {
    const result = inlineDiff('const value = 1;', 'const value = 2;');
    expect(result.left).toEqual([
      { text: 'const value = ', changed: false },
      { text: '1', changed: true },
      { text: ';', changed: false },
    ]);
    expect(result.right).toEqual([
      { text: 'const value = ', changed: false },
      { text: '2', changed: true },
      { text: ';', changed: false },
    ]);
  });

  it('diffs CJK text character by character', () => {
    const result = inlineDiff('我们今天去公园。', '我们明天去公园！');
    expect(result.left).toEqual([
      { text: '我们', changed: false },
      { text: '今', changed: true },
      { text: '天去公园', changed: false },
      { text: '。', changed: true },
    ]);
    expect(segmentsText(result.right)).toBe('我们明天去公园！');
  });

  it('absorbs whitespace between changed words', () => {
    const result = inlineDiff('the quick brown fox', 'the slow red fox');
    expect(result.left).toEqual([
      { text: 'the ', changed: false },
      { text: 'quick brown', changed: true },
      { text: ' fox', changed: false },
    ]);
  });

  it('marks very different or empty lines as a whole', () => {
    expect(inlineDiff('alpha beta', 'gamma delta')).toEqual({
      left: [{ text: 'alpha beta', changed: true }],
      right: [{ text: 'gamma delta', changed: true }],
    });
    expect(inlineDiff('', 'new')).toEqual({ left: [], right: [{ text: 'new', changed: true }] });
    expect(inlineDiff('same', 'same')).toEqual({
      left: [{ text: 'same', changed: false }],
      right: [{ text: 'same', changed: false }],
    });
  });

  it('always covers both lines fully (property)', () => {
    const piece = fc.constantFrom('a', 'bc', ' ', '中', '文', ',', '😀', 'x_y', '\t');
    fc.assert(
      fc.property(fc.array(piece), fc.array(piece), (a, b) => {
        const left = a.join('');
        const right = b.join('');
        const result = inlineDiff(left, right);
        expect(segmentsText(result.left)).toBe(left);
        expect(segmentsText(result.right)).toBe(right);
        for (const segments of [result.left, result.right]) {
          for (const segment of segments) expect(segment.text).not.toBe('');
          segments.slice(1).forEach((segment, index) => {
            expect(segment.changed).not.toBe(segments[index]?.changed);
          });
        }
      }),
      { numRuns: 300 },
    );
  });
});

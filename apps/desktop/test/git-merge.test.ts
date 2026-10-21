import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyNonConflicting,
  chunkResult,
  type Decision,
  initialDecisions,
  type MergeChunk,
  merge3,
  mergeResult,
  parseConflictMarkers,
  unresolvedCount,
} from '../src/features/git/model/merge.js';

const L = (text: string): string[] => (text === '' ? [] : text.split(''));

/** Chunks are contiguous, in order, non-empty and cover all three files. */
function assertCovers(
  chunks: readonly MergeChunk[],
  base: readonly string[],
  yours: readonly string[],
  theirs: readonly string[],
): void {
  let b = 0;
  let y = 0;
  let t = 0;
  for (const chunk of chunks) {
    expect(chunk.base[0]).toBe(b);
    expect(chunk.yours[0]).toBe(y);
    expect(chunk.theirs[0]).toBe(t);
    const size =
      chunk.base[1] -
      chunk.base[0] +
      chunk.yours[1] -
      chunk.yours[0] +
      chunk.theirs[1] -
      chunk.theirs[0];
    expect(size).toBeGreaterThan(0);
    if (chunk.kind === 'unchanged') {
      const lines = base.slice(chunk.base[0], chunk.base[1]);
      expect(yours.slice(chunk.yours[0], chunk.yours[1])).toEqual(lines);
      expect(theirs.slice(chunk.theirs[0], chunk.theirs[1])).toEqual(lines);
    }
    [b, y, t] = [chunk.base[1], chunk.yours[1], chunk.theirs[1]];
  }
  expect([b, y, t]).toEqual([base.length, yours.length, theirs.length]);
}

const kinds = (chunks: readonly MergeChunk[]) => chunks.map((chunk) => chunk.kind);

describe('merge3', () => {
  it('returns nothing for three empty files and one unchanged chunk for identical ones', () => {
    expect(merge3([], [], [])).toEqual([]);
    expect(merge3(L('abc'), L('abc'), L('abc'))).toEqual([
      { kind: 'unchanged', base: [0, 3], yours: [0, 3], theirs: [0, 3] },
    ]);
  });

  it('takes a one-sided change from either side', () => {
    expect(merge3(L('abc'), L('aXc'), L('abc'))).toEqual([
      { kind: 'unchanged', base: [0, 1], yours: [0, 1], theirs: [0, 1] },
      { kind: 'yours', base: [1, 2], yours: [1, 2], theirs: [1, 2] },
      { kind: 'unchanged', base: [2, 3], yours: [2, 3], theirs: [2, 3] },
    ]);
    expect(kinds(merge3(L('abc'), L('abc'), L('ac')))).toEqual([
      'unchanged',
      'theirs',
      'unchanged',
    ]);
  });

  it('keeps separated changes on both sides apart', () => {
    const base = L('abcde');
    const yours = L('aXXbcde');
    const theirs = L('abcd');
    const chunks = merge3(base, yours, theirs);
    assertCovers(chunks, base, yours, theirs);
    expect(chunks).toEqual([
      { kind: 'unchanged', base: [0, 1], yours: [0, 1], theirs: [0, 1] },
      { kind: 'yours', base: [1, 1], yours: [1, 3], theirs: [1, 1] },
      { kind: 'unchanged', base: [1, 4], yours: [3, 6], theirs: [1, 4] },
      { kind: 'theirs', base: [4, 5], yours: [6, 7], theirs: [4, 4] },
    ]);
    expect(mergeResult(chunks, initialDecisions(chunks), base, yours, theirs)).toEqual(L('aXXbcd'));
  });

  it('recognises identical changes on both sides', () => {
    const chunks = merge3(L('abc'), L('aXc'), L('aXc'));
    expect(kinds(chunks)).toEqual(['unchanged', 'both-same', 'unchanged']);
    expect(initialDecisions(chunks)).toEqual([
      { kind: 'base' },
      { kind: 'yours' },
      { kind: 'base' },
    ]);
  });

  it('reports overlapping changes as one conflict', () => {
    const base = L('abcde');
    const yours = L('aXYde');
    const theirs = L('abZWe');
    const chunks = merge3(base, yours, theirs);
    assertCovers(chunks, base, yours, theirs);
    expect(chunks).toEqual([
      { kind: 'unchanged', base: [0, 1], yours: [0, 1], theirs: [0, 1] },
      { kind: 'conflict', base: [1, 4], yours: [1, 4], theirs: [1, 4] },
      { kind: 'unchanged', base: [4, 5], yours: [4, 5], theirs: [4, 5] },
    ]);
  });

  it('groups adjacent changes into a conflict', () => {
    const chunks = merge3(L('abcd'), L('aXcd'), L('abYd'));
    expect(chunks).toEqual([
      { kind: 'unchanged', base: [0, 1], yours: [0, 1], theirs: [0, 1] },
      { kind: 'conflict', base: [1, 3], yours: [1, 3], theirs: [1, 3] },
      { kind: 'unchanged', base: [3, 4], yours: [3, 4], theirs: [3, 4] },
    ]);
  });

  it('chains overlaps across several hunks of both sides', () => {
    const base = L('abcdefg');
    const yours = L('aXcYefg');
    const theirs = L('abZdWfg');
    const chunks = merge3(base, yours, theirs);
    assertCovers(chunks, base, yours, theirs);
    expect(kinds(chunks)).toEqual(['unchanged', 'conflict', 'unchanged']);
    expect(chunks[1]?.base).toEqual([1, 5]);
  });

  it('handles an empty base where both sides added text', () => {
    expect(merge3([], L('ab'), L('cd'))).toEqual([
      { kind: 'conflict', base: [0, 0], yours: [0, 2], theirs: [0, 2] },
    ]);
    expect(merge3([], L('ab'), L('ab'))).toEqual([
      { kind: 'both-same', base: [0, 0], yours: [0, 2], theirs: [0, 2] },
    ]);
    expect(merge3([], L('ab'), [])).toEqual([
      { kind: 'yours', base: [0, 0], yours: [0, 2], theirs: [0, 0] },
    ]);
  });

  it('merges insertions at both ends', () => {
    const base = L('mid');
    const yours = L('Smid');
    const theirs = L('midE');
    const chunks = merge3(base, yours, theirs);
    assertCovers(chunks, base, yours, theirs);
    expect(kinds(chunks)).toEqual(['yours', 'unchanged', 'theirs']);
    expect(mergeResult(chunks, initialDecisions(chunks), base, yours, theirs)).toEqual(L('SmidE'));
  });

  it('conflicts on different insertions at the same place', () => {
    expect(kinds(merge3(L('ab'), L('aXb'), L('aYb')))).toEqual([
      'unchanged',
      'conflict',
      'unchanged',
    ]);
  });

  it('can ignore whitespace differences', () => {
    const base = ['a', 'b  c', 'd'];
    const yours = ['a', 'b c', 'd'];
    const theirs = ['a', 'bc', 'd', 'e'];
    expect(kinds(merge3(base, yours, theirs))).toEqual([
      'unchanged',
      'conflict',
      'unchanged',
      'theirs',
    ]);
    expect(kinds(merge3(base, yours, theirs, { ignoreWhitespace: true }))).toEqual([
      'unchanged',
      'theirs',
    ]);
    expect(kinds(merge3(['x'], ['y z'], ['yz'], { ignoreWhitespace: true }))).toEqual([
      'both-same',
    ]);
  });

  it('covers the files and rebuilds either side (property)', () => {
    const text = fc.array(fc.constantFrom('a', 'b', 'c', 'd', ''), { maxLength: 14 });
    fc.assert(
      fc.property(text, text, text, (base, yours, theirs) => {
        const chunks = merge3(base, yours, theirs);
        assertCovers(chunks, base, yours, theirs);
        const all = (kind: 'yours' | 'theirs'): Decision[] => chunks.map(() => ({ kind }));
        expect(mergeResult(chunks, all('yours'), base, yours, theirs)).toEqual(yours);
        expect(mergeResult(chunks, all('theirs'), base, yours, theirs)).toEqual(theirs);
        const natural = mergeResult(chunks, initialDecisions(chunks), base, yours, theirs);
        const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
        if (same(theirs, base)) expect(natural).toEqual(yours);
        if (same(yours, base)) expect(natural).toEqual(theirs);
        if (same(yours, theirs)) expect(natural).toEqual(yours);
      }),
      { numRuns: 500 },
    );
  });
});

describe('decisions', () => {
  const base = L('abcdef');
  const yours = L('aXcdeQ');
  const theirs = L('abYdef');
  // a | b->X vs c->Y (adjacent: conflict) | d e | f->Q
  const chunks = merge3(base, yours, theirs);

  it('starts with natural decisions and unresolved conflicts', () => {
    expect(kinds(chunks)).toEqual(['unchanged', 'conflict', 'unchanged', 'yours']);
    const decisions = initialDecisions(chunks);
    expect(decisions).toEqual([{ kind: 'base' }, null, { kind: 'base' }, { kind: 'yours' }]);
    expect(unresolvedCount(chunks, decisions)).toBe(1);
    expect(unresolvedCount(chunks, [])).toBe(4);
    expect(mergeResult(chunks, decisions, base, yours, theirs)).toEqual(L('abcdeQ'));
  });

  it('builds every kind of chunk result', () => {
    const conflict = chunks[1] as MergeChunk;
    const result = (decision: Decision | null) =>
      chunkResult(conflict, decision, base, yours, theirs);
    expect(result(null)).toEqual(L('bc'));
    expect(result({ kind: 'base' })).toEqual(L('bc'));
    expect(result({ kind: 'yours' })).toEqual(L('Xc'));
    expect(result({ kind: 'theirs' })).toEqual(L('bY'));
    expect(result({ kind: 'yours-theirs' })).toEqual(L('XcbY'));
    expect(result({ kind: 'theirs-yours' })).toEqual(L('bYXc'));
    const custom = { kind: 'custom' as const, lines: ['m', 'n'] };
    const lines = result(custom);
    expect(lines).toEqual(['m', 'n']);
    lines.push('o');
    expect(custom.lines).toEqual(['m', 'n']);
  });

  it('applies non-conflicting changes without touching conflict decisions', () => {
    const edited: (Decision | null)[] = [
      { kind: 'theirs' },
      { kind: 'theirs-yours' },
      null,
      { kind: 'base' },
    ];
    const applied = applyNonConflicting(chunks, edited);
    expect(applied).toEqual([
      { kind: 'base' },
      { kind: 'theirs-yours' },
      { kind: 'base' },
      { kind: 'yours' },
    ]);
    expect(applyNonConflicting(chunks, [])).toEqual(initialDecisions(chunks));
    expect(unresolvedCount(chunks, applied)).toBe(0);
    expect(mergeResult(chunks, applied, base, yours, theirs)).toEqual(L('abYXcdeQ'));
  });
});

describe('parseConflictMarkers', () => {
  it('splits a two-way conflict', () => {
    const text = [
      'top',
      '<<<<<<< HEAD',
      'mine',
      '=======',
      'other',
      'more',
      '>>>>>>> feature',
      'bottom',
      '',
    ].join('\n');
    expect(parseConflictMarkers(text)).toEqual({
      yours: ['top', 'mine', 'bottom'],
      base: ['top', 'bottom'],
      theirs: ['top', 'other', 'more', 'bottom'],
      conflicts: 1,
    });
  });

  it('reads the base section of diff3-style markers and CRLF files', () => {
    const text = [
      '<<<<<<< ours',
      'A',
      '||||||| base',
      'B',
      '=======',
      '>>>>>>> theirs',
      'x',
      '<<<<<<<',
      '=======',
      'T',
      '>>>>>>>',
    ].join('\r\n');
    expect(parseConflictMarkers(text)).toEqual({
      yours: ['A', 'x'],
      base: ['B', 'x'],
      theirs: ['x', 'T'],
      conflicts: 2,
    });
  });

  it('treats a setext underline as content and returns no conflicts for plain text', () => {
    expect(parseConflictMarkers('Title\n=======\ntext')).toEqual({
      yours: ['Title', '=======', 'text'],
      base: ['Title', '=======', 'text'],
      theirs: ['Title', '=======', 'text'],
      conflicts: 0,
    });
    expect(parseConflictMarkers('')).toEqual({ yours: [], base: [], theirs: [], conflicts: 0 });
    expect(parseConflictMarkers('<<<<<<<<< not a marker\n>>>>>>>x')?.conflicts).toBe(0);
  });

  it('rejects malformed markers', () => {
    expect(parseConflictMarkers('<<<<<<< a\nx\n=======\ny')).toBeNull();
    expect(parseConflictMarkers('<<<<<<< a\nx\n>>>>>>> b')).toBeNull();
    expect(parseConflictMarkers('<<<<<<< a\n<<<<<<< b\n=======\n>>>>>>> c')).toBeNull();
    expect(parseConflictMarkers('x\n>>>>>>> b')).toBeNull();
    expect(parseConflictMarkers('x\n||||||| b')).toBeNull();
    expect(parseConflictMarkers('<<<<<<< a\n||||||| b\n||||||| c\n=======\n>>>>>>> d')).toBeNull();
    expect(parseConflictMarkers('<<<<<<< a\n=======\n||||||| b\n>>>>>>> d')).toBeNull();
  });

  it('feeds merge3 to rebuild the conflict', () => {
    const parsed = parseConflictMarkers(
      [
        'a',
        '<<<<<<< HEAD',
        'mine',
        '||||||| base',
        'orig',
        '=======',
        'theirs',
        '>>>>>>> x',
        'z',
      ].join('\n'),
    );
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const chunks = merge3(parsed.base, parsed.yours, parsed.theirs);
    expect(kinds(chunks)).toEqual(['unchanged', 'conflict', 'unchanged']);
  });
});

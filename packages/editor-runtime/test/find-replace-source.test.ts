import { describe, expect, it } from 'vitest';
import {
  findReplaceSourceMatch,
  findReplaceSourcePatches,
} from '../src/runtime/find-replace-source.js';

function prove(source: string, regexp: RegExp, replacement: string, regexReplacement = true) {
  const hits = [...source.matchAll(new RegExp(regexp.source, regexp.flags))].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  return findReplaceSourcePatches(source, hits, regexp, replacement, regexReplacement, '\r\n');
}

describe('original Source replace-all local range proof', () => {
  it('expands a last or unique native match with full lookaround and replacement context', () => {
    const source = '前😀后';
    const hit = { start: 1, end: 3 };
    expect(findReplaceSourceMatch(source, hit, /(?<=前)😀(?=后)/g, '$&!', '\n')).toBe('😀!');
    expect(
      findReplaceSourceMatch(source, hit, /(?<=前)(?<emoji>😀)(?=后)/g, "$<emoji>:$`:$'", '\n'),
    ).toBe('😀:前:后');
    expect(
      findReplaceSourceMatch(source, { start: 0, end: 2 }, /(?<=前)😀(?=后)/g, 'x', '\n'),
    ).toBeUndefined();
    expect(
      findReplaceSourceMatch(source, { start: 1, end: 1 }, /(?=😀)/g, 'x', '\n'),
    ).toBeUndefined();
  });
  it('retains UTF-16 offsets and capture results for emoji and combining text', () => {
    expect(prove('前🙂 e\u0301 你好🙂\r\n你好🙂', /(你好)(🙂)/g, '$2-$1')).toEqual([
      { from: 7, to: 11, insert: '🙂-你好' },
      { from: 13, to: 17, insert: '🙂-你好' },
    ]);
  });

  it('delegates context tokens, named captures, lookaround and dollar escaping to native JS', () => {
    const source = 'A🙂B / A🙂B';
    const pattern = /(?<=A)(?<emoji>🙂)(?=B)/g;
    const patches = prove(source, pattern, "$$:$&:$<emoji>:$`:$'");
    expect(patches).toHaveLength(2);
    let replayed = source;
    for (const patch of [...(patches ?? [])].reverse())
      replayed = replayed.slice(0, patch.from) + patch.insert + replayed.slice(patch.to);
    expect(replayed).toBe(source.replace(pattern, "$$:$&:$<emoji>:$`:$'"));
  });

  it('uses literal dollars outside regex mode and avoids sentinels already present in input', () => {
    expect(prove('word word', /word/g, '$&', false)).toEqual([
      { from: 0, to: 4, insert: '$&' },
      { from: 5, to: 9, insert: '$&' },
    ]);
    expect(prove('\uE000marklyra-find\uE001 word', /word/g, '\uE000marklyra-find\uE001$&')).toEqual(
      [{ from: 16, to: 20, insert: '\uE000marklyra-find\uE001word' }],
    );
  });

  it('normalizes only replacement line separators to the actual CM document separator', () => {
    expect(prove('before\r\nword\r\nafter', /word/g, 'new\ntext\rnext')).toEqual([
      { from: 8, to: 12, insert: 'new\r\ntext\r\nnext' },
    ]);
  });

  it('rejects stale ranges, zero-width matches, missing hits and non-global regexes', () => {
    const hits = [{ start: 0, end: 4 }];
    expect(findReplaceSourcePatches('word', hits, /word/g, 'x', true, '\n')).toEqual([
      { from: 0, to: 4, insert: 'x' },
    ]);
    expect(findReplaceSourcePatches(' word', hits, /word/g, 'x', true, '\n')).toBeUndefined();
    expect(findReplaceSourcePatches('word', [], /word/g, 'x', true, '\n')).toBeUndefined();
    expect(findReplaceSourcePatches('word', hits, /word/, 'x', true, '\n')).toBeUndefined();
    expect(findReplaceSourcePatches('word', hits, /(?=word)/g, 'x', true, '\n')).toBeUndefined();
    expect(findReplaceSourcePatches('word word', hits, /word/g, 'x', true, '\n')).toBeUndefined();
    expect(findReplaceSourcePatches('word', hits, /word/g, 'x', true, '\r')).toBeUndefined();
    expect(
      findReplaceSourcePatches('word', Array(5_001).fill(hits[0]), /word/g, 'x', true, '\n'),
    ).toBeUndefined();
  });
});

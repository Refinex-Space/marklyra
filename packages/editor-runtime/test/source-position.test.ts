import { SourceMirror } from '@marklyra/editor-core';
import { describe, expect, it } from 'vitest';
import { offsetAt, positionAt } from '../src/source-position.js';

describe('source search navigation', () => {
  it('maps mixed endings and serializer normalization before moving the cursor', () => {
    const raw = '\ufeff# A\r\n\r\n7. hello\r\n\t世界😀\n';
    const canonical = '# A\n\n1. hello\n    世界😀\n';
    const mirror = new SourceMirror(raw, canonical);
    const offset = mirror.sourceToCanonical(offsetAt(raw, 4, 2));
    expect(positionAt(canonical, offset)).toEqual({ line: 4, column: 5 });
    expect(canonical.slice(offset, offset + 2)).toBe('世界');
  });
  it('keeps UTF-16 columns and handles CR, CRLF, LF, and empty last lines', () => {
    const source = 'a\rb😀\r\nc\n';
    for (const [line, column] of [
      [1, 1],
      [2, 2],
      [2, 4],
      [3, 2],
      [4, 1],
    ] as const) {
      expect(positionAt(source, offsetAt(source, line, column))).toEqual({ line, column });
    }
    expect(() => positionAt(source, 6)).toThrow('splits CRLF');
  });
  it('rejects invalid line/column values instead of silently selecting another word', () => {
    for (const [line, column] of [
      [0, 1],
      [1, 0],
      [2, 1],
      [1, 5],
      [1.5, 1],
    ] as const)
      expect(() => offsetAt('abc', line, column)).toThrow(RangeError);
    expect(() => positionAt('abc', 5)).toThrow(RangeError);
  });
});

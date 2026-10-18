import { describe, expect, it } from 'vitest';
import {
  searchFingerprint,
  searchPositionIsCurrent,
} from '../src/features/documents/search-position.js';

describe('search result source coordinates', () => {
  it('matches independent UTF-16LE FNV vectors, including surrogate pairs and exact EOLs', () => {
    expect(searchFingerprint('')).toBe('cbf29ce484222325');
    expect(searchFingerprint('a')).toBe('089be207b544f1e4');
    expect(searchFingerprint('🙂')).toBe('f47a500fb71281b8');
    expect(searchFingerprint('TARGET')).toBe('906b01dfb1055254');
    expect(searchFingerprint('🙂\r\nneedle needle')).toBe('aa5ebc06bb2bab7f');
  });
  it('validates UTF-16 columns across mixed CR/LF/CRLF without normalization', () => {
    const source = '前🙂needle\r\nx\ry\n末';
    expect(
      searchPositionIsCurrent(source, {
        line: 1,
        column: 4,
        matchLength: 6,
        expectedText: 'needle',
      }),
    ).toBe(true);
    expect(
      searchPositionIsCurrent(source, { line: 2, column: 1, matchLength: 1, expectedText: 'x' }),
    ).toBe(true);
    expect(
      searchPositionIsCurrent(source, { line: 3, column: 1, matchLength: 1, expectedText: 'y' }),
    ).toBe(true);
    expect(
      searchPositionIsCurrent(source, { line: 4, column: 1, matchLength: 1, expectedText: '末' }),
    ).toBe(true);
  });
  it('rejects stale whole-source hints even when the old matched substring still exists', () => {
    const match = {
      line: 2,
      column: 1,
      matchLength: 6,
      expectedText: 'needle',
      sourceFingerprint: 'aa5ebc06bb2bab7f',
    };
    expect(searchPositionIsCurrent('🙂\r\nneedle needle', match)).toBe(true);
    expect(searchPositionIsCurrent('XX\r\nneedle needle', match)).toBe(false);
    expect(searchPositionIsCurrent('🙂\nneedle needle', match)).toBe(false);
  });
  it('checks full match fingerprints when text is omitted and preserves literal BOM coordinates', () => {
    expect(
      searchPositionIsCurrent('\uFEFFprefix TARGET', {
        line: 1,
        column: 9,
        matchLength: 6,
        expectedText: null,
        matchFingerprint: '906b01dfb1055254',
      }),
    ).toBe(true);
    expect(
      searchPositionIsCurrent('\uFEFFprefix TARGXT', {
        line: 1,
        column: 9,
        matchLength: 6,
        expectedText: null,
        matchFingerprint: '906b01dfb1055254',
      }),
    ).toBe(false);
    expect(
      searchPositionIsCurrent('ab\n', { line: 1, column: 3, matchLength: 0, expectedText: '' }),
    ).toBe(true);
  });
  it('rejects out-of-range, malformed and surrogate-splitting positions', () => {
    for (const match of [
      { line: 0, column: 1, matchLength: 0 },
      { line: 1, column: 0, matchLength: 0 },
      { line: 1, column: 2, matchLength: 0 },
      { line: 1, column: 1, matchLength: 1 },
      { line: 2, column: 1, matchLength: 0 },
      { line: 1, column: 1, matchLength: -1 },
      { line: Infinity, column: 1, matchLength: 0 },
    ])
      expect(searchPositionIsCurrent('🙂', match)).toBe(false);
  });
});

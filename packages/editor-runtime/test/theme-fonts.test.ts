import { describe, expect, it } from 'vitest';
import { MAX_THEME_FONT_BYTES, themeFonts } from '../src/styles/fonts.js';

const face = () => ({
  family: 'Test Face',
  descriptors: { weight: '400' },
  sources: [{ kind: 'data', bytes: new Uint8Array([1, 2, 3]).buffer }],
});

describe('theme font transfer boundary', () => {
  it('copies the caller buffer and preserves ordered local and byte fallbacks', () => {
    const input = face();
    const result = themeFonts([input]);
    new Uint8Array(input.sources[0]?.bytes ?? new ArrayBuffer(0))[0] = 99;
    const bytes = result[0]?.sources[0];
    expect(bytes?.kind).toBe('data');
    if (bytes?.kind !== 'data') throw new Error('Missing bytes');
    expect([...new Uint8Array(bytes.bytes)]).toEqual([1, 2, 3]);
    expect(
      themeFonts([
        { family: 'Local', descriptors: {}, sources: [{ kind: 'local', name: 'Arial' }] },
      ])[0]?.sources,
    ).toEqual([{ kind: 'local', name: 'Arial' }]);
  });
  it.each([
    null,
    {},
    [{ ...face(), url: 'https://example.invalid/font.woff2' }],
    [{ ...face(), family: '' }],
    [{ ...face(), family: 'a\n' }],
    [{ ...face(), descriptors: { unexpected: 'value' } }],
    [{ ...face(), sources: [{ kind: 'url', url: 'file:///private/font.ttf' }] }],
    [{ ...face(), sources: [] }],
  ])('rejects an unbounded or untyped font payload %#', (value) => {
    expect(() => themeFonts(value)).toThrow();
  });
  it('limits individual resources, total resources and face count', () => {
    expect(themeFonts([])).toEqual([]);
    expect(() => themeFonts(Array.from({ length: 65 }, face))).toThrow();
    expect(() =>
      themeFonts([
        {
          ...face(),
          sources: [{ kind: 'data', bytes: new ArrayBuffer(MAX_THEME_FONT_BYTES + 1) }],
        },
      ]),
    ).toThrow();
    expect(() =>
      themeFonts(
        Array.from({ length: 3 }, () => ({
          ...face(),
          sources: [{ kind: 'data', bytes: new ArrayBuffer(MAX_THEME_FONT_BYTES) }],
        })),
      ),
    ).toThrow();
  });
});

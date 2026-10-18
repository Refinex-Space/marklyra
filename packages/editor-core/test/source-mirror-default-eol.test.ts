import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../src/index.js';

describe('new-document newline preference', () => {
  it('uses the fallback for the first newline without normalizing a no-edit source', () => {
    const m = new SourceMirror('\uFEFFFirst', 'First', { defaultLineEnding: '\r\n' });
    expect(m.source).toBe('\uFEFFFirst');
    expect(m.update('First\n\nSecond').source).toBe('\uFEFFFirst\r\n\r\nSecond');
    const next = m.stateId;
    expect(
      m.update('First', { kind: 'history', baseStateId: m.stateId, targetStateId: 0 }).source,
    ).toBe('\uFEFFFirst');
    expect(
      m.update('First\n\nSecond', { kind: 'history', baseStateId: m.stateId, targetStateId: next })
        .source,
    ).toBe('\uFEFFFirst\r\n\r\nSecond');
  });
  it('observed LF, CRLF and CR always win over the new-document default', () => {
    for (const ending of ['\n', '\r\n', '\r']) {
      const original = `First${ending}Tail  `;
      const canonical = 'First\nTail';
      const m = new SourceMirror(original, canonical, { defaultLineEnding: '\r\n' });
      expect(m.update(canonical + '\nNext').source).toBe(`First${ending}Tail${ending}Next  `);
    }
  });
  it('maps offsets correctly for generated first-newline CRLF text', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (n) => {
        const prefix = 'x'.repeat(n),
          m = new SourceMirror(prefix, prefix, { defaultLineEnding: '\r\n' });
        const next = m.update(prefix + '\nY');
        expect(next.source).toBe(prefix + '\r\nY');
        expect(m.canonicalToSource(n + 1, 'right')).toBe(n + 2);
        expect(m.sourceToCanonical(n + 2)).toBe(n + 1);
      }),
      { numRuns: 80 },
    );
  });
});

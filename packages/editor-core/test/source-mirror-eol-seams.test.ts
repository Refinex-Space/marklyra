import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../src/source-mirror.js';

const normalized = (source: string) => source.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');

function exactEdit(mirror: SourceMirror, patches: { from: number; to: number; insert: string }[]) {
  let canonical = mirror.canonical;
  for (const patch of [...patches].reverse())
    canonical = canonical.slice(0, patch.from) + patch.insert + canonical.slice(patch.to);
  return mirror.update(canonical, {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseCanonical: mirror.canonical,
    patches,
  });
}

describe('SourceMirror mixed-EOL splice seams', () => {
  it('preserves four logical newlines before a following explicit no-op (seed -1151593439)', () => {
    const raw = '\uFEFFaa\r\n\n\ra\r\na\n';
    const mirror = new SourceMirror(raw, 'aa\n\n\na\na\n');
    const initial = mirror.stateId;
    const result = exactEdit(mirror, [{ from: 5, to: 8, insert: '' }]);
    expect(result).toEqual({
      source: '\uFEFFaa\r\n\n\r\n\n',
      patches: [{ from: 7, to: 11, insert: '\n' }],
    });
    expect(normalized(mirror.source)).toBe(mirror.canonical);
    expect(mirror.canonicalToSource(5)).toBe(8);
    expect(mirror.sourceToCanonical(8)).toBe(5);
    expect(() => mirror.sourceToCanonical(7)).toThrow('splits a CRLF sequence');
    const deleted = mirror.stateId;
    const noOp = exactEdit(mirror, [{ from: 0, to: 0, insert: '' }]);
    expect(noOp.source).toBe(result.source);
    expect(normalized(noOp.source)).toBe('aa\n\n\n\n');
    mirror.update('aa\n\n\na\na\n', {
      kind: 'history',
      baseStateId: mirror.stateId,
      targetStateId: initial,
    });
    expect(mirror.source).toBe(raw);
    mirror.update('aa\n\n\n\n', { kind: 'history', baseStateId: initial, targetStateId: deleted });
    expect(mirror.source).toBe(result.source);
  });

  it.each([
    { raw: '\rX\n', from: 1, to: 2, insert: '', expected: '\r\n\n' },
    { raw: 'left\rright\n', from: 5, to: 5, insert: '\n', expected: 'left\r\n\nright\n' },
    { raw: 'LX\rY\nR', from: 1, to: 4, insert: '\n', expected: 'L\r\n\nR' },
    { raw: 'a\r\nX\n', from: 2, to: 3, insert: '', expected: 'a\r\n\n' },
    { raw: '\rX\r\n', from: 1, to: 2, insert: '', expected: '\r\r\n' },
  ])('keeps logical newlines at a deletion/insertion boundary: $raw', (fixture) => {
    const canonical = normalized(fixture.raw),
      mirror = new SourceMirror(fixture.raw, canonical);
    const initial = mirror.stateId;
    exactEdit(mirror, [{ from: fixture.from, to: fixture.to, insert: fixture.insert }]);
    const after = mirror.canonical,
      changed = mirror.stateId;
    expect(mirror.source).toBe(fixture.expected);
    expect(normalized(mirror.source)).toBe(after);
    mirror.update(canonical, { kind: 'history', baseStateId: changed, targetStateId: initial });
    expect(mirror.source).toBe(fixture.raw);
    mirror.update(after, { kind: 'history', baseStateId: initial, targetStateId: changed });
    expect(mirror.source).toBe(fixture.expected);
  });

  it('repairs adjacent merged edits only once and repairs separate seams independently', () => {
    const adjacent = new SourceMirror('\rAB\n', '\nAB\n');
    const result = exactEdit(adjacent, [
      { from: 1, to: 2, insert: '' },
      { from: 2, to: 3, insert: '' },
    ]);
    expect(result).toEqual({ source: '\r\n\n', patches: [{ from: 1, to: 3, insert: '\n' }] });
    const separate = new SourceMirror('\rA\n\rB\n', '\nA\n\nB\n');
    exactEdit(separate, [
      { from: 1, to: 2, insert: '' },
      { from: 4, to: 5, insert: '' },
    ]);
    expect(separate.source).toBe('\r\n\n\r\n\n');
    expect(normalized(separate.source)).toBe(separate.canonical);
  });

  it('also protects a unique no-hint deletion while keeping subsequent no-op bytes', () => {
    const mirror = new SourceMirror('\rX\n', '\nX\n');
    expect(mirror.update('\n\n').source).toBe('\r\n\n');
    expect(mirror.update('\n\n')).toEqual({ source: '\r\n\n', patches: [] });
  });

  it('preserves prefix/suffix bytes and normalized text around arbitrary deleted Unicode spans', () => {
    const fragment = fc
      .array(fc.constantFrom('a', '中', '😀', '\r\n', '\n', '\r', '\t'), { maxLength: 12 })
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(fragment, fragment, fragment, (before, body, after) => {
        const prefix = `\uFEFF${before}p\r`,
          middle = `a${body}b`,
          suffix = `\nq${after}`;
        const raw = prefix + middle + suffix,
          canonical = normalized(raw);
        const from = normalized(prefix).length,
          to = from + normalized(middle).length;
        const mirror = new SourceMirror(raw, canonical),
          initial = mirror.stateId;
        exactEdit(mirror, [{ from, to, insert: '' }]);
        expect(mirror.source).toBe(`${prefix}\n${suffix}`);
        expect(normalized(mirror.source)).toBe(mirror.canonical);
        mirror.update(canonical, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: initial,
        });
        expect(mirror.source).toBe(raw);
      }),
      { numRuns: 100, seed: 412798 },
    );
  });
});

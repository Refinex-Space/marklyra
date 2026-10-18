import { describe, expect, it } from 'vitest';
import { SourceMirror, type SourceMirrorHint } from '../src/source-mirror.js';

const fixture = () => {
  const canonical = '\n\n';
  const mirror = new SourceMirror('\r\n\n', canonical);
  const hint: Extract<SourceMirrorHint, { kind: 'edit' }> = {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseCanonical: canonical,
    patches: [{ from: 2, to: 2, insert: '\nX' }],
    placementRanges: [
      { from: 0, to: 2 },
      { from: 2, to: 2 },
    ],
    placementChecks: [
      { patch: { from: 2, to: 2, insert: '\n' }, range: { from: 0, to: 2 } },
      { patch: { from: 2, to: 2, insert: 'X' }, range: { from: 2, to: 2 } },
    ],
  };
  return { mirror, hint, next: '\n\n\nX' };
};
describe('coincident insertion placement obligations', () => {
  it('retains an original fragment ambiguity hidden by concatenating its insert text', () => {
    const { mirror, hint, next } = fixture();
    expect(() => mirror.update(next, hint)).toThrow('different raw-source edit placements');
    expect(mirror.source).toBe('\r\n\n');
    const oldCaller = fixture();
    const { placementChecks: _, ...withoutChecks } = oldCaller.hint;
    expect(oldCaller.mirror.update(oldCaller.next, withoutChecks).source).toBe('\r\n\n\nX');
  });

  it('accepts CRLF and Unicode fragments without changing untouched BOM and EOL', () => {
    const canonical = '前😀\r\n';
    const raw = '\uFEFF前😀\r\n';
    const mirror = new SourceMirror(raw, canonical);
    const at = canonical.length;
    const value = mirror.update(canonical + '甲\r\n乙', {
      kind: 'edit',
      baseStateId: mirror.stateId,
      baseCanonical: canonical,
      patches: [{ from: at, to: at, insert: '甲\r\n乙' }],
      placementRanges: [{ from: at, to: at }],
      placementChecks: [
        { patch: { from: at, to: at, insert: '甲\r\n' }, range: { from: at, to: at } },
        { patch: { from: at, to: at, insert: '乙' }, range: { from: at, to: at } },
      ],
    });
    expect(value.source).toBe(raw + '甲\r\n乙');
  });

  for (const name of [
    'single',
    'wrong text',
    'replacement',
    'missing domain',
    'unlisted domain',
    'out of bounds',
    'wrong target',
    'empty insertion',
    'noncontiguous group',
  ] as const)
    it(`rejects forged proof: ${name}`, () => {
      const { mirror, hint, next } = fixture();
      const checks =
        hint.placementChecks?.map((check) => ({
          patch: { ...check.patch },
          range: { ...check.range },
        })) ?? [];
      let altered: typeof hint = { ...hint, placementChecks: checks };
      if (name === 'single') checks.pop();
      if (name === 'wrong text' && checks[1]) checks[1].patch.insert = 'different';
      if (name === 'replacement' && checks[0]) checks[0].patch.from = 1;
      if (name === 'missing domain') {
        const { placementRanges: _, ...rest } = altered;
        altered = rest;
      }
      if (name === 'unlisted domain' && checks[0]) checks[0].range.from = 1;
      if (name === 'out of bounds' && checks[0]) checks[0].range.to = 20;
      if (name === 'wrong target')
        for (const check of checks) check.patch.from = check.patch.to = 1;
      if (name === 'empty insertion' && checks[0]) checks[0].patch.insert = '';
      if (name === 'noncontiguous group')
        checks.splice(1, 0, { patch: { from: 1, to: 1, insert: 'z' }, range: { from: 0, to: 2 } });
      expect(() => mirror.update(next, altered)).toThrow();
      expect(mirror.source).toBe('\r\n\n');
    });

  it('rejects fragment positions inside a surrogate or a CRLF pair', () => {
    for (const [canonical, position] of [
      ['😀', 1],
      ['A\r\n', 2],
    ] as const) {
      const mirror = new SourceMirror(canonical, canonical);
      const at = canonical.length;
      expect(() =>
        mirror.update(canonical + 'XY', {
          kind: 'edit',
          baseStateId: mirror.stateId,
          baseCanonical: canonical,
          patches: [{ from: at, to: at, insert: 'XY' }],
          placementRanges: [{ from: 0, to: at }],
          placementChecks: [
            { patch: { from: position, to: position, insert: 'X' }, range: { from: 0, to: at } },
            { patch: { from: at, to: at, insert: 'Y' }, range: { from: 0, to: at } },
          ],
        }),
      ).toThrow();
    }
  });
});

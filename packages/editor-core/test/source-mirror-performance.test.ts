import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../src/source-mirror.js';
import { updateEqualCorrespondence } from '../src/source-mirror-ranges.js';
import { PROPERTY_TIMEOUT } from './property-timeout.js';

/** Public mapping invariants across inserted/deleted (zero-width) whitespace spans. */
function assertIntervals(mirror: SourceMirror): void {
  const positions = (text: string) => {
    const result = [0];
    let index = 0;
    for (const point of text) {
      index += point.length;
      if (text[index - 1] !== '\r' || text[index] !== '\n') result.push(index);
    }
    return result;
  };
  for (const position of positions(mirror.source)) {
    const left = mirror.sourceToCanonical(position, 'left');
    const right = mirror.sourceToCanonical(position, 'right');
    expect(left).toBeLessThanOrEqual(right);
    expect(mirror.canonicalToSource(left, 'left')).toBeLessThanOrEqual(position);
    expect(mirror.canonicalToSource(right, 'right')).toBeGreaterThanOrEqual(position);
  }
  for (const position of positions(mirror.canonical)) {
    const left = mirror.canonicalToSource(position, 'left');
    const right = mirror.canonicalToSource(position, 'right');
    expect(left).toBeLessThanOrEqual(right);
    expect(mirror.sourceToCanonical(left, 'left')).toBeLessThanOrEqual(position);
    expect(mirror.sourceToCanonical(right, 'right')).toBeGreaterThanOrEqual(position);
  }
}

describe('SourceMirror optimized correspondence invariants', () => {
  it('restores physical history across a disambiguated CRLF seam via the full path', () => {
    const mirror = new SourceMirror('a\rb\n', 'a\nb\n');
    const initial = mirror.stateId;
    mirror.update('a\n\n\n', {
      kind: 'edit',
      baseStateId: initial,
      baseCanonical: mirror.canonical,
      patches: [{ from: 2, to: 3, insert: '\n' }],
    });
    const edited = mirror.stateId;
    expect(mirror.source).toBe('a\r\n\n\n');
    expect(mirror.source.replace(/\r\n|\r/g, '\n')).toBe(mirror.canonical);
    expect(
      mirror.update('a\nb\n', { kind: 'history', baseStateId: edited, targetStateId: initial })
        .source,
    ).toBe('a\rb\n');
  });

  it.each([
    ['>009. alpha😀  \r\n', '>1. alpha😀\n'],
    ['>>009. alpha\r', '>>1. alpha\n'],
    ['>+ alpha\r\n', '>- alpha\n'],
  ])('stops equal runs at attached list aliases in %j', (source, canonical) => {
    const mirror = new SourceMirror(source, canonical);
    assertIntervals(mirror);
    expect(mirror.update(canonical.replace('alpha', 'beta')).source).toBe(
      source.replace('alpha', 'beta'),
    );
  });

  it('retains both affinities where equal, expanded and deleted ranges meet', () => {
    const mirror = new SourceMirror('\uFEFF|a|\t中😀  \r\n009. x\r', '| a |    中😀\n1. x\n\n');
    assertIntervals(mirror);
    expect(() => mirror.sourceToCanonical(mirror.source.indexOf('\r') + 1)).toThrow(RangeError);
    expect(() => mirror.canonicalToSource(mirror.canonical.indexOf('😀') + 1)).toThrow(
      'splits a surrogate pair',
    );
  });

  it('keeps correspondence intervals across generated whitespace boundary chains', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom('a', '中', '😀', '|'),
            fc.constantFrom('', ' ', '\t', '  ', '\r\n', '\r', '\n'),
            fc.constantFrom('', ' ', '\t', '   ', '\n', '\n\n'),
          ),
          { minLength: 1, maxLength: 30 },
        ),
        (parts) => {
          const source = `\uFEFF${parts.map(([point, gap]) => point + gap).join('')}`;
          const canonical = parts.map(([point, , gap]) => point + gap).join('');
          assertIntervals(new SourceMirror(source, canonical));
        },
      ),
      { numRuns: 100, seed: 741921 },
    );
  });

  it('returns the validated physical patch for adjacent history instead of re-aligning repetition', () => {
    const raw = 'same\r\nsame\nsame\r',
      canonical = 'same\nsame\nsame\n';
    const mirror = new SourceMirror(raw, canonical);
    const first = mirror.stateId;
    const edited = mirror.update('same\nsame\n', {
      kind: 'edit',
      baseStateId: first,
      baseCanonical: canonical,
      patches: [{ from: 0, to: 5, insert: '' }],
    });
    const second = mirror.stateId;
    expect(edited.patches).toEqual([{ from: 0, to: 6, insert: '' }]);
    const undo = mirror.update(canonical, {
      kind: 'history',
      baseStateId: second,
      targetStateId: first,
    });
    expect(undo).toEqual({ source: raw, patches: [{ from: 0, to: 0, insert: 'same\r\n' }] });
    expect(Object.isFrozen(undo.patches[0])).toBe(true);
    expect(
      mirror.update('same\nsame\n', {
        kind: 'history',
        baseStateId: first,
        targetStateId: second,
      }),
    ).toEqual(edited);
    assertIntervals(mirror);
  });

  it('does not treat same-canonical explicit edits or external history as a no-op', () => {
    const mirror = new SourceMirror('a\r\n', 'a\n');
    const initial = mirror.stateId;
    expect(mirror.update('a\n').patches).toEqual([]);
    expect(mirror.stateId).toBe(initial);
    mirror.update('a\n', { kind: 'edit', baseStateId: initial, baseCanonical: 'a\n', patches: [] });
    expect(mirror.stateId).not.toBe(initial);
    mirror.adoptExternal('\uFEFFa\n', 'a\n');
    const external = mirror.stateId;
    expect(
      mirror.update('a\n', { kind: 'history', baseStateId: external, targetStateId: initial })
        .source,
    ).toBe('a\r\n');
    expect(() =>
      mirror.update('a\n', { kind: 'history', baseStateId: external, targetStateId: initial }),
    ).toThrow('checkpoint changed');
  });
});

describe('local equal-span reuse and owned history text', () => {
  function compareFresh(mirror: SourceMirror): void {
    const fresh = new SourceMirror(mirror.source, mirror.canonical);
    for (const key of ['source', 'canonical'] as const) {
      let at = 0;
      const method = key === 'source' ? 'sourceToCanonical' : 'canonicalToSource';
      for (const point of mirror[key]) {
        for (const affinity of ['left', 'right'] as const)
          if (!(mirror[key][at - 1] === '\r' && mirror[key][at] === '\n'))
            expect(mirror[method](at, affinity)).toBe(fresh[method](at, affinity));
        at += point.length;
      }
      for (const affinity of ['left', 'right'] as const)
        expect(mirror[method](at, affinity)).toBe(fresh[method](at, affinity));
    }
  }

  it.each(['X', '中', '😀', '👩‍💻', 'e\u0301'])(
    'preserves EOF/hidden space/virtual newline boundaries through insertion, deletion and history: %j',
    (text) => {
      for (const raw of ['\uFEFFalpha', 'alpha  \r\n', '|a|b|\r\n\r\nalpha\n']) {
        const canonical = raw
          .replace(/^\uFEFF/, '')
          .replace(/\r\n/g, '\n')
          .replace('|a|b|', '| a | b |')
          .replace(/ {2}\n/g, '\n')
          .replace(/\n*$/, '\n\n');
        const mirror = new SourceMirror(raw, canonical),
          initial = mirror.stateId;
        const from = canonical.indexOf('alpha') + 5;
        const next = canonical.slice(0, from) + text + canonical.slice(from);
        mirror.update(next, {
          kind: 'edit',
          baseStateId: initial,
          baseCanonical: canonical,
          patches: [{ from, to: from, insert: text }],
        });
        expect(mirror.source).toBe(raw.replace('alpha', `alpha${text}`));
        compareFresh(mirror);
        const inserted = mirror.stateId;
        mirror.update(canonical, {
          kind: 'edit',
          baseStateId: inserted,
          baseCanonical: next,
          patches: [{ from, to: from + text.length, insert: '' }],
        });
        expect(mirror.source).toBe(raw);
        compareFresh(mirror);
        mirror.update(next, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: inserted,
        });
        compareFresh(mirror);
        mirror.update(canonical, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: initial,
        });
        expect(mirror.source).toBe(raw);
        compareFresh(mirror);
      }
    },
  );

  it('copies surrogate pairs straddling the 4096-code-unit history chunk boundary', () => {
    const removed = `${'a'.repeat(4095)}😀`,
      inserted = `${'中'.repeat(4095)}👩‍💻`;
    const mirror = new SourceMirror(`start\r\n${removed}\nend`, `start\n${removed}\nend`);
    const initial = mirror.stateId,
      before = mirror.canonical;
    const next = `start\n${inserted}\nend`;
    mirror.update(next, {
      kind: 'edit',
      baseStateId: initial,
      baseCanonical: before,
      patches: [{ from: 6, to: 6 + removed.length, insert: inserted }],
    });
    const edited = mirror.stateId;
    expect(mirror.source).toBe(`start\r\n${inserted}\nend`);
    mirror.update(before, { kind: 'history', baseStateId: edited, targetStateId: initial });
    expect(mirror.source).toBe(`start\r\n${removed}\nend`);
    mirror.update(next, { kind: 'history', baseStateId: initial, targetStateId: edited });
    expect(mirror.source).toBe(`start\r\n${inserted}\nend`);
  });

  it('reuses a zero-net-change span with distant deletion/insertion around a surrogate pair', () => {
    const raw = '\uFEFFab😀中  \r\n009. tail\r',
      canonical = 'ab😀中\n1. tail\n\n';
    const mirror = new SourceMirror(raw, canonical),
      before = mirror.stateId;
    const next = 'a😀Z中\n1. tail\n\n';
    mirror.update(next, {
      kind: 'edit',
      baseStateId: before,
      baseCanonical: canonical,
      patches: [
        { from: 1, to: 2, insert: '' },
        { from: 4, to: 4, insert: 'Z' },
      ],
    });
    expect(mirror.source).toBe(raw.replace('ab😀中', 'a😀Z中'));
    compareFresh(mirror);
    mirror.update(canonical, {
      kind: 'history',
      baseStateId: mirror.stateId,
      targetStateId: before,
    });
    expect(mirror.source).toBe(raw);
    compareFresh(mirror);
  });

  it('owns long UTF-16 text across chunk boundaries, Undo, Redo and a new branch', () => {
    const removed = '文😀e\u0301'.repeat(1500),
      inserted = '𝄞中👩‍💻'.repeat(1300);
    const raw = `\uFEFFstart\r\n${removed}\nend`,
      canonical = `start\n${removed}\nend`;
    const mirror = new SourceMirror(raw, canonical),
      initial = mirror.stateId;
    const next = `start\n${inserted}\nend`;
    mirror.update(next, {
      kind: 'edit',
      baseStateId: initial,
      baseCanonical: canonical,
      patches: [{ from: 6, to: 6 + removed.length, insert: inserted }],
    });
    const changed = mirror.stateId;
    expect(mirror.source).toBe(`\uFEFFstart\r\n${inserted}\nend`);
    mirror.update(canonical, { kind: 'history', baseStateId: changed, targetStateId: initial });
    expect(mirror.source).toBe(raw);
    mirror.update(next, { kind: 'history', baseStateId: initial, targetStateId: changed });
    mirror.update(canonical, { kind: 'history', baseStateId: changed, targetStateId: initial });
    mirror.update(canonical.replace('end', 'ending'));
    expect(mirror.source).toBe(raw.replace('end', 'ending'));
    expect(() =>
      mirror.update(next, { kind: 'history', baseStateId: mirror.stateId, targetStateId: changed }),
    ).toThrow('Unknown history checkpoint');
  });

  it('matches fresh full correspondence through randomized Unicode word edits and distant shifts', {
    timeout: PROPERTY_TIMEOUT,
  }, () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            slot: fc.integer({ min: 0, max: 1 }),
            insert: fc.constantFrom('X', '中', '😀', 'e\u0301', '👩‍💻', '', '\n', ' ', '009.'),
          }),
          { minLength: 5, maxLength: 20 },
        ),
        (operations) => {
          const raw = '\uFEFF|a|b|\r\n\r\nalpha\tword  \n009. alpha\r';
          const canonical = '| a | b |\n\nalpha    word\n1. alpha\n\n';
          const mirror = new SourceMirror(raw, canonical);
          for (const operation of operations) {
            const from = operation.slot
              ? mirror.canonical.lastIndexOf('alpha') + 5
              : mirror.canonical.indexOf('alpha') + 5;
            // Keep the anchor word so each step has a known input location.
            const to = from;
            const next =
              mirror.canonical.slice(0, from) + operation.insert + mirror.canonical.slice(to);
            mirror.update(next, {
              kind: 'edit',
              baseStateId: mirror.stateId,
              baseCanonical: mirror.canonical,
              patches: [{ from, to, insert: operation.insert }],
            });
            compareFresh(mirror);
          }
        },
      ),
      { numRuns: 100, seed: 628419 },
    );
  });
});

describe('local correspondence proof boundaries', () => {
  const span = { sourceFrom: 0, sourceTo: 5, canonicalFrom: 0, canonicalTo: 5, equal: true };
  it('accepts plain tail text with a retained atom at EOF', () => {
    const patch = { from: 5, to: 5, insert: '中文😀' };
    expect(updateEqualCorrespondence([span], 'alpha', [patch], [patch])).toEqual([
      { ...span, sourceTo: 9, canonicalTo: 9 },
    ]);
  });
  it('falls back when all guards are deleted by other patches', () => {
    const range = { ...span, sourceTo: 2, canonicalTo: 2 };
    const patches = [
      { from: 0, to: 1, insert: '' },
      { from: 1, to: 2, insert: '' },
    ];
    expect(updateEqualCorrespondence([range], 'ab', patches, patches)).toBeUndefined();
  });
  it('falls back for grammar/whitespace changes or mismatching projected raw coordinates', () => {
    for (const insert of [' ', '\n', '`', '-', '1.']) {
      const patch = { from: 2, to: 3, insert };
      expect(updateEqualCorrespondence([span], 'alpha', [patch], [patch])).toBeUndefined();
    }
    expect(
      updateEqualCorrespondence(
        [span],
        'alpha',
        [{ from: 2, to: 3, insert: 'X' }],
        [{ from: 3, to: 4, insert: 'X' }],
      ),
    ).toBeUndefined();
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyTransaction,
  diffText,
  EditorSession,
  SourceMirror,
  SourceMirrorError,
} from '../src/index.js';

function normalized(source: string): string {
  return source.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
}

// These fixture calls intentionally revisit prior states as Undo/Redo, so carry
// explicit checkpoint identities instead of asking production code to infer history.
const fixtureHistory = new WeakMap<SourceMirror, Map<string, number>>();
function checkedUpdate(mirror: SourceMirror, canonical: string): string {
  const previous = mirror.source;
  let history = fixtureHistory.get(mirror);
  if (!history) {
    history = new Map([[mirror.canonical, mirror.stateId]]);
    fixtureHistory.set(mirror, history);
  }
  const target = history.get(canonical);
  const result = mirror.update(
    canonical,
    target === undefined
      ? undefined
      : { kind: 'history', baseStateId: mirror.stateId, targetStateId: target },
  );
  history.set(canonical, mirror.stateId);
  const state = new EditorSession(previous).state;
  expect(applyTransaction(state, { baseRevision: 0, patches: result.patches }).source).toBe(
    result.source,
  );
  expect(mirror.canonical).toBe(canonical);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.patches)).toBe(true);
  return result.source;
}

function validPositions(source: string): number[] {
  const positions = [0];
  let offset = 0;
  for (const point of source) {
    offset += point.length;
    if (source[offset - 1] !== '\r' || source[offset] !== '\n') positions.push(offset);
  }
  return positions;
}

function checkMappingIntervals(mirror: SourceMirror): void {
  const rawPositions = validPositions(mirror.source);
  const canonicalPositions = validPositions(mirror.canonical);
  const rawSet = new Set(rawPositions),
    canonicalSet = new Set(canonicalPositions);
  let previousLeft = -1,
    previousRight = -1;
  for (const position of rawPositions) {
    const left = mirror.sourceToCanonical(position, 'left');
    const right = mirror.sourceToCanonical(position, 'right');
    expect(canonicalSet.has(left) && canonicalSet.has(right)).toBe(true);
    expect(left).toBeLessThanOrEqual(right);
    expect(left).toBeGreaterThanOrEqual(previousLeft);
    expect(right).toBeGreaterThanOrEqual(previousRight);
    expect(mirror.canonicalToSource(left, 'left')).toBeLessThanOrEqual(position);
    expect(mirror.canonicalToSource(right, 'right')).toBeGreaterThanOrEqual(position);
    previousLeft = left;
    previousRight = right;
  }
  previousLeft = -1;
  previousRight = -1;
  for (const position of canonicalPositions) {
    const left = mirror.canonicalToSource(position, 'left');
    const right = mirror.canonicalToSource(position, 'right');
    expect(rawSet.has(left) && rawSet.has(right)).toBe(true);
    expect(left).toBeLessThanOrEqual(right);
    expect(left).toBeGreaterThanOrEqual(previousLeft);
    expect(right).toBeGreaterThanOrEqual(previousRight);
    expect(mirror.sourceToCanonical(left, 'left')).toBeLessThanOrEqual(position);
    expect(mirror.sourceToCanonical(right, 'right')).toBeGreaterThanOrEqual(position);
    previousLeft = left;
    previousRight = right;
  }
}

describe('SourceMirror source preservation', () => {
  it('does not change a byte-equivalent UTF-16 source string when the serializer normalizes it', () => {
    const source = '\uFEFF---\r\ntitle: test  \n---\r\n\r\n009. first\n\t- child  \r\n|a|b|\r';
    const canonical = '---\ntitle: test\n---\n\n1. first\n    - child\n| a | b |\n\n';
    const mirror = new SourceMirror(source, canonical);
    expect(mirror.source).toBe(source);
    expect(mirror.canonical).toBe(canonical);
    expect(mirror.update(canonical)).toEqual({ source, patches: [] });
    expect(mirror.update(canonical.replace(/\n/g, '\r\n')).source).toBe(source);
  });

  it('projects two nonadjacent edits without touching YAML, numbering, indentation, tables or EOL', () => {
    const source = '\uFEFF---\r\ntitle: keep  \n---\r\n\r\n009. first\n\t- child  \r\n|a|b|\r';
    const canonical = '---\ntitle: keep\n---\n\n1. first\n    - child\n| a | b |\n\n';
    const next = canonical.replace('first', 'first中文').replace('| b |', '| X |');
    const mirror = new SourceMirror(source, canonical);
    expect(checkedUpdate(mirror, next)).toBe(
      source.replace('first', 'first中文').replace('|b|', '|X|'),
    );
    expect(checkedUpdate(mirror, canonical)).toBe(source);
    expect(checkedUpdate(mirror, next)).toBe(
      source.replace('first', 'first中文').replace('|b|', '|X|'),
    );
  });

  it('emits separate old-source-coordinate patches around unchanged content', () => {
    const source = '\uFEFFfirst\r\n\tunchanged table |a|b|  \nlast\r';
    const canonical = 'first\n    unchanged table | a | b |\nlast\n';
    const mirror = new SourceMirror(source, canonical);
    const result = mirror.update(canonical.replace('first', 'FIRST').replace('last', 'LAST'));
    expect(result.source).toBe(source.replace('first', 'FIRST').replace('last', 'LAST'));
    expect(result.patches).toEqual([
      { from: 1, to: 6, insert: 'FIRST' },
      { from: source.indexOf('last'), to: source.indexOf('last') + 4, insert: 'LAST' },
    ]);
  });

  it('preserves unchanged code content and only changes the edited Unicode code point', () => {
    const source = '\uFEFF```ts\r\n\tconst x = "😀";  \n```\r\n\nlast';
    const canonical = normalized(source);
    const mirror = new SourceMirror(source, canonical);
    expect(checkedUpdate(mirror, canonical.replace('😀', '😃'))).toBe(source.replace('😀', '😃'));
    expect(checkedUpdate(mirror, canonical)).toBe(source);
  });

  it('uses the edited line ending for newly inserted lines and retains all existing mixed endings', () => {
    const source = 'alpha\r\nbeta\ngamma\rdelta';
    const canonical = normalized(source);
    const mirror = new SourceMirror(source, canonical);
    expect(checkedUpdate(mirror, 'al\npha\nbeta\ngamma\ndelta')).toBe(
      'al\r\npha\r\nbeta\ngamma\rdelta',
    );
    expect(checkedUpdate(mirror, canonical)).toBe(source);
    expect(checkedUpdate(mirror, 'alpha\nbe\nta\ngamma\ndelta')).toBe(
      'alpha\r\nbe\nta\ngamma\rdelta',
    );
  });

  it('uses preceding style when inserting at EOF and keeps BOM out of canonical positions', () => {
    const source = '\uFEFFfirst\r\nlast';
    const mirror = new SourceMirror(source, 'first\nlast');
    expect(mirror.canonicalToSource(0)).toBe(1);
    expect(mirror.canonicalToSource(6)).toBe(8);
    expect(checkedUpdate(mirror, 'first\nlast\nnew')).toBe(`${source}\r\nnew`);
    expect(mirror.canonicalToSource('first\nlast\nnew'.length)).toBe(mirror.source.length);
  });

  it('materializes a virtual EOF separator only when new paragraph content requires it', () => {
    const mirror = new SourceMirror('hello', 'hello\n\n');
    const initialId = mirror.stateId;
    expect(checkedUpdate(mirror, 'hello!\n\n')).toBe('hello!');
    expect(
      mirror.update('hello!\n\nnew\n\n', {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: mirror.canonical,
        patches: [{ from: 8, to: 8, insert: 'new\n\n' }],
      }).source,
    ).toBe('hello!\n\nnew\n\n');
    expect(
      mirror.update('hello\n\n', {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: initialId,
      }).source,
    ).toBe('hello');
  });

  it('keeps table padding virtual while changing existing cell content', () => {
    const mirror = new SourceMirror('|a|b|\r\n', '| a | b |\n');
    expect(checkedUpdate(mirror, '| changed | b |\n')).toBe('|changed|b|\r\n');
  });

  it('changes only the explicitly edited normalized indentation and can undo to the original tab', () => {
    const source = '\t- child\r\nother';
    const mirror = new SourceMirror(source, '    - child\nother');
    expect(mirror.canonicalToSource(2, 'left')).toBe(0);
    expect(mirror.canonicalToSource(2, 'right')).toBe(1);
    const initialId = mirror.stateId;
    expect(
      mirror.update('     - child\nother', {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: mirror.canonical,
        patches: [{ from: 4, to: 4, insert: ' ' }],
      }).source,
    ).toBe('\t - child\r\nother');
    expect(
      mirror.update('    - child\nother', {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: initialId,
      }).source,
    ).toBe(source);
    expect(checkedUpdate(mirror, '  X  - child\nother')).toBe('  X  - child\r\nother');
  });

  it('maps an insertion at raw-only whitespace without reversing the source range', () => {
    const mirror = new SourceMirror('first  \r\nsecond', 'first\nsecond');
    expect(mirror.canonicalToSource(5, 'left')).toBe(5);
    expect(mirror.canonicalToSource(5, 'right')).toBe(7);
    expect(checkedUpdate(mirror, 'first!\nsecond')).toBe('first!  \r\nsecond');
  });

  it('handles normalized list numbers and bullets, retaining untouched representations', () => {
    const source = '009. one\r\n010. two\n+ three\r';
    const canonical = '1. one\n2. two\n- three\n';
    const mirror = new SourceMirror(source, canonical);
    expect(checkedUpdate(mirror, canonical.replace('two', 'second'))).toBe(
      source.replace('two', 'second'),
    );
    expect(checkedUpdate(mirror, canonical)).toBe(source);
    expect(checkedUpdate(mirror, canonical.replace('1.', '3.'))).toBe(source.replace('009.', '3.'));
  });

  it('retains nested quote/list prefixes and whitespace on edits to their body', () => {
    const source = '> 007. quote\r\n> \t- child  \n';
    const canonical = '> 1. quote\n>     - child\n';
    const mirror = new SourceMirror(source, canonical);
    expect(checkedUpdate(mirror, canonical.replace('child', '子节点'))).toBe(
      source.replace('child', '子节点'),
    );
    expect(checkedUpdate(mirror, canonical)).toBe(source);
  });

  it('preserves format through grouped undo, redo and branch edits without full-text history snapshots', () => {
    const source = '\uFEFFone\r\ntwo\nthree\rfour';
    const initial = normalized(source);
    const mirror = new SourceMirror(source, initial);
    const first = initial.replace('one', 'oneA');
    const second = first.replace('three', 'threeB');
    const third = second.replace('two', 'twoC');
    checkedUpdate(mirror, first);
    checkedUpdate(mirror, second);
    const final = checkedUpdate(mirror, third);
    expect(checkedUpdate(mirror, initial)).toBe(source);
    expect(checkedUpdate(mirror, third)).toBe(final);
    expect(checkedUpdate(mirror, first)).toBe(source.replace('one', 'oneA'));
    const branch = first.replace('four', 'fourD');
    expect(checkedUpdate(mirror, branch)).toBe(
      source.replace('one', 'oneA').replace('four', 'fourD'),
    );
    expect(checkedUpdate(mirror, initial)).toBe(source);
  });

  it('treats deleting all canonical content as a real edit, retains BOM and restores exact source on undo', () => {
    const source = '\uFEFF   one  \r\n';
    const mirror = new SourceMirror(source, 'one\n');
    expect(checkedUpdate(mirror, '')).toBe('\uFEFF');
    expect(checkedUpdate(mirror, 'one\n')).toBe(source);
  });

  it('supports canonical CRLF coordinates and rejects the middle of a two-unit newline', () => {
    const mirror = new SourceMirror('a\nb', 'a\r\nb');
    expect(() => mirror.canonicalToSource(2, 'left')).toThrow('CRLF');
    expect(() => mirror.canonicalToSource(2, 'right')).toThrow('CRLF');
    expect(mirror.canonicalToSource(3)).toBe(2);
    expect(checkedUpdate(mirror, 'a\r\nb!')).toBe('a\nb!');
  });

  it('rejects unverified semantic normalization and leaves reset/update state untouched on failure', () => {
    expect(() => new SourceMirror('Title\n=====', '## Title\n')).toThrow(SourceMirrorError);
    const mirror = new SourceMirror('one\r\ntwo', 'one\ntwo', { maxEditLength: 0 });
    const before = mirror.source;
    expect(() => mirror.update('xxx\nyyy')).toThrow(SourceMirrorError);
    expect(mirror.source).toBe(before);
    expect(mirror.canonical).toBe('one\ntwo');
    expect(() => mirror.reset('raw', 'different')).toThrow(SourceMirrorError);
    expect(mirror.source).toBe(before);
    expect(() => mirror.update('\ud800')).toThrow();
    expect(mirror.source).toBe(before);
    expect(() => mirror.canonicalToSource(100)).toThrow();
  });

  it.each(['      ```', '    ```', '\t```', '      ~~~'])(
    'follows the serializer when an indented %j closer ends a fence before a list',
    (closer) => {
      const marker = closer.trim();
      // Observed runtime output: the indented closer ends the fence and is rewritten to column 0.
      const source = `${marker}yaml\na\n      ${marker}json\n      x\n${closer}\n- item\n${marker}\n`;
      const canonical = `${marker}yaml\na\n      ${marker}json\n      x\n${marker}\n- item\n${marker}\n`;
      const mirror = new SourceMirror(source, canonical);
      expect(mirror.source).toBe(source);
      expect(checkedUpdate(mirror, canonical.replace('- item', '- item!'))).toBe(
        source.replace('- item', '- item!'),
      );
    },
  );

  it('accepts large pure insertions without running an expensive edit-distance search', () => {
    const mirror = new SourceMirror('before\r\n', 'before\n', { maxEditLength: 0 });
    const text = '中文😀'.repeat(10_000);
    expect(checkedUpdate(mirror, `before${text}\n`)).toBe(`before${text}\r\n`);
    expect(checkedUpdate(mirror, 'before\n')).toBe('before\r\n');
  });

  it('reset creates a new correspondence and clears the previous document history', () => {
    const mirror = new SourceMirror('one\r\n', 'one\n');
    checkedUpdate(mirror, 'one!\n');
    mirror.reset('second\r', 'second\n');
    expect(mirror.source).toBe('second\r');
    expect(checkedUpdate(mirror, 'second!\n')).toBe('second!\r');
    expect(checkedUpdate(mirror, 'second\n')).toBe('second\r');
  });

  it('does not allow returned patch objects to mutate future inverse history', () => {
    const mirror = new SourceMirror('one\r\ntwo', 'one\ntwo');
    const result = mirror.update('one!\ntwo');
    expect(Object.isFrozen(result.patches[0])).toBe(true);
    expect(() => {
      Object.assign(result.patches[0] ?? {}, { insert: 'tamper' });
    }).toThrow();
    expect(checkedUpdate(mirror, 'one\ntwo')).toBe('one\r\ntwo');
  });

  it.each([
    ['**bold**', '__bold__'],
    ['[label](url)', '<a href="url">label</a>'],
    ['one &amp; two', 'one & two'],
    ['content 2026', 'content 1'],
    ['```\n009. literal\n```', '```\n1. literal\n```'],
  ])(
    'rejects non-approved normalization rather than silently replacing source: %j',
    (source, canonical) => {
      expect(() => new SourceMirror(source, canonical)).toThrow(SourceMirrorError);
    },
  );
});

describe('SourceMirror property vectors', () => {
  const words = fc
    .array(fc.constantFrom('a', 'b', '中', '😀', 'e\u0301'), { minLength: 1, maxLength: 15 })
    .map((parts) => parts.join(''));
  it('preserves independently chosen EOLs and untouched prefixes through two distant edits and history reversal', () => {
    fc.assert(
      fc.property(
        fc.array(words, { minLength: 3, maxLength: 12 }),
        fc.array(fc.constantFrom('\n', '\r\n', '\r'), { minLength: 12, maxLength: 12 }),
        (values, endings) => {
          const rawLines = values.map(
            (value, index) =>
              `${String(index + 10).padStart(3, '0')}. item_${index}_${value}  ${endings[index] ?? '\n'}`,
          );
          const canonicalLines = values.map(
            (value, index) => `${index + 1}. item_${index}_${value}\n`,
          );
          const source = `\uFEFF${rawLines.join('')}`;
          const initial = canonicalLines.join('');
          const next = initial
            .replace('item_0_', 'changed_0_')
            .replace(`item_${values.length - 1}_`, `changed_${values.length - 1}_`);
          const expected = source
            .replace('item_0_', 'changed_0_')
            .replace(`item_${values.length - 1}_`, `changed_${values.length - 1}_`);
          const mirror = new SourceMirror(source, initial);
          expect(checkedUpdate(mirror, next)).toBe(expected);
          expect(checkedUpdate(mirror, initial)).toBe(source);
          expect(checkedUpdate(mirror, next)).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps normalized text and arbitrary Unicode edit sequences equivalent and restores the initial mixed source', () => {
    const fragment = fc
      .array(fc.constantFrom('a', ' ', '\n', '\t', '中', '😀', '*', '#'), { maxLength: 20 })
      .map((parts) => parts.join(''));
    const action = fc.record({ a: fc.nat(), b: fc.nat(), insert: fragment });
    fc.assert(
      fc.property(
        fragment,
        fc.array(action, { minLength: 1, maxLength: 15 }),
        (initial, actions) => {
          let count = 0;
          const raw = `\uFEFF${initial.replace(/\n/g, () => ['\r\n', '\n', '\r'][count++ % 3] ?? '\n')}`;
          const mirror = new SourceMirror(raw, initial);
          let canonical = initial;
          const initialId = mirror.stateId;
          for (const operation of actions) {
            const positions = [0];
            let at = 0;
            for (const point of canonical) {
              at += point.length;
              positions.push(at);
            }
            const a = positions[operation.a % positions.length] ?? 0;
            const b = positions[operation.b % positions.length] ?? 0;
            canonical =
              canonical.slice(0, Math.min(a, b)) +
              operation.insert +
              canonical.slice(Math.max(a, b));
            const source = mirror.update(canonical, {
              kind: 'edit',
              baseStateId: mirror.stateId,
              baseCanonical: mirror.canonical,
              patches: [{ from: Math.min(a, b), to: Math.max(a, b), insert: operation.insert }],
            }).source;
            expect(normalized(source)).toBe(canonical);
          }
          expect(
            mirror.update(initial, {
              kind: 'history',
              baseStateId: mirror.stateId,
              targetStateId: initialId,
            }).source,
          ).toBe(raw);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('SourceMirror reverse source navigation', () => {
  it('maps raw search offsets through BOM, mixed EOL, tabs and normalized list numbers', () => {
    const source = '\uFEFF009. alpha\r\n\t- beta  \nlast';
    const canonical = '1. alpha\n    - beta\nlast\n';
    const mirror = new SourceMirror(source, canonical);
    expect(mirror.sourceToCanonical(source.indexOf('alpha'))).toBe(canonical.indexOf('alpha'));
    expect(mirror.sourceToCanonical(source.indexOf('beta'))).toBe(canonical.indexOf('beta'));
    expect(mirror.sourceToCanonical(source.indexOf('\t'))).toBe(canonical.indexOf('    '));
    expect(mirror.sourceToCanonical(source.indexOf('\t') + 1)).toBe(canonical.indexOf('- beta'));
    expect(mirror.sourceToCanonical(2, 'left')).toBe(0);
    expect(mirror.sourceToCanonical(2, 'right')).toBe(1);
    expect(mirror.sourceToCanonical(source.length, 'left')).toBe(canonical.length - 1);
    expect(mirror.sourceToCanonical(source.length, 'right')).toBe(canonical.length);
    checkMappingIntervals(mirror);
  });

  it('represents discarded BOM and raw-only whitespace as intervals rather than a false bijection', () => {
    const mirror = new SourceMirror('\uFEFFword  \r\n', 'word\n');
    expect(mirror.sourceToCanonical(0)).toBe(0);
    expect(mirror.sourceToCanonical(1)).toBe(0);
    expect(mirror.canonicalToSource(0, 'left')).toBe(0);
    expect(mirror.canonicalToSource(0, 'right')).toBe(1);
    expect(mirror.sourceToCanonical(6, 'left')).toBe(4);
    expect(mirror.sourceToCanonical(6, 'right')).toBe(4);
    expect(mirror.canonicalToSource(4, 'left')).toBe(5);
    expect(mirror.canonicalToSource(4, 'right')).toBe(7);
    checkMappingIntervals(mirror);
  });

  it('expands virtual canonical padding with explicit left/right affinity', () => {
    const mirror = new SourceMirror('|a|', '\uFEFF| a |\r\n');
    expect(mirror.sourceToCanonical(0, 'left')).toBe(0);
    expect(mirror.sourceToCanonical(0, 'right')).toBe(1);
    expect(mirror.sourceToCanonical(1, 'left')).toBe(2);
    expect(mirror.sourceToCanonical(1, 'right')).toBe(3);
    expect(mirror.sourceToCanonical(2, 'left')).toBe(4);
    expect(mirror.sourceToCanonical(2, 'right')).toBe(5);
    checkMappingIntervals(mirror);
  });

  it('uses the current correspondence after edits, undo, redo and reset', () => {
    const raw = '\uFEFF009. alpha\r\nlast';
    const initial = '1. alpha\nlast\n';
    const mirror = new SourceMirror(raw, initial);
    const next = initial.replace('alpha', 'alpha😀');
    checkedUpdate(mirror, next);
    expect(mirror.sourceToCanonical(mirror.source.indexOf('last'))).toBe(next.indexOf('last'));
    checkMappingIntervals(mirror);
    checkedUpdate(mirror, initial);
    expect(mirror.sourceToCanonical(raw.indexOf('last'))).toBe(initial.indexOf('last'));
    checkMappingIntervals(mirror);
    checkedUpdate(mirror, next);
    checkMappingIntervals(mirror);
    mirror.reset('new\r\n文', 'new\n文');
    expect(mirror.sourceToCanonical(5)).toBe(4);
    checkMappingIntervals(mirror);
  });

  it('rejects illegal source positions without changing source or canonical state', () => {
    const source = 'a😀\r\nb';
    const mirror = new SourceMirror(source, 'a😀\nb');
    for (const invalid of [-1, 1.5, 2, 4, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const affinity of ['left', 'right'] as const) {
        expect(() => mirror.sourceToCanonical(invalid, affinity)).toThrow();
      }
    }
    expect(mirror.source).toBe(source);
    expect(mirror.canonical).toBe('a😀\nb');
    expect(() => mirror.canonicalToSource(2)).toThrow('surrogate');
  });

  it('keeps both roundtrips inside their representative intervals over randomized normalization', () => {
    const word = fc
      .array(fc.constantFrom('a', '中', '😀', 'e\u0301'), { minLength: 1, maxLength: 6 })
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(
        fc.array(word, { minLength: 1, maxLength: 5 }),
        fc.array(fc.constantFrom('\n', '\r\n', '\r'), { minLength: 5, maxLength: 5 }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (words, endings, rawBom, canonicalBom, rawFinalEnding, canonicalCrLf) => {
          const source =
            (rawBom ? '\uFEFF' : '') +
            words
              .map(
                (value, index) =>
                  `\t${String(index + 7).padStart(3, '0')}. ${value}  ${index === words.length - 1 && !rawFinalEnding ? '' : (endings[index] ?? '\n')}`,
              )
              .join('');
          const ending = canonicalCrLf ? '\r\n' : '\n';
          const canonical =
            (canonicalBom ? '\uFEFF' : '') +
            words.map((value, index) => `    ${index + 1}. ${value}${ending}`).join('');
          checkMappingIntervals(new SourceMirror(source, canonical));
        },
      ),
      { numRuns: 250 },
    );
  });
});

describe('SourceMirror evidence-based identity', () => {
  const raw = 'same\r\n\r\nsame\n\n';
  const canonical = 'same\n\nsame\n\n';
  it('rejects indistinguishable canonical deletions atomically', () => {
    const mirror = new SourceMirror(raw, canonical);
    expect(() => mirror.update('same\n\n')).toThrowError(
      expect.objectContaining({ code: 'AMBIGUOUS_EDIT' }),
    );
    expect(mirror.source).toBe(raw);
    expect(mirror.canonical).toBe(canonical);
    expect(mirror.stateId).toBe(0);
  });
  it('distinguishes first/second deletion and an undo-then-other-delete branch', () => {
    const mirror = new SourceMirror(raw, canonical);
    const initial = mirror.stateId;
    const edit = (from: number, to: number) =>
      mirror.update('same\n\n', {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: mirror.canonical,
        patches: [{ from, to, insert: '' }],
      }).source;
    expect(edit(0, 6)).toBe('same\n\n');
    const first = mirror.stateId;
    expect(
      mirror.update(canonical, { kind: 'history', baseStateId: first, targetStateId: initial })
        .source,
    ).toBe(raw);
    expect(edit(6, 12)).toBe('same\r\n\r\n');
    expect(mirror.stateId).not.toBe(first);
    expect(() =>
      mirror.update('same\n\n', {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: first,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_HINT' }));
    const second = mirror.stateId;
    mirror.update(canonical, { kind: 'history', baseStateId: second, targetStateId: initial });
    expect(
      mirror.update('same\n\n', {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: second,
      }).source,
    ).toBe('same\r\n\r\n');
  });
  it('validates exact canonical coordinates, stale checkpoints and split character boundaries', () => {
    const mirror = new SourceMirror('😀\r\nsame', '😀\r\nsame');
    const hint = {
      kind: 'edit' as const,
      baseStateId: mirror.stateId,
      baseCanonical: mirror.canonical,
      patches: [{ from: 4, to: 8, insert: 'next' }],
    };
    expect(() => mirror.update('wrong', hint)).toThrowError(
      expect.objectContaining({ code: 'INVALID_HINT' }),
    );
    for (const from of [1, 3])
      expect(() =>
        mirror.update('wrong', { ...hint, patches: [{ from, to: 4, insert: '' }] }),
      ).toThrow();
    expect(mirror.update('😀\r\nnext', hint).source).toBe('😀\r\nnext');
    expect(() => mirror.update('😀\r\nnext', hint)).toThrowError(
      expect.objectContaining({ code: 'STALE_STATE' }),
    );
  });
  it('rejects ambiguous normalized words but accepts identical raw alternatives', () => {
    const mirror = new SourceMirror('word\tword', 'wordword');
    expect(() => mirror.update('word')).toThrowError(
      expect.objectContaining({ code: 'AMBIGUOUS_EDIT' }),
    );
    expect(new SourceMirror('word word', 'word word').update('word').source).toBe('word');
  });
});

it('does not confuse manual return to canonical text with actual Undo', () => {
  const mirror = new SourceMirror('a\tb', 'a   b');
  expect(mirror.update('ab').source).toBe('ab');
  expect(mirror.update('a   b').source).toBe('a   b');
});

it('rejects compound alternative alignments with different raw output', () => {
  const mirror = new SourceMirror('a\tba', 'aba');
  expect(() => mirror.update('bab')).toThrowError(
    expect.objectContaining({ code: 'AMBIGUOUS_EDIT' }),
  );
  expect(mirror.source).toBe('a\tba');
});
it('checks inferred placement domains while trusting exact original input coordinates', () => {
  const mirror = new SourceMirror('same\r\n\r\nsame\n\n', 'same\n\nsame\n\n');
  const hint = {
    kind: 'edit' as const,
    baseStateId: mirror.stateId,
    baseCanonical: mirror.canonical,
    patches: [{ from: 0, to: 6, insert: '' }],
  };
  expect(() =>
    mirror.update('same\n\n', { ...hint, placementRanges: [{ from: 0, to: 12 }] }),
  ).toThrowError(expect.objectContaining({ code: 'AMBIGUOUS_EDIT' }));
  expect(mirror.update('same\n\n', { ...hint, placementRanges: [{ from: 0, to: 6 }] }).source).toBe(
    'same\n\n',
  );
});

it('proves BOM-only repeated-text placements equivalent without exhausting the budget', () => {
  const canonical = 'x'.repeat(10000),
    mirror = new SourceMirror('\uFEFF' + canonical, canonical);
  expect(mirror.update(canonical + 'x').source).toBe('\uFEFF' + canonical + 'x');
  expect(
    mirror.update(canonical, {
      kind: 'edit',
      baseStateId: mirror.stateId,
      baseCanonical: mirror.canonical,
      patches: [{ from: 0, to: 1, insert: '' }],
      placementRanges: [{ from: 0, to: 10001 }],
    }).source,
  ).toBe('\uFEFF' + canonical);
});

it('owns supplied canonical patches after a successful update', () => {
  const mirror = new SourceMirror('one\r\ntwo', 'one\ntwo'),
    initial = mirror.stateId;
  const patches = [{ from: 3, to: 3, insert: '!' }];
  mirror.update('one!\ntwo', {
    kind: 'edit',
    baseStateId: initial,
    baseCanonical: mirror.canonical,
    patches,
  });
  const edited = mirror.stateId;
  patches[0] = { from: 0, to: 999, insert: 'corruption' };
  patches.push({ from: 0, to: 0, insert: 'bad' });
  mirror.update('one\ntwo', { kind: 'history', baseStateId: edited, targetStateId: initial });
  expect(
    mirror.update('one!\ntwo', { kind: 'history', baseStateId: initial, targetStateId: edited })
      .source,
  ).toBe('one!\r\ntwo');
});

describe('exact text diff for runtime protocol', () => {
  it.each([
    ['', 'same\r\n\r\n'],
    ['same\r\n', 'same\n'],
    ['same\n', 'same\r\n'],
    ['😀a\r\nend', '😃a\r\nnew\r\nend'],
    ['\r\n\r\n', '\n\n'],
  ])('preserves actual EOL strings from %j to %j', (before, after) => {
    const patches = diffText(before, after);
    expect(
      applyTransaction(new EditorSession(before).state, { baseRevision: 0, patches }).source,
    ).toBe(after);
    for (const patch of patches)
      for (const at of [patch.from, patch.to])
        expect(before[at - 1] === '\r' && before[at] === '\n').toBe(false);
  });
  it('reconstructs arbitrary mixed-EOL Unicode outputs without newline projection', () => {
    const text = fc
      .array(fc.constantFrom('a', 'b', '😀', '\r', '\n', '\r\n'), { maxLength: 40 })
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(text, text, (before, after) => {
        const patches = diffText(before, after);
        expect(
          applyTransaction(new EditorSession(before).state, { baseRevision: 0, patches }).source,
        ).toBe(after);
        for (const patch of patches)
          for (const at of [patch.from, patch.to])
            expect(before[at - 1] === '\r' && before[at] === '\n').toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

describe('explicit external source adoption', () => {
  it('creates a distinct format-only state without discarding old raw history', () => {
    const mirror = new SourceMirror('same\r\n', 'same\n'),
      before = mirror.stateId;
    const result = mirror.adoptExternal('\uFEFFsame\n', 'same\n');
    const after = mirror.stateId;
    expect(after).not.toBe(before);
    expect(result.source).toBe('\uFEFFsame\n');
    expect(
      mirror.update('same\n', { kind: 'history', baseStateId: after, targetStateId: before })
        .source,
    ).toBe('same\r\n');
    expect(
      mirror.update('same\n', { kind: 'history', baseStateId: before, targetStateId: after })
        .source,
    ).toBe('\uFEFFsame\n');
  });
  it('is atomic on unsupported correspondence and preserves prior edits and branch identity', () => {
    const mirror = new SourceMirror('one\r\n', 'one\n');
    mirror.update('one!\n');
    const edited = mirror.stateId;
    expect(() => mirror.adoptExternal('&amp;', '&')).toThrow(SourceMirrorError);
    expect(mirror.stateId).toBe(edited);
    expect(mirror.source).toBe('one!\r\n');
    mirror.adoptExternal('two\n', 'two\n');
    const external = mirror.stateId;
    expect(
      mirror.update('one!\n', { kind: 'history', baseStateId: external, targetStateId: edited })
        .source,
    ).toBe('one!\r\n');
  });
});

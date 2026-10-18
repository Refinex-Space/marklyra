import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../src/index.js';

interface Fixture {
  readonly id: string;
  readonly source: string;
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}
const fixtures: readonly Fixture[] = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/source-cases.json', import.meta.url), 'utf8'),
);
const canonical = (text: string): string => text.replace(/\r\n|\r/g, '\n');
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('authored composite source fixtures (string mapping, not filesystem encoding)', () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: exact patch retains YAML/code/table/repeated neighbors and history`, () => {
      const mirror = new SourceMirror(fixture.source, canonical(fixture.source), {
        sourceBOM: 'text',
        canonicalBOM: 'text',
      });
      const initialId = mirror.stateId;
      expect(mirror.update(mirror.canonical).patches).toEqual([]);
      const from = canonical(fixture.source.slice(0, fixture.from)).length;
      const to = canonical(fixture.source.slice(0, fixture.to)).length;
      const next = mirror.canonical.slice(0, from) + fixture.insert + mirror.canonical.slice(to);
      const updated = mirror.update(next, {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: mirror.canonical,
        patches: [{ from, to, insert: fixture.insert }],
      });
      const expected =
        fixture.source.slice(0, fixture.from) + fixture.insert + fixture.source.slice(fixture.to);
      expect(updated.source).toBe(expected);
      expect(updated.patches).toEqual([
        { from: fixture.from, to: fixture.to, insert: fixture.insert },
      ]);
      expect(bytes(updated.source.slice(0, fixture.from))).toEqual(
        bytes(fixture.source.slice(0, fixture.from)),
      );
      expect(bytes(updated.source.slice(fixture.from + fixture.insert.length))).toEqual(
        bytes(fixture.source.slice(fixture.to)),
      );
      const editedId = mirror.stateId;
      expect(
        mirror.update(canonical(fixture.source), {
          kind: 'history',
          baseStateId: editedId,
          targetStateId: initialId,
        }).source,
      ).toBe(fixture.source);
      expect(
        mirror.update(next, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: editedId,
        }).source,
      ).toBe(expected);
    });
  }

  it('keeps the explicitly selected repeat, all foreign regions and UTF-16 endpoints across 300 vectors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('\\*same\\*', '&amp;same', '**outer *same* same**', 'same 🙂'),
        fc.integer({ min: 0, max: 2 }),
        fc.constantFrom('中🙂', 'x', 'é', ''),
        (token, selected, insert) => {
          const fixture = fixtures[0];
          if (!fixture) throw new Error('Missing authored fixture');
          const prefix = fixture.source.slice(0, fixture.source.indexOf('\\*same'));
          const rows = [token, token, token];
          const before = prefix + rows.join('\r\n') + '\nTail  \t\r';
          const rawFrom = prefix.length + selected * (token.length + 2) + token.indexOf('same');
          const rawTo = rawFrom + 4;
          const initial = canonical(before);
          const from = canonical(before.slice(0, rawFrom)).length;
          const to = from + 4;
          const next = initial.slice(0, from) + insert + initial.slice(to);
          const mirror = new SourceMirror(before, initial);
          const firstId = mirror.stateId;
          const updated = mirror.update(next, {
            kind: 'edit',
            baseStateId: firstId,
            baseCanonical: initial,
            patches: [{ from, to, insert }],
          });
          expect(updated.source).toBe(before.slice(0, rawFrom) + insert + before.slice(rawTo));
          expect(updated.patches).toEqual([{ from: rawFrom, to: rawTo, insert }]);
          expect(mirror.sourceToCanonical(rawFrom)).toBe(from);
          expect(
            mirror.update(initial, {
              kind: 'history',
              baseStateId: mirror.stateId,
              targetStateId: firstId,
            }).source,
          ).toBe(before);
        },
      ),
      { numRuns: 300, seed: 3032026 },
    );
  });
});

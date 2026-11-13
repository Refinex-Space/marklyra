import { SourceMirror } from '@marklyra/editor-core';
import { describe, expect, it } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeSourceTracking } from '../src/runtime/source-tracking.js';

const original = 'Alpha first\n\nGamma delta\n',
  raw = 'Alpha first\r\n\r\nGamma delta\n';
function fixture(history: boolean, known: boolean) {
  const redo = {},
    undo = { index: -1, commandStack: [{ redo }], undo() {}, redo() {} };
  const runtime = {
    editor: { writingArea: { ownerDocument: null }, sourceView: { inSourceMode: false }, undo },
  } as unknown as LegacyGlobals;
  const tracking = new RuntimeSourceTracking(runtime, () => false);
  Reflect.set(tracking, 'previous', {
    canonical: 'Q\n',
    blocks: [{ id: 'tail', from: 0, to: 2, text: 'Q\n' }],
  });
  Reflect.set(tracking, 'prepared', {
    canonical: original,
    blocks: [
      { id: 'first', from: 0, to: 13, text: 'Alpha first\n\n' },
      { id: 'tail', from: 13, to: original.length, text: 'Gamma delta\n' },
    ],
  });
  Reflect.set(tracking, 'historyDepth', history ? 1 : 0);
  Reflect.set(tracking, 'scalarIdentities', new Map(known ? [['native:initial', 7]] : []));
  Reflect.set(tracking, 'checkpoint', 9);
  Reflect.set(tracking, 'serial', 9);
  return tracking;
}
describe('proven original history targets bypass only fresh placement inference', () => {
  it('transports an exact target when an inserted cid and surviving replacement share an old boundary', () => {
    const tracking = fixture(true, true),
      change = tracking.capture(original).changes.at(-1);
    expect(change?.historyTarget).toBe(7);
    expect(change?.placementRanges).toBeUndefined();
    expect(change?.placementChecks).toBeUndefined();
    let canonical = 'Q\n';
    for (const patch of [...(change?.patches ?? [])].reverse())
      canonical = canonical.slice(0, patch.from) + patch.insert + canonical.slice(patch.to);
    expect(canonical).toBe(original);
  });
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])(
    'without both history invocation and identity, places the recreated block by its own domains (%s,%s)',
    (history, known) => {
      // An Undo to an entry that was never journaled (e.g. made mid-IME) once failed here with
      // "Only coincident serializer insertions can be combined" and left the document unsaved.
      const change = fixture(history, known).capture(original).changes.at(-1);
      expect(change?.historyTarget).toBeUndefined();
      expect(change?.patches).toEqual([{ from: 0, to: 1, insert: 'Alpha first\n\nGamma delta' }]);
      if (!change?.placementRanges) throw Error('Missing placement domains');
      for (const before of ['Q\r\n', 'Q\n', '\uFEFFQ\r\n']) {
        const mirror = new SourceMirror(before, 'Q\n'),
          initial = mirror.stateId;
        const edited = mirror.update(original, {
          kind: 'edit',
          baseStateId: initial,
          baseCanonical: 'Q\n',
          patches: change.patches,
          placementRanges: change.placementRanges,
        }).source;
        const ending = before.endsWith('\r\n') ? '\r\n' : '\n';
        expect(edited).toBe(
          `${before.startsWith('\uFEFF') ? '\uFEFF' : ''}Alpha first${ending}${ending}Gamma delta${ending}`,
        );
        expect(
          mirror.update('Q\n', {
            kind: 'history',
            baseStateId: mirror.stateId,
            targetStateId: initial,
          }).source,
        ).toBe(before);
      }
    },
  );
  it('retains complete target-journal canonical validation and exact raw EOL restoration', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    mirror.update('Q\n', {
      kind: 'edit',
      baseStateId: initial,
      baseCanonical: original,
      patches: [{ from: 0, to: original.length, insert: 'Q\n' }],
    });
    const edited = mirror.stateId,
      editedRaw = mirror.source;
    expect(() =>
      mirror.update('Wrong\n', { kind: 'history', baseStateId: edited, targetStateId: initial }),
    ).toThrow();
    expect(mirror.source).toBe(editedRaw);
    expect(
      mirror.update(original, { kind: 'history', baseStateId: edited, targetStateId: initial })
        .source,
    ).toBe(raw);
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  diffText,
  SourceMirror,
  type SourceMirrorCanonicalProjection,
  type SourceMirrorHint,
  type SourceMirrorRebase,
} from '../src/index.js';
import type { Patch } from '../src/types.js';
import { PROPERTY_TIMEOUT } from './property-timeout.js';

function applied(text: string, patches: readonly Patch[]): string {
  for (const patch of [...patches].reverse())
    text = text.slice(0, patch.from) + patch.insert + text.slice(patch.to);
  return text;
}
function receipt(
  mirror: SourceMirror,
  base: string,
  next: string,
): SourceMirrorCanonicalProjection {
  return {
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: base,
    patches: diffText(base, next),
  };
}
function authorization(mirror: SourceMirror, next: string): SourceMirrorRebase {
  return { ...receipt(mirror, mirror.canonical, next), baseStateId: mirror.stateId };
}
function rebase(mirror: SourceMirror, next: string) {
  return mirror.rebaseCanonical(next, authorization(mirror, next));
}
function edit(mirror: SourceMirror, from: number, to: number, insert: string) {
  const patch = { from, to, insert };
  return mirror.update(applied(mirror.canonical, [patch]), {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: mirror.canonical,
    patches: [patch],
  });
}
function projectedEdit(mirror: SourceMirror, patches: readonly Patch[], next: string) {
  const primary = applied(mirror.canonical, patches);
  return mirror.update(next, {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: mirror.canonical,
    patches,
    canonicalProjection: receipt(mirror, primary, next),
  });
}
function history(mirror: SourceMirror, id: number, next: string, journal?: string) {
  return mirror.update(next, {
    kind: 'history',
    baseStateId: mirror.stateId,
    targetStateId: id,
    baseProjectionEpoch: mirror.projectionEpoch,
    ...(journal === undefined ? {} : { canonicalProjection: receipt(mirror, journal, next) }),
  });
}
function snapshot(mirror: SourceMirror) {
  return {
    source: mirror.source,
    canonical: mirror.canonical,
    stateId: mirror.stateId,
    epoch: mirror.projectionEpoch,
  };
}
function compareMapping(mirror: SourceMirror) {
  const fresh = new SourceMirror(mirror.source, mirror.canonical);
  for (const value of ['source', 'canonical'] as const) {
    const map = value === 'source' ? 'sourceToCanonical' : 'canonicalToSource';
    let offset = 0;
    for (const point of mirror[value]) {
      if (!(mirror[value][offset - 1] === '\r' && point === '\n'))
        for (const affinity of ['left', 'right'] as const)
          expect(mirror[map](offset, affinity)).toBe(fresh[map](offset, affinity));
      offset += point.length;
    }
    for (const affinity of ['left', 'right'] as const)
      expect(mirror[map](offset, affinity)).toBe(fresh[map](offset, affinity));
  }
}
const raw = '\uFEFF- Root\r\n\t- Child😀  \n\nTail\r';
const original = '- Root\n  - Child😀\n\nTail\n';
const projected = original.replace('  - Child', '    - Child');

describe('trusted canonical projection without content history changes', () => {
  it('keeps physical source, content identity and saved-source comparison while replacing coordinates', () => {
    const mirror = new SourceMirror(raw, original),
      id = mirror.stateId;
    const result = rebase(mirror, projected);
    expect(result).toEqual({ source: raw, patches: [] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(mirror.stateId).toBe(id);
    expect(mirror.projectionEpoch).toBe(1);
    expect(mirror.source !== raw).toBe(false);
    compareMapping(mirror);
    const at = mirror.canonical.indexOf('Child😀') + 'Child😀'.length;
    expect(edit(mirror, at, at, '中文').source).toBe(raw.replace('Child😀', 'Child😀中文'));
    compareMapping(mirror);
    history(mirror, id, projected, original);
    expect(mirror.source).toBe(raw);
    expect(mirror.stateId).toBe(id);
    compareMapping(mirror);
  });

  it('retains existing redo, composes journal edits and permits multiple policy changes between histories', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    edit(mirror, original.indexOf('Root') + 4, original.indexOf('Root') + 4, 'A');
    const first = mirror.stateId,
      firstJournal = mirror.canonical,
      firstRaw = mirror.source;
    edit(mirror, mirror.canonical.indexOf('Tail') + 4, mirror.canonical.indexOf('Tail') + 4, 'B');
    const second = mirror.stateId,
      secondJournal = mirror.canonical,
      secondRaw = mirror.source;
    history(mirror, first, firstJournal);
    rebase(mirror, firstJournal.replace('  - Child', '\t- Child'));
    history(mirror, second, secondJournal.replace('  - Child', '\t- Child'), secondJournal);
    expect(mirror.source).toBe(secondRaw);
    rebase(mirror, secondJournal.replace('  - Child', '   - Child'));
    history(mirror, initial, original.replace('  - Child', '   - Child'), original);
    expect(mirror.source).toBe(raw);
    history(mirror, second, secondJournal.replace('  - Child', '   - Child'), secondJournal);
    expect(mirror.source).toBe(secondRaw);
    history(mirror, first, firstJournal.replace('  - Child', '   - Child'), firstJournal);
    expect(mirror.source).toBe(firstRaw);
    const base = mirror.canonical;
    edit(mirror, base.indexOf('Child'), base.indexOf('Child') + 5, 'Branch');
    const branch = mirror.stateId,
      branchRaw = mirror.source;
    expect(() => history(mirror, second, secondJournal)).toThrow('Unknown history checkpoint');
    expect(mirror.stateId).toBe(branch);
    history(mirror, initial, original.replace('  - Child', '   - Child'), original);
    expect(mirror.source).toBe(raw);
    history(mirror, branch, base.replace('Child', 'Branch'));
    expect(mirror.source).toBe(branchRaw);
  });

  it('uses exact physical adjacent raw history even when repeated text has different whitespace', () => {
    const source = 'same\r\nsame  \nsame\r';
    const mirror = new SourceMirror(source, 'same\nsame\nsame\n'),
      initial = mirror.stateId;
    edit(mirror, 0, 5, '');
    const changed = mirror.stateId,
      journal = mirror.canonical,
      editedRaw = mirror.source;
    rebase(mirror, `  ${journal}`);
    const undo = history(mirror, initial, '  same\nsame\nsame\n', 'same\nsame\nsame\n');
    expect(undo).toEqual({ source, patches: [{ from: 0, to: 0, insert: 'same\r\n' }] });
    history(mirror, changed, `  ${journal}`, journal);
    expect(mirror.source).toBe(editedRaw);
    compareMapping(mirror);
  });

  it('restores an exact raw inverse across a CRLF seam while rebuilding projected coordinates', () => {
    const mirror = new SourceMirror('\rX\n', '\nX\n'),
      initial = mirror.stateId;
    expect(edit(mirror, 1, 2, '').source).toBe('\r\n\n');
    const changed = mirror.stateId;
    rebase(mirror, ' \n\n');
    expect(history(mirror, initial, ' \nX\n', '\nX\n')).toEqual({
      source: '\rX\n',
      patches: [{ from: 1, to: 2, insert: 'X' }],
    });
    compareMapping(mirror);
    history(mirror, changed, ' \n\n', '\n\n');
    expect(mirror.source).toBe('\r\n\n');
    compareMapping(mirror);
  });

  it('separates raw-only external history and equal-canonical identities after a projection', () => {
    const mirror = new SourceMirror('A\r\n', 'A\n'),
      initial = mirror.stateId;
    mirror.adoptExternal('\uFEFFA\r\n', 'A\n');
    const external = mirror.stateId;
    rebase(mirror, 'A\n\n');
    history(mirror, initial, 'A\n\n', 'A\n');
    expect(mirror.source).toBe('A\r\n');
    history(mirror, external, 'A\n\n', 'A\n');
    expect(mirror.source).toBe('\uFEFFA\r\n');
    expect(mirror.stateId).toBe(external);
  });

  it('adopts an external version from the journal anchor without clearing its history', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    rebase(mirror, projected);
    const nextRaw = raw.replace('Root', 'External'),
      nextCanonical = projected.replace('Root', 'External');
    mirror.adoptExternal(nextRaw, nextCanonical);
    const external = mirror.stateId;
    history(mirror, initial, projected, original);
    expect(mirror.source).toBe(raw);
    history(mirror, external, nextCanonical);
    expect(mirror.source).toBe(nextRaw);
  });

  it('does not implicitly project a history target just because its difference is whitespace', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    edit(mirror, original.indexOf('Root') + 4, original.indexOf('Root') + 4, '!');
    rebase(mirror, mirror.canonical.replace('  - Child', '    - Child'));
    const before = snapshot(mirror);
    expect(() => history(mirror, initial, projected)).toThrow('History checkpoint does not match');
    expect(snapshot(mirror)).toEqual(before);
    history(mirror, initial, original);
    expect(mirror.source).toBe(raw);
  });

  it('rejects old/missing epochs after A to B to A, while legacy epoch-zero callers still work', () => {
    const mirror = new SourceMirror(raw, original),
      id = mirror.stateId;
    const old = authorization(mirror, projected);
    rebase(mirror, projected);
    rebase(mirror, original);
    const before = snapshot(mirror);
    expect(mirror.stateId).toBe(id);
    expect(() => mirror.rebaseCanonical(projected, old)).toThrow('epoch');
    expect(() => mirror.update(original.replace('Root', 'Changed'))).toThrow('epoch');
    expect(() =>
      mirror.update(original, {
        kind: 'edit',
        baseStateId: id,
        baseCanonical: original,
        patches: [],
      }),
    ).toThrow('epoch');
    expect(() => history(mirror, id, projected, original.replace('Root', 'wrong'))).toThrow();
    expect(snapshot(mirror)).toEqual(before);
    expect(mirror.update(original)).toEqual({ source: raw, patches: [] });
    const legacy = new SourceMirror('A\r\n', 'A\n');
    legacy.update('B\n');
    legacy.reset('C\r\n', 'C\n');
    expect(legacy.projectionEpoch).toBe(0);
    expect(legacy.update('D\n').source).toBe('D\r\n');
  });

  it('reset advances an opted-in projection generation and invalidates the old history', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    rebase(mirror, projected);
    const before = mirror.projectionEpoch;
    mirror.reset('New\r\n', 'New\n');
    expect(mirror.projectionEpoch).toBe(before + 1);
    expect(() => history(mirror, initial, original)).toThrow('Unknown history checkpoint');
    expect(edit(mirror, 3, 3, '!').source).toBe('New!\r\n');
  });
});

describe('projection validation is atomic', () => {
  it.each(['state', 'epoch', 'anchor', 'patch', 'unsupported', 'surrogate', 'crlf'] as const)(
    'rejects invalid %s receipts without consuming redo or changing a mapping',
    (kind) => {
      const mirror = new SourceMirror(raw, original),
        initial = mirror.stateId;
      edit(mirror, original.indexOf('Root') + 4, original.indexOf('Root') + 4, 'X');
      const changed = mirror.stateId,
        changedCanonical = mirror.canonical;
      history(mirror, initial, original);
      const before = snapshot(mirror),
        ticket = authorization(mirror, projected);
      let next = projected,
        invalid: SourceMirrorRebase = ticket;
      if (kind === 'state') invalid = { ...ticket, baseStateId: changed };
      if (kind === 'epoch') invalid = { ...ticket, baseProjectionEpoch: 1 };
      if (kind === 'anchor') invalid = { ...ticket, baseCanonical: 'Wrong' };
      if (kind === 'patch') invalid = { ...ticket, patches: [] };
      if (kind === 'unsupported') {
        next = projected.replace('Root', 'Unverified');
        invalid = { ...ticket, patches: diffText(original, next) };
      }
      if (kind === 'surrogate') {
        next = '\ud800';
        invalid = { ...ticket, patches: [{ from: 0, to: original.length, insert: next }] };
      }
      if (kind === 'crlf') {
        mirror.reset(raw, original.replaceAll('\n', '\r\n'));
        const same = snapshot(mirror),
          at = mirror.canonical.indexOf('\r\n') + 1;
        expect(() =>
          mirror.rebaseCanonical(mirror.canonical, {
            ...authorization(mirror, mirror.canonical),
            patches: [{ from: at, to: at, insert: '' }],
          }),
        ).toThrow('CRLF');
        expect(snapshot(mirror)).toEqual(same);
        return;
      }
      expect(() => mirror.rebaseCanonical(next, invalid)).toThrow();
      expect(snapshot(mirror)).toEqual(before);
      compareMapping(mirror);
      history(mirror, changed, changedCanonical);
      expect(mirror.source).toBe(raw.replace('Root', 'RootX'));
    },
  );

  it('rejects mismatched target projection anchors, wrong replay and conflicting outer epochs', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    edit(mirror, original.indexOf('Root') + 4, original.indexOf('Root') + 4, 'X');
    rebase(mirror, mirror.canonical.replace('  - Child', '    - Child'));
    const before = snapshot(mirror),
      projection = receipt(mirror, original, projected);
    for (const canonicalProjection of [
      { ...projection, baseCanonical: mirror.canonical },
      { ...projection, patches: [] },
      { ...projection, baseProjectionEpoch: 0 },
    ]) {
      expect(() =>
        mirror.update(projected, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: initial,
          canonicalProjection,
        }),
      ).toThrow();
      expect(snapshot(mirror)).toEqual(before);
    }
    expect(() =>
      mirror.update(projected, {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: initial,
        baseProjectionEpoch: 0,
        canonicalProjection: projection,
      }),
    ).toThrow('epoch');
    expect(snapshot(mirror)).toEqual(before);
    history(mirror, initial, projected, original);
    expect(mirror.source).toBe(raw);
  });

  it('keeps a failed projected mapping and a failed journal diff completely atomic', () => {
    const limited = new SourceMirror('a\tb', 'a\tb', { maxEditLength: 0 });
    const unchanged = snapshot(limited);
    expect(() => rebase(limited, 'a b')).toThrow('budget');
    expect(snapshot(limited)).toEqual(unchanged);
    const mirror = new SourceMirror('a\r\nb', 'a\nb', { maxEditLength: 0 });
    rebase(mirror, ' a\nb');
    const rebased = snapshot(mirror);
    const at = mirror.canonical.indexOf('b');
    expect(() => edit(mirror, at, at + 1, 'c')).toThrow('budget');
    expect(snapshot(mirror)).toEqual(rebased);
    compareMapping(mirror);
    rebase(mirror, 'a\nb');
    expect(edit(mirror, mirror.canonical.length, mirror.canonical.length, '!').source).toBe(
      'a\r\nb!',
    );
  });

  it('does not replace journal anchors or remove redo when reset/external adoption fails after opting in', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    edit(mirror, original.indexOf('Root') + 4, original.indexOf('Root') + 4, '!');
    const changed = mirror.stateId,
      journal = mirror.canonical,
      changedRaw = mirror.source;
    history(mirror, initial, original);
    rebase(mirror, projected);
    const before = snapshot(mirror);
    expect(() => mirror.reset('new raw', 'unrelated canonical')).toThrow('normalization');
    expect(() => mirror.adoptExternal('external raw', 'unrelated canonical')).toThrow(
      'normalization',
    );
    expect(snapshot(mirror)).toEqual(before);
    compareMapping(mirror);
    history(mirror, changed, journal.replace('  - Child', '    - Child'), journal);
    expect(mirror.source).toBe(changedRaw);
  });

  it('retains both anchors and the history cursor when an otherwise exact target receipt cannot map to raw', () => {
    const mirror = new SourceMirror(raw, original),
      initial = mirror.stateId;
    edit(mirror, original.indexOf('Root') + 4, original.indexOf('Root') + 4, '!');
    rebase(mirror, mirror.canonical.replace('  - Child', '\t- Child'));
    const before = snapshot(mirror),
      unsupported = original.replace('Root', 'Other');
    expect(() => history(mirror, initial, unsupported, original)).toThrow('normalization');
    expect(snapshot(mirror)).toEqual(before);
    compareMapping(mirror);
    history(mirror, initial, projected, original);
    expect(mirror.source).toBe(raw);
  });

  it('keeps host-decoded literal FEFF characters editable across a projected Undo/Redo', () => {
    const text = '\uFEFF\uFEFFAlpha\r\n';
    const canonical = '\uFEFF\uFEFFAlpha\n';
    const mirror = new SourceMirror(text, canonical, { sourceBOM: 'text', canonicalBOM: 'text' });
    const initial = mirror.stateId;
    rebase(mirror, canonical.replace('Alpha', '  Alpha'));
    expect(edit(mirror, 0, 1, '').source).toBe(text.slice(1));
    const changed = mirror.stateId,
      journal = mirror.canonical;
    history(mirror, initial, canonical.replace('Alpha', '  Alpha'), canonical);
    expect(mirror.source).toBe(text);
    history(mirror, changed, journal);
    expect(mirror.source).toBe(text.slice(1));
    expect(mirror.canonicalToSource(0)).toBe(0);
  });
});

describe('one content edit with an additional trusted serializer projection', () => {
  const raw = '\uFEFF- Alpha\r\n- Beta\n\nTail  \r\n';
  const canonical = '- Alpha\r\n- Beta\r\n\r\nTail  \r\n';
  const intermediate = canonical.replace('- Beta', '  - Beta');
  const actual = intermediate.replace('\r\n\r\nTail', '\r\n\r\n\r\nTail');
  const primary = [
    { from: canonical.indexOf('- Beta'), to: canonical.indexOf('- Beta'), insert: '  ' },
  ];

  it('projects only the proven indent prefix to mixed EOL/BOM raw and journals the actual serializer output', () => {
    const mirror = new SourceMirror(raw, canonical),
      initial = mirror.stateId;
    const result = projectedEdit(mirror, primary, actual),
      nested = mirror.stateId;
    const from = raw.indexOf('- Beta');
    expect(result).toEqual({
      source: raw.replace('- Beta', '  - Beta'),
      patches: [{ from, to: from, insert: '  ' }],
    });
    expect(mirror.canonical).toBe(actual);
    expect(mirror.projectionEpoch).toBe(1);
    compareMapping(mirror);
    history(mirror, initial, canonical);
    expect(mirror.source).toBe(raw);
    const before = snapshot(mirror);
    expect(() => history(mirror, nested, intermediate)).toThrow(
      'History checkpoint does not match',
    );
    expect(snapshot(mirror)).toEqual(before);
    history(mirror, nested, actual);
    expect(mirror.source).toBe(raw.replace('- Beta', '  - Beta'));
    compareMapping(mirror);
  });

  it('keeps the actual journal anchor through policy rebase, a later ordinary edit and arbitrary Undo/Redo', () => {
    const mirror = new SourceMirror(raw, canonical),
      initial = mirror.stateId;
    projectedEdit(mirror, primary, actual);
    const nested = mirror.stateId,
      nestedRaw = mirror.source,
      policyCanonical = actual.replace('  - Beta', '\t- Beta');
    rebase(mirror, policyCanonical);
    const at = mirror.canonical.indexOf('Beta') + 4;
    edit(mirror, at, at, '😀');
    const typed = mirror.stateId,
      typedCanonical = mirror.canonical,
      typedRaw = nestedRaw.replace('Beta', 'Beta😀');
    expect(mirror.source).toBe(typedRaw);
    history(mirror, nested, policyCanonical, actual);
    expect(mirror.source).toBe(nestedRaw);
    history(mirror, initial, canonical);
    expect(mirror.source).toBe(raw);
    history(mirror, typed, typedCanonical);
    expect(mirror.source).toBe(typedRaw);
    history(mirror, nested, policyCanonical, actual);
    expect(mirror.source).toBe(nestedRaw);
    compareMapping(mirror);
  });

  it('accepts a projection-bound epoch without the optional outer epoch and requires epochs thereafter', () => {
    const mirror = new SourceMirror(raw, canonical);
    mirror.update(actual, {
      kind: 'edit',
      baseStateId: mirror.stateId,
      baseCanonical: canonical,
      patches: primary,
      canonicalProjection: receipt(mirror, intermediate, actual),
    });
    expect(mirror.projectionEpoch).toBe(1);
    const before = snapshot(mirror);
    expect(() =>
      mirror.update(actual, {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: actual,
        patches: [],
      }),
    ).toThrow('epoch');
    expect(snapshot(mirror)).toEqual(before);
  });

  it('treats even an empty authorized projection as one content state and one new coordinate epoch', () => {
    const mirror = new SourceMirror(raw, canonical),
      initial = mirror.stateId;
    projectedEdit(mirror, primary, intermediate);
    expect(mirror.projectionEpoch).toBe(1);
    expect(mirror.source).toBe(raw.replace('- Beta', '  - Beta'));
    const changed = mirror.stateId;
    history(mirror, initial, canonical);
    expect(mirror.source).toBe(raw);
    history(mirror, changed, intermediate);
    expect(mirror.source).toBe(raw.replace('- Beta', '  - Beta'));
  });

  it.each([
    'state',
    'outer-epoch',
    'inner-epoch',
    'base',
    'replay',
    'primary-crlf',
    'projection-crlf',
    'surrogate',
    'unsupported',
    'domain',
    'ambiguous',
  ] as const)(
    'rejects invalid %s projected edits atomically and leaves the existing redo reachable',
    (kind) => {
      const source = kind === 'ambiguous' ? '\uFEFFsame\r\nsame\nsame\r\n' : raw;
      const original = kind === 'ambiguous' ? 'same\r\nsame\r\nsame\r\n' : canonical;
      const mirror = new SourceMirror(source, original),
        initial = mirror.stateId;
      edit(mirror, 0, 0, 'X');
      const redo = { id: mirror.stateId, canonical: mirror.canonical, raw: mirror.source };
      history(mirror, initial, original);
      rebase(mirror, original);
      const before = snapshot(mirror);
      let next = actual;
      let hint: Extract<SourceMirrorHint, { kind: 'edit' }> = {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseProjectionEpoch: mirror.projectionEpoch,
        baseCanonical: original,
        patches: primary,
        canonicalProjection: receipt(mirror, intermediate, next),
      };
      if (kind === 'state') hint = { ...hint, baseStateId: redo.id };
      if (kind === 'outer-epoch')
        hint = { ...hint, baseProjectionEpoch: mirror.projectionEpoch - 1 };
      if (kind === 'inner-epoch')
        hint = {
          ...hint,
          canonicalProjection: {
            ...receipt(mirror, intermediate, next),
            baseProjectionEpoch: mirror.projectionEpoch - 1,
          },
        };
      if (kind === 'base') hint = { ...hint, canonicalProjection: receipt(mirror, original, next) };
      if (kind === 'replay')
        hint = {
          ...hint,
          canonicalProjection: { ...receipt(mirror, intermediate, next), patches: [] },
        };
      if (kind === 'primary-crlf')
        hint = {
          ...hint,
          patches: [
            { from: original.indexOf('\r\n') + 1, to: original.indexOf('\r\n') + 1, insert: '  ' },
          ],
        };
      if (kind === 'projection-crlf')
        hint = {
          ...hint,
          canonicalProjection: {
            ...receipt(mirror, intermediate, next),
            patches: [
              {
                from: intermediate.indexOf('\r\n') + 1,
                to: intermediate.indexOf('\r\n') + 1,
                insert: '',
              },
            ],
          },
        };
      if (kind === 'surrogate') hint = { ...hint, patches: [{ from: 0, to: 0, insert: '\ud800' }] };
      if (kind === 'unsupported') {
        next = actual.replace('Tail', 'Foreign');
        hint = { ...hint, canonicalProjection: receipt(mirror, intermediate, next) };
      }
      if (kind === 'domain') hint = { ...hint, placementRanges: [{ from: 0, to: 0 }] };
      if (kind === 'ambiguous') {
        const patches = [{ from: 0, to: 'same\r\n'.length, insert: '' }];
        const intermediate = applied(original, patches);
        next = `${intermediate}\r\n`;
        hint = {
          ...hint,
          patches,
          placementRanges: [{ from: 0, to: original.length }],
          canonicalProjection: receipt(mirror, intermediate, next),
        };
      }
      expect(() => mirror.update(next, hint)).toThrow();
      expect(snapshot(mirror)).toEqual(before);
      compareMapping(mirror);
      history(mirror, redo.id, redo.canonical);
      expect(mirror.source).toBe(redo.raw);
    },
  );

  it('leaves both anchors and redo unchanged when the full canonical journal diff exceeds its budget', () => {
    const mirror = new SourceMirror(raw, canonical, { maxEditLength: 0 }),
      initial = mirror.stateId;
    edit(mirror, 0, 0, 'X');
    const redo = { id: mirror.stateId, canonical: mirror.canonical, raw: mirror.source };
    history(mirror, initial, canonical);
    const before = snapshot(mirror);
    expect(() => projectedEdit(mirror, primary, actual)).toThrow('budget');
    expect(snapshot(mirror)).toEqual(before);
    history(mirror, redo.id, redo.canonical);
    expect(mirror.source).toBe(redo.raw);
  });
});

it('preserves independently calculated raw and journal checkpoints through randomized primary edits with virtual separators', {
  timeout: PROPERTY_TIMEOUT,
}, () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          kind: fc.constantFrom('edit', 'history', 'policy'),
          value: fc.nat(),
          text: fc.constantFrom('中', '😀', 'e\u0301', 'X'),
        }),
        { minLength: 6, maxLength: 24 },
      ),
      (actions) => {
        let value = 'Beta',
          indent = '',
          separator = '',
          policy = '  ';
        let raw = '\uFEFF- Alpha\r\n- Beta\n\nTail  \r';
        const render = () => `- Alpha\n${indent}- ${value}\n\n${separator}Tail\n`;
        const mirror = new SourceMirror(raw, render());
        const states = [
          { id: mirror.stateId, raw, journal: mirror.canonical, value, indent, separator },
        ];
        let cursor = 0;
        for (const action of actions) {
          if (action.kind === 'history') {
            cursor = action.value % states.length;
            const state = states[cursor];
            if (!state) throw Error('Missing raw/model checkpoint');
            ({ raw, value, separator } = state);
            indent = state.indent ? policy : '';
            history(mirror, state.id, render(), state.journal);
          } else if (action.kind === 'policy') {
            policy = ['  ', '   ', '    ', '\t'][action.value % 4] ?? '  ';
            if (indent) indent = policy;
            rebase(mirror, render());
          } else {
            const base = mirror.canonical;
            const at = base.indexOf(value) + value.length;
            const newIndent = indent || policy;
            const indentAt = base.indexOf('\n') + 1;
            const patches = [
              ...(!indent ? [{ from: indentAt, to: indentAt, insert: newIndent }] : []),
              { from: at, to: at, insert: action.text },
            ];
            raw = raw.replace(`- ${value}`, `- ${value}${action.text}`);
            if (!indent) raw = raw.replace('- Beta', `${newIndent}- Beta`);
            value += action.text;
            indent = newIndent;
            separator = action.value % 2 ? '\n' : '';
            projectedEdit(mirror, patches, render());
            states.splice(cursor + 1);
            states.push({
              id: mirror.stateId,
              raw,
              journal: mirror.canonical,
              value,
              indent,
              separator,
            });
            cursor++;
          }
          expect(mirror.source).toBe(raw);
          expect(mirror.canonical).toBe(render());
          compareMapping(mirror);
        }
      },
    ),
    { numRuns: 100 },
  );
});

it('retains exact Unicode raw checkpoints through randomized edits, projections, external adoption and arbitrary history jumps', {
  timeout: PROPERTY_TIMEOUT,
}, () => {
  const operations = fc.array(
    fc.record({
      kind: fc.constantFrom('edit', 'project', 'history', 'external'),
      value: fc.nat(),
      text: fc.constantFrom('X', '中', '😀', 'e\u0301'),
    }),
    { minLength: 5, maxLength: 22 },
  );
  fc.assert(
    fc.property(operations, (actions) => {
      let values = ['Root', 'Child😀', 'Other中'],
        policy = '  ';
      const render = (items: string[]) =>
        items.map((value, i) => `${i ? policy : ''}- item_${i}_${value}`).join('\n') + '\n';
      let raw = `\uFEFF- item_0_Root\r\n\t- item_1_Child😀  \n\t- item_2_Other中\r`;
      const mirror = new SourceMirror(raw, render(values));
      const states = [{ id: mirror.stateId, raw, journal: mirror.canonical, values: [...values] }];
      let cursor = 0;
      for (const action of actions) {
        if (action.kind === 'project') {
          const before = snapshot(mirror);
          policy = [' ', '  ', '    ', '\t'][action.value % 4] ?? '  ';
          expect(rebase(mirror, render(values))).toEqual({ source: raw, patches: [] });
          expect(mirror.stateId).toBe(before.stateId);
        } else if (action.kind === 'history') {
          cursor = action.value % states.length;
          const target = states[cursor];
          if (!target) throw Error('Missing model checkpoint');
          values = [...target.values];
          raw = target.raw;
          history(mirror, target.id, render(values), target.journal);
        } else {
          if (action.kind === 'edit') {
            const index = action.value % values.length,
              old = `item_${index}_${values[index] ?? ''}`,
              next = `${old}${action.text}`;
            const from = mirror.canonical.indexOf(old) + old.length;
            edit(mirror, from, from, action.text);
            raw = raw.replace(old, next);
            values[index] = `${values[index] ?? ''}${action.text}`;
          } else {
            raw = raw.startsWith('\uFEFF') ? raw.slice(1) : `\uFEFF${raw}`;
            mirror.adoptExternal(raw, render(values));
          }
          states.splice(cursor + 1);
          states.push({ id: mirror.stateId, raw, journal: mirror.canonical, values: [...values] });
          cursor++;
        }
        expect(mirror.source).toBe(raw);
        expect(mirror.canonical).toBe(render(values));
        compareMapping(mirror);
      }
    }),
    { numRuns: 100 },
  );
});

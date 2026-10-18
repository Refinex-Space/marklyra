import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../../editor-core/src/source-mirror.js';
import {
  indentPrefixChanges,
  locateStructuralSource,
  type StructuralSourceLeaf,
} from '../src/runtime/block-indent-source.js';
import type { LegacyNode } from '../src/runtime/legacy-types.js';

const apply = (text: string, patches: readonly { from: number; to: number; insert: string }[]) =>
  [...patches]
    .reverse()
    .reduce(
      (value, patch) => value.slice(0, patch.from) + patch.insert + value.slice(patch.to),
      text,
    );

describe('container prefix component proof', () => {
  it('uses the fresh native root range rather than the first matching empty line', () => {
    const node = (cid: string) => ({ cid }) as unknown as LegacyNode;
    const list = node('list'),
      item = node('item'),
      alpha = node('alpha'),
      empty = node('empty'),
      tail = node('tail');
    const canonical = '- Alpha\r\n\r\n\r\n\r\nTail\r\n';
    const leaves: StructuralSourceLeaf[] = [
      {
        node: alpha,
        root: list,
        type: 'paragraph',
        body: ['Alpha'],
        contexts: [{ node: item, parent: list, type: 'list', style: 'ul', first: alpha.cid }],
        lines: [],
      },
      {
        node: empty,
        root: empty,
        type: 'paragraph',
        body: [''],
        contexts: [],
        lines: [],
        rootRange: { from: 11, to: 15 },
        ahead: 0,
      },
      { node: tail, root: tail, type: 'paragraph', body: ['Tail'], contexts: [], lines: [] },
    ];
    expect(locateStructuralSource(canonical, leaves, '\r\n')?.leaves[1]?.lines).toEqual([
      { from: 11, to: 11, prefix: '', body: '' },
    ]);
    const invalid = [-1, NaN, 10, 24];
    for (const from of invalid) {
      const changed = leaves.map((leaf) =>
        leaf.node === empty ? { ...leaf, rootRange: { from, to: 15 } } : leaf,
      );
      expect(locateStructuralSource(canonical, changed, '\r\n')).toBeUndefined();
    }
    expect(
      locateStructuralSource(
        canonical,
        leaves.map((leaf) => (leaf.node === empty ? { ...leaf, ahead: -1 } : leaf)),
        '\r\n',
      ),
    ).toBeUndefined();
  });
  it('keeps marker deletion separate from continuation insertion with distinct transaction starts', () => {
    expect(indentPrefixChanges('010. ', '   ', 7, true)).toEqual([
      { patch: { from: 7, to: 12, insert: '' }, role: 'list-marker' },
      { patch: { from: 12, to: 12, insert: '   ' } },
    ]);
  });
  it('preserves the outer quote component and the unchanged list marker', () => {
    expect(indentPrefixChanges('> > ', '> ', 7)).toEqual([
      { patch: { from: 9, to: 11, insert: '' }, role: 'quote' },
    ]);
    expect(indentPrefixChanges('  - ', '- ', 7)).toEqual([
      { patch: { from: 7, to: 9, insert: '' }, role: 'indent' },
    ]);
    expect(indentPrefixChanges('10. ', '   1. ', 7)).toEqual([
      { patch: { from: 7, to: 11, insert: '   1. ' }, role: 'list-marker' },
    ]);
  });
  it('replays finite combinations of quote, list, task and continuation tokens', () => {
    const component = fc.constantFrom(' ', '  ', '\t', '> ', '>', '- ', '19. ', '2) ', '- [x] ');
    fc.assert(
      fc.property(
        fc.array(component, { maxLength: 8 }),
        fc.array(component, { maxLength: 8 }),
        (a, b) => {
          const before = a.join(''),
            after = b.join(''),
            changes = indentPrefixChanges(before, after, 0);
          expect(changes).toBeDefined();
          if (!changes) return;
          expect(
            apply(
              before,
              changes.map((value) => value.patch),
            ),
          ).toBe(after);
          for (let i = 1; i < changes.length; i++)
            expect(changes[i]?.patch.from).toBeGreaterThanOrEqual(changes[i - 1]?.patch.to ?? 0);
        },
      ),
      { numRuns: 200 },
    );
  });
  it.each(['body', '  body ', '> **', '\n', '1.without-space', '- [ ]missing-space', '\r'])(
    'rejects non-prefix input %j',
    (invalid) => {
      expect(indentPrefixChanges(invalid, '', 0)).toBeUndefined();
    },
  );
  it('bounds very deep prefixes', () => {
    expect(indentPrefixChanges('> '.repeat(300), '', 0)).toBeUndefined();
  });
});

describe('complete prefix handoff to source mapping', () => {
  it('removes a raw three-space prefix represented by two active spaces', () => {
    const source = '- Alpha\n  - Beta\n  - Gamma\n\nTail';
    const raw = '\ufeff- Alpha\r\n  - Beta\n   - Gamma\n\nTail';
    const changes = indentPrefixChanges('  - ', '- ', 17);
    if (!changes) throw Error('Missing prefix proof');
    const patches = changes.map((change) => change.patch),
      mirror = new SourceMirror(raw, source);
    expect(
      mirror.update(apply(source, patches), {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: source,
        patches,
        completePrefixes: [{ patchIndex: 0, canonical: { from: 17, to: 19 }, role: 'indent' }],
      }).source,
    ).toBe(raw.replace('   - Gamma', '- Gamma'));
  });
});

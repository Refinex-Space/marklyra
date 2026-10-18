import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../../editor-core/src/source-mirror.js';
import type {
  StructuralDocumentSource,
  StructuralSourceLeaf,
} from '../src/runtime/block-indent-source.js';
import type { LegacyNode } from '../src/runtime/legacy-types.js';
import { structuralBreakReceipt } from '../src/runtime/structural-break-source.js';

// This unit exercises the pure receipt boundary with opaque identity tokens.
// Native prototypes, isolated serialization, DOM and selection require the
// separate real-runtime browser tests; these substitutes do not prove them.
const identity = (cid: string) => ({ cid }) as unknown as LegacyNode;
interface Row {
  node: LegacyNode;
  item: LegacyNode;
  prefix: string;
  text: string;
}
function documentSource(root: LegacyNode, rows: readonly Row[]): StructuralDocumentSource {
  let canonical = '';
  const leaves: StructuralSourceLeaf[] = rows.map((row) => {
    const from = canonical.length;
    canonical += row.prefix + row.text + '\n';
    return {
      node: row.node,
      root,
      type: 'paragraph',
      body: [row.text],
      contexts: [{ node: row.item, parent: root, type: 'list', style: 'ol', first: row.node.cid }],
      lines: [
        {
          from,
          to: from + row.prefix.length + row.text.length,
          prefix: row.prefix,
          body: row.text,
        },
      ],
    };
  });
  return { canonical, leaves };
}
function fixture(text = 'Beta', offset = 2, start = 9) {
  const root = identity('list'),
    alpha = identity('alpha'),
    beta = identity('beta'),
    gamma = identity('gamma'),
    first = identity('item-a'),
    middle = identity('item-b'),
    last = identity('item-c'),
    fresh = identity('fresh-p'),
    freshItem = identity('fresh-item');
  const a = String(start).padStart(4, '0') + '. ',
    b = String(start + 1).padStart(4, '0') + '. ',
    c = String(start + 2).padStart(4, '0') + '. ';
  const before = documentSource(root, [
    { node: alpha, item: first, prefix: a, text: 'Alpha' },
    { node: beta, item: middle, prefix: b, text },
    { node: gamma, item: last, prefix: c, text: 'Gamma' },
  ]);
  const after = documentSource(root, [
    { node: alpha, item: first, prefix: `${start}. `, text: 'Alpha' },
    { node: beta, item: middle, prefix: `${start + 1}. `, text: text.slice(0, offset) },
    { node: fresh, item: freshItem, prefix: `${start + 2}. `, text: text.slice(offset) },
    { node: gamma, item: last, prefix: `${start + 3}. `, text: 'Gamma' },
  ]);
  const raw = `\uFEFF${a}Alpha\r\n${b}${text}\n${c}Gamma\r`;
  const expected = `\uFEFF${a}Alpha\r\n${b}${text.slice(0, offset)}\n${start + 2}. ${text.slice(offset)}\n${c}Gamma\r`;
  return { before, after, raw, expected, offset };
}

describe('identity-bound structural break receipt', () => {
  it('turns the existing quoted soft break into a paragraph boundary without rewriting its prefix', () => {
    const quote = identity('quote'),
      paragraph = identity('paragraph'),
      fresh = identity('new-paragraph');
    const make = (
      rows: readonly { node: LegacyNode; text: string }[],
    ): StructuralDocumentSource => {
      let canonical = '';
      const leaves: StructuralSourceLeaf[] = rows.map((row, index) => {
        if (index) canonical += '>\n';
        const body = row.text.split('\n');
        const lines = body.map((text) => {
          const from = canonical.length;
          canonical += '> ' + text + '\n';
          return { from, to: from + 2 + text.length, prefix: '> ', body: text };
        });
        return {
          node: row.node,
          root: quote,
          type: 'paragraph',
          body,
          lines,
          contexts: [{ node: quote, type: 'quote', style: '' }],
        };
      });
      return { canonical, leaves };
    };
    const before = make([{ node: paragraph, text: 'Alpha\nBeta\nGamma' }]),
      after = make([
        { node: paragraph, text: 'Alpha\nBeta' },
        { node: fresh, text: 'Gamma' },
      ]);
    const receipt = structuralBreakReceipt(before, after, 0, 10, false);
    expect(receipt?.patches).toEqual([{ from: 14, to: 14, insert: '\n>' }]);
    if (!receipt) throw Error('Missing quote receipt');
    const mirror = new SourceMirror('\uFEFF> Alpha\r\n> Beta\n> Gamma\r\n', before.canonical);
    expect(
      mirror.update(after.canonical, {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: before.canonical,
        patches: receipt.patches,
      }).source,
    ).toBe('\uFEFF> Alpha\r\n> Beta\n>\n> Gamma\r\n');
  });
  it('keeps padded source ordinals, physical endings and BOM while projecting display renumbering', () => {
    const f = fixture(),
      receipt = structuralBreakReceipt(f.before, f.after, 1, f.offset, false);
    expect(receipt).toBeDefined();
    if (!receipt) throw Error('Missing receipt');
    expect(receipt.patches).toEqual([
      {
        from: f.before.canonical.indexOf('Beta') + 2,
        to: f.before.canonical.indexOf('Beta') + 2,
        insert: '\n11. ',
      },
    ]);
    const mirror = new SourceMirror(f.raw, f.before.canonical);
    expect(
      mirror.update(f.after.canonical, {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: f.before.canonical,
        patches: receipt.patches,
        canonicalProjection: {
          baseProjectionEpoch: mirror.projectionEpoch,
          baseCanonical: receipt.editCanonical,
          patches: receipt.normalizationPatches,
        },
      }).source,
    ).toBe(f.expected);
  });
  it('preserves Unicode and unmodified source under independent ordered split vectors', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('A', '中', '😀', 'e\u0301', '𠮷', 'Ж', '1'), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.nat(),
        fc.integer({ min: 1, max: 9999 }),
        (parts, at, start) => {
          const offset = parts.slice(0, at % (parts.length + 1)).join('').length;
          const f = fixture(parts.join(''), offset, start),
            receipt = structuralBreakReceipt(f.before, f.after, 1, offset, false);
          expect(receipt).toBeDefined();
          if (!receipt) throw Error('Missing property receipt');
          const mirror = new SourceMirror(f.raw, f.before.canonical);
          expect(
            mirror.update(f.after.canonical, {
              kind: 'edit',
              baseStateId: mirror.stateId,
              baseCanonical: f.before.canonical,
              patches: receipt.patches,
              canonicalProjection: {
                baseProjectionEpoch: mirror.projectionEpoch,
                baseCanonical: receipt.editCanonical,
                patches: receipt.normalizationPatches,
              },
            }).source,
          ).toBe(f.expected);
        },
      ),
      { seed: 20261017, numRuns: 300 },
    );
  });
  it.each([
    'foreign-node',
    'body-change',
    'path-change',
    'type-change',
    'non-number-prefix',
    'unaccounted-gap',
  ])('rejects %s instead of authorizing a whole document rewrite', (kind) => {
    const f = fixture();
    const leaves = f.after.leaves.map((leaf) => ({ ...leaf }));
    const gamma = leaves[3];
    if (!gamma) throw Error('Missing test leaf');
    if (kind === 'foreign-node') gamma.node = identity('foreign');
    if (kind === 'body-change') gamma.body = ['Changed'];
    const context = gamma.contexts[0],
      line = gamma.lines[0];
    if (!context || !line) throw Error('Missing test context or line');
    if (kind === 'path-change') gamma.contexts = [{ ...context, node: identity('other-parent') }];
    if (kind === 'type-change') gamma.type = 'fences';
    if (kind === 'non-number-prefix') gamma.lines = [{ ...line, prefix: '- ' }];
    const after = {
      ...f.after,
      leaves,
      ...(kind === 'unaccounted-gap' ? { canonical: f.after.canonical + 'extra\n' } : {}),
    };
    expect(structuralBreakReceipt(f.before, after, 1, f.offset, false)).toBeUndefined();
  });
  it('rejects offsets inside a surrogate pair', () => {
    const f = fixture('A😀B', 2);
    expect(structuralBreakReceipt(f.before, f.after, 1, 2, false)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../../editor-core/src/source-mirror.js';
import type { StructuralDocumentSource } from '../src/runtime/block-indent-source.js';
import type { LegacyNode } from '../src/runtime/legacy-types.js';
import { rootBreakReceipt } from '../src/runtime/root-break-source.js';

const identity = (cid: string) => ({ cid }) as LegacyNode;
interface Block {
  node: LegacyNode;
  body: string;
  type?: string;
}
function documentSource(blocks: readonly Block[]): StructuralDocumentSource {
  let canonical = '';
  const leaves = blocks.map(({ node, body, type = 'paragraph' }) => {
    const from = canonical.length;
    const lines = body.split('\n').map((text) => {
      const from = canonical.length;
      canonical += `${text}\r\n`;
      return { from, to: from + text.length, body: text, prefix: '' };
    });
    canonical += '\r\n';
    return {
      node,
      root: node,
      type,
      body: body.split('\n'),
      lines,
      contexts: [],
      rootRange: { from, to: canonical.length },
    };
  });
  return { canonical, leaves };
}

describe('root Enter source receipt', () => {
  it.each([
    ['paragraph', 'First\nMARK  \nLast', 'First\nMA', 'RK  \nLast', '\r\n\r\n'],
    ['heading', '### MARK ###', '### MA ###', '### RK ###', ' ###\r\n\r\n### '],
    ['heading', 'MARK\n========', 'MA\n========', 'RK\n========', '\r\n========\r\n\r\n'],
    [
      'paragraph',
      'Before **bold *MARK* end**',
      'Before **bold *MA***',
      '***RK* end**',
      '***\r\n\r\n***',
    ],
    ['paragraph', 'Before [MARK](url)', 'Before [MA', '[RK](url)', '\r\n\r\n['],
  ])('proves a single caret insertion for %s / %s', (type, body, first, second, inserted) => {
    const head = identity('head'),
      current = identity('current'),
      fresh = identity('fresh'),
      tail = identity('tail');
    const before = documentSource([
        { node: head, body: 'Keep first' },
        { node: current, type, body },
        { node: tail, body: 'Keep last  ' },
      ]),
      after = documentSource([
        { node: head, body: 'Keep first' },
        { node: current, type, body: first },
        { node: fresh, type, body: second },
        { node: tail, body: 'Keep last  ' },
      ]),
      point = before.canonical.indexOf('MARK') + 2;
    const receipt = rootBreakReceipt(before, after, 1, point, false);
    expect(receipt?.patches).toEqual([{ from: point, to: point, insert: inserted }]);
    if (!receipt) throw Error('Missing exact root split receipt');
    let line = 0;
    const raw = `\ufeff${before.canonical.replace(/\r\n/g, () => (line++ % 2 ? '\n' : '\r\n'))}`;
    const mirror = new SourceMirror(raw, before.canonical);
    const update = mirror.update(after.canonical, {
      kind: 'edit',
      baseStateId: mirror.stateId,
      baseCanonical: before.canonical,
      patches: receipt.patches,
    });
    // Newly inserted lines use the local source ending. Every old byte remains.
    const rawPoint = raw.indexOf('MARK') + 2;
    const length = update.source.length - raw.length;
    expect(update.source.slice(0, rawPoint)).toBe(raw.slice(0, rawPoint));
    expect(update.source.slice(rawPoint + length)).toBe(raw.slice(rawPoint));
    expect(update.source.slice(rawPoint, rawPoint + length).replace(/\r\n/g, '\n')).toBe(
      inserted.replace(/\r\n/g, '\n'),
    );
  });

  it('proves Shift+Enter without inventing a new root identity', () => {
    const node = identity('paragraph');
    const before = documentSource([{ node, body: 'A😀B' }]),
      after = documentSource([{ node, body: 'A😀\nB' }]);
    expect(rootBreakReceipt(before, after, 0, 3, true)?.patches).toEqual([
      { from: 3, to: 3, insert: '\r\n' },
    ]);
    expect(rootBreakReceipt(before, after, 0, 2, true)).toBeUndefined();
  });

  it('keeps the original raw block gap when native Enter normalizes padding before math', () => {
    const current = identity('paragraph'),
      fresh = identity('fresh'),
      math = identity('math');
    const before = documentSource([
        { node: current, body: 'MARK' },
        { node: math, type: 'math_block', body: '$$\nx^2\n$$' },
      ]),
      after = documentSource([
        { node: current, body: 'MA' },
        { node: fresh, body: 'RK' },
        { node: math, type: 'math_block', body: '$$\nx^2\n$$' },
      ]);
    const gap = after.canonical.indexOf('RK') + 2;
    const normalized: StructuralDocumentSource = {
      canonical: after.canonical.slice(0, gap) + after.canonical.slice(gap + 2),
      leaves: after.leaves.map((leaf, index) => ({
        ...leaf,
        lines: leaf.lines.map((line) =>
          index > 1 ? { ...line, from: line.from - 2, to: line.to - 2 } : line,
        ),
        rootRange: {
          from: (leaf.rootRange?.from ?? 0) - (index > 1 ? 2 : 0),
          to: (leaf.rootRange?.to ?? 0) - (index >= 1 ? 2 : 0),
        },
      })),
    };
    const receipt = rootBreakReceipt(before, normalized, 0, 2, false);
    expect(receipt?.patches).toEqual([{ from: 2, to: 2, insert: '\r\n\r\n' }]);
    if (!receipt) throw Error('Missing layout receipt');
    const raw = '\ufeffMARK\n\r\n$$\nx^2\r\n$$\n\r\n';
    const mirror = new SourceMirror(raw, before.canonical);
    expect(
      mirror.update(normalized.canonical, {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: before.canonical,
        patches: receipt.patches,
        canonicalProjection: {
          baseProjectionEpoch: mirror.projectionEpoch,
          baseCanonical: receipt.editCanonical,
          patches: receipt.normalizationPatches,
        },
      }).source,
    ).toBe(raw.replace('MARK', 'MA\n\nRK'));
  });

  it.each([
    'foreign-root',
    'reused-root',
    'foreign-tail',
    'changed-tail',
    'wrong-type',
    'text-insert',
    'wrong-caret',
  ])('rejects %s without granting a source edit', (kind) => {
    const current = identity('current'),
      fresh = identity('fresh'),
      tail = identity('tail');
    const before = documentSource([
        { node: current, body: 'MARK' },
        { node: tail, body: 'Tail' },
      ]),
      after = documentSource([
        { node: kind === 'foreign-root' ? identity('other') : current, body: 'MA' },
        {
          node: kind === 'reused-root' ? tail : fresh,
          type: kind === 'wrong-type' ? 'heading' : 'paragraph',
          body: kind === 'text-insert' ? 'arbitraryRK' : 'RK',
        },
        {
          node: kind === 'foreign-tail' ? identity('other-tail') : tail,
          body: kind === 'changed-tail' ? 'Changed' : 'Tail',
        },
      ]);
    expect(
      rootBreakReceipt(before, after, 0, kind === 'wrong-caret' ? 1 : 2, false),
    ).toBeUndefined();
  });
});

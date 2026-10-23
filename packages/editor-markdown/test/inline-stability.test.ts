import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseInline } from '../src/index.js';

describe('bounded literal inline parsing', () => {
  it.each([
    ['backslashes', '\\'.repeat(30_000)],
    ['unclosed link labels', '['.repeat(1_000_000)],
    ['unclosed link destination', `${'['.repeat(1_000_000)}](missing`],
  ])('keeps long %s literal without rescanning each suffix', (_name, source) => {
    const start = performance.now();
    const nodes = parseInline(source, 0, source.length);
    const elapsed = performance.now() - start;
    expect(nodes).toEqual([
      {
        kind: 'text',
        from: 0,
        to: source.length,
        contentFrom: 0,
        contentTo: source.length,
        children: [],
      },
    ]);
    expect(elapsed).toBeLessThan(1000);
  });

  it('retains escaped marker parity after long literal runs and locates subsequent links', () => {
    const prefix = `${'\\'.repeat(30_000)}\\*literal* `;
    const source = `${prefix}[first](one) [second](two)`;
    const nodes = parseInline(source, 0, source.length);
    expect(nodes[0]).toMatchObject({ kind: 'text', from: 0, to: prefix.length });
    expect(nodes.filter((node) => node.kind === 'link').map((node) => node.destination)).toEqual([
      'one',
      'two',
    ]);
  });
  it('preserves escape parity, exact source coverage and following links across generated runs', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), fc.constantFrom('*', '_'), (count, marker) => {
        const prefix = '\\'.repeat(count);
        const source = `${prefix}${marker}中文😀${marker} [first](one) [second](two)`;
        const nodes = parseInline(source, 0, source.length);
        let end = 0;
        for (const node of nodes) {
          expect(node.from).toBe(end);
          expect(node.contentFrom).toBeGreaterThanOrEqual(node.from);
          expect(node.contentTo).toBeLessThanOrEqual(node.to);
          end = node.to;
        }
        expect(end).toBe(source.length);
        expect(nodes.some((node) => ['strong', 'emphasis', 'strike'].includes(node.kind))).toBe(
          count % 2 === 0,
        );
        expect(
          nodes.filter((node) => node.kind === 'link').map((node) => node.destination),
        ).toEqual(['one', 'two']);
      }),
      { numRuns: 300, seed: 718333 },
    );
  });
});

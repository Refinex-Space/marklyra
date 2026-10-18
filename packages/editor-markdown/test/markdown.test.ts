import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, serializeMarkdown } from '../src/index.js';

describe('source-preserving parse', () => {
  it.each([
    '\uFEFF---\r\nx: 1\r\n---\r\n\r\n# Title  \n\n',
    '007. item\r\n\t- sub\n',
    '| a  | b |\n| --- | --- |\n| x | y |\n',
    '```ts\r\n# raw\n\tcode\r\n```\r\n',
    '\r',
    '',
  ])('retains exact source %j', (source) =>
    expect(serializeMarkdown(parseMarkdown(source))).toBe(source),
  );
  it('partitions every arbitrary source without gaps', () =>
    fc.assert(
      fc.property(fc.string(), (source) => {
        const doc = parseMarkdown(source);
        let end = 0;
        for (const block of doc.blocks) {
          expect(block.from).toBe(end);
          expect(block.raw).toBe(source.slice(block.from, block.to));
          expect(block.contentFrom).toBeGreaterThanOrEqual(block.from);
          expect(block.contentTo).toBeLessThanOrEqual(block.to);
          end = block.to;
        }
        expect(end).toBe(source.length);
        expect(serializeMarkdown(doc)).toBe(source);
      }),
      { numRuns: 500 },
    ));
  it('keeps offsets including CRLF and BOM', () => {
    const doc = parseMarkdown('\uFEFF# Title\r\n\r\nA **bold**.');
    expect(doc.blocks[0]).toMatchObject({
      kind: 'heading',
      from: 0,
      contentFrom: 3,
      contentTo: 8,
      to: 10,
    });
    expect(doc.blocks[2]?.inlines[1]).toMatchObject({
      kind: 'strong',
      from: 14,
      contentFrom: 16,
      contentTo: 20,
      to: 22,
    });
  });
  it('does not render escaped markers or code contents as emphasis', () => {
    expect(parseInline('\\*literal*', 0, 10).every((n) => n.kind === 'text')).toBe(true);
    expect(parseInline('`**raw**`', 0, 9)[0]).toMatchObject({ kind: 'code', children: [] });
  });
  it('groups multiline paragraph but isolates fenced code', () => {
    expect(parseMarkdown('a\nb\n\n```md\n# x\n```\n').blocks.map((b) => b.kind)).toEqual([
      'paragraph',
      'blank',
      'code',
      'blank',
    ]);
  });
});

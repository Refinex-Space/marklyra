/** Benchmark inputs; no runtime program source or user documents. */
export function createPerformanceFixture(
  bytes,
  kind = 'mixed',
  { bom = true, eol = 'mixed' } = {},
) {
  if (!Number.isSafeInteger(bytes) || bytes < 1024 || !['plain', 'mixed'].includes(kind))
    throw new Error('Invalid benchmark fixture options');
  if (typeof bom !== 'boolean' || !['mixed', 'lf'].includes(eol))
    throw new Error('Invalid benchmark encoding controls');
  const normalize = (value) => (eol === 'lf' ? value.replace(/\r\n/g, '\n') : value);
  const header =
    (bom ? '\uFEFF' : '') +
    normalize('---\r\ntitle: MarkLyra performance fixture\n---\r\n\n# Benchmark\r\n\r\n');
  const tail = '\n\nbenchmark-tail';
  const section = (index) =>
    normalize(
      kind === 'plain'
        ? `Paragraph ${index}: ordinary prose with 中文 and 😀. Keep exact spaces and line endings.\r\nA soft line continues here.\n\n`
        : [
            `## Section ${index}\r\n\n`,
            'Text with **strong**, *emphasis*, ~~strike~~, `inline code` and 中文😀.\r\n\n',
            '[Local reference](./reference.md) and ![image](./fixture.png).\n\n',
            '- parent\n  - child\r\n    - grandchild\n- [ ] task\n\n',
            '> A quotation\n> > Nested quotation\r\n\n',
            '| column | value |\n| --- | --- |\n| sample | 123 |\r\n\n',
            '```typescript\nconst sample = { exact: "  spaces  " };\n```\r\n\n',
          ].join(''),
    );
  let source = header;
  let remaining = bytes - Buffer.byteLength(header + tail);
  for (let index = 1; ; index++) {
    const block = section(index);
    const length = Buffer.byteLength(block);
    if (length > remaining) break;
    source += block;
    remaining -= length;
  }
  source += 'x'.repeat(remaining) + tail;
  if (Buffer.byteLength(source) !== bytes) throw new Error('Fixture byte count mismatch');
  return source;
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const percentile = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: sorted.length,
    minMs: sorted[0],
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1),
  };
}

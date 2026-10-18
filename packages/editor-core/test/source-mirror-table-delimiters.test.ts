import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffText, SourceMirror } from '../src/source-mirror.js';
import { tableDelimiterRuns } from '../src/source-mirror-tables.js';

function project(source: string, next: string) {
  const mirror = new SourceMirror(source, source);
  mirror.update(next, {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseCanonical: source,
    patches: [],
    canonicalProjection: {
      baseProjectionEpoch: mirror.projectionEpoch,
      baseCanonical: source,
      patches: diffText(source, next),
    },
  });
  return mirror;
}
const declaration = '| :------------ | -----------: |',
  short = '| :--- | ---: |';
const table = `| H1 | H2 |\n${declaration}\n| body | keep |\n`;
describe('context-checked table delimiter dash correspondence', () => {
  it('does not mistake an escaped trailing pipe for an explicit outer boundary', () => {
    expect(tableDelimiterRuns('| H1 | H2 \\|\n| ------------ |\n').size).toBe(0);
  });
  it.each(['', '> ', '> > ', '   '])(
    'keeps raw dashes and following cell edits/history with prefix %s',
    (prefix) => {
      const lead = prefix === '   ' ? '- Parent\n\n' : '';
      const source =
        '\ufeff' +
        lead +
        table
          .split(/(?<=\n)/u)
          .map((line) => prefix + line)
          .join('');
      const next = source.replace(declaration, short),
        mirror = project(source, next),
        checkpoint = mirror.stateId;
      expect(mirror.source).toBe(source);
      const at = next.indexOf('body'),
        edited = next.slice(0, at) + 'X' + next.slice(at);
      expect(mirror.canonicalToSource(at)).toBe(source.indexOf('body'));
      expect(
        mirror.update(edited, {
          kind: 'edit',
          baseStateId: mirror.stateId,
          baseCanonical: next,
          baseProjectionEpoch: mirror.projectionEpoch,
          patches: [{ from: at, to: at, insert: 'X' }],
        }).source,
      ).toBe(source.replace('body', 'Xbody'));
      expect(
        mirror.update(next, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: checkpoint,
          baseProjectionEpoch: mirror.projectionEpoch,
        }).source,
      ).toBe(source);
    },
  );
  it.each([
    '```md\n' + table + '```\n',
    '> ```md\n' +
      table
        .split(/(?<=\n)/u)
        .map((line) => '> ' + line)
        .join('') +
      '> ```\n',
    '```md\n> ```\n' + table + '```\n',
    '```md\n- ```\n' + table + '```\n',
    table
      .split(/(?<=\n)/u)
      .map((line) => '    ' + line)
      .join(''),
    '---\n' + table + '---\n',
    '<pre>\n' + table + '</pre>\n',
    '<div>\n</div>\n' + table + '\n',
    '<!--\n' + table + '-->\n',
    '$$\n' + table + '$$\n',
    '$$\n> $$\n' + table + '$$\n',
    '| only one |\n' + declaration + '\n',
    declaration + '\n',
  ])('does not alias declaration-looking code or unmatched headers: %s', (source) => {
    expect(() => project(source, source.replace(declaration, short))).toThrow();
  });
  it('requires pipes, colons and intrinsic content to remain exact', () => {
    for (const next of [
      table.replace(':---', '---'),
      table.replace('body', 'changed'),
      table.replace(declaration, '| ---: | :--- |'),
      table.replace(declaration, '| :--- | ---: | --- |'),
    ])
      expect(() => project(table, next)).toThrow();
  });
  it('accepts escaped/code-span pipes and literal equality when only one side has a table alias', () => {
    const source = table.replace('H1', '`a|b`').replace('H2', 'a\\|b');
    expect(project(source, source.replace(declaration, short)).source).toBe(source);
    const tab =
      '- Parent\n\n' +
      table
        .split(/(?<=\n)/u)
        .map((line) => '\t' + line)
        .join('');
    const spaces = tab.replaceAll('\t', '   ');
    expect(project(tab, spaces).source).toBe(tab);
    expect(() => project(tab, spaces.replace(declaration, short))).toThrow();
  });
  it('fuzzes width-only normalization with exact source preservation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 100 }),
        fc.integer({ min: 3, max: 100 }),
        fc.array(fc.constantFrom('left', 'center', 'right', 'none'), {
          minLength: 1,
          maxLength: 8,
        }),
        (a, b, align) => {
          const header = '|' + align.map((_, i) => ` H${i}中😀 |`).join('');
          const delimiter = (width: number) =>
            '|' +
            align
              .map(
                (value) =>
                  ' ' +
                  (value === 'left' || value === 'center' ? ':' : '') +
                  '-'.repeat(width) +
                  (value === 'right' || value === 'center' ? ':' : '') +
                  ' |',
              )
              .join('');
          const source = header + '\n' + delimiter(a) + '\n';
          expect(project(source, header + '\n' + delimiter(b) + '\n').source).toBe(source);
        },
      ),
      { seed: 20261017, numRuns: 150 },
    );
  });
});

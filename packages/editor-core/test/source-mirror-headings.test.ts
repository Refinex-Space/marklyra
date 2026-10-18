import { describe, expect, it } from 'vitest';
import { diffText, SourceMirror, SourceMirrorError } from '../src/index.js';

function rebase(mirror: SourceMirror, next: string) {
  return mirror.rebaseCanonical(next, {
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: mirror.canonical,
    patches: diffText(mirror.canonical, next),
  });
}
function edit(mirror: SourceMirror, from: number, to: number, insert: string) {
  return mirror.update(mirror.canonical.slice(0, from) + insert + mirror.canonical.slice(to), {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: mirror.canonical,
    patches: [{ from, to, insert }],
  });
}

describe('bounded heading declaration correspondence', () => {
  it('pairs equal level and exact inline text across ATX, closed ATX and both setext widths', () => {
    const forms = [
      '# A *中😀* \\#\n',
      '# A *中😀* \\# #\n',
      'A *中😀* \\#\n===\n',
      'A *中😀* \\#\n============\n',
    ];
    for (const raw of forms)
      for (const canonical of forms) {
        const source = `\uFEFF${raw.replace(/\n/gu, '\r\n')}\r\nTail  \r`,
          text = `${canonical}\nTail\n`,
          mirror = new SourceMirror(source, text),
          at = text.indexOf('中😀');
        expect(mirror.source).toBe(source);
        expect(mirror.canonicalToSource(at)).toBe(source.indexOf('中😀'));
        expect(mirror.sourceToCanonical(source.indexOf('中😀'))).toBe(at);
        const update = edit(mirror, at, at + '中😀'.length, '中文');
        expect(update.source).toBe(source.replace('中😀', '中文'));
        expect(update.patches).toEqual([
          { from: source.indexOf('中😀'), to: source.indexOf('中😀') + 3, insert: '中文' },
        ]);
      }
  });

  it('keeps heading text endpoints narrow while projecting suffixes and EOLs', () => {
    for (const raw of ['Title\r\n=======\r\n', '# Title ####  \r\n']) {
      const source = `\uFEFF${raw}\r\nTail\r`,
        mirror = new SourceMirror(source, '# Title\n\nTail\n');
      const at = mirror.canonical.indexOf('Title') + 5;
      expect(mirror.canonicalToSource(at, 'left')).toBe(source.indexOf('Title') + 5);
      expect(mirror.canonicalToSource(at, 'right')).toBe(source.indexOf('Title') + 5);
      expect(edit(mirror, at, at, '中文').source).toBe(source.replace('Title', 'Title中文'));
    }
    const mirror = new SourceMirror('Title\n=====', '# Title\n');
    expect(edit(mirror, 2, 2, 'New ').source).toBe('New Title\n=====');
  });

  it('rebases all styles without source/history changes and restores local edits exactly', () => {
    const source = '\uFEFF# One ###\r\n\r\n## Two ##\n\n### Three ###\r',
      initial = '# One\n\n## Two\n\n### Three\n',
      mirror = new SourceMirror(source, initial),
      originalId = mirror.stateId;
    for (const next of [
      'One\n===\n\nTwo\n---\n\n### Three\n',
      '# One #\n\n## Two ##\n\n### Three ###\n',
      'One\n==========\n\nTwo\n----------\n\n### Three\n',
      initial,
    ] as const) {
      expect(rebase(mirror, next)).toEqual({ source, patches: [] });
      expect(mirror.stateId).toBe(originalId);
      const at = next.indexOf('Two');
      expect(mirror.canonicalToSource(at)).toBe(source.indexOf('Two'));
    }
    const at = mirror.canonical.indexOf('Three');
    expect(edit(mirror, at, at + 5, '三')).toEqual({
      source: source.replace('Three', '三'),
      patches: [{ from: source.indexOf('Three'), to: source.indexOf('Three') + 5, insert: '三' }],
    });
    const editedId = mirror.stateId,
      edited = mirror.canonical;
    expect(
      mirror.update(initial, {
        kind: 'history',
        baseStateId: editedId,
        targetStateId: originalId,
        baseProjectionEpoch: mirror.projectionEpoch,
      }).source,
    ).toBe(source);
    expect(
      mirror.update(edited, {
        kind: 'history',
        baseStateId: originalId,
        targetStateId: editedId,
        baseProjectionEpoch: mirror.projectionEpoch,
      }).source,
    ).toBe(source.replace('Three', '三'));
  });

  it('does not reinterpret unknown blocks, containers, multi-line paragraphs or literal BOM', () => {
    for (const [raw, canonical] of [
      ['```md\n# Title ###\n```\n', '```md\n# Title\n```\n'],
      ['~~~\nTitle\n===\n~~~\n', '~~~\n# Title\n~~~\n'],
      ['---\n# Title ###\n---\n', '---\n# Title\n---\n'],
      ['<div>\n# Title ###\n</div>\n', '<div>\n# Title\n</div>\n'],
      ['<!--\nTitle\n===\n-->\n', '<!--\n# Title\n-->\n'],
      ['<![CDATA[\n\n# Title ###\n]]>\n', '<![CDATA[\n\n# Title\n]]>\n'],
      ['<script\n\n# Title ###\n</script>\n', '<script\n\n# Title\n</script>\n'],
      ['$$\n# Title ###\n$$\n', '$$\n# Title\n$$\n'],
      ['> # Title ###\n', '> # Title\n'],
      ['- # Title ###\n', '- # Title\n'],
      ['- item\n\n  # Title ###\n', '- item\n\n  # Title\n'],
      ['    # Title ###\n', '    # Title\n'],
      ['Para\nTitle\n===\n', 'Para\n# Title\n'],
      ['\uFEFF# Title ###\n', '\uFEFF# Title\n'],
    ] as const) {
      expect(
        () => new SourceMirror(raw, canonical, { sourceBOM: 'text', canonicalBOM: 'text' }),
        raw,
      ).toThrow(SourceMirrorError);
    }
  });

  it('requires exact heading level, escaped punctuation and inline source text', () => {
    for (const [raw, canonical] of [
      ['# Title\n', 'Title\n---\n'],
      ['Title\n===\n', '## Title\n'],
      ['### Title ###\n', '## Title ##\n'],
      ['# *Title* #\n', '# Title\n'],
      ['# Title \\#\n', '# Title\n'],
      ['# A &amp; B #\n', '# A & B\n'],
      ['# <em>Title</em> #\n', '# *Title*\n'],
      ['# Title\uFEFF #\n', '# Title\n'],
      ['---\n===\n', '# ---\n'],
      ['[ref]: /url\n===\n', '# [ref]: /url\n'],
      ['Title\n=====', '# Title'],
    ] as const)
      expect(() => new SourceMirror(raw, canonical), raw).toThrow(SourceMirrorError);
  });
});

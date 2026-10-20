import { describe, expect, it } from 'vitest';
import {
  inferExtension,
  pandocFormat,
  paperMillimetres,
} from '../src/features/export/settings/catalog.js';
import {
  marginsFillPage,
  pdfPreview,
  resolveVariables,
} from '../src/features/export/settings/pdfLayout.js';

const sample = { title: '稿', author: '李', pageNo: 2, totalPages: 9, today: '2026/10/20' };

describe('export settings model', () => {
  it('resolves header and footer variables and leaves unknown text alone', () => {
    expect(resolveVariables('${title} · ${author}', sample)).toBe('稿 · 李');
    expect(resolveVariables('第 ${pageNo} / ${totalPages} 页 ${today}', sample)).toBe(
      '第 2 / 9 页 2026/10/20',
    );
    expect(resolveVariables('${unknown} $title ${ title }', sample)).toBe(
      '${unknown} $title ${ title }',
    );
  });

  it('previews the page the host prints: A4 default, orientation, margins, header room', () => {
    const plain = pdfPreview({}, true);
    expect(plain.paper).toEqual([210, 297]);
    expect(plain.margins).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    const landscape = pdfPreview({ paper: 'Letter', landscape: true }, true);
    expect(landscape.paper).toEqual([279, 216]);
    const custom = pdfPreview(
      {
        paper: 'custom',
        'paper.custom': [100, 150],
        'paper.margin': 'custom',
        'paper.marginTop': 2,
        'paper.marginBottom': 30,
        'paper.marginLeft': 5,
        header: '${title}',
        footerRight: '${pageNo}',
      },
      true,
    );
    expect(custom.paper).toEqual([100, 150]);
    // A thin margin is widened to hold a header; a roomy one is kept.
    expect(custom.margins).toEqual({ top: 12, right: 16, bottom: 30, left: 5 });
    // Without header/footer support the text never reserves room.
    expect(pdfPreview({ header: '${title}', 'paper.margin': '' }, false).margins.top).toBe(16);
    // Custom values are ignored while the margins are standard.
    expect(pdfPreview({ 'paper.marginTop': 40 }, true).margins.top).toBe(16);
  });

  it('notices margins that leave no printable area', () => {
    const squeezed = pdfPreview(
      {
        paper: 'A5',
        'paper.margin': 'custom',
        'paper.marginLeft': 80,
        'paper.marginRight': 80,
      },
      true,
    );
    expect(marginsFillPage(squeezed)).toBe(true);
    expect(marginsFillPage(pdfPreview({}, true))).toBe(false);
  });

  it('knows the paper sizes and the usual extension of a Pandoc output format', () => {
    expect(paperMillimetres(undefined, undefined)).toEqual([210, 297]);
    expect(paperMillimetres('Tabloid', undefined)).toEqual([279, 432]);
    expect(paperMillimetres('custom', [100, 120])).toEqual([100, 120]);
    for (const [writer, extension] of [
      ['asciidoc', 'adoc'],
      ['gfm', 'md'],
      ['markdown+pipe_tables-smart', 'md'],
      ['html5', 'html'],
      ['latex', 'tex'],
      ['pptx', 'pptx'],
      ['some_new_format', 'somenewfor'],
    ])
      expect(inferExtension(writer ?? ''), writer).toBe(extension);
    expect(pandocFormat('wiki')?.extension).toBe('wiki');
    expect(pandocFormat('docx')?.styled).toBe(true);
    expect(pandocFormat('latex')?.styled).toBe(false);
    expect(pandocFormat('pdf')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { embedImages } from '../src/export/markdown.js';
import { portableLink } from '../src/export/resources.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const jpg = 'data:image/jpeg;base64,/9j/4AAQ=';

describe('Markdown export image embedding', () => {
  it('rewrites image destinations and nothing that only looks like one', () => {
    const source = [
      '---',
      'cover: assets/a.png',
      '---',
      '',
      '![图](assets/a.png) 与 [链接](assets/a.png) 以及 `![code](assets/a.png)`',
      '',
      '![两张](assets/b.jpg "标题")',
      '',
      '```',
      '![fence](assets/a.png)',
      '```',
      '',
      '<img src="assets/a.png" width="40">',
      '',
    ].join('\n');
    const result = embedImages(source, { 'assets/a.png': png, 'assets/b.jpg': jpg });
    expect(result).toContain(`![图](${png})`);
    expect(result).toContain(`![两张](${jpg} "标题")`);
    expect(result).toContain(`<img src="${png}" width="40">`);
    // Links, inline code, fenced code and front matter keep their original text.
    expect(result).toContain('[链接](assets/a.png)');
    expect(result).toContain('`![code](assets/a.png)`');
    expect(result).toContain('![fence](assets/a.png)');
    expect(result).toContain('cover: assets/a.png');
  });
  it('leaves unresolved images and documents without images untouched', () => {
    const source = '![远程](https://example.test/a.png)\n\n正文\n';
    expect(embedImages(source, {})).toBe(source);
    expect(embedImages(source, { 'assets/other.png': png })).toBe(source);
  });
  it('still embeds when the strict scanner refuses the document', () => {
    // A data URL image makes the conservative reference scanner fail closed for the whole text.
    const source = `![内嵌](${png})\n\n![本地](assets/a.png)\n`;
    const result = embedImages(source, { 'assets/a.png': jpg });
    expect(result).toContain(`![本地](${jpg})`);
    expect(result).toContain(`![内嵌](${png})`);
  });
  it('handles destinations that contain regular-expression characters', () => {
    const source = `![x](img/a+b (1).png)\n\n![y](${png})\n`;
    // The strict scanner refuses this; the fallback must not misread the destination as a pattern.
    expect(embedImages(source, { 'img/a+b (1).png': jpg })).toContain(jpg);
  });
});

describe('portable hyperlinks', () => {
  it('keeps fragments and web or mail addresses and unlinks everything else', () => {
    for (const keep of ['#section', ' #中文 ', 'https://example.test/a', 'HTTP://x.test', 'mailto:a@b.test'])
      expect(portableLink(keep), keep).toBe(true);
    for (const drop of [
      '02-密级能力-现状分析.md',
      './other.md',
      '../up/doc.md#part',
      'C:\docs\a.md',
      'file:///C:/a.md',
      'ftp://host/a',
      'tel:123',
      'javascript:alert(1)',
      'https://x.test/\u0007',
      '',
    ])
      expect(portableLink(drop), drop).toBe(false);
  });
});

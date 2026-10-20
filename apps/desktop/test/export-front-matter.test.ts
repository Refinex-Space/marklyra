import { describe, expect, it } from 'vitest';
import { frontMatterFields, titleFromName } from '../src/features/export/front-matter.js';

describe('front matter fields for export', () => {
  it('reads top-level title and author scalars', () => {
    expect(frontMatterFields('---\ntitle: 测试文档\nauthor: liyao\ntags: [a, b]\n---\n\n# 正文')).toEqual({
      title: '测试文档',
      author: 'liyao',
    });
    expect(frontMatterFields('---\r\ntitle: "带 # 的 \\"标题\\""\r\n---\r\nx')).toEqual({
      title: '带 # 的 "标题"',
    });
    expect(frontMatterFields("---\ntitle: 'It''s'\nauthor: A # comment\n---\n")).toEqual({
      title: "It's",
      author: 'A',
    });
    expect(frontMatterFields('\uFEFF---\ntitle: BOM\n---\n')).toEqual({ title: 'BOM' });
  });
  it('ignores what is not a plain top-level scalar', () => {
    expect(frontMatterFields('---\ntitle: |\n  block\nauthor: [a, b]\n---\n')).toEqual({});
    expect(frontMatterFields('---\n  title: nested\n---\n')).toEqual({});
    expect(frontMatterFields('---\ntitle: first\ntitle: second\n---\n')).toEqual({ title: 'first' });
  });
  it('is not front matter unless the block opens the document and closes', () => {
    expect(frontMatterFields('# 标题\n\n---\ntitle: x\n---\n')).toEqual({});
    expect(frontMatterFields('---\ntitle: never closed\n\n正文')).toEqual({});
    expect(frontMatterFields('')).toEqual({});
  });
  it('bounds length and refuses control characters', () => {
    const long = frontMatterFields(`---\ntitle: ${'长'.repeat(500)}\n---\n`);
    expect(long.title?.length).toBe(200);
    expect(frontMatterFields('---\ntitle: a\u0007b\n---\n')).toEqual({});
  });
  it('derives a title from a file name', () => {
    expect(titleFromName('笔记.md')).toBe('笔记');
    expect(titleFromName('C:\\docs\\a.b.md')).toBe('a.b');
    expect(titleFromName('/tmp/.hidden')).toBe('.hidden');
    expect(titleFromName('未命名')).toBe('未命名');
  });
});

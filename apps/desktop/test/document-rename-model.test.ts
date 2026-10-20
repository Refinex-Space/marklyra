import { describe, expect, it } from 'vitest';
import { checkFileName, stemRange } from '../src/features/documents/rename-model.js';

describe('document rename model', () => {
  it('selects the stem and leaves the extension alone', () => {
    expect(stemRange('README.md')).toEqual([0, 6]);
    expect(stemRange('notes.v2.md')).toEqual([0, 8]);
    expect(stemRange('.hidden')).toEqual([0, 7]);
    expect(stemRange('plain')).toEqual([0, 5]);
  });

  it('keeps a Markdown name as typed and restores the old extension otherwise', () => {
    expect(checkFileName(' 新名称.md ', 'a.md', true)).toEqual({ name: '新名称.md' });
    expect(checkFileName('README', 'old.md', false)).toEqual({ name: 'README.md' });
    expect(checkFileName('journal', 'old.txt', false)).toEqual({ name: 'journal.txt' });
    expect(checkFileName('notes.v2', 'old.md', false)).toEqual({ name: 'notes.v2.md' });
    expect(checkFileName('a.markdown', 'old.md', false)).toEqual({ name: 'a.markdown' });
    expect(checkFileName('NOTES.MD', 'old.md', false)).toEqual({ name: 'NOTES.MD' });
  });

  it('rejects names the file system cannot hold before asking the host', () => {
    expect(checkFileName('   ', 'a.md', true)).toEqual({ error: '名称不能为空' });
    expect(checkFileName('a/b.md', 'a.md', false)).toEqual({ error: '名称不能包含 / 或 \\' });
    expect(checkFileName('a\\b.md', 'a.md', false)).toEqual({ error: '名称不能包含 / 或 \\' });
    expect(checkFileName('a:b.md', 'a.md', true)).toEqual({ error: '名称不能包含 : * ? " < > |' });
    // A colon is a legal macOS name character.
    expect(checkFileName('a:b.md', 'a.md', false)).toEqual({ name: 'a:b.md' });
    expect(checkFileName('draft.', 'a.md', true)).toEqual({ error: '名称不能以 . 结尾' });
    expect(checkFileName('..', 'a.md', false)).toEqual({ error: '名称无效' });
    expect(checkFileName('a\u0007b', 'a.md', false)).toEqual({ error: '名称不能包含控制字符' });
    expect(checkFileName('x'.repeat(300), 'a.md', false)).toEqual({ error: '名称过长' });
  });
});

import { describe, expect, it } from 'vitest';
import { displayPath } from '../src/services/display-path.js';

describe('displayPath', () => {
  it('drops the Windows verbatim prefix and keeps everything else', () => {
    expect(displayPath(String.raw`\\?\D:\refinex-vault\工作空间\项目管理\Java-Base`)).toBe(
      String.raw`D:\refinex-vault\工作空间\项目管理\Java-Base`,
    );
    expect(displayPath(String.raw`\\?\UNC\server\share\a.md`)).toBe(
      String.raw`\\server\share\a.md`,
    );
    expect(displayPath(String.raw`D:\plain\a.md`)).toBe(String.raw`D:\plain\a.md`);
    expect(displayPath(String.raw`\\server\share\a.md`)).toBe(String.raw`\\server\share\a.md`);
    expect(displayPath('/Users/a/b.md')).toBe('/Users/a/b.md');
    expect(displayPath('')).toBe('');
  });
});

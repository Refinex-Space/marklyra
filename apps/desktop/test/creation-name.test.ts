import { describe, expect, it } from 'vitest';
import { creationName } from '../src/features/file-explorer/creation-types.js';

describe('creation filename input', () => {
  it('normalizes a display filename without granting path traversal', () => {
    expect(creationName('  中/文\\稿\u0000\u0019.md  ', false)).toBe('中文稿.md');
    expect(creationName('folder/../name.md', false)).toBe('folder..name.md');
    expect(creationName('  /\\\u0001  ', false)).toBe('');
  });
  it('keeps Mac characters but applies the evidenced Windows input exclusions', () => {
    expect(creationName(' A:*?"<>|.md ', false)).toBe('A:*?"<>|.md');
    expect(creationName(' A:*?"<>|.md ', true)).toBe('A.md');
    expect(creationName('👩🏽‍💻.md', true)).toBe('👩🏽‍💻.md');
  });
});

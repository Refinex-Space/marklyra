import { describe, expect, it } from 'vitest';
import { emptyThemeStyles, themeStyles } from '../src/styles/contracts.js';

describe('host supplied theme styles', () => {
  it('resolves CSS in the isolated runtime and preserves its explicit order', () => {
    expect(
      themeStyles(
        { theme: './custom.css', baseUser: '/__styles/token/base.user.css', themeUser: null },
        'marklyra://localhost/index.html',
      ),
    ).toEqual({
      theme: 'marklyra://localhost/custom.css',
      baseUser: 'marklyra://localhost/__styles/token/base.user.css',
      themeUser: null,
    });
    expect(themeStyles({}, 'https://runtime.invalid/index.html')).toEqual(emptyThemeStyles);
  });

  it('keeps caller data separate from subsequent style updates', () => {
    const input = { baseUser: '/base.user.css?revision=2' };
    const result = themeStyles(input, 'http://marklyra.localhost/index.html');
    input.baseUser = '/changed.css';
    expect(result.baseUser).toBe('http://marklyra.localhost/base.user.css?revision=2');
    expect(
      themeStyles({ theme: 'https://runtime.invalid/a.CSS' }, 'https://runtime.invalid/').theme,
    ).toBe('https://runtime.invalid/a.CSS');
  });

  it.each([
    null,
    [],
    { unknown: '/a.css' },
    { theme: 1 },
    { theme: 'data:text/css,body{}' },
    { theme: 'javascript:alert(1)' },
    { theme: 'file:///Users/test/a.css' },
    { theme: 'marklyra://foreign/a.css' },
    { theme: 'http://localhost/a.css' },
    { theme: 'marklyra://user:password@localhost/a.css' },
    { theme: '/a.css#part' },
    { theme: '/a.js' },
    { theme: '/a.css\n' },
  ])('rejects unsupported authority or malformed payload %#', (input) => {
    expect(() => themeStyles(input, 'marklyra://localhost/index.html')).toThrow();
  });
});

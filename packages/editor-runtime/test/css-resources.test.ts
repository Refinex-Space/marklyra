import { describe, expect, it } from 'vitest';
import { cssUrlTokens, stripLocalFontSources } from '../src/styles/css-resources.js';

describe('font fallback sources', () => {
  it('removes complete locals containing parentheses, commas and escaped quotes', () => {
    const src = String.raw`local("Missing (Fallback), Family"), local("Escaped \"Family\""), url("./font(a,b).woff2") format("woff2")`;
    expect(stripLocalFontSources(src)).toBe('url("./font(a,b).woff2") format("woff2")');
  });
  it('preserves kept URL/format bytes and handles escaped local names', () => {
    const src = String.raw`l\6f cal('A'), URL(./font\(a\).woff2)  format( 'woff2' ),local(B)`;
    expect(stripLocalFontSources(src)).toBe(String.raw`URL(./font\(a\).woff2)  format( 'woff2' )`);
  });
  it('keeps fallback order and discards local-only alternatives', () => {
    expect(stripLocalFontSources('local("Arial")')).toBe('');
    expect(stripLocalFontSources(' /* only comment */ ')).toBe('');
    expect(stripLocalFontSources('url(a.woff),local("B"),url(b.woff2) format("woff2")')).toBe(
      'url(a.woff), url(b.woff2) format("woff2")',
    );
  });
  for (const src of [
    'local(',
    'local("bad)',
    'local()',
    'local(A),',
    ',url(a)',
    'url(a),,url(b)',
    'local(A) garbage',
    'var(--source)',
    'url(a) tech(unknown)',
    'url(a(b).woff2)',
    'local(A) /* unclosed',
  ])
    it(`rejects malformed/unsupported source ${src}`, () =>
      expect(() => stripLocalFontSources(src)).toThrow());
});

describe('CSS URL tokens', () => {
  it('returns original UTF-16 offsets and decoded values, including nested function arguments', () => {
    const css = String.raw`/* url(ignore) */ .x{content:'url("literal")';background:image-set(url("a(b,c).png") 1x, URL(a\(b\).png) 2x);src:u\72l("font\20 name.woff2")}`;
    const tokens = cssUrlTokens(css);
    expect(tokens.map((token) => token.value)).toEqual([
      'a(b,c).png',
      'a(b).png',
      'font name.woff2',
    ]);
    expect(tokens.map((token) => css.slice(token.from, token.to))).toEqual([
      'url("a(b,c).png")',
      String.raw`URL(a\(b\).png)`,
      String.raw`u\72l("font\20 name.woff2")`,
    ]);
  });
  it('supports quoted data URIs, escaped delimiters and CSS escaped-newline strings', () => {
    expect(
      cssUrlTokens(String.raw`url("data:image/svg+xml,<svg>(x)</svg>") url(a\,b.png)`).map(
        (token) => token.value,
      ),
    ).toEqual(['data:image/svg+xml,<svg>(x)</svg>', 'a,b.png']);
    expect(cssUrlTokens('url("line\\\nbreak.png")')[0]?.value).toBe('linebreak.png');
    expect(cssUrlTokens(String.raw`url("a\22 b.png")`)[0]?.value).toBe('a"b.png');
  });
  it('ignores at/hash keywords, numeric dimensions, longer identifiers and literal strings', () => {
    expect(
      cssUrlTokens(
        `@url("a") #url(b) 1url("c") .x{content:"url(d)";a:noturl(e);b:URL("real.png")}`,
      ).map((token) => token.value),
    ).toEqual(['real.png']);
  });
  it('allows safe reverse-offset replacement without touching quoted content', () => {
    let css = `.x{content:"url(keep)";a:url("😀.png");b:url(b.png)}`;
    for (const token of cssUrlTokens(css).reverse())
      css = `${css.slice(0, token.from)}url("data:image/png;base64,YQ==")${css.slice(token.to)}`;
    expect(css).toBe(
      '.x{content:"url(keep)";a:url("data:image/png;base64,YQ==");b:url("data:image/png;base64,YQ==")}',
    );
  });
  for (const css of [
    'url(',
    'url("bad)',
    'url(unescaped(space).png)',
    'url(a b)',
    'url(a\\\nb)',
    'url("a" trailing)',
    'url(/*comment*/a)',
    '/* missing',
    '"unterminated',
    'x(url(a)',
  ])
    it(`rejects malformed URL/style ${css}`, () => expect(() => cssUrlTokens(css)).toThrow());
});

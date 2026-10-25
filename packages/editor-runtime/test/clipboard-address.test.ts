import { describe, expect, it } from 'vitest';
import { externalLink } from '../src/context-menu/contracts.js';
import { imageHostReference } from '../src/images/contracts.js';
import { clipboardMarkupAddressAllowed } from '../src/runtime/clipboard-address.js';

describe('rich clipboard address boundaries', () => {
  it.each([
    'javascript:alert(1)',
    'java\nscript:alert(1)',
    'vbs\u0000cript:run',
    'blob:https://example.test/id',
    'marklyra://localhost/private',
    'MarK\u00a0LyRa://localhost/private',
    'recovered://resource',
  ])('rejects executable or current private capability URI %s in both HTML roles', (value) => {
    expect(clipboardMarkupAddressAllowed(value, false)).toBe(false);
    expect(clipboardMarkupAddressAllowed(value, true)).toBe(false);
  });

  it.each([
    'https://example.test/path',
    'http://example.test/path',
    'ftp://example.test/file',
    'ftps://example.test/file',
    '//example.test/path',
    '../images/a.png',
    '#section',
    'mailto:person@example.test',
    'tel:+123',
    'custom-editor://document/item',
    'custom+document:opaque-value',
    'C:\\images\\a.png',
    'data:image/png;base64,AQID',
    'data:image/svg+xml;charset=utf-8,%3Csvg/%3E',
  ])('retains the existing plain data path for reference %s', (value) => {
    expect(clipboardMarkupAddressAllowed(value, false)).toBe(true);
    expect(clipboardMarkupAddressAllowed(value, true)).toBe(true);
  });

  it('keeps file images on host resolution while refusing file links in rich HTML', () => {
    expect(clipboardMarkupAddressAllowed('file:///tmp/a.png', true)).toBe(true);
    expect(clipboardMarkupAddressAllowed('file:///tmp/a.png', false)).toBe(false);
  });

  it.each([
    'custom-editor://document/item',
    'custom+document:opaque-value',
    'data:text/plain,hello',
  ])('retaining URI data %s grants neither host navigation nor image authority', (value) => {
    expect(clipboardMarkupAddressAllowed(value, false)).toBe(true);
    expect(() => externalLink(value)).toThrow();
    expect(() => imageHostReference(value)).toThrow();
  });
});

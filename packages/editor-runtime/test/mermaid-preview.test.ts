import { describe, expect, it } from 'vitest';
import { imagePreviewRequest } from '../src/images/preview.js';
import { localSvgPaint, svgPreviewSize } from '../src/runtime/mermaid-svg.js';

describe('Mermaid vector preview bounds and local references', () => {
  const base = 'https://runtime.test/index.html?channel=own';
  const ids = new Set(['arrow', 'clip']);
  it('preserves diagram dimensions and scales oversized SVG viewports within image limits', () => {
    expect(svgPreviewSize(800, 320)).toEqual({ width: 800, height: 320 });
    const size = svgPreviewSize(30000, 8000);
    expect(size.width).toBeLessThanOrEqual(16384);
    expect(size.width * size.height).toBeLessThanOrEqual(16_777_216);
    expect(size.width / size.height).toBeCloseTo(30000 / 8000, 2);
  });
  it.each([
    [0, 20],
    [-1, 20],
    [Number.NaN, 20],
    [Infinity, 20],
  ])('rejects invalid SVG bounds %s x %s', (width, height) => {
    expect(() => svgPreviewSize(width, height)).toThrow('尺寸');
  });
  it('rebases only same-document arrow and clipping references', () => {
    expect(
      localSvgPaint('url("https://runtime.test/index.html?channel=own#arrow")', base, ids),
    ).toBe('url("#arrow")');
    expect(localSvgPaint('url(#clip)', base, ids)).toBe('url("#clip")');
    expect(localSvgPaint('rgb(80, 90, 100)', base, ids)).toBe('rgb(80, 90, 100)');
  });
  it.each([
    'url(https://other.test/image#arrow)',
    'url(https://runtime.test/other#arrow)',
    'url(#missing)',
    'url(javascript:alert)',
  ])('drops unbound resource reference %s', (value) => {
    expect(localSvgPaint(value, base, ids)).toBeUndefined();
  });
  it('only accepts the named diagram kind in the existing preview protocol', () => {
    const input = {
      id: 'diagram-1',
      generation: 0,
      url: 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E',
      name: 'Mermaid 图',
      dark: false,
      kind: 'mermaid',
    };
    expect(imagePreviewRequest(input, base)).toMatchObject({ kind: 'mermaid' });
    expect(() => imagePreviewRequest({ ...input, kind: 'html' }, base)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { clipboardContent } from '../src/context-menu/contracts.js';
import { MAX_IMAGE_BYTES } from '../src/images/contracts.js';

describe('binary clipboard payload boundary', () => {
  it('owns image bytes and retains accompanying formats for paste priority', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = clipboardContent({
      text: 'alt',
      html: '<b>HTML</b>',
      image: { name: 'clip.png', type: 'image/png', bytes },
    });
    bytes[0] = 9;
    expect(result.image?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.html).toBe('<b>HTML</b>');
  });
  it.each([
    { name: '../clip.png', type: 'image/png', bytes: [] },
    { name: 'clip\n.png', type: 'image/png', bytes: new Uint8Array([1]) },
    { name: 'clip.png', type: 'text/html', bytes: new Uint8Array([1]) },
    { name: 'clip.png', type: 'image/png', bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) },
  ])('rejects malformed or oversized binary input', (image) => {
    expect(() => clipboardContent({ text: '', image })).toThrow();
  });
});

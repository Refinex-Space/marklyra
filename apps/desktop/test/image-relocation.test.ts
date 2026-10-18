import { describe, expect, it } from 'vitest';
import { relocationImageReferences as eligible } from '../src/services/image-relocation.js';

describe('original conditional image-directory migration eligibility', () => {
  it('selects only the old sibling directory when a filename template changes', () => {
    expect(
      eligible('/notes/A.md', '/notes/B.md', '${filename}.assets', '', [
        'A.assets/one.png',
        './A.assets/two.png',
        'A.assets2/other.png',
        'other.png',
        'https://example.test/A.assets/one.png',
        'data:image/png,abc',
      ]),
    ).toEqual(['A.assets/one.png', './A.assets/two.png']);
  });
  it('handles cross-parent moves, root URLs and percent-encoded Unicode filenames', () => {
    expect(
      eligible('/notes/A.md', '/next/A.md', 'assets', '.', [
        'assets/%E5%9B%BE.png',
        'file:///notes/assets/two.png',
        '../foreign.png',
      ]),
    ).toEqual(['assets/%E5%9B%BE.png', 'file:///notes/assets/two.png']);
  });
  it.each(['', 'UPLOAD', 'ipic', 'textbundle', '.', 'images/nested', '../assets'])(
    'does not migrate a non-sibling or special target %s',
    (folder) => {
      expect(eligible('/notes/A.md', '/next/B.md', folder, '', ['assets/a.png'])).toEqual([]);
    },
  );
  it('does not prompt for unchanged storage or arbitrary unrelated references', () => {
    expect(eligible('/notes/A.md', '/notes/B.md', 'assets', '', ['assets/a.png'])).toEqual([]);
    expect(eligible('/notes/A.md', '/next/B.md', 'assets', '', ['other/a.png'])).toEqual([]);
  });
});

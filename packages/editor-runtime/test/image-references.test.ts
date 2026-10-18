import { describe, expect, it } from 'vitest';
import { imageHostReference, imageMarkdown } from '../src/images/contracts.js';
import { DocumentImages } from '../src/images/host.js';
import {
  applyImagePatches,
  imageDestinations,
  imageReferencePatches,
} from '../src/images/references.js';

describe('proven image destinations', () => {
  it('changes only destinations across mixed EOL/BOM, titles, HTML and repeated text', () => {
    const source =
      '\uFEFF# A\r\n\r\nassets/a.png [link](assets/a.png)\n\n![A](assets/a.png "Title") and ![B](<assets/a.png>)\r\n\n<img alt="A" src="assets/a.png" width="100">\n';
    const patches = imageReferencePatches(source, [
      { source: 'assets/a.png', target: 'new/a.png' },
    ]);
    expect(patches).toHaveLength(3);
    expect(patches.map((patch) => source.slice(patch.from, patch.to))).toEqual([
      'assets/a.png',
      'assets/a.png',
      'assets/a.png',
    ]);
    expect(applyImagePatches(source, patches)).toBe(
      source
        .replace('![A](assets/a.png', '![A](new/a.png')
        .replace('![B](<assets/a.png', '![B](<new/a.png')
        .replace('src="assets/a.png"', 'src="new/a.png"'),
    );
  });
  it('excludes code, YAML, comments and escaped image markers', () => {
    const source =
      '---\r\nimage: ![fake](no.png)\n---\r\n\n`![fake](no.png)`\n\n```md\n![fake](no.png)\n```\n\n    ![fake](no.png)\n\n<!-- ![fake](no.png) -->\n\\![fake](no.png)\n![real](yes.png)';
    expect(imageDestinations(source).map((item) => item.source)).toEqual(['yes.png']);
  });
  it('updates an image-only reference definition, rejects a shared link definition', () => {
    const source = '![A][id]\n\n[id]: old.png "title"\r\n';
    expect(
      applyImagePatches(
        source,
        imageReferencePatches(source, [{ source: 'old.png', target: 'new.png' }]),
      ),
    ).toBe(source.replace('old.png', 'new.png'));
    expect(() => imageDestinations(`${source}[link][id]`)).toThrow('语法');
  });
  it('rejects unproved escapes, duplicate mappings, unknown images and unsafe target syntax', () => {
    expect(() => imageDestinations('![a](a\\(b\\).png)')).toThrow();
    expect(() => imageDestinations('<img data-src="old.png">')).toThrow();
    expect(() => imageDestinations('![<img src="old.png">](old.png)')).toThrow();
    expect(
      imageDestinations('<img alt=\'src="fake.png"\' src="old.png">').map((item) => item.source),
    ).toEqual(['old.png']);
    expect(imageDestinations('---\n![a](old.png)').map((item) => item.source)).toEqual(['old.png']);
    for (const mapping of [
      [
        { source: 'old.png', target: 'a.png' },
        { source: 'old.png', target: 'b.png' },
      ],
      [{ source: 'missing.png', target: 'new.png' }],
      [{ source: 'old.png', target: 'a(b).png' }],
      [{ source: 'old.png', target: 'javascript:x' }],
    ])
      expect(() => imageReferencePatches('![a](old.png)', mapping)).toThrow();
  });
  it('retains balanced source parentheses and recognizes explicit host URL requests', () => {
    expect(
      imageDestinations(
        '![a](images/a(b).png)\n![web](https://example.test/a.png?q=1#x)\n![local](file:///tmp/a.png)',
      ).map((item) => item.source),
    ).toEqual(['images/a(b).png', 'https://example.test/a.png?q=1#x', 'file:///tmp/a.png']);
  });
});

describe('explicit host image requests', () => {
  it('keeps absolute, file and network references lexical and rejects credential/protocol/UNC file URLs', () => {
    for (const value of [
      '/tmp/a.png',
      'C:\\images\\a.png',
      'file:///tmp/a.png',
      'https://example.test/a.png',
    ])
      expect(imageHostReference(value)).toBe(value);
    expect(imageHostReference('a.png', '/tmp/root')).toBe('/tmp/root/a.png');
    expect(imageHostReference('/a.png', '/tmp/root')).toBe('/tmp/root/a.png');
    expect(imageHostReference('/a.png', './root')).toBe('root/a.png');
    expect(imageHostReference('//example.test/a.png')).toBe('http://example.test/a.png');
    for (const value of [
      'javascript:alert(1)',
      'file://remote/a.png',
      'https://user:secret@example.test/a.png',
      'a\u0000.png',
    ])
      expect(() => imageHostReference(value)).toThrow();
  });
  it('does not call an unlisted action and discards a late authorized result after document change', async () => {
    let called = 0,
      finish!: (value: { source: string; url: string } | null) => void;
    const images = new DocumentImages(
      {
        resolve: async () => null,
        actions: ['copyToStorage'],
        action: async () => {
          called++;
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      },
      'doc-a',
      'http://localhost/runtime',
    );
    const generation = images.capture().generation;
    await expect(
      images.action(
        'downloadToStorage',
        'https://example.test/a.png',
        'https://example.test/a.png',
        generation,
      ),
    ).rejects.toThrow('能力');
    expect(called).toBe(0);
    const pending = images.action('copyToStorage', 'a.png', 'a.png', generation);
    images.transition('doc-b');
    finish({ source: 'new.png', url: 'data:image/png;base64,AA==' });
    await expect(pending).rejects.toThrow('取消');
  });
});

it('uses a host-authorized file URL only as source text and keeps display URLs controlled', async () => {
  expect(imageMarkdown('file:///tmp/a.png', 'a.png')).toBe('![a](<file:///tmp/a.png>)');
  const images = new DocumentImages(
    {
      resolve: async () => null,
      import: async () => ({ source: 'file:///tmp/a.png', url: 'data:image/png;base64,AA==' }),
    },
    'doc-a',
    'http://localhost/runtime',
  );
  await expect(
    images.import('a.png', 'image/png', new Uint8Array([1]), images.capture().generation),
  ).resolves.toEqual({ source: 'file:///tmp/a.png', url: 'data:image/png;base64,AA==' });
});
it('settles cancelled image actions even when a host never returns', async () => {
  const images = new DocumentImages(
    { resolve: async () => null, actions: ['copyToStorage'], action: () => new Promise(() => {}) },
    'doc-a',
    'http://localhost/runtime',
  );
  const pending = images.action('copyToStorage', 'a.png', 'a.png', images.capture().generation);
  images.transition('doc-b');
  await expect(pending).rejects.toThrow('取消');
});

import { describe, expect, it } from 'vitest';
import {
  displayImageUrl,
  type ImageHostAdapter,
  imageMarkdown,
  imageReference,
  imageRoot,
  imageType,
  MAX_IMAGE_BYTES,
  type NativeInputResult,
  nativeImageResults,
  nativeInputMarkdown,
} from '../src/images/contracts.js';
import { DocumentImages } from '../src/images/host.js';

describe('image reference and capability boundaries', () => {
  it('normalizes only path structure and never decodes percent escapes twice', () => {
    expect(imageReference('images/a%23b.png?size=2#fragment', './root')).toBe(
      'root/images/a%23b.png',
    );
    expect(imageReference('../images/%252e.png', '../root')).toBe('../images/%252e.png');
    expect(imageReference('图 像.png', './assets')).toBe('assets/图 像.png');
    expect(imageReference('..\\images\\a.png')).toBe('../images/a.png');
    expect(imageReference('%2Fetc/image.png')).toBe('%2Fetc/image.png');
  });
  it.each([
    '/etc/image.png',
    '\\\\host\\image.png',
    'C:\\images\\a.png',
    'file:///a.png',
    'https://example.test/a.png',
    'x\u0000.png',
  ])('never disguises absolute or unsafe source %s as a relative path', (source) => {
    expect(() => imageReference(source)).toThrow();
  });
  it('rejects an absolute YAML root and supports simple quoted roots', () => {
    expect(imageRoot('title: x\ntypora-root-url: "./assets"\n')).toBe('./assets');
    expect(() => imageReference('image.png', imageRoot('typora-root-url: /private'))).toThrow();
  });
  it('requires a bounded image and infers empty browser MIME from filename', () => {
    expect(imageType('diagram.PNG', '', 200)).toBe('image/png');
    expect(imageType('diagram.PNG', 'application/octet-stream', 200)).toBe('image/png');
    expect(imageType('diagram.PNG', 'image/x-png', 200)).toBe('image/png');
    expect(imageType('photo.jpeg', 'image/pjpeg', 200)).toBe('image/jpeg');
    expect(imageType('diagram.svg', 'image/svg+xml', 200)).toBe('image/svg+xml');
    expect(() => imageType('x.html', 'text/html', 200)).toThrow();
    expect(() => imageType('x.png', '', MAX_IMAGE_BYTES + 1)).toThrow('8 MiB');
    expect(() => imageType('x.png', '', 0)).toThrow();
  });
  it('allows local capability URLs but not arbitrary network, file or active data documents', () => {
    expect(displayImageUrl('http://127.0.0.1:4174/asset/id')).toContain('/asset/id');
    expect(displayImageUrl('marklyra://runtime/asset/id')).toContain('/asset/id');
    expect(displayImageUrl('blob:http://localhost/id')).toContain('blob:');
    expect(displayImageUrl('data:image/png;base64,AAAA')).toContain('image/png');
    for (const url of [
      'file:///secret.png',
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'https://external.example/a.png',
      'http://user:pass@localhost/a.png',
    ])
      expect(() => displayImageUrl(url)).toThrow();
  });
  it('creates Markdown without inserting display capability URLs or unescaped alt delimiters', () => {
    expect(imageMarkdown('assets/a%20b.png', 'a[b].png')).toBe('![ab](<assets/a%20b.png>)');
  });
});

describe('document image generations', () => {
  it('honors a scoped extension import signal even when the adapter returns after cancellation', async () => {
    const controller = new AbortController();
    let release!: (value: { source: string; url: string }) => void;
    let received: AbortSignal | undefined;
    const images = new DocumentImages(
      {
        resolve: async () => null,
        import: (request) => {
          received = request.signal;
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      },
      'doc',
      'http://127.0.0.1:4174',
    );
    const work = images.import(
      'a.png',
      'image/png',
      new Uint8Array([1]),
      0,
      '',
      undefined,
      controller.signal,
    );
    expect(received).toBe(controller.signal);
    controller.abort(new Error('extension removed'));
    release({ source: 'assets/a.png', url: 'http://127.0.0.1:4174/a.png' });
    await expect(work).rejects.toThrow('extension removed');
    expect(images.capture().signal.aborted).toBe(false);
  });
  it('aborts old resolve work and rejects a late result, even if the adapter ignores AbortSignal', async () => {
    let finish: ((result: { url: string }) => void) | undefined;
    let signal: AbortSignal | undefined;
    const images = new DocumentImages(
      {
        resolve: (request) => {
          signal = request.signal;
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      },
      'a',
      'http://127.0.0.1:4174',
    );
    const first = images.transition('a');
    const result = images.resolve('a.png', 'a.png', first.generation);
    images.transition('b');
    expect(signal?.aborted).toBe(true);
    finish?.({ url: 'http://127.0.0.1:4174/old' });
    await expect(result).rejects.toThrow('已取消');
  });
  it('keeps caller byte ownership separate and binds the import to the captured context', async () => {
    let received: Uint8Array | undefined;
    const adapter: ImageHostAdapter = {
      resolve: async () => null,
      import: async (request) => {
        received = request.bytes;
        expect(request.documentContext).toBe('doc');
        return { source: 'assets/a.png', url: 'http://127.0.0.1:4174/asset/a' };
      },
    };
    const images = new DocumentImages(adapter, 'doc', 'http://127.0.0.1:4174');
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await images.import('a.png', '', bytes, images.capture().generation)).toMatchObject({
      source: 'assets/a.png',
    });
    received?.fill(9);
    expect([...bytes]).toEqual([1, 2, 3]);
  });
  it('passes encoded YAML image root to the host and preserves its root-relative returned source', async () => {
    const images = new DocumentImages(
      {
        resolve: async () => null,
        import: async (request) => {
          expect(request.referenceRoot).toBe('../public%23images');
          return { source: '../docs/assets/a.png', url: 'http://127.0.0.1:4174/asset/a' };
        },
      },
      'doc',
      'http://127.0.0.1:4174',
    );
    const result = await images.import('a.png', '', new Uint8Array([1]), 0, '../public%23images');
    expect(result.source).toBe('../docs/assets/a.png');
    expect(imageReference(result.source, '../public%23images')).toBe('../docs/assets/a.png');
  });
  it('destroys all active work and never accepts old import completion', async () => {
    let finish: ((value: { source: string; url: string }) => void) | undefined;
    const images = new DocumentImages(
      {
        resolve: async () => null,
        import: (request) =>
          new Promise((resolve) => {
            finish = resolve;
            expect(request.signal.aborted).toBe(false);
          }),
      },
      'doc',
      'http://127.0.0.1:4174',
    );
    const pending = images.import(
      'a.png',
      'image/png',
      new Uint8Array([1]),
      images.capture().generation,
    );
    const signal = images.capture().signal;
    images.destroy();
    expect(signal.aborted).toBe(true);
    finish?.({ source: 'assets/a.png', url: 'http://127.0.0.1:4174/asset/a' });
    await expect(pending).rejects.toThrow('已取消');
  });
  it('rejects hostile URLs and source paths returned by an import adapter', async () => {
    const images = new DocumentImages(
      {
        resolve: async () => null,
        import: async () => ({ source: '/outside/a.png', url: 'file:///outside/a.png' }),
      },
      null,
      'http://127.0.0.1:4174',
    );
    await expect(images.import('a.png', 'image/png', new Uint8Array([1]), 0)).rejects.toThrow();
  });
});

describe('native input host capability boundary', () => {
  const image = {
    name: 'pixel.png',
    source: 'assets/pixel.png',
    url: 'runtime-asset://image/pixel',
  };
  it('accepts image and file-link results without assigning file URLs display authority', () => {
    const input = [image, { kind: 'link', name: 'a[b].md', source: 'file:///external/a%20b.md' }];
    const result = nativeImageResults(input);
    input[0] = { ...image, name: 'changed' };
    expect(result[0]?.name).toBe('pixel.png');
    expect(result.map(nativeInputMarkdown)).toEqual([
      '![pixel](<assets/pixel.png>)',
      ' [a\\[b\\].md](file:///external/a%20b.md) ',
    ]);
  });
  it('preserves link labels and safely delimits exceptional native paths', () => {
    expect(nativeInputMarkdown({ kind: 'link', name: 'a[b].md', source: '../a.md' })).toBe(
      ' [a\\[b\\].md](../a.md) ',
    );
    expect(nativeInputMarkdown({ kind: 'link', name: 'a(b).md', source: '../a(b).md' })).toBe(
      ' [a(b).md](<../a(b).md>) ',
    );
    expect(nativeInputMarkdown({ kind: 'link', name: 'a<b>.md', source: '../a<b>.md' })).toBe(
      ' [a\\<b\\>.md](<../a%3Cb%3E.md>) ',
    );
  });
  it.each(
    [
      [],
      Array.from({ length: 129 }, () => image),
      [image, { ...image, source: 'javascript:alert(1)' }],
      [image, { ...image, url: 'file:///secret.png' }],
      [image, { ...image, name: 'bad\n.png' }],
      [{ kind: 'link', name: 'remote', source: 'file://remote/secret' }],
      [{ kind: 'directory', name: 'x', source: 'x' }],
    ].map((value) => ({ value })),
  )('rejects the entire native batch before any runtime mutation %#', ({ value }) => {
    expect(() => nativeImageResults(value)).toThrow();
  });
  it('binds the native importer to the exact captured document and storage', async () => {
    const images = new DocumentImages(undefined, 'native-doc', 'http://127.0.0.1:4174');
    let request: unknown;
    const results = await images.importNative(
      async (value) => {
        request = value;
        return [image];
      },
      0,
      { referenceRoot: './root', storageFolder: 'assets' },
    );
    expect(request).toMatchObject({
      documentContext: 'native-doc',
      referenceRoot: './root',
      storageFolder: 'assets',
      signal: images.capture().signal,
    });
    expect(results).toEqual([image]);
  });
  it('releases a late native importer immediately when its document is replaced', async () => {
    const images = new DocumentImages(undefined, 'before', 'http://127.0.0.1:4174');
    let release: (value: NativeInputResult[]) => void = () => {};
    const work = images.importNative(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      0,
      { referenceRoot: '' },
    );
    const rejected = expect(work).rejects.toThrow('取消');
    images.transition('after');
    await rejected;
    release([image]);
    expect(images.capture().context).toBe('after');
  });
});

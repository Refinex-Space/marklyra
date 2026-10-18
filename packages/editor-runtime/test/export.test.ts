import { describe, expect, it } from 'vitest';
import {
  bundledFontUrl,
  type ExportHTMLOptions,
  exportOptions,
  MAX_EXPORT_BYTES,
  sameRuntimeOrigin,
} from '../src/export/options.js';
import { imageData, portableCss, resourceBytes } from '../src/export/resources.js';

describe('self-contained HTML export boundary', () => {
  it('only accepts the finite public options and defaults to styled', () => {
    expect(exportOptions()).toEqual({ styled: true });
    expect(
      exportOptions({
        title: '<script>as literal title</script>',
        styled: false,
        theme: 'marklyra-dark',
      }),
    ).toEqual({
      title: '<script>as literal title</script>',
      styled: false,
      theme: 'marklyra-dark',
    });
    for (const value of [
      { runCommand: 'echo unsafe' },
      { path: '/private/file' },
      { selfContained: false },
      { appendHead: '<script/>' },
      { theme: '../../elsewhere' },
      { styled: 'yes' },
    ])
      expect(() => exportOptions(value as ExportHTMLOptions)).toThrow();
    expect(() => exportOptions({ title: 'x'.repeat(513) })).toThrow();
    expect(MAX_EXPORT_BYTES).toBe(32 * 1024 * 1024);
  });
  it('validates print and static CSS without exposing serializer injections', () => {
    expect(exportOptions({ print: { splitPages: true }, extraCss: 'h1 { color: red; }' })).toEqual({
      styled: true,
      print: { splitPages: true },
      extraCss: 'h1 { color: red; }',
    });
    for (const value of [
      { print: true },
      { print: {} },
      { print: { splitPages: 'true' } },
      { print: { splitPages: false, path: '/tmp/output.pdf' } },
      { print: { splitPages: false }, styled: false },
      { extraCss: '</style><script>alert(1)</script>' },
      { extraCss: '中'.repeat(6000) },
    ])
      expect(() => exportOptions(value as ExportHTMLOptions)).toThrow();
  });
  it('handles opaque native origins without equating unrelated authorities', () => {
    expect(
      sameRuntimeOrigin(
        new URL('marklyra://localhost/style/a.css'),
        new URL('marklyra://localhost/index.html'),
      ),
    ).toBe(true);
    expect(
      sameRuntimeOrigin(
        new URL('marklyra://attacker/style/a.css'),
        new URL('marklyra://localhost/index.html'),
      ),
    ).toBe(false);
    expect(
      sameRuntimeOrigin(
        new URL('file:///private/a.css'),
        new URL('marklyra://localhost/index.html'),
      ),
    ).toBe(false);
  });
  it('only resolves font files inside bundled theme resources', () => {
    const base = 'http://127.0.0.1:4174/style/themes/marklyra-light.css',
      runtime = 'http://127.0.0.1:4174/index.html';
    expect(bundledFontUrl('./github/a.woff2', base, runtime)).toBe(
      'http://127.0.0.1:4174/style/themes/github/a.woff2',
    );
    for (const url of [
      'https://fonts.example/a.woff2',
      '../../secret.woff2',
      'file:///secret.woff2',
      'data:font/woff2;base64,AAAA',
      './github/a.js',
      './github/a.woff2?path=private',
    ])
      expect(() => bundledFontUrl(url, base, runtime)).toThrow();
  });
});

describe('bounded export resource materialization', () => {
  it('allows an empty stylesheet only when the caller explicitly permits it', async () => {
    await expect(resourceBytes(new Response(''))).rejects.toThrow('为空');
    expect(await resourceBytes(new Response(''), 1024, true)).toHaveLength(0);
  });
  it('decodes bounded image data without requiring a network capability', () => {
    expect([...imageData('data:image/png;base64,AQID').bytes]).toEqual([1, 2, 3]);
    expect(imageData('data:image/svg+xml,%3Csvg%2F%3E').mime).toBe('image/svg+xml');
    expect(() => imageData('data:text/html;base64,AQID')).toThrow();
    expect(() => imageData(`data:image/png;base64,${'A'.repeat(12 * 1024 * 1024)}`)).toThrow(
      '8 MiB',
    );
  });
  it('cancels a misleading chunked response before consuming the entire body', async () => {
    let canceled = false,
      sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        canceled = true;
      },
    });
    await expect(
      resourceBytes(new Response(stream, { headers: { 'content-length': '1' } }), 8),
    ).rejects.toThrow('8 MiB');
    expect(canceled).toBe(true);
    expect(sent).toBeLessThanOrEqual(4);
  });
  it('rejects external CSS resources including escaped or alternate resource syntax', () => {
    for (const css of [
      'background:URL(https://example/a.png)',
      'background:u\\72l(https://example/a.png)',
      'background:image-set("https://example/a.png" 1x)',
      'src:local("Name")',
      'background:image("https://example/a.png")',
      'width:expression(alert(1))',
      '@namespace url(https://example/ns);',
    ])
      expect(() => portableCss(css)).toThrow();
    expect(portableCss('marker-end:url(#arrow);src:url("data:font/woff;base64,AQID")')).toContain(
      '#arrow',
    );
  });
});

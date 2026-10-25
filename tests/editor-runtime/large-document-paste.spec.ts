import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor; largeDocumentErrors: string[] };
// Reuse the benchmark's exact pure fixture generator, without importing or
// running its browser controller. Its JavaScript module has no TS declaration.
const fixtureUrl = new URL('../../scripts/performance-fixtures.mjs', import.meta.url).href;
const { createPerformanceFixture } = (await import(fixtureUrl)) as {
  createPerformanceFixture(bytes: number, kind: 'mixed'): string;
};
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

test('1 MiB mixed-EOL tail paste retains history, next input and synthetic composition ownership', async ({
  page,
}, info) => {
  // Resource deadline only: this correctness test has no fragile latency SLO.
  test.setTimeout(180_000);
  const source = createPerformanceFixture(1024 * 1024, 'mixed');
  const marker = '__large_paste_finished__';
  const payload = 'p'.repeat(10 * 1024 - marker.length) + marker;
  expect(Buffer.byteLength(payload, 'utf8')).toBe(10 * 1024);
  const errors: string[] = [];
  const checks: { name: string; sha256: string; bytes: number }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    const old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    const mount = old.element.parentElement;
    if (!mount) throw Error('Missing large-document editor mount');
    old.destroy();
    host.largeDocumentErrors = [];
    host.marklyraEditor = new Constructor(mount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      documentContext: 'large-document-correctness',
      host: {
        images: {
          resolve: async ({ reference }) =>
            reference === 'fixture.png'
              ? {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwaQz6DwAD+wIH+1FtgwAAAABJRU5ErkJggg==',
                }
              : null,
        },
      },
      onError: (error) => host.largeDocumentErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, source);
  const frame = page.frameLocator('.marklyra-editor-frame');
  const flush = () => page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
  const history = (type: 'undo' | 'redo') =>
    page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
  const exact = async (name: string, expected: string) => {
    const actual = await flush();
    if (actual !== expected)
      await info.attach(`${name}-actual-source`, {
        body: actual,
        contentType: 'text/markdown; charset=utf-8',
      });
    expect(actual === expected, `${name}: every source code unit must remain exact`).toBe(true);
    checks.push({ name, sha256: sha256(actual), bytes: Buffer.byteLength(actual) });
  };
  await exact('loaded', source);
  await frame.locator('#write').evaluate((area) => {
    (area as HTMLElement).focus();
    const last = area.lastElementChild;
    if (!last?.textContent.endsWith('benchmark-tail')) throw Error('Missing fixture tail');
    const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
    let tail: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) tail = node;
    if (!tail) throw Error('Missing tail Text endpoint');
    getSelection()?.setBaseAndExtent(
      tail,
      tail.textContent?.length ?? 0,
      tail,
      tail.textContent?.length ?? 0,
    );
  });
  await frame.locator('#write').evaluate((area, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    area.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, payload);
  // ClipboardEvent insertion completes asynchronously. Observe only its changed
  // tail, never poll whole-document serialization to guess that it has finished.
  await expect(frame.locator('#write > p').last()).toContainText(marker, { timeout: 30_000 });
  const pasted = source + payload;
  await exact('pasted', pasted);
  await history('undo');
  await exact('paste-undone', source);
  await history('redo');
  await exact('paste-redone', pasted);
  // This must use the restored Redo caret; do not manually move it again.
  await page.keyboard.insertText('续写😀');
  const continued = `${pasted}续写😀`;
  await exact('continued', continued);
  await history('undo');
  await exact('continue-undone', pasted);
  await history('redo');
  await exact('continue-redone', continued);

  for (const mode of ['wysiwyg', 'source'] as const) {
    if (mode === 'source')
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
      );
    const target = frame.locator(mode === 'source' ? '#marklyra-source textarea' : '#write');
    await target.evaluate((element) => {
      // Only lifecycle ordering is synthesized. This is not a real system IME
      // candidate, confirmation, cancellation or native WK/WebView2 test.
      for (const type of ['compositionstart', 'compositionend', 'compositionstart'])
        element.dispatchEvent(new CompositionEvent(type, { bubbles: true, data: '' }));
    });
    await target.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing)).toBe(
      true,
    );
    await expect(
      page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
      ),
    ).rejects.toThrow();
    await target.evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
      .toBe(false);
    await exact(`${mode}-composition-finished`, continued);
  }
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  await exact('source-roundtrip', continued);
  expect(
    await page.evaluate(async () => {
      const editor = (window as unknown as Host).marklyraEditor;
      return editor.markSaved(await editor.flush());
    }),
  ).toBe(true);
  const saved = info.outputPath('large-document-saved.md');
  await writeFile(saved, await flush(), 'utf8');
  expect((await readFile(saved)).equals(Buffer.from(continued, 'utf8'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Host).largeDocumentErrors)).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach('large-document-source-checks', {
    body: JSON.stringify(
      {
        sourceBytes: Buffer.byteLength(source),
        sourceSha256: sha256(source),
        checks,
        systemClipboard: false,
        systemIME: false,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

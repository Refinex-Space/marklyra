import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };

test('strict Markdown requires whitespace after heading markers and preserves original bytes', async ({
  page,
}) => {
  const source = '\uFEFF#NoSpace\r\n\r\n# WithSpace\r\n\r\nTail  \n';
  for (const strictMarkdown of [false, true, false]) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
    await page.evaluate(
      async ({ source, strictMarkdown }) => {
        const host = window as unknown as Host;
        await host.marklyraEditor.ready;
        const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
        host.marklyraEditor.destroy();
        const root = document.querySelector<HTMLElement>('#editor');
        if (!root) throw new Error('Missing editor mount');
        host.marklyraEditor = new Constructor(root, {
          runtimeUrl: 'http://127.0.0.1:4174/index.html',
          markdown: source,
          startupPreferences: { strictMarkdown },
        });
        await host.marklyraEditor.ready;
      },
      { source, strictMarkdown },
    );
    const frame = page.frameLocator('.marklyra-editor-frame');
    await expect(frame.locator('#write h1')).toHaveCount(strictMarkdown ? 1 : 2);
    await expect(frame.locator('#write h1').last()).toHaveText('WithSpace');
    if (strictMarkdown) await expect(frame.locator('#write p').first()).toHaveText('#NoSpace');
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      source,
    );
  }
});

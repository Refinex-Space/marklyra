import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { type CDPSession, expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };
type Child = Window & { editor: { writingArea: HTMLElement } };

test.skip(({ browserName }) => browserName !== 'chromium', 'CDP IME input is Chromium only');

async function compose(page: Page): Promise<CDPSession> {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async () => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor,
      root = old.element.parentElement;
    if (!root) throw Error('Missing mount');
    old.destroy();
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: 'Alpha\n',
    });
    await host.marklyraEditor.ready;
    await host.marklyraEditor.flush();
  });
  await page.locator('.marklyra-editor-frame').focus();
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing frame');
  await frame.evaluate(() => {
    const area = (window as unknown as Child).editor.writingArea;
    area.focus();
    const text = document.createTreeWalker(area, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) throw Error('Missing paragraph text');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
    .toBe(true);
  return cdp;
}

// Windows IMEs commit with the same Enter/Space/click that also issues a save or command; the
// composition then ends a task later. That request must wait for the commit, not be refused.
test('a save or command issued as a candidate is committed runs after the commit', async ({
  page,
}) => {
  const cdp = await compose(page);
  const pending = page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    const results = await Promise.allSettled([
      editor.flush(),
      editor.execute({ type: 'insertText', text: '!' }),
    ]);
    return results.map((result) => (result.status === 'fulfilled' ? 'ok' : result.reason.message));
  });
  await page.waitForTimeout(150);
  await cdp.send('Input.insertText', { text: '你' });
  expect(await pending).toEqual(['ok', 'ok']);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    'Alpha你!\n',
  );
});

test('a candidate still open after the wait is reported, and nothing runs', async ({ page }) => {
  await compose(page);
  const started = Date.now();
  const result = await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'insertText', text: '!' }).then(
      () => 'ok',
      (error: Error) => error.message,
    ),
  );
  expect(result).toBe('请先完成输入法候选');
  expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing)).toBe(
    true,
  );
});

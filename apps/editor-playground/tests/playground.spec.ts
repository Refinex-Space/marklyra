import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type DemoWindow = Window & typeof globalThis & { marklyraEditor: MarkLyraEditor };
async function ready(page: Page, route: string) {
  await page.goto(route);
  await page.waitForFunction(() => Boolean((window as Partial<DemoWindow>).marklyraEditor));
  await page.evaluate(() => (window as DemoWindow).marklyraEditor.ready);
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(1);
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 Markdown' })).toBeEnabled();
}
async function download(page: Page): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 Markdown' }).click();
  const result = await pending;
  expect(result.suggestedFilename()).toBe('roundtrip.md');
  const path = await result.path();
  if (!path) throw new Error('Missing downloaded artifact');
  return readFile(path);
}
function encoded(text: string, encoding: 'utf8' | 'utf16le' | 'utf16be'): Buffer {
  if (encoding === 'utf8') return Buffer.from(text, 'utf8');
  const buffer = Buffer.from(text, 'utf16le');
  return encoding === 'utf16be' ? buffer.swap16() : buffer;
}

for (const route of ['/', '/react.html']) {
  for (const encoding of ['utf8', 'utf16le', 'utf16be'] as const) {
    test(`${route} preserves ${encoding} bytes through file input, download and real keyboard editing`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await ready(page, route);
      const source = '\uFEFF---\r\ntitle: Browser BOM\n---\r\n\r\n# Heading\n\nhello😀\r\n';
      const bytes = encoded(source, encoding);
      await page
        .locator('#file')
        .setInputFiles({ name: 'roundtrip.md', mimeType: 'text/markdown', buffer: bytes });
      await expect(page.getByRole('status')).toContainText('已载入：roundtrip.md');
      expect(await page.evaluate(() => (window as DemoWindow).marklyraEditor.flush())).toBe(source);
      expect(await download(page)).toEqual(bytes);
      await expect(
        page.frameLocator('.marklyra-editor-frame').locator('#write > .md-meta-block'),
      ).toHaveCount(1);
      await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > h1')).toHaveText(
        'Heading',
      );
      await page.frameLocator('.marklyra-editor-frame').locator('#write > p').first().click();
      await page
        .frameLocator('.marklyra-editor-frame')
        .locator('#write > p')
        .first()
        .evaluate((element) => {
          const document = element.ownerDocument;
          (element as HTMLElement).focus();
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false);
          const selection = document.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        });
      await page.keyboard.type('X');
      const expected = source.replace('hello😀', 'hello😀X');
      await expect
        .poll(() => page.evaluate(() => (window as DemoWindow).marklyraEditor.flush()))
        .toBe(expected);
      expect(await download(page)).toEqual(encoded(expected, encoding));
      expect(errors).toEqual([]);
    });
  }
  test(`${route} rejects invalid encoding without replacing the current document`, async ({
    page,
  }) => {
    await ready(page, route);
    const previous = await page.evaluate(() => (window as DemoWindow).marklyraEditor.flush());
    await page.locator('#file').setInputFiles({
      name: 'invalid.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from([0xc3, 0x28]),
    });
    await expect(page.getByRole('status')).toContainText('文件编码无效');
    expect(await page.evaluate(() => (window as DemoWindow).marklyraEditor.flush())).toBe(previous);
  });
}

test('portable routes retain their own DOM editor without mounting runtime resources', async ({
  page,
}) => {
  for (const route of ['/portable.html', '/portable-react.html']) {
    await page.goto(route);
    await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible();
    await expect(page.locator('.marklyra-editor-frame')).toHaveCount(0);
  }
});

for (const route of ['/', '/react.html']) {
  for (const encoding of ['utf8', 'utf16le', 'utf16be'] as const) {
    test(`${route} retains a second literal FEFF when an encoded file is edited and downloaded (${encoding})`, async ({
      page,
    }) => {
      await ready(page, route);
      const source = '\uFEFF\uFEFFAlpha\r\n\r\nMid\uFEFFdle\n\nhello😀\r\n';
      await page.locator('#file').setInputFiles({
        name: 'roundtrip.md',
        mimeType: 'text/markdown',
        buffer: encoded(source, encoding),
      });
      await expect(page.getByRole('status')).toContainText('已载入：roundtrip.md');
      expect(await download(page)).toEqual(encoded(source, encoding));
      const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p').last();
      await paragraph.click();
      await paragraph.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
      await page.keyboard.type('X');
      const expected = source.replace('hello😀', 'hello😀X');
      await expect
        .poll(() => page.evaluate(() => (window as DemoWindow).marklyraEditor.flush()))
        .toBe(expected);
      expect(await download(page)).toEqual(encoded(expected, encoding));
    });
  }
}

import { expect, type Page, test } from '@playwright/test';
import {
  createImageEditor,
  focusEnd,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

async function copy(page: Page, index = 0) {
  return imageFrame(page, index)
    .locator('#write')
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const data = new DataTransfer();
      element.dispatchEvent(
        new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }),
      );
      return Object.fromEntries([...data.types].map((type) => [type, data.getData(type)]));
    });
}
async function paste(page: Page, formats: Record<string, string>, index = 1) {
  await focusEnd(page, index);
  await imageFrame(page, index)
    .locator('#write')
    .evaluate((element, formats) => {
      const data = new DataTransfer();
      for (const [type, value] of Object.entries(formats)) data.setData(type, value);
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, formats);
}
test.beforeEach(async ({ page }) => setupImageHost(page));
for (const source of ['images/pixel.png', 'file:///tmp/pixel.png'])
  test(`cross-document MarkHTML retains the declared ${source.startsWith('file') ? 'file URL' : 'relative source'} without display capabilities`, async ({
    page,
  }) => {
    await createImageEditor(page, { source: `![pixel](${source})\n`, context: 'doc-a', width: 1 });
    await createImageEditor(page, { source: '', context: 'doc-b', width: 1 });
    const formats = await copy(page);
    expect(formats['text/markhtml']).toContain('data-src=');
    await paste(page, formats);
    await expect.poll(() => imageSource(page, 1)).toBe(`![pixel](${source})`);
    expect(await imageSource(page, 1)).not.toContain('__image_fixture__');
    await imageCommand(page, 'undo', 1);
    expect(await imageSource(page, 1)).toBe('');
  });
test('untrusted image metadata is rebuilt from source markers and never carries active DOM or a live URL', async ({
  page,
}) => {
  await createImageEditor(page, { source: '', context: 'doc-b' });
  const markup =
    '<p mdtype="paragraph" cid="foreign"><span md-inline="image" data-src="javascript:alert(1)" data-root="file:///private/escape" data-copy-from-path="/private/secret"><span>![pixel](images/pixel.png)</span><img src="blob:http://localhost/leaked-token" onerror="window.badClipboard=1"></span></p>';
  await paste(page, { 'text/markhtml': markup, 'text/plain': '![pixel](images/pixel.png)' }, 0);
  await expect.poll(() => imageSource(page, 0)).toBe('![pixel](images/pixel.png)');
  expect(
    await imageFrame(page, 0)
      .locator('#write')
      .evaluate(() => Reflect.get(window, 'badClipboard')),
  ).toBeUndefined();
  expect(await imageSource(page, 0)).not.toMatch(/private|blob:|leaked-token|javascript:/);
});
test('a live image capability as the Markdown destination is rejected before insertion', async ({
  page,
}) => {
  const source = '\uFEFFBefore\r\n';
  await createImageEditor(page, { source, context: 'doc-b' });
  const markup =
    '<p mdtype="paragraph"><span md-inline="image" data-src="blob:http://localhost/live-cap"><span>![pixel](blob:http://localhost/live-cap)</span><img src="blob:http://localhost/live-cap"></span></p>';
  await paste(page, { 'text/markhtml': markup, 'text/plain': 'pixel' }, 0);
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors.length))
    .toBeGreaterThan(0);
  expect(await imageSource(page, 0)).toBe(source);
});

import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

const source = '\uFEFFBefore **bold**\r\n\r\n![截图](images/diagram.png "标题")\r\n\r\nAfter  \n';
test('preview transforms never change source, history or the original image and restore the caret', async ({
  page,
}) => {
  await setupImageHost(page);
  await page.route('**/__image_fixture__/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="2200"><rect width="1400" height="2200" fill="#dbeafe"/><text x="100" y="200" font-size="80">Image preview</text></svg>',
    }),
  );
  await createImageEditor(page, { source, context: 'preview-doc' });
  const frame = imageFrame(page);
  const picture = frame.locator('#write .md-image img');
  await expect
    .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1400);
  await frame.locator('#write').evaluate((area) => {
    area.focus();
    const paragraph = [...area.querySelectorAll('p')].find((element) =>
      element.textContent?.startsWith('After'),
    );
    const text = paragraph && document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) throw Error('Missing text');
    getSelection()?.setBaseAndExtent(text, 2, text, 2);
  });
  const history = () =>
    frame.locator('#write').evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        undo: { commandStack: unknown; index: number };
      };
      return JSON.stringify([editor.undo.commandStack, editor.undo.index]);
    });
  const before = await history();
  const original = await picture.getAttribute('style');
  await picture.hover();
  const entry = frame.getByRole('button', { name: '查看大图', exact: true });
  await expect(entry).toBeVisible();
  await entry.click();
  const viewer = page.getByRole('dialog', { name: '图片预览', exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();
  await viewer.getByRole('button', { name: '原始尺寸', exact: true }).click();
  await expect(viewer.locator('[data-preview-scale]')).toHaveText('100%');
  await viewer.getByRole('button', { name: '放大', exact: true }).click();
  await expect(viewer.locator('[data-preview-scale]')).toHaveText('125%');
  await viewer.getByRole('button', { name: '顺时针旋转', exact: true }).click();
  await expect(viewer.locator('img')).toHaveAttribute('data-rotation', '90');
  await viewer.getByRole('button', { name: '适应宽度', exact: true }).click();
  await viewer.getByRole('button', { name: '适应窗口', exact: true }).click();
  await viewer.getByRole('button', { name: '重置视图', exact: true }).click();
  await expect(viewer.locator('img')).toHaveAttribute('data-rotation', '0');
  expect(await imageSource(page)).toBe(source);
  expect(await history()).toBe(before);
  expect(await picture.getAttribute('style')).toBe(original);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect
    .poll(() => frame.locator('#write').evaluate(() => getSelection()?.anchorOffset))
    .toBe(2);
  expect(await history()).toBe(before);
  await page.keyboard.type('X');
  await expect.poll(() => imageSource(page)).toBe(source.replace('After', 'AfXter'));
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'undo' }),
  );
  expect(await imageSource(page)).toBe(source);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'redo' }),
  );
  expect(await imageSource(page)).toBe(source.replace('After', 'AfXter'));
});

async function mount(
  page: import('@playwright/test').Page,
  text = source,
  resolve: 'immediate' | 'defer' = 'immediate',
) {
  await setupImageHost(page);
  await page.route('**/__image_fixture__/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="2200"><rect width="1400" height="2200" fill="#e4eaf3"/><path d="M0 500h1400M0 1000h1400M0 1500h1400" stroke="#7792b3"/><text x="100" y="200" font-size="70">Markdown image</text></svg>',
    }),
  );
  await createImageEditor(page, { source: text, context: 'preview-test', resolve });
  return imageFrame(page).locator('#write .md-image img').first();
}
async function preview(page: import('@playwright/test').Page) {
  const picture = imageFrame(page).locator('#write .md-image img').first();
  await expect
    .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1400);
  await picture.hover();
  await imageFrame(page).getByRole('button', { name: '查看大图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '图片预览', exact: true });
  await expect(dialog.locator('img')).toBeVisible();
  return dialog;
}

test('long-image pan, wheel/pinch zoom, keyboard focus and narrow viewports stay inside the viewer', async ({
  page,
}, info) => {
  await mount(page);
  const dialog = await preview(page);
  const stage = dialog.locator('.ml-preview-stage'),
    image = dialog.locator('img');
  await dialog.getByRole('button', { name: '原始尺寸', exact: true }).click();
  const before = await image.getAttribute('style');
  const box = await stage.boundingBox();
  if (!box) throw Error('Missing stage');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 - 110);
  await page.mouse.up();
  expect(await image.getAttribute('style')).not.toBe(before);
  await stage.dispatchEvent('wheel', {
    deltaY: -25,
    ctrlKey: true,
    clientX: box.x + 300,
    clientY: box.y + 200,
  });
  await expect(dialog.locator('[data-preview-scale]')).not.toHaveText('100%');
  await dialog.getByRole('button', { name: '原始尺寸', exact: true }).click();
  await stage.evaluate((element) => {
    element.dispatchEvent(new Event('gesturestart', { cancelable: true }));
    const event = new Event('gesturechange', { cancelable: true });
    Object.defineProperty(event, 'scale', { value: 1.5 });
    element.dispatchEvent(event);
    element.dispatchEvent(new Event('gestureend', { cancelable: true }));
  });
  await expect(dialog.locator('[data-preview-scale]')).toHaveText('150%');
  await dialog.getByRole('button', { name: '重置视图' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭图片预览' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '重置视图' })).toBeFocused();
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Control+z');
  expect(await imageSource(page)).toBe(source);
  await dialog.getByRole('button', { name: '适应窗口' }).click();
  await page.screenshot({ path: info.outputPath('image-preview-wide.png') });
  await page.setViewportSize({ width: 420, height: 400 });
  await expect.poll(async () => (await image.boundingBox())?.width).toBeLessThan(420);
  await expect.poll(async () => (await image.boundingBox())?.height).toBeLessThan(400);
  await expect(dialog.getByRole('button', { name: '关闭图片预览' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '重置视图' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('image-preview-narrow.png') });
  await dialog.getByRole('button', { name: '关闭图片预览' }).click();
  expect(await imageSource(page)).toBe(source);
});

test('right-click preview and repeated closing keep HTML, linked and reference image source intact', async ({
  page,
}) => {
  const text =
    '\uFEFF![ref][diagram]\r\n\r\n[diagram]: images/diagram.png "A title"\r\n\r\n<img src="images/diagram.png" alt="HTML" width="320">\n\n[![linked](images/diagram.png)](https://example.com)\n';
  await mount(page, text);
  const picture = imageFrame(page).locator('#write .md-image img').first();
  await expect
    .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1400);
  await picture.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '查看大图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '图片预览', exact: true });
  await expect
    .poll(async () => ({
      open: await dialog.count(),
      errors: await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors),
    }))
    .toEqual({ open: 1, errors: [] });
  await page.keyboard.press('Escape');
  for (let index = 0; index < 3; index++) {
    await preview(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  expect(await imageSource(page)).toBe(text);
  expect(await imageFrame(page).locator('#write .ml-image-preview-trigger').count()).toBe(0);
});

test('composition and unresolved image placeholders cannot start a preview', async ({ page }) => {
  const picture = await mount(page, source, 'defer');
  await picture.hover();
  const entry = imageFrame(page).getByRole('button', { name: '查看大图', exact: true });
  await expect(entry).toBeHidden();
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.releaseResolves('preview-test'),
  );
  await expect
    .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1400);
  await picture.hover();
  await expect(entry).toBeVisible();
  await imageFrame(page).locator('#write').dispatchEvent('compositionstart', { data: '中' });
  await imageFrame(page).locator('.ml-image-preview-trigger').dispatchEvent('click');
  await expect(page.getByRole('dialog', { name: '图片预览' })).toHaveCount(0);
  await imageFrame(page).locator('#write').dispatchEvent('compositionend', { data: '' });
  await preview(page);
  await page.keyboard.press('Escape');
  expect(await imageSource(page)).toBe(source);
});

test('loading a new document or destroying the SDK revokes the preview and its saved focus', async ({
  page,
}) => {
  await mount(page);
  await preview(page);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.load(
      '# Replacement\n\n![new](images/new.png)',
      { documentContext: 'replacement' },
    ),
  );
  await expect(page.getByRole('dialog', { name: '图片预览' })).toHaveCount(0);
  expect(await imageSource(page)).toBe('# Replacement\n\n![new](images/new.png)');
  await preview(page);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.destroy());
  await expect(page.getByRole('dialog', { name: '图片预览' })).toHaveCount(0);
});

test('preview restores directed CodeMirror selections without creating image or code edits', async ({
  page,
}) => {
  const text = '```js\nconst value = 1;\n```\n\n![diagram](images/diagram.png)\n';
  await mount(page, text);
  await expect
    .poll(() =>
      imageFrame(page)
        .locator('#write .md-image img')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(1400);
  const code = imageFrame(page).locator('#write .CodeMirror');
  await expect(code).toHaveCount(1);
  await code.click();
  const ranges = [{ anchor: { line: 0, ch: 12 }, head: { line: 0, ch: 2 } }];
  await code.evaluate((element, ranges) => {
    const cm = Reflect.get(element, 'CodeMirror') as {
      focus(): void;
      setSelections(ranges: unknown): void;
    };
    cm.focus();
    cm.setSelections(ranges);
  }, ranges);
  await preview(page);
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      code.evaluate((element) =>
        (
          Reflect.get(element, 'CodeMirror') as {
            listSelections(): {
              anchor: { line: number; ch: number };
              head: { line: number; ch: number };
            }[];
          }
        )
          .listSelections()
          .map(({ anchor, head }) => ({
            anchor: { line: anchor.line, ch: anchor.ch },
            head: { line: head.line, ch: head.ch },
          })),
      ),
    )
    .toEqual(ranges);
  expect(await imageSource(page)).toBe(text);
});

test('inline data images preview without exposing encoded bytes as the title or changing HTML', async ({
  page,
}) => {
  await setupImageHost(page);
  const png = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.png);
  const text = `<img src="${png}" alt="" width="200">\n\nTail\n`;
  await createImageEditor(page, { source: text, context: 'inline-image' });
  const picture = imageFrame(page).locator('#write .md-image img');
  await expect
    .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await picture.hover();
  await imageFrame(page).getByRole('button', { name: '查看大图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '图片预览', exact: true });
  await expect(dialog.locator('header > span')).toHaveText('图片预览');
  await page.keyboard.press('Escape');
  expect(await imageSource(page)).toBe(text);
});

test('image decoration can replace its DOM node without closing a valid read-only preview', async ({
  page,
}) => {
  const picture = await mount(page);
  const viewer = await preview(page);
  await picture.evaluate((image) => image.replaceWith(image.cloneNode(true)));
  await viewer.getByRole('button', { name: '顺时针旋转' }).click();
  await expect(viewer.locator('img')).toHaveAttribute('data-rotation', '90');
  await page.keyboard.press('Escape');
  expect(await imageSource(page)).toBe(source);
});

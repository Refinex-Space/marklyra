import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

for (const percent of ['80', '125']) {
  test(`editing a menu-scaled image from 50% to ${percent}% retains rendering and history`, async ({
    page,
  }) => {
    await setupImageHost(page);
    await createImageEditor(page, {
      source: '![clipboard-image](./assets/clipboard-image-with-a-long-file-name.png)\n\nAfter',
      context: 'doc-a',
    });
    await expectDecodedImage(page);
    const image = imageFrame(page).locator('#write img').first();
    await image.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^缩放图片/ }).hover();
    await page.getByRole('menuitem', { name: '50%', exact: true }).click();
    const source = imageFrame(page).locator('#write .md-image .md-meta').first();
    await expect(source).toContainText('zoom:50%');
    const scaled = await imageSource(page);
    await source.scrollIntoViewIfNeeded();
    const point = await source.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && !text.textContent?.includes('50%')) text = walker.nextNode();
      if (!text) throw new Error('Missing image zoom source');
      const offset = text.textContent?.indexOf('50%') ?? -1;
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset + 2);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    const frame = await page.locator('[data-image-editor="0"] iframe').boundingBox();
    if (!frame) throw new Error('Missing image frame');
    await page.mouse.dblclick(frame.x + point.x, frame.y + point.y);
    await page.keyboard.insertText(percent);
    const edited = scaled.replace('50%', `${percent}%`);
    await expect.poll(() => imageSource(page)).toBe(edited);
    await expectDecodedImage(page);
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS('zoom', String(Number(percent) / 100));
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(scaled);
    await expectDecodedImage(page);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(edited);
    await expectDecodedImage(page);
  });
}

for (const style of ['style=“zoom:80%;"', 'style="zoom:80%;”', 'style=“zoom:80%;”']) {
  test(`image preview tolerates curved zoom delimiters without rewriting source: ${style}`, async ({
    page,
  }) => {
    await setupImageHost(page);
    const source = `\uFEFF<img src="images/pixel.png" alt="A" ${style} />\r\n\r\nAfter\n`;
    await createImageEditor(page, { source, context: 'doc-a' });
    const image = imageFrame(page).locator('#write img');
    await expect(image).toHaveCount(1);
    await expectDecodedImage(page);
    await expect(image).toHaveCSS('zoom', '0.8');
    expect(await imageSource(page)).toBe(source);
    await imageFrame(page).locator('#write > p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await expect.poll(() => imageSource(page)).toBe(source.replace('After', 'AfterX'));
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
  });
}

test('a curved quote introduced while editing image zoom does not turn the image into plain text', async ({
  page,
}) => {
  await setupImageHost(page);
  const source = '<img src="images/pixel.png" alt="A" style="zoom:50%;" />\n\nAfter';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  await imageFrame(page).locator('#write img').click();
  await expect(imageFrame(page).locator('#write .md-image .md-meta')).toBeVisible();
  await imageFrame(page).locator('#write .md-image .md-meta').scrollIntoViewIfNeeded();
  await page.keyboard.press('ArrowLeft');
  for (let index = 0; index < source.indexOf('"zoom:50%'); index++)
    await page.keyboard.press('ArrowRight');
  await page.keyboard.down('Shift');
  for (let index = 0; index < '"zoom:50%'.length; index++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  expect(
    await imageFrame(page)
      .locator('#write')
      .evaluate(() => getSelection()?.toString()),
  ).toBe('"zoom:50%');
  await page.keyboard.insertText('“zoom:80%');
  const edited = source.replace('"zoom:50%', '“zoom:80%');
  await expect.poll(() => imageSource(page)).toBe(edited);
  await expect(imageFrame(page).locator('#write img')).toHaveCount(1);
  await expectDecodedImage(page);
  await expect(imageFrame(page).locator('#write img')).toHaveCSS('zoom', '0.8');
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  await imageCommand(page, 'redo');
  expect(await imageSource(page)).toBe(edited);
  await expectDecodedImage(page);
});

for (const source of [
  '<img src="images/pixel.png" style=“width:80%;" />',
  '<img src=“images/pixel.png" style=“zoom:80%;" />',
  '`<img src="images/pixel.png" style=“zoom:80%;" />`',
]) {
  test(`zoom recovery does not reinterpret other malformed syntax or code: ${source}`, async ({
    page,
  }) => {
    await setupImageHost(page);
    await createImageEditor(page, { source, context: 'doc-a' });
    expect(await imageSource(page)).toBe(source);
    await expect(imageFrame(page).locator('#write img')).toHaveCount(0);
  });
}

test('zoom recovery keeps HTML sanitization and exported scale, and later menu zoom is undoable', async ({
  page,
}) => {
  await setupImageHost(page);
  const source =
    '<img src="images/pixel.png" alt="A" style=“zoom:80%;" onload="window.unsafeZoom=1" />';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  const image = imageFrame(page).locator('#write img');
  expect(await image.evaluate(() => Reflect.get(window, 'unsafeZoom'))).toBeUndefined();
  expect(await image.getAttribute('onload')).not.toContain('unsafeZoom');
  const html = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML({ styled: false }),
  );
  expect(html).toContain('zoom:80%;');
  expect(html).not.toContain('unsafeZoom');
  expect(await imageSource(page)).toBe(source);
  await image.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^缩放图片/ }).hover();
  await page.getByRole('menuitem', { name: '50%', exact: true }).click();
  await expect(image).toHaveCSS('zoom', '0.5');
  const scaled = await imageSource(page);
  expect(scaled).toMatch(/style="zoom:\s*50%;"/);
  expect(scaled.match(/style=/g)).toHaveLength(1);
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  await expect(image).toHaveCSS('zoom', '0.8');
  await imageCommand(page, 'redo');
  expect(await imageSource(page)).toBe(scaled);
  await expect(image).toHaveCSS('zoom', '0.5');
});

test('quoted alt text that mentions a zoom attribute remains literal', async ({ page }) => {
  await setupImageHost(page);
  const source = `<img src="images/pixel.png" alt='literal style=“zoom:80%;"' />`;
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  const image = imageFrame(page).locator('#write img');
  await expect(image).toHaveAttribute('alt', 'literal style=“zoom:80%;"');
  await expect(image).toHaveCSS('zoom', '1');
  expect(await imageSource(page)).toBe(source);
});

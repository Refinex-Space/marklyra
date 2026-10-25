import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

test('native drop point binds the focused fenced CodeMirror rather than its previous caret', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:4174/frame-host.js', (route) =>
    route.fulfill({
      path: fileURLToPath(
        new URL('../../packages/editor-runtime/dist/frame-host.js', import.meta.url),
      ),
      contentType: 'text/javascript',
    }),
  );
  await setupImageHost(page);
  await createImageEditor(page, {
    source: 'Before\n\n```js\nabcde\n```\n\nAfter',
    context: 'point-doc',
  });
  const point = await imageFrame(page)
    .locator('#write .CodeMirror')
    .evaluate((element) => {
      const cm = Reflect.get(element, 'CodeMirror') as {
        focus(): void;
        setCursor(point: { line: number; ch: number }): void;
        charCoords(
          point: { line: number; ch: number },
          mode: 'window',
        ): { left: number; top: number; bottom: number };
      };
      cm.focus();
      cm.setCursor({ line: 0, ch: 0 });
      const rect = cm.charCoords({ line: 0, ch: 4 }, 'window');
      return { x: rect.left + 0.1, y: (rect.top + rect.bottom) / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing iframe');
  await page.evaluate(
    async (point) => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw Error('Missing editor');
      await editor.importNativeInput({ id: 'fenced-point', point }, async () => [
        { kind: 'link', name: 'file.md', source: '../file.md' },
      ]);
    },
    { x: box.x + point.x, y: box.y + point.y },
  );
  expect(await imageSource(page)).toBe(
    'Before\n\n```js\nabcd [file.md](../file.md) e\n```\n\nAfter',
  );
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'undo' }),
  );
  expect(await imageSource(page)).toBe('Before\n\n```js\nabcde\n```\n\nAfter');
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'redo' }),
  );
  expect(await imageSource(page)).toBe(
    'Before\n\n```js\nabcd [file.md](../file.md) e\n```\n\nAfter',
  );
  await page.keyboard.type('Z');
  expect(await imageSource(page)).toBe(
    'Before\n\n```js\nabcd [file.md](../file.md) Ze\n```\n\nAfter',
  );
});

test('native Source drop point keeps mixed EOL bytes and one exact Undo', async ({ page }) => {
  await page.route('http://127.0.0.1:4174/frame-host.js', (route) =>
    route.fulfill({
      path: fileURLToPath(
        new URL('../../packages/editor-runtime/dist/frame-host.js', import.meta.url),
      ),
      contentType: 'text/javascript',
    }),
  );
  await setupImageHost(page);
  const raw = '\ufeffBefore\r\nTail\nAfter\r\n';
  await createImageEditor(page, { source: raw, context: 'source-point-doc' });
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  const point = await imageFrame(page)
    .locator('#marklyra-source .CodeMirror')
    .evaluate((element) => {
      const cm = Reflect.get(element, 'CodeMirror') as {
        focus(): void;
        setCursor(point: { line: number; ch: number }): void;
        charCoords(
          point: { line: number; ch: number },
          mode: 'window',
        ): { left: number; top: number; bottom: number };
      };
      cm.focus();
      cm.setCursor({ line: 0, ch: 0 });
      const rect = cm.charCoords({ line: 1, ch: 4 }, 'window');
      return { x: rect.left + 0.1, y: (rect.top + rect.bottom) / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing iframe');
  await page.evaluate(
    async (point) => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw Error('Missing editor');
      await editor.importNativeInput({ id: 'source-point', point }, async () => [
        { kind: 'link', name: 'file.md', source: '../file.md' },
      ]);
    },
    { x: box.x + point.x, y: box.y + point.y },
  );
  expect(await imageSource(page)).toBe('\ufeffBefore\r\nTail [file.md](../file.md) \nAfter\r\n');
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'undo' }),
  );
  expect(await imageSource(page)).toBe(raw);
});

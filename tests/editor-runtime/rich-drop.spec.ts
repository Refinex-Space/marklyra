import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:4174/frame-host.js', (route) =>
    route.fulfill({
      path: fileURLToPath(
        new URL('../../packages/editor-runtime/dist/frame-host.js', import.meta.url),
      ),
      contentType: 'text/javascript',
    }),
  );
  await setupImageHost(page);
  await createImageEditor(page, { source: 'Tail', context: 'rich-drop', nativeDrop: true });
});

for (const mode of ['wysiwyg', 'source'] as const)
  for (const rich of ['html', 'markHtml'] as const)
    test(`rich ${rich} and Files drop keeps original ${mode} content priority without native import`, async ({
      page,
    }) => {
      if (mode === 'source')
        await page.evaluate(() =>
          (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({
            type: 'toggleSource',
          }),
        );
      const selector = mode === 'source' ? '#marklyra-source .CodeMirror' : '#write p';
      await imageFrame(page)
        .locator(selector)
        .evaluate(
          (element, { mode, rich }) => {
            let x: number, y: number;
            if (mode === 'source') {
              const cm = Reflect.get(element, 'CodeMirror') as {
                focus(): void;
                setCursor(point: { line: number; ch: number }): void;
                charCoords(
                  point: { line: number; ch: number },
                  mode: 'window',
                ): { left: number; top: number; bottom: number };
              };
              cm.focus();
              cm.setCursor({ line: 0, ch: 4 });
              const rect = cm.charCoords({ line: 0, ch: 4 }, 'window');
              x = rect.left + 0.1;
              y = (rect.top + rect.bottom) / 2;
            } else {
              const range = document.createRange();
              range.selectNodeContents(element);
              range.collapse(false);
              document.getSelection()?.removeAllRanges();
              document.getSelection()?.addRange(range);
              const text = element.querySelector('[md-inline="plain"]')?.firstChild;
              if (!text) throw Error('Missing Tail');
              const rectRange = document.createRange();
              rectRange.setStart(text, 3);
              rectRange.setEnd(text, 4);
              const rect = rectRange.getBoundingClientRect();
              x = rect.right - 0.1;
              y = (rect.top + rect.bottom) / 2;
            }
            const NativeFile = Reflect.get(window, '__imageTestNativeFile') as typeof File;
            const transfer = new DataTransfer();
            transfer.items.add(
              new NativeFile([new Uint8Array([1, 2, 3])], 'ignored.png', { type: 'image/png' }),
            );
            transfer.setData('text/plain', 'rich');
            transfer.setData(
              rich === 'html' ? 'text/html' : 'text/markhtml',
              rich === 'html'
                ? '<strong>rich</strong>'
                : '<p mdtype="paragraph"><span md-inline="strong">**rich**</span></p>',
            );
            element.dispatchEvent(
              new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: transfer,
                clientX: x,
                clientY: y,
              }),
            );
          },
          { mode, rich },
        );
      await expect
        .poll(() => imageSource(page))
        .toBe(mode === 'source' ? 'Tailrich' : 'Tail**rich**');
      expect(
        await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports),
      ).toEqual([]);
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'undo' }),
      );
      expect(await imageSource(page)).toBe('Tail');
    });

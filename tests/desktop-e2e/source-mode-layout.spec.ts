import { expect, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

const source =
  '\uFEFF# Source layout\r\n\r\n' +
  'A paragraph with **emphasis** and 中文 text.\r\n\r\n'.repeat(30) +
  '```js\r\nconst answer = 42;\r\n```\r\n';

for (const titlebar of ['appkit', 'web'] as const) {
  for (const theme of ['marklyra-light', 'marklyra-dark'] as const) {
    test(`${titlebar} ${theme} preserves the document surface and column in source mode`, async ({
      page,
    }, info) => {
      await installLayout(page, undefined, titlebar);
      await readyLayout(page, theme);
      await openLayoutDocument(page, source);
      const frame = page.frameLocator('.marklyra-editor-frame');
      for (const width of [960, 1484, 2000]) {
        await page.setViewportSize({ width, height: 900 });
        const write = frame.locator('#write');
        await expect(write).toBeVisible();
        const before = await write.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          return {
            left: box.left + Number.parseFloat(css.paddingLeft),
            right: box.right - Number.parseFloat(css.paddingRight),
            background: getComputedStyle(document.body).backgroundColor,
          };
        });
        await emitLayoutMenu(page, 'view:source');
        const mirror = frame.locator('#typora-source .CodeMirror');
        await expect(mirror).toBeVisible();
        await expect(mirror).toHaveCSS('background-color', before.background);
        await expect(frame.locator('#typora-source')).toHaveCSS(
          'background-color',
          before.background,
        );
        await expect
          .poll(async () => {
            const box = await frame.locator('#typora-source .CodeMirror-code').boundingBox();
            const iframe = await page.locator('.marklyra-editor-frame').boundingBox();
            if (!box || !iframe) return Infinity;
            return Math.max(
              Math.abs(box.x - iframe.x - before.left),
              Math.abs(box.x + box.width - iframe.x - before.right),
            );
          })
          .toBeLessThanOrEqual(1);
        const lineNumber = frame.locator('#typora-source .CodeMirror-linenumber-show').first();
        await expect(lineNumber).toBeVisible();
        const box = await lineNumber.boundingBox();
        const pane = await frame.locator('#typora-source').boundingBox();
        expect(box && pane && box.x >= pane.x).toBe(true);
        await expect(frame.locator('#typora-source .CodeMirror-gutters')).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)',
        );
        await expect(frame.locator('#typora-source .CodeMirror-gutters')).toHaveCSS(
          'pointer-events',
          'none',
        );
        await page.screenshot({ path: info.outputPath(`source-${width}.png`) });
        await emitLayoutMenu(page, 'view:source');
        await expect(write).toBeVisible();
        await expect(frame.locator('#write .md-fences').first()).not.toHaveCSS(
          'background-color',
          before.background,
        );
      }
      await saveLayoutSource(page, info, 'source-layout', source);
    });
  }
}

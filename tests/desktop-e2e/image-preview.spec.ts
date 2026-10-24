import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const titlebar of ['appkit', 'web'] as const) {
  for (const theme of ['marklyra-light', 'marklyra-dark']) {
    test(`${titlebar}/${theme}: document preview covers the Shell and fences native editing commands`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await installLayout(page, undefined, titlebar);
      await page.addInitScript(() => {
        if (window !== window.top) return;
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1600;
        const context = canvas.getContext('2d');
        if (!context) throw Error('Missing image fixture context');
        context.fillStyle = '#edf2fa';
        context.fillRect(0, 0, 1200, 1600);
        context.fillStyle = '#27364d';
        context.font = '50px system-ui';
        context.fillText('Image preview', 100, 180);
        const url = canvas.toDataURL('image/png');
        const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
          invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
        };
        const previous = internal.invoke;
        internal.invoke = async (command, args) =>
          command === 'resolve_document_image' ? { url } : previous(command, args);
      });
      await readyLayout(page, theme);
      const source = '\uFEFF# Preview\r\n\r\n![diagram](images/diagram.png)\r\n\r\nTail\n';
      await page.evaluate((text) => {
        (window as TestWindow).__desktopMock.nextDocument = {
          id: 'preview-doc',
          path: '/mock/Preview.md',
          text,
          encoding: 'UTF-8',
        };
      }, source);
      await emitLayoutMenu(page, 'open');
      const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
      const picture = frame.locator('#write .md-image img');
      await expect
        .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
        .toBe(1200);
      await picture.hover();
      const entry = frame.getByRole('button', { name: '查看大图', exact: true });
      await expect(entry).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: info.outputPath('image-preview-trigger.png') });
      await entry.click();
      const viewer = page.getByRole('dialog', { name: '图片预览', exact: true });
      await expect(viewer.locator('img')).toBeVisible();
      await expect(viewer).toHaveCSS(
        'background-color',
        theme === 'marklyra-dark' ? 'rgb(24, 28, 34)' : 'rgb(244, 245, 247)',
      );
      const title = await viewer.locator('header > span').boundingBox();
      const close = await viewer.getByRole('button', { name: '关闭图片预览' }).boundingBox();
      if (!title || !close) throw Error('Missing preview header');
      expect(title.y).toBeGreaterThanOrEqual(titlebar === 'web' ? 32 : 28);
      expect(Math.abs(title.y + title.height / 2 - close.y - close.height / 2)).toBeLessThan(1);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls
                .filter((call) => call.command === 'update_editor_chrome')
                .at(-1)?.args.payload,
          ),
        )
        .toMatchObject({ imagePreviewOpen: true });
      const bounds = await viewer.boundingBox();
      expect(bounds?.width).toBe(page.viewportSize()?.width);
      expect(bounds?.height).toBe(page.viewportSize()?.height);
      await emitLayoutMenu(page, 'undo');
      await emitLayoutMenu(page, 'open');
      await expect(viewer).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls.filter(
                (call) => call.command === 'open_document',
              ).length,
          ),
        )
        .toBe(1);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls
                .filter((call) => call.command === 'sync_editor_menu_state')
                .at(-1)?.args.snapshot,
          ),
        )
        .toMatchObject({ blocked: true });
      await viewer.getByRole('button', { name: '顺时针旋转' }).click();
      await viewer.getByRole('button', { name: '适应窗口' }).click();
      await page.screenshot({ path: info.outputPath('image-preview-shell.png') });
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls
                .filter((call) => call.command === 'update_editor_chrome')
                .at(-1)?.args.payload,
          ),
        )
        .toMatchObject({ imagePreviewOpen: false });
      await emitLayoutMenu(page, 'save');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls
                .filter((call) => call.command === 'save_document')
                .at(-1)?.args.text,
          ),
        )
        .toBe(source);
      expect(errors).toEqual([]);
    });
  }
}

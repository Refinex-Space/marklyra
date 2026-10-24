import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const titlebar of ['appkit', 'web'] as const) {
  for (const theme of ['marklyra-light', 'marklyra-dark']) {
    test(`${titlebar}/${theme}: Mermaid uses the shared preview chrome and keeps source editing`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await installLayout(page, undefined, titlebar);
      await readyLayout(page, theme);
      const source =
        '\uFEFF# Mermaid\r\n\r\n```mermaid\r\nflowchart LR\r\n A[业务文档] --> B[知识索引]\r\n B --> C[应用编排]\r\n```\r\n\r\nTail\n';
      await page.evaluate((text) => {
        (window as TestWindow).__desktopMock.nextDocument = {
          id: 'mermaid-preview',
          path: '/mock/Diagram.md',
          text,
          encoding: 'UTF-8',
        };
      }, source);
      await emitLayoutMenu(page, 'open');
      const frame = page.frameLocator('.runtime-area .marklyra-editor-frame'),
        block = frame.locator('#write [mdtype="fences"][lang="mermaid"]');
      await expect(block.locator('.md-diagram-panel-preview > svg')).toBeVisible();
      await block.locator('svg').hover();
      await frame.getByRole('button', { name: '查看大图', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览', exact: true });
      await expect
        .poll(() =>
          viewer.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(100);
      await expect(viewer).toHaveCSS(
        'background-color',
        theme === 'marklyra-dark' ? 'rgb(24, 28, 34)' : 'rgb(244, 245, 247)',
      );
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
      const title = await viewer.locator('header > span').boundingBox(),
        close = await viewer.getByRole('button', { name: '关闭图表预览' }).boundingBox();
      if (!title || !close) throw Error('Missing header');
      expect(title.y).toBeGreaterThanOrEqual(titlebar === 'web' ? 32 : 28);
      expect(Math.abs(title.y + title.height / 2 - close.y - close.height / 2)).toBeLessThan(1);
      await viewer.getByRole('button', { name: '适应宽度', exact: true }).click();
      await page.screenshot({ path: info.outputPath('mermaid-preview-shell.png') });
      await emitLayoutMenu(page, 'undo');
      await expect(viewer).toBeVisible();
      await viewer.getByRole('button', { name: '关闭图表预览' }).click();
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
      await block.locator('.md-diagram-panel').click();
      await expect(block.locator('.CodeMirror')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

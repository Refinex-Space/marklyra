import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { installLayout, openLayoutDocument, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: Lucide panel icons render and retain their panel actions`, async ({
    page,
  }, testInfo) => {
    await installLayout(page, undefined, 'web');
    await readyLayout(page, theme);
    await openLayoutDocument(page);
    for (const [name, icon, geometry] of [
      ['显示/隐藏文档目录', 'table-of-contents', 'M16 5H3'],
      ['侧边栏', 'panel-left', 'M9 3v18'],
    ] as const) {
      const glyph = page.getByRole('button', { name, exact: true }).locator('.titlebar-glyph');
      await expect(glyph).toHaveCSS('width', '14px');
      await expect(glyph).toHaveCSS('height', '14px');
      const mask = await glyph.evaluate((element) => getComputedStyle(element).maskImage);
      expect(decodeURIComponent(mask)).toContain(geometry);
      const response = await page.request.get(`/src-tauri/icons/titlebar/${icon}.svg`);
      expect(response.ok()).toBe(true);
      expect(await response.text()).toContain(geometry);
    }
    await page.locator('header.titlebar').screenshot({ path: testInfo.outputPath('titlebar.png') });
    const outline = page.getByRole('button', { name: '显示/隐藏文档目录' });
    await outline.click();
    await expect(outline).toHaveAttribute('aria-pressed', 'true');
    await outline.click();
    await expect(outline).toHaveAttribute('aria-pressed', 'false');
    const sidebar = page.getByRole('button', { name: '侧边栏', exact: true });
    for (const open of [false, true, false, true]) {
      await sidebar.click();
      await expect(sidebar).toHaveAttribute('aria-expanded', String(open));
      await expect(page.locator('aside.sidebar')).toBeVisible({ visible: open });
      const mask = await sidebar
        .locator('.titlebar-glyph')
        .evaluate((element) => getComputedStyle(element).maskImage);
      expect(decodeURIComponent(mask)).toContain(open ? 'M9 3v18' : 'M15 3v18');
      await expect
        .poll(() =>
          page.evaluate(() => {
            const payload = (window as TestWindow).__desktopMock.calls
              .filter((call) => call.command === 'update_editor_chrome')
              .at(-1)?.args.payload as { sidebarOpen?: boolean } | undefined;
            return payload?.sidebarOpen;
          }),
        )
        .toBe(open);
      const outlineMask = await outline
        .locator('.titlebar-glyph')
        .evaluate((element) => getComputedStyle(element).maskImage);
      expect(decodeURIComponent(outlineMask)).toContain('M16 5H3');
    }
  });
}

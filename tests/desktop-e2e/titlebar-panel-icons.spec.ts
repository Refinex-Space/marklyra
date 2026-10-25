import { expect, test } from '@playwright/test';
import { installLayout, openLayoutDocument, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: Lucide panel icons render and retain their panel actions`, async ({
    page,
  }, testInfo) => {
    await installLayout(page, undefined, 'web');
    await readyLayout(page, theme);
    await openLayoutDocument(page);
    for (const [name, icon, divider] of [
      ['显示/隐藏文档目录', 'panel-right', 'M15 3v18'],
      ['侧边栏', 'panel-left', 'M9 3v18'],
    ] as const) {
      const glyph = page.getByRole('button', { name, exact: true }).locator('.titlebar-glyph');
      await expect(glyph).toHaveCSS('width', '14px');
      await expect(glyph).toHaveCSS('height', '14px');
      const mask = await glyph.evaluate((element) => getComputedStyle(element).maskImage);
      expect(decodeURIComponent(mask)).toContain(divider);
      const response = await page.request.get(`/src-tauri/icons/titlebar/${icon}.svg`);
      expect(response.ok()).toBe(true);
      expect(await response.text()).toContain('<rect width="18" height="18" x="3" y="3" rx="2" />');
    }
    await page.locator('header.titlebar').screenshot({ path: testInfo.outputPath('titlebar.png') });
    const outline = page.getByRole('button', { name: '显示/隐藏文档目录' });
    await outline.click();
    await expect(outline).toHaveAttribute('aria-pressed', 'true');
    await outline.click();
    await expect(outline).toHaveAttribute('aria-pressed', 'false');
    const sidebar = page.getByRole('button', { name: '侧边栏', exact: true });
    await sidebar.click();
    await expect(page.locator('aside.sidebar')).toBeHidden();
    await sidebar.click();
    await expect(page.locator('aside.sidebar')).toBeVisible();
  });
}

import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const titlebar of ['appkit', 'web'] as const)
  for (const theme of ['marklyra-light', 'marklyra-dark'])
    test(`${titlebar}/${theme}: search replaces the folder header and returning restores its focus`, async ({
      page,
    }, info) => {
      await installLayout(page, undefined, titlebar);
      await readyLayout(page, theme);
      await emitLayoutMenu(page, 'open-folder');
      await emitLayoutMenu(page, 'view:files');
      const header = page.locator('.workspace-navigation-header'),
        search = header.getByRole('button', { name: '全文搜索', exact: true }),
        input = page.getByRole('searchbox', { name: '搜索文件', exact: true });
      const editor = await page.locator('.runtime-area iframe').elementHandle();
      await expect(header).toBeVisible();
      await search.click();
      await expect(input).toBeFocused();
      await expect(header).toBeHidden();
      await expect(header).toHaveCSS('display', 'none');
      await expect(page.getByRole('navigation', { name: '侧栏导航', exact: true })).toHaveCount(1);
      await input.fill('Alpha');
      await page
        .locator('aside.sidebar')
        .screenshot({ path: info.outputPath('search-sidebar.png') });
      await input.press('Escape');
      await expect(header).toBeVisible();
      await expect(search).toBeFocused();

      // Native menu entry must obey the same visibility rule, including open popups.
      await header.getByRole('button', { name: '目录菜单', exact: true }).click();
      await expect(page.getByRole('menu', { name: '目录操作', exact: true })).toBeVisible();
      await emitLayoutMenu(page, 'view:workspace-search');
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('Alpha');
      await expect(header).toBeHidden();
      await expect(page.getByRole('menu', { name: '目录操作', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '返回文件', exact: true }).click();
      await expect(header).toBeVisible();
      await expect(page.locator('.runtime-area iframe')).toBeFocused();
      await expect(page.getByRole('navigation', { name: '侧栏导航', exact: true })).toHaveCount(1);
      expect(await editor?.evaluate((element) => element.isConnected)).toBe(true);
    });

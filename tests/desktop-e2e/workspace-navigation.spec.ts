import { expect, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

for (const platform of ['macos', 'windows'] as const)
  for (const articles of [false, true])
    test(`${platform}/${articles ? 'articles' : 'tree'}: one header creates a root folder and keeps the editor mounted`, async ({
      page,
    }) => {
      await page.addInitScript(installMock, {
        nativeChrome: true,
        titlebar: platform === 'windows' ? ('web' as const) : ('appkit' as const),
      });
      await page.addInitScript(installRecoveryMock);
      await page.addInitScript(installCreationMock, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        articles,
        nested: true,
      });
      await page.goto('/');
      await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
      await expect(page.locator('.workspace-footer')).toHaveCount(0);
      const frame = await page.locator('.marklyra-editor-frame').elementHandle();
      const header = page.getByRole('navigation', { name: '侧栏导航' });
      const folder = header.getByRole('button', { name: '目录菜单', exact: true });
      const create = header.getByRole('button', { name: '新建', exact: true });
      const search = header.getByRole('button', { name: '全文搜索', exact: true });
      for (const button of [folder, create, search]) {
        const rect = await button.boundingBox(),
          bar = await header.boundingBox();
        expect(
          rect && bar && Math.abs(rect.y + rect.height / 2 - bar.y - bar.height / 2),
        ).toBeLessThanOrEqual(1);
      }
      await create.click();
      await expect(page.getByRole('menu', { name: '新建' })).toContainText('Creation 根目录');
      await page.getByRole('menuitem', { name: '新建文件夹', exact: true }).click();
      const input = page.getByRole('textbox', { name: '文件夹名称', exact: true });
      await expect(input).toBeFocused();
      await input.dispatchEvent('compositionstart');
      await input.fill('设计草稿');
      await input.press('Enter');
      await expect(input).toBeVisible();
      await input.dispatchEvent('compositionend', { data: '设计草稿' });
      await input.press('Enter');
      await expect(input).toHaveCount(0);
      if (articles)
        await expect(page.locator('.notice-host')).toContainText('已创建文件夹“设计草稿”');
      const requests = await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'create_workspace_entry',
        ),
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]?.args).toMatchObject({ parentRelativePath: '', kind: 'directory' });
      expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
      await folder.click();
      await page.getByRole('menuitem', { name: /视图与排序/ }).click();
      await page
        .getByRole('menuitemradio', { name: articles ? '文件树' : '文档列表', exact: true })
        .click();
      await page.getByRole('menuitemradio', { name: '名称', exact: true }).click();
      await page.getByRole('menuitemradio', { name: '降序', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: /视图与排序/ })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(folder).toBeFocused();
      await expect(page.locator('.sidebar')).toHaveAttribute(
        'data-file-view',
        articles ? 'tree' : 'articles',
      );
      expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
    });

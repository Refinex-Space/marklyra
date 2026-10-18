import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: strict Markdown explains parser behavior without the external help link`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    const row = ui.locator('tr:has([data-marklyra-preference="strict_mode"])');
    const hint = row.locator('.label-hint');
    await expect(row.getByRole('checkbox', { name: '严格模式', exact: true })).toBeEnabled();
    await expect(row.getByRole('link')).toHaveCount(0);
    await expect(hint).toHaveAttribute('aria-label', /#标题 会保留为普通文本/);
    const tooltip = ui.locator('#ty-tooltip');
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await hint.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveCSS('opacity', '1');
      await expect(tooltip).toContainText('# 标题 会识别为标题');
      await expect(tooltip).toContainText('列表的嵌套和续行会按标记宽度检查缩进');
      await expect(tooltip).toContainText('新建窗口或重启应用后生效');
      expect(await tooltip.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`strict-markdown-help-${width}.png`) });
    }
    await ui.getByRole('button', { name: '编辑器', exact: true }).click();
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(row.getByRole('link')).toHaveCount(0);
    await hint.hover();
    await expect(tooltip).toContainText('#标题 会保留为普通文本');
    await expect(ui.locator('.content:not(.display-none) .input-group-header a')).toHaveCount(0);
  });
}

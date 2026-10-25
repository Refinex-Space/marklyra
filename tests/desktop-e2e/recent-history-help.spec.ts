import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: recent-history help explains recording and clearing instead of displaying a URL`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    const toggle = ui.getByRole('checkbox', { name: '记录历史文件和文件夹', exact: true });
    const hint = ui.locator(
      '.checkbox:has([data-marklyra-preference="noRecentFiles"]) .label-hint',
    );
    const tooltip = ui.locator('#marklyra-tooltip');
    await expect(toggle).toBeChecked();
    await expect(hint).toHaveAttribute('aria-label', /关闭开关不会清除已有历史/);
    const icon = hint.locator('a');
    await expect(icon).not.toHaveAttribute('href');
    await expect(icon).not.toHaveAttribute('aria-disabled');
    await expect(hint.locator('[title*="不支持"]')).toHaveCount(0);
    await icon.click();
    await expect(toggle).toBeChecked();
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await hint.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveCSS('opacity', '1');
      await expect(tooltip).toContainText('开启后记录最近使用的文件和文件夹');
      await expect(tooltip).toContainText('固定的文件夹仍可访问');
      await expect(tooltip).toContainText('关闭开关不会清除已有历史');
      await expect(tooltip).toContainText('清除历史文件记录');
      await expect(tooltip).toContainText('原文档不会删除');
      await expect(tooltip).not.toContainText('https://');
      await expect(tooltip.locator('a')).toHaveCount(0);
      expect(
        await tooltip.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (
            element.scrollWidth <= element.clientWidth &&
            box.left >= 0 &&
            box.right <= window.innerWidth &&
            box.top >= 0 &&
            box.bottom <= window.innerHeight
          );
        }),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`recent-history-help-${width}.png`) });
    }
    await toggle.uncheck();
    await expect
      .poll(() =>
        page.evaluate(() => (window as TestWindow).__desktopMock.filePreferences.noRecentFiles),
      )
      .toBe(true);
    await hint.hover();
    await expect(tooltip).toContainText('关闭开关不会清除已有历史');
    await toggle.check();
    await expect
      .poll(() =>
        page.evaluate(() => (window as TestWindow).__desktopMock.filePreferences.noRecentFiles),
      )
      .toBe(false);
    await ui.getByRole('button', { name: '编辑器', exact: true }).click();
    await ui.getByRole('button', { name: '文件', exact: true }).click();
    await hint.hover();
    await expect(tooltip).toContainText('固定的文件夹仍可访问');
    await expect(hint.locator('[title*="不支持"]')).toHaveCount(0);
    await expect(icon).not.toHaveAttribute('href');
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.filter(
          (call) => call.command === 'ask_clear_recent_history',
        ),
      ),
    ).toEqual([]);
  });
}

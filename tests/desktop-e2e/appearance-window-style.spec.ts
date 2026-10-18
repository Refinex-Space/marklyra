import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['github', 'night']) {
  test(`${theme}: appearance omits window styles while keeping font, zoom and theme controls`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '外观', exact: true }).click();
    await expect(ui.locator('[name="use_seamless_window"], [name="framelessWindow"]')).toHaveCount(
      0,
    );
    await expect(ui.getByText('窗口样式', { exact: true })).toHaveCount(0);
    await expect(ui.getByText('Seamless', { exact: true })).toHaveCount(0);
    const titles = ui.locator('.content:not(.display-none) .input-group-header-title');
    await expect(titles.first()).toHaveText('字体大小');
    const zoom = ui.locator('[data-marklyra-preference="zoomFactor"]');
    await expect(zoom).toBeEnabled();
    await expect(ui.locator('[data-marklyra-preference="theme"]')).toBeEnabled();
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await ui.locator('.pane').evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`appearance-${width}.png`) });
    }
    const search = ui.getByRole('searchbox', { name: '搜索设置', exact: true });
    for (const text of ['窗口样式', 'Seamless', 'Unibody']) {
      await search.fill(text);
      await expect(ui.locator('.settings-page-heading p')).toHaveText(
        '没有找到匹配的设置，请尝试其他关键词。',
      );
    }
    await search.fill('');
    await ui.getByRole('button', { name: '外观', exact: true }).click();
    await ui.locator('input[name="useCustomFontSize"][value="true"]').check();
    await expect(ui.locator('[data-marklyra-preference="customFontSize"]')).toBeEnabled();
    await ui.locator('input[name="useCustomFontSize"][value="false"]').check();
    await expect(ui.locator('[name="use_seamless_window"], [name="framelessWindow"]')).toHaveCount(
      0,
    );
  });
}

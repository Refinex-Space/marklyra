import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['github', 'night']) {
  test(`${theme}: every settings category omits Learn More links without empty hint spacing`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await expect(ui.getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      for (const category of ['文件', '编辑器', '图像', 'Markdown', '导出', '外观', '通用']) {
        await ui.getByRole('button', { name: category, exact: true }).click();
        await expect(ui.locator('.settings-page-heading h1')).toHaveText(category);
        const remaining = await ui
          .locator('.pane a')
          .evaluateAll((links) =>
            links
              .map((link) => link.textContent?.trim() ?? '')
              .filter((text) => /^(?:了解更多|Learn More)(?:\s*(?:\.{3}|…))?$/i.test(text)),
          );
        expect(remaining).toEqual([]);
        expect(
          await ui
            .locator('.input-group-header-hint:empty, .inline-hint:empty')
            .evaluateAll((hints) => hints.every((hint) => hint.getClientRects().length === 0)),
        ).toBe(true);
        const pane = ui.locator('.pane');
        expect(await pane.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        if (category === 'Markdown' || category === '图像') {
          await pane.evaluate((element) => {
            element.scrollTop = 0;
          });
          await page.screenshot({ path: info.outputPath(`settings-${category}-${width}.png`) });
        }
      }
    }
    await ui.getByRole('button', { name: '图像', exact: true }).click();
    await ui
      .locator('.checkbox:has([data-marklyra-preference="autoEscapeImageURL"]) .label-hint')
      .hover();
    await expect(ui.locator('#ty-tooltip')).toContainText('%20 表示空格');
    await ui.getByRole('button', { name: '返回应用', exact: true }).click();
    await expect(page.locator('.preferences-page')).toHaveCount(0);
  });
}

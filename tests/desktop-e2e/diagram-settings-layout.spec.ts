import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['github', 'night']) {
  test(`${theme}: diagram settings keep the description beside the title without an options button`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    const toggle = ui.locator('[data-marklyra-preference="enable_diagram"]');
    const row = ui.locator('.checkbox.row:has([data-marklyra-preference="enable_diagram"])');
    await expect(toggle).toBeEnabled();
    await expect(ui.getByRole('button', { name: '图表选项', exact: true })).toHaveCount(0);
    await expect(row.locator('.inline-hint')).toHaveText('(序列图、流程图 和 Mermaid 图)');
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await toggle.scrollIntoViewIfNeeded();
      const geometry = await row.evaluate((element) => {
        const label = element.querySelector('label')?.getBoundingClientRect();
        const hint = element.querySelector('.inline-hint')?.getBoundingClientRect();
        const input = element.querySelector('input')?.getBoundingClientRect();
        if (!label || !hint || !input) throw Error('Missing diagram controls');
        return {
          gap: hint.left - label.right,
          center: Math.abs(hint.top + hint.height / 2 - label.top - label.height / 2),
          overlap: hint.right > input.left,
          overflow: element.scrollWidth > element.clientWidth,
          insideTable: !!element.closest('table'),
        };
      });
      expect(geometry.gap).toBeGreaterThanOrEqual(8);
      expect(geometry.gap).toBeLessThanOrEqual(24);
      expect(geometry.center).toBeLessThanOrEqual(1);
      expect(geometry.overlap).toBe(false);
      expect(geometry.overflow).toBe(false);
      expect(geometry.insideTable).toBe(false);
      await page.screenshot({ path: info.outputPath(`diagram-setting-${width}.png`) });
    }
    await toggle.uncheck();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as TestWindow).__desktopMock.applicationPreferences.values.enable_diagram,
        ),
      )
      .toBe(false);
    await toggle.check();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as TestWindow).__desktopMock.applicationPreferences.values.enable_diagram,
        ),
      )
      .toBe(true);
    await ui.getByRole('button', { name: '返回应用', exact: true }).click();
    await expect(page.locator('.preferences-page')).toHaveCount(0);
    await emitLayoutMenu(page, 'preferences');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(toggle).toBeChecked();
  });
}

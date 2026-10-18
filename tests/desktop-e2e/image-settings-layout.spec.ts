import { expect, type Locator, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

async function rowInsets(control: Locator) {
  return control.evaluate((element) => {
    const row = element.closest('.row');
    if (!row) throw Error('Missing image setting row');
    const bounds = element.getBoundingClientRect();
    const area = row.getBoundingClientRect();
    return {
      left: Math.abs(bounds.left - area.left),
      right: Math.abs(area.right - bounds.right),
      overflow: row.scrollWidth > row.clientWidth,
    };
  });
}

for (const theme of ['github', 'night']) {
  test(`${theme}: image insertion controls fill their rows across window sizes and retain path editing`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '图像', exact: true }).click();
    const select = ui.locator('select[data-marklyra-preference="image_save_location"]');
    const input = ui.locator('input[data-marklyra-preference="custom_image_save_location"]');
    for (const width of [1280, 960, 700]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['', 'folder', 'assert', 'per-file-assert', 'custom']) {
        await select.selectOption(mode);
        await expect(select).toHaveValue(mode);
        await expect.poll(async () => (await rowInsets(select)).left).toBeLessThanOrEqual(1);
        const insets = await rowInsets(select);
        expect(insets.right).toBeLessThanOrEqual(1);
        expect(insets.overflow).toBe(false);
      }
      await expect(input).toBeVisible();
      const pathRow = ui.locator(
        '.row:has(> input[data-marklyra-preference="custom_image_save_location"])',
      );
      const icons = pathRow.locator('.icon-button');
      await expect(icons).toHaveCount(2);
      expect((await rowInsets(input)).left).toBeLessThanOrEqual(1);
      expect((await rowInsets(icons.last())).right).toBeLessThanOrEqual(1);
      expect((await rowInsets(input)).overflow).toBe(false);
      const alignment = await pathRow.evaluate((row) => {
        const controls = [...row.children].map((element) => element.getBoundingClientRect());
        return controls.slice(1).map((box, index) => {
          const previous = controls[index];
          if (!previous) throw Error('Missing previous path control');
          return {
            gap: box.left - previous.right,
            center: Math.abs(box.top + box.height / 2 - previous.top - previous.height / 2),
          };
        });
      });
      for (const control of alignment) {
        expect(control.gap).toBeCloseTo(10, 0);
        expect(control.center).toBeLessThanOrEqual(1);
      }
      await page.screenshot({ path: info.outputPath(`image-insertion-${width}.png`) });
    }
    await input.fill('./images');
    await input.blur();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').imageStorageFolder,
        ),
      )
      .toBe('./images');
    await ui.getByRole('button', { name: '重置', exact: true }).click();
    await expect(input).toHaveValue('./${filename}');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').imageStorageFolder,
        ),
      )
      .toBe('./${filename}');
  });
}

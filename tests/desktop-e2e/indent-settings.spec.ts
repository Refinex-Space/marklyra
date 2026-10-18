import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['github', 'night']) {
  test(`${theme}: indent controls align horizontally and preview reflows on narrow windows`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '编辑器', exact: true }).click();
    const group = ui.locator('.settings-indent-group');
    const size = group.getByRole('combobox', { name: '缩进宽度', exact: true });
    const toggle = group.getByRole('checkbox', { name: '对齐缩进', exact: true });
    await expect(size).toHaveValue('2');
    await expect(toggle).toBeEnabled();
    const geometry = () =>
      group.evaluate((element) => {
        const size = element.querySelector('select')?.getBoundingClientRect();
        const toggle = element.querySelector('input[type="checkbox"]')?.getBoundingClientRect();
        const label = element.querySelector('.checkbox label');
        const preview = element.querySelector('pre')?.parentElement?.getBoundingClientRect();
        const controls = element.querySelector('td:first-child > div')?.getBoundingClientRect();
        if (!size || !toggle || !label || !preview || !controls)
          throw new Error('Missing indent controls or preview');
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          centerDifference: Math.abs(size.y + size.height / 2 - toggle.y - toggle.height / 2),
          toggleAfterSize: toggle.left > size.right,
          toggleAfterText: toggle.left > range.getBoundingClientRect().left,
          previewRight: preview.left > controls.right,
          previewBelow: preview.top >= controls.bottom,
          overflow: element.scrollWidth > element.clientWidth,
        };
      });
    const wide = await geometry();
    expect(wide.centerDifference).toBeLessThan(2);
    expect(wide.toggleAfterSize).toBe(true);
    expect(wide.toggleAfterText).toBe(true);
    expect(wide.previewRight).toBe(true);
    expect(wide.overflow).toBe(false);
    await page.screenshot({ path: info.outputPath('indent-wide.png') });
    await page.setViewportSize({ width: 800, height: 750 });
    await expect.poll(async () => (await geometry()).previewBelow).toBe(true);
    expect((await geometry()).centerDifference).toBeLessThan(2);
    expect((await geometry()).overflow).toBe(false);
    await page.screenshot({ path: info.outputPath('indent-narrow.png') });
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await ui.getByRole('button', { name: '编辑器', exact: true }).click();
    await expect(group.locator('.settings-indent-label')).toHaveCount(1);
    await size.focus();
    await expect(size).toBeFocused();
    await toggle.focus();
    await expect(toggle).toBeFocused();
  });
}

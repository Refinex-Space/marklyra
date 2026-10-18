import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: whitespace controls have independent aligned rows and preserve saved choices`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    const visibleBr = ui.locator('input[data-marklyra-preference="hideBrAndLineBreak"]');
    const group = ui.locator('.input-group:has([data-marklyra-preference="hideBrAndLineBreak"])');
    const writing = ui.locator('select[data-marklyra-preference="ignoreLineBreak"]');
    const exporting = ui.locator('select[data-marklyra-preference="preLinebreakOnExport"]');
    await expect(visibleBr).toBeChecked();
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await group.scrollIntoViewIfNeeded();
      const layout = await group.evaluate((element) => {
        const keys = [
          'indentFirstLine',
          'hideBrAndLineBreak',
          'ignoreLineBreak',
          'preLinebreakOnExport',
        ];
        return keys.map((key) => {
          const control = element.querySelector(`[data-marklyra-preference="${key}"]`);
          const row = control?.closest('.checkbox.row, tr');
          const label = row?.querySelector('label, td:first-child');
          if (!control || !row || !label) throw Error(`Missing independent setting row: ${key}`);
          const field = control.getBoundingClientRect();
          const bounds = row.getBoundingClientRect();
          const text = [...label.childNodes].find(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
          if (!text) throw Error(`Missing setting label: ${key}`);
          const range = document.createRange();
          range.selectNode(text);
          const caption = range.getBoundingClientRect();
          return {
            left: field.left,
            right: field.right,
            labelLeft: caption.left,
            centerOffset: Math.abs(field.y + field.height / 2 - caption.y - caption.height / 2),
            top: bounds.top,
            bottom: bounds.bottom,
          };
        });
      });
      const [first, , editing, exported] = layout;
      if (!first || !editing || !exported) throw Error('Missing whitespace layout');
      for (const [index, row] of layout.entries()) {
        expect(Math.abs(row.right - first.right)).toBeLessThanOrEqual(1);
        expect(Math.abs(row.labelLeft - first.labelLeft)).toBeLessThanOrEqual(1);
        expect(row.centerOffset).toBeLessThan(3);
        const previous = layout[index - 1];
        if (previous) expect(row.top).toBeGreaterThanOrEqual(previous.bottom);
      }
      expect(Math.abs(editing.left - exported.left)).toBeLessThanOrEqual(1);
      expect(await group.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`whitespace-${width}.png`) });
    }
    await visibleBr.uncheck();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.applicationPreferences.values.hideBrAndLineBreak,
        ),
      )
      .toBe(true);
    await writing.selectOption('true');
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as TestWindow).__desktopMock.applicationPreferences.values.ignoreLineBreak,
        ),
      )
      .toBe(true);
    await exporting.selectOption('true');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.applicationPreferences.values.preLinebreakOnExport,
        ),
      )
      .toBe(true);
    await ui.getByRole('button', { name: '返回应用', exact: true }).click();
    await expect(page.locator('.preferences-page')).toHaveCount(0);
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    await emitLayoutMenu(page, 'preferences');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(visibleBr).not.toBeChecked();
    await expect(writing).toHaveValue('true');
    await expect(exporting).toHaveValue('true');
  });
}

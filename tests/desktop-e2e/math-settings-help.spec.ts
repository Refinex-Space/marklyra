import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: formula help explains line breaks and numbering with math enabled by default`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    const formulas = ui.locator(
      '.input-group:has([data-marklyra-preference="noDisplayLinesInMath"])',
    );
    await expect(formulas.locator('[data-marklyra-preference="enable_inline_math"]')).toBeChecked();
    await expect(formulas.locator('[data-marklyra-preference="gitlabMath"]')).toBeChecked();
    await expect(
      ui.getByRole('button', { name: '开启内联公式和代码块公式', exact: true }),
    ).toHaveCount(0);
    const lineBreak = ui.locator(
      '.checkbox:has([data-marklyra-preference="noDisplayLinesInMath"]) .label-hint',
    );
    const numbering = ui.locator(
      'tr:has([data-marklyra-preference="auto_numbering_for_math"]) .label-hint',
    );
    await expect(ui.locator('[data-marklyra-preference="auto_numbering_for_math"]')).toHaveValue(
      '',
    );
    await expect(lineBreak).toHaveAttribute('aria-label', /\\newline/);
    await expect(numbering).toHaveAttribute('aria-label', /AMS 编号规则/);
    const tooltip = ui.locator('#marklyra-tooltip');
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 850 });
      for (const [name, hint, texts] of [
        [
          'line-break',
          lineBreak,
          ['\\\\', '\\newline', 'align、matrix', '新建窗口或重启应用后生效'],
        ],
        [
          'numbering',
          numbering,
          ['不自动编号', 'AMS 编号规则', '所有块级公式自动编号', '不会向 Markdown 原文写入序号'],
        ],
      ] as const) {
        await hint.hover();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveCSS('opacity', '1');
        for (const text of texts) await expect(tooltip).toContainText(text);
        await expect(tooltip).not.toContainText('https://');
        await expect(hint.locator('[title*="不支持"]')).toHaveCount(0);
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
        await page.screenshot({ path: info.outputPath(`math-${name}-${width}.png`) });
      }
    }
    await ui.getByRole('button', { name: '编辑器', exact: true }).click();
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(
      ui.getByRole('button', { name: '开启内联公式和代码块公式', exact: true }),
    ).toHaveCount(0);
    await numbering.hover();
    await expect(tooltip).toContainText('AMS 编号规则');
  });
}

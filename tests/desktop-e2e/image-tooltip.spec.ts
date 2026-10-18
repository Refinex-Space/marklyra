import { expect, type Locator, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

async function textInsets(tooltip: Locator) {
  return tooltip.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const fragments = [...range.getClientRects()];
    return {
      left: Math.min(...fragments.map((fragment) => fragment.left)) - box.left,
      right: box.right - Math.max(...fragments.map((fragment) => fragment.right)),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      overflow: element.scrollWidth > element.clientWidth,
      inViewport: box.left >= 0 && box.right <= window.innerWidth,
    };
  });
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: image URL help explains escaping and keeps long text inside both paddings`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '图像', exact: true }).click();
    const hint = ui.locator(
      '.checkbox:has([data-marklyra-preference="autoEscapeImageURL"]) .label-hint',
    );
    const tooltip = ui.locator('#ty-tooltip');
    await hint.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('%20 表示空格');
    await expect(tooltip).not.toContainText('%E7%A4');
    await expect(hint).toHaveAttribute('aria-label', /%20 表示空格/);
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await hint.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveCSS('opacity', '1');
      await expect(tooltip).toContainText('关闭后路径更易阅读');
      await expect.poll(async () => (await textInsets(tooltip)).inViewport).toBe(true);
      const insets = await textInsets(tooltip);
      expect(insets.overflow).toBe(false);
      expect(insets.left).toBeGreaterThanOrEqual(insets.paddingLeft);
      expect(insets.right).toBeGreaterThanOrEqual(insets.paddingRight);
      await page.screenshot({ path: info.outputPath(`image-url-help-${width}.png`) });
      // A future help message may contain a much longer unbroken encoded path.
      await tooltip.evaluate((element) => {
        element.textContent = `img/${'%E7%A4%BA%E4%BE%8B'.repeat(12)}.png`;
      });
      const longPath = await textInsets(tooltip);
      expect(longPath.overflow).toBe(false);
      expect(longPath.left).toBeGreaterThanOrEqual(longPath.paddingLeft);
      expect(longPath.right).toBeGreaterThanOrEqual(longPath.paddingRight);
      await ui.locator('.settings-page-heading').hover();
      await expect(tooltip).toBeHidden();
    }
    await ui
      .locator('.checkbox:has([data-marklyra-preference="relativePathWithDot"]) .label-hint')
      .hover();
    await expect(tooltip).toContainText('./assets/image.png');
    await expect(tooltip).not.toContainText('%20 表示空格');
  });
}

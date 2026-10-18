import { expect, type Locator, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

const controlStyle = (element: Element) => {
  const style = getComputedStyle(element);
  return {
    background: style.backgroundColor,
    color: style.color,
    radius: style.borderRadius,
    font: style.font,
    opacity: style.opacity,
    height: style.height,
    padding: style.padding,
    appearance: style.appearance,
  };
};
const bounds = (control: Locator) =>
  control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right };
  });

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: code language keeps standard styling with a bounded scrollable popup and saved values`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem(
        'mock-application-preferences',
        JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          values: { defaultCodeLang: 'custom-lang' },
        }),
      );
    });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    const language = ui.locator('select[data-marklyra-preference="defaultCodeLang"]');
    const indent = ui.locator('select[data-marklyra-preference="codeIndentSize"]');
    const policy = ui.locator('select[data-marklyra-preference="defaultCodeLangOption"]');
    const row = ui.locator('tr:has([data-marklyra-preference="defaultCodeLangOption"])');
    const popup = ui.getByRole('listbox', { name: '默认的代码块语言', exact: true });
    await expect(row.locator('.label-hint, .settings-hint-slot')).toHaveCount(0);
    await expect(ui.locator('input[data-marklyra-preference="defaultCodeLang"]')).toHaveCount(0);
    await expect(language).toBeEnabled();
    await expect(language).toHaveValue('custom-lang');
    await expect(language.locator('option:checked')).toHaveText('custom-lang');
    await expect(
      ui.locator(
        '.settings-select-row:has(> select[data-marklyra-preference="defaultCodeLang"]) > .settings-select-chevron',
      ),
    ).toHaveCount(1);
    for (const width of [1280, 700]) {
      const height = width === 700 ? 600 : 1000;
      await page.setViewportSize({ width, height });
      await language.evaluate(
        (element, atEnd) => element.scrollIntoView({ block: atEnd ? 'end' : 'center' }),
        width === 700,
      );
      await language.selectOption('__LAST');
      await language.blur();
      await ui.locator('.sidebar').hover();
      await expect(language.locator('option:checked')).toHaveText('上次使用的');
      const field = await bounds(language);
      for (const select of [indent, policy]) {
        const box = await bounds(select);
        expect(Math.abs(box.left - field.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.right - field.right)).toBeLessThanOrEqual(1);
        expect(await language.evaluate(controlStyle)).toEqual(await select.evaluate(controlStyle));
      }
      await language.click();
      await expect(popup).toBeVisible();
      await expect(language).toHaveAttribute('aria-expanded', 'true');
      const menu = await popup.boundingBox();
      if (!menu) throw Error('Missing language menu');
      expect(menu.height).toBeLessThanOrEqual(252);
      expect(menu.y).toBeGreaterThanOrEqual(8);
      expect(menu.y + menu.height).toBeLessThanOrEqual(height - 8);
      expect(Math.abs(menu.width - (field.right - field.left))).toBeLessThanOrEqual(1);
      expect(await popup.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`code-language-scroll-menu-${width}.png`) });
      const pane = ui.locator('.pane-group > .pane');
      const pageScroll = await pane.evaluate((element) => element.scrollTop);
      await popup.hover();
      await page.mouse.wheel(0, 500);
      await expect.poll(() => popup.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await pane.evaluate((element) => element.scrollTop)).toBe(pageScroll);
      await popup.getByRole('option', { name: 'yaml', exact: true }).click();
      await expect(language).toHaveValue('yaml');
      await expect(popup).toHaveCount(0);
      await language.click();
      await expect(popup).toBeVisible();
      await language.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(page.locator('.preferences-page')).toBeVisible();
      await expect(language).toHaveValue('yaml');
    }
    await language.focus();
    await language.press('Enter');
    await language.press('Home');
    await language.press('ArrowDown');
    await language.press('Enter');
    await expect(language).toHaveValue('__LAST');
    await language.press('p');
    await language.press('y');
    await language.press('Enter');
    await expect(language).toHaveValue('python');
    for (const value of ['', 'python', 'c++', '__LAST']) {
      await language.selectOption(value);
      await expect(language).toHaveValue(value);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.applicationPreferences.values.defaultCodeLang,
          ),
        )
        .toBe(value);
    }
    await expect(language.locator('option[value=""]')).toHaveText('(空)');
    await expect(ui.locator('.input-autocomplete')).toHaveCount(0);
    await policy.selectOption('3');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.applicationPreferences.values
              .defaultCodeLangOption,
        ),
      )
      .toBe(3);
    await ui.getByRole('button', { name: '返回应用', exact: true }).click();
    await expect(page.locator('.preferences-page')).toHaveCount(0);
    await emitLayoutMenu(page, 'preferences');
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(language).toHaveValue('__LAST');
    await expect(language.locator('option:checked')).toHaveText('上次使用的');
    await expect(policy).toHaveValue('3');
  });
}

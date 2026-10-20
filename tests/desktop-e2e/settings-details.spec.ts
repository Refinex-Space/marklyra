import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: settings details stay aligned through focus, hover and custom controls`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    const back = ui.getByRole('button', { name: '返回应用', exact: true });
    await expect(back).toBeVisible();
    await expect(ui.locator('.settings-sidebar-title')).toHaveCount(0);
    const search = ui.getByRole('searchbox', { name: '搜索设置', exact: true });
    const backBox = await back.boundingBox();
    const searchBox = await search.boundingBox();
    if (!backBox || !searchBox) throw new Error('Missing settings navigation');
    expect(backBox.y + backBox.height).toBeLessThan(searchBox.y);
    const styles = (element: Element) => {
      const style = getComputedStyle(element);
      return {
        animation: style.animationName,
        shadow: style.boxShadow,
        outline: style.outlineStyle,
        transition: style.transitionDuration,
      };
    };
    await search.click();
    expect(await search.evaluate(styles)).toEqual({
      animation: 'none',
      shadow: 'none',
      outline: 'none',
      transition: '0s',
    });
    expect(await search.boundingBox()).toEqual(searchBox);
    const select = ui.locator('[data-marklyra-preference="actionWhenDropFolder"]');
    await select.focus();
    expect(await select.evaluate(styles)).toEqual({
      animation: 'none',
      shadow: 'none',
      outline: 'none',
      transition: '0s',
    });
    const hint = ui.locator('.settings-file-content .label-hint').first();
    await hint.hover();
    const tooltip = ui.locator('#ty-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveCSS('opacity', '1');
    expect(await tooltip.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    await expect
      .poll(async () => {
        const popup = await tooltip.boundingBox();
        const target = await hint.boundingBox();
        return popup && target ? popup.y - target.y - target.height : -1;
      })
      .toBeGreaterThanOrEqual(7);
    const tipBox = await tooltip.boundingBox();
    if (!tipBox) throw new Error('Missing tooltip');
    expect(tipBox.width).toBeGreaterThan(180);
    expect(tipBox.height).toBeLessThan(100);
    await page.screenshot({ path: info.outputPath('file-focus-tooltip.png') });
    const band = await page.locator('.preferences-page').evaluate((el) => ({
      paint: getComputedStyle(el, '::before').backgroundColor,
      canvas: getComputedStyle(el).backgroundColor,
      line: getComputedStyle(el).getPropertyValue('--settings-page-line').trim(),
    }));
    expect(band.line).toBe(theme === 'marklyra-dark' ? '#30363d' : '#e8e9eb');
    // The band behind the titlebar is the same canvas the two settings cards sit on.
    expect(band.paint).toBe(band.canvas);
    await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(ui.locator('.content:not(.display-none) .input-group-header a')).toHaveCount(0);
    await ui.getByRole('button', { name: '外观', exact: true }).click();
    const customRadio = ui.locator('input[name="useCustomFontSize"][value="true"]');
    await customRadio.check();
    const radioGeometry = await customRadio.evaluate((input) => {
      const label = input.parentElement;
      if (!label) throw new Error('Missing radio label');
      const text = [...label.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (!text) throw new Error('Missing radio text');
      const range = document.createRange();
      range.selectNode(text);
      const textBox = range.getBoundingClientRect();
      const box = input.getBoundingClientRect();
      return Math.abs(box.y + box.height / 2 - textBox.y - textBox.height / 2);
    });
    expect(radioGeometry).toBeLessThan(3);
    const zoom = ui.locator('[data-marklyra-preference="zoomFactor"]');
    expect(
      await zoom.evaluate((el) => {
        const row = el.closest('tr');
        if (!row) throw new Error('Missing Zoom row');
        return Math.abs(el.getBoundingClientRect().left - row.getBoundingClientRect().left);
      }),
    ).toBeLessThan(2);
    const split = ui.locator('.btn-split-group');
    const buttonGaps = await split.evaluate((el) => {
      const buttons = el.querySelectorAll('button');
      const a = buttons[0]?.getBoundingClientRect(),
        b = buttons[1]?.getBoundingClientRect();
      if (!a || !b) throw new Error('Missing split controls');
      return { gap: b.x - a.right, dy: Math.abs(a.y - b.y) };
    });
    expect(buttonGaps.gap).toBeGreaterThanOrEqual(6);
    expect(buttonGaps.dy).toBeLessThan(1);
    const actions = await ui.locator('.settings-theme-actions').evaluate((el) => {
      const buttons = el.querySelectorAll('button');
      const a = buttons[0]?.getBoundingClientRect(),
        b = buttons[1]?.getBoundingClientRect();
      if (!a || !b) throw new Error('Missing theme controls');
      return {
        start: a.left - el.getBoundingClientRect().left,
        gap: b.left - a.right,
        dy: Math.abs(a.y - b.y),
      };
    });
    expect(actions.start).toBeLessThan(2);
    expect(actions.gap).toBeGreaterThanOrEqual(8);
    expect(actions.gap).toBeLessThan(13);
    expect(actions.dy).toBeLessThan(1);
    await ui.locator('[data-marklyra-preference="customFontSize"]').fill('16');
    await ui.locator('.settings-page-heading').click();
    await page.screenshot({ path: info.outputPath('appearance.png') });
    await ui.locator('[data-marklyra-reading-speed="toggle"]').click();
    await expect(ui.locator('.btn-split-group .dropdown-menu')).toBeVisible();
    const popupBox = await ui.locator('.btn-split-group .dropdown-menu').boundingBox();
    const triggerBox = await ui.locator('[data-marklyra-reading-speed="toggle"]').boundingBox();
    if (!popupBox || !triggerBox) throw new Error('Missing reading speed popup');
    expect(popupBox.y - triggerBox.y - triggerBox.height).toBeGreaterThanOrEqual(6);
    await page.screenshot({ path: info.outputPath('reading-speed-menu.png') });
    await ui.locator('.settings-page-heading').click();
    await page.setViewportSize({ width: 700, height: 650 });
    expect(await ui.locator('.pane').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('appearance-narrow.png') });
    // The two settings cards add a 4px top inset, an 8px bottom inset and their borders.
    await page.setViewportSize({ width: 1280, height: 1040 });
    for (const category of ['文件', '编辑器', '图像', 'Markdown', '导出', '外观', '通用']) {
      await ui.getByRole('button', { name: category, exact: true }).click();
      const pane = ui.locator('.pane');
      await pane.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath(`category-${category}.png`) });
      const overflow = await pane.evaluate((el) => el.scrollHeight - el.clientHeight);
      if (['文件', '图像'].includes(category)) expect(overflow).toBe(0);
      if (overflow > 0) {
        await pane.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.screenshot({ path: info.outputPath(`category-${category}-bottom.png`) });
      }
    }
    await back.click();
    await expect(page.locator('.preferences-page')).toHaveCount(0);
  });
}

import { expect, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';
import { waitForNativeUndo } from './native-menu.helpers.js';

const source =
  '\uFEFF# MarkLyra Theme\r\n\r\nA **clear** document with a [link](https://example.com).\r\n\r\n> A quiet quotation with `inline code`.\r\n\r\n| Item | Value |\r\n| --- | --- |\r\n| Alpha | 42 |\r\n| Beta | 64 |\r\n\r\n- [x] A completed task\r\n- [ ] A task to do\r\n\r\n```javascript\r\nconst answer = 42; // A comment\r\nconsole.log("MarkLyra");\r\n```\r\n\r\n$$\r\nE = mc^2\r\n$$\r\n\r\n```mermaid\r\ngraph LR\r\n  Document --> Preview\r\n```\r\n';

test('the built-in pair shares layout, renders dark content clearly and is branded throughout settings', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, source);
  const frame = page.frameLocator('.marklyra-editor-frame');
  const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
  let typography: unknown;
  for (const [theme, background] of [
    ['marklyra-light', 'rgb(255, 255, 255)'],
    ['marklyra-dark', 'rgb(13, 17, 23)'],
  ] as const) {
    await emitLayoutMenu(page, `theme:${theme}`);
    await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', theme);
    await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
    await expect(frame.locator('body')).toHaveCSS('background-color', background);
    const layout = await frame.locator('#write').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: element.getBoundingClientRect().width,
        font: style.fontFamily,
        size: style.fontSize,
        lineHeight: style.lineHeight,
      };
    });
    if (typography) expect(layout).toEqual(typography);
    else typography = layout;
    await expect(frame.locator('#write h1')).toHaveText('MarkLyra Theme');
    await expect(frame.locator('#write table')).toHaveCount(1);
    const table = frame.locator('#write table');
    await expect(table).toHaveCSS('background-color', background);
    await expect(table).toHaveCSS('border-radius', '4px');
    await expect(table).toHaveCSS('border-collapse', 'separate');
    for (const row of await table.locator('tr').all())
      await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    // Outer border and shared cell edges stay single-width.
    await expect(table.locator('th').first()).toHaveCSS('border-top-width', '0px');
    await expect(table.locator('th').first()).toHaveCSS('border-left-width', '0px');
    await expect(table.locator('tbody td').first()).toHaveCSS('border-top-width', '1px');
    await expect(table.locator('tbody td').nth(1)).toHaveCSS('border-left-width', '1px');
    await table.screenshot({ path: info.outputPath(`${theme}-table.png`) });
    // The rounded border must not interfere with cell navigation or row editing.
    await table.locator('tbody tr:last-child td:last-child').click();
    await page.keyboard.press('Tab');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await waitForNativeUndo(page);
    await emitLayoutMenu(page, 'undo');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    if (theme === 'marklyra-dark') {
      await expect(frame.locator('#write blockquote')).toHaveCSS('color', 'rgb(139, 148, 158)');
      await expect(frame.locator('.md-diagram-panel .node rect').first()).not.toHaveCSS(
        'fill',
        'rgb(236, 236, 255)',
      );
      await expect(frame.locator('.md-diagram-panel .nodeLabel').first()).not.toHaveCSS(
        'color',
        'rgb(51, 51, 51)',
      );
      const contrast = await frame.locator('#write').evaluate((element) => {
        const light = (color: string) => {
          const channels = (color.match(/[\d.]+/g) || [])
            .slice(0, 3)
            .map(Number)
            .map((v) => v / 255)
            .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
          return (
            (channels[0] || 0) * 0.2126 + (channels[1] || 0) * 0.7152 + (channels[2] || 0) * 0.0722
          );
        };
        const bg = light(getComputedStyle(document.body).backgroundColor);
        return [
          element,
          element.querySelector('a'),
          element.querySelector('blockquote'),
          element.querySelector('.md-diagram-panel .nodeLabel'),
        ].map((node) => {
          if (!node) throw Error('Missing contrast sample');
          const fg = light(getComputedStyle(node).color);
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
      });
      for (const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
    await saveLayoutSource(page, info, theme, source);
    expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
    await page.screenshot({ path: info.outputPath(`${theme}.png`) });
  }
  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await ui.getByRole('button', { name: '外观', exact: true }).click();
  await ui.getByRole('checkbox', { name: '在深色模式下使用独立的主题', exact: true }).check();
  await expect(ui.locator('select[data-marklyra-preference="darkTheme"]')).toHaveCount(1);
  for (const key of ['theme', 'darkTheme']) {
    const select = ui.locator(`select[data-marklyra-preference="${key}"]`);
    expect(await select.locator('option').allTextContents()).toEqual([
      'MarkLyra Light',
      'MarkLyra Dark',
    ]);
  }
  await expect(ui.locator('select[data-marklyra-preference="theme"]')).toHaveValue(
    'marklyra-dark.css',
  );
  await expect(ui.locator('select[data-marklyra-preference="darkTheme"]')).toHaveValue(
    'marklyra-dark.css',
  );
  await page.screenshot({ path: info.outputPath('branded-settings.png') });
});

test('a retired bundled selection resolves cleanly without rewriting its stored record', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(() => {
    if (window === window.top)
      localStorage.setItem(
        'marklyra-theme-choice-v1',
        JSON.stringify({ theme: 'night', revision: 'existing' }),
      );
  });
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'marklyra-dark');
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('marklyra-theme-choice-v1') || '{}')),
  ).toEqual({ theme: 'night', revision: 'existing' });
});

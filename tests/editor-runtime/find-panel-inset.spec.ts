import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };

async function setup(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async () => {
    await (window as unknown as Host).marklyraEditor.ready;
  });
}
async function panelRect(page: Page) {
  return page
    .frameLocator('iframe.marklyra-editor-frame')
    .locator('#md-searchpanel')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        innerWidth: document.documentElement.clientWidth,
        display: getComputedStyle(element).display,
      };
    });
}

test('查找面板保留原始全宽布局，顶部让出宿主标题栏', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.setContentInset(240, 28, 28);
    await editor.execute({ type: 'find' });
  });
  const inset = await panelRect(page);
  expect(inset.display).not.toBe('none');
  // 原始查找栏横跨窗口，宿主只为它开放侧栏上方的命中区域。
  expect(Math.abs(inset.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(inset.top - 28)).toBeLessThanOrEqual(1);
  expect(Math.abs(inset.right - inset.innerWidth)).toBeLessThanOrEqual(1);

  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.setContentInset(0, 0, 0);
  });
  const full = await panelRect(page);
  // 无缩进时保持原版全宽贴顶行为。
  expect(Math.abs(full.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(full.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(full.right - full.innerWidth)).toBeLessThanOrEqual(1);
});

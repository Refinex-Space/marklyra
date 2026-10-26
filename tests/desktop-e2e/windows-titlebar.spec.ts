import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// The Windows host draws the unified titlebar in the WebView. Only the host IPC is doubled:
// the real Shell, titlebar component, runtime iframe and SDK run in the browser.
async function ready(page: Page, theme = 'marklyra-light', width = 1280) {
  await installLayout(page, undefined, 'web');
  await page.setViewportSize({ width, height: 800 });
  await readyLayout(page, theme);
  await openLayoutDocument(page);
}

const calls = (page: Page, command: string) =>
  page.evaluate(
    (name) => (window as TestWindow).__desktopMock.calls.filter((call) => call.command === name),
    command,
  );

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: the WebView titlebar replaces the HTML toolbar and statusbar`, async ({
    page,
  }) => {
    await ready(page, theme);
    const shell = page.locator('.shell');
    await expect(shell).toHaveAttribute('data-titlebar', 'web');
    await expect(page.locator('header.titlebar')).toBeVisible();
    await expect(
      page.locator('.native-titlebar-drag, header.toolbar, footer.statusbar'),
    ).toHaveCount(0);
    const bar = await page.locator('header.titlebar').boundingBox();
    expect(bar).toMatchObject({ x: 0, y: 0, height: 32, width: 1280 });
    // Windows owns the 32px caption band; AppKit keeps its 28pt titlebar.
    expect(
      await shell.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--titlebar-height'),
      ),
    ).toBe('32px');
    await expect(page.locator('.titlebar-menu')).toHaveText([
      '文件',
      '编辑',
      '段落',
      '格式',
      '显示',
      '主题',
      '窗口',
      '帮助',
    ]);
    await expect(page.getByRole('toolbar', { name: '窗口控制' }).getByRole('button')).toHaveCount(
      3,
    );
    await expect(page.locator('.titlebar-name')).toHaveText('Layout.md');
    const center = await page.locator('.titlebar-title').evaluate((element) => {
      const box = element.getBoundingClientRect();
      const area = document.querySelector('main.document-area')?.getBoundingClientRect();
      return { title: box.left + box.width / 2, area: area ? (area.left + area.right) / 2 : -1 };
    });
    expect(Math.abs(center.title - center.area)).toBeLessThan(1.5);
  });
}

test('titlebar menus pop up the existing native menus below their controls', async ({ page }) => {
  await ready(page);
  await page.locator('.titlebar-menu', { hasText: '格式' }).click();
  await page.locator('.titlebar-menu', { hasText: '帮助' }).click();
  // The app icon is brand only; settings, exit and About live in File and Help.
  await page.locator('.titlebar-app').click();
  await expect(page.getByRole('button', { name: 'MarkLyra', exact: true })).toHaveCount(0);
  const popups = await calls(page, 'popup_app_menu');
  expect(popups).toHaveLength(2);
  expect(popups[0]?.args).toMatchObject({ index: 3, viewportWidth: 1280 });
  expect(popups[0]?.args.y).toBe(28);
  expect(popups[1]?.args).toMatchObject({ index: 7 });
  // A keyboard-opened title shows its own menu.
  await page.locator('.titlebar-menu', { hasText: '文件' }).focus();
  await page.keyboard.press('ArrowDown');
  expect((await calls(page, 'popup_app_menu'))[2]?.args).toMatchObject({ index: 0 });
  // The titles come from the native menu model; React StrictMode may mount the effect twice.
  expect((await calls(page, 'list_app_menu')).length).toBeGreaterThanOrEqual(1);
});

test('compact windows fold the menu titles into one menu button', async ({ page }) => {
  await ready(page, 'marklyra-light', 900);
  await expect(page.locator('.titlebar-menu')).toHaveCount(1);
  await page.locator('.titlebar-menu-compact').click();
  const [popup] = await calls(page, 'popup_app_menu');
  expect(popup?.args).toMatchObject({ index: null });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.titlebar-menu')).toHaveCount(8);
});

test('the word count menu follows the AppKit unit menu and persists the choice', async ({
  page,
}) => {
  await ready(page);
  const trigger = page.locator('.document-statistics-button');
  await expect(trigger).toContainText('词');
  await trigger.click();
  const items = page.getByRole('menuitemradio');
  await expect(items).toHaveCount(4);
  await expect(items.nth(2)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(items).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('menuitemradio', { name: /字符$/ }).click();
  await expect(trigger).toContainText('字符');
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: /字符$/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.mouse.click(600, 400);
  await expect(page.getByRole('menuitemradio')).toHaveCount(0);
});

test('outline, sidebar and AI controls mirror the native titlebar toggles', async ({ page }) => {
  await ready(page);
  const outline = page.getByRole('button', { name: '显示/隐藏文档目录' });
  const ai = page.getByRole('button', { name: 'AI 助手' });
  await outline.click();
  await expect(outline).toHaveAttribute('aria-pressed', 'true');
  await ai.click();
  await expect(ai).toHaveAttribute('aria-pressed', 'true');
  await expect(outline).toHaveAttribute('aria-pressed', 'false');
  await ai.click();
  await expect(ai).toHaveAttribute('aria-pressed', 'false');
  const sidebar = page.getByRole('button', { name: '侧边栏' });
  await expect(page.locator('aside.sidebar')).toBeVisible();
  await sidebar.click();
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await sidebar.click();
  await expect(page.locator('aside.sidebar')).toBeVisible();
});

test('source mode swaps the document controls for the exit chip', async ({ page }) => {
  await ready(page);
  await emitLayoutMenu(page, 'view:source');
  const chip = page.getByRole('button', { name: '退出源代码模式' });
  await expect(chip).toBeVisible();
  await expect(page.locator('.document-statistics-button')).toHaveCount(0);
  await expect(page.locator('.titlebar-action')).toHaveCount(0);
  await chip.click();
  await expect(chip).toHaveCount(0);
  await expect(page.locator('.document-statistics-button')).toBeVisible();
});

test('caption buttons drive the window and follow its maximized state', async ({ page }) => {
  await ready(page);
  const maximize = page.getByRole('button', { name: '最大化' });
  await page.getByRole('button', { name: '最小化' }).click();
  await maximize.click();
  await page.getByRole('button', { name: '关闭' }).click();
  expect(await calls(page, 'plugin:window|minimize')).toHaveLength(1);
  expect(await calls(page, 'plugin:window|toggle_maximize')).toHaveLength(1);
  expect(await calls(page, 'plugin:window|close')).toHaveLength(1);
  await page.evaluate(() => {
    Reflect.set(window, '__testMaximized', true);
    (window as TestWindow).__desktopMock.emitEvent('tauri://resize', { width: 1280, height: 800 });
  });
  await expect(page.getByRole('button', { name: '还原' })).toBeVisible();
});

test('settings page hides document controls but keeps menus and caption buttons', async ({
  page,
}) => {
  await ready(page);
  await emitLayoutMenu(page, 'preferences');
  await expect(page.locator('.shell')).toHaveAttribute('data-settings-page', 'true');
  await expect(page.locator('header.titlebar')).toHaveAttribute('data-settings', 'true');
  await expect(page.locator('.titlebar-title, .titlebar-actions')).toHaveCount(0);
  await expect(page.locator('.titlebar-menu')).toHaveCount(8);
  await expect(page.getByRole('toolbar', { name: '窗口控制' })).toBeVisible();
  const frame = page.frameLocator('iframe.runtime-preferences-frame');
  await expect(frame.locator('.nav-group-item').first()).toBeVisible();
  // The settings page is one design on every host; only genuine OS differences adapt.
  const url = await page.locator('iframe.runtime-preferences-frame').getAttribute('src');
  expect(new URL(url ?? '').searchParams.get('os')).toBe('mac');
  expect(new URL(url ?? '').searchParams.get('hostOs')).toBe('win');
  await expect(frame.getByText('随时可按 Ctrl + S 手动保存')).toBeVisible();
  await frame.locator('.nav-group-item').filter({ hasText: '通用' }).click();
  await expect(frame.getByText('所有窗口被关闭后自动退出')).toBeHidden();
  await frame.locator('.nav-group-item').filter({ hasText: '外观' }).click();
  await expect(frame.getByText('按住 Ctrl 时使用鼠标滑轮缩放')).toBeVisible();
});

test('fullscreen removes the titlebar and keeps the word count in the document card', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => Reflect.set(window, '__marklyraLayoutFullscreen', true));
  await emitLayoutMenu(page, 'view:fullscreen');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitEvent('tauri://resize', { width: 1280, height: 800 }),
  );
  await expect(page.locator('header.titlebar')).toHaveCount(0);
  await expect(page.locator('main.document-area .document-statistics-button')).toBeVisible();
});

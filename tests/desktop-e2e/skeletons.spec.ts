import { expect, type Page, test } from '@playwright/test';
import { installMock } from './desktop.helpers.js';
import { installRecentMock } from './recent.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const runtime = /127\.0\.0\.1:4174/;
const loadingText = /正在(读取|加载|准备|打开)|加载中/;

/** Hold the isolated runtime page back, as a slow disk or a cold start would. */
async function slowRuntime(
  page: Page,
  delay: number,
  filter: (url: string) => boolean = () => true,
) {
  await page.route(runtime, async (route) => {
    if (filter(route.request().url())) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.continue();
  });
}

async function install(page: Page) {
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: 'web' as 'web' | 'appkit',
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installRecentMock);
  await page.setViewportSize({ width: 1180, height: 760 });
}
async function boot(page: Page, view = '/') {
  await install(page);
  await page.goto(view);
}

test('the first screen shows the page and the folder list as skeletons, never loading text', async ({
  page,
}) => {
  await slowRuntime(page, 1800);
  await boot(page);
  const card = page.locator('main.document-area');
  const document = card.locator('.document-skeleton');
  await expect(document).toBeVisible();
  await expect(document).toHaveAttribute('aria-label', '正在准备编辑器');
  await expect(document).toHaveText('');
  // The sidebar is restoring its folder: placeholder rows, not a "choose a folder" prompt.
  await expect(page.locator('.sidebar .sidebar-skeleton[data-variant="tree"]')).toBeVisible();
  await expect(page.locator('.workspace-empty, .workspace-compact-empty')).toHaveCount(0);
  await expect(page.locator('.shell')).not.toContainText(loadingText);
  // The skeleton fills the card (inside its 1px border), so nothing shifts when the page arrives.
  const box = await card.boundingBox();
  const cover = await document.boundingBox();
  expect(Math.abs((cover?.x ?? -9) - (box?.x ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((cover?.width ?? -9) - (box?.width ?? 0))).toBeLessThanOrEqual(3);
  expect(Math.abs((cover?.height ?? -9) - (box?.height ?? 0))).toBeLessThanOrEqual(3);

  await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
  await expect(document).toHaveCount(0);
  await expect(page.locator('.sidebar-skeleton')).toHaveCount(0);
});

test('the skeleton is a polite status region and honours reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await slowRuntime(page, 1500);
  await boot(page);
  const skeleton = page.locator('.document-skeleton');
  await expect(skeleton).toHaveAttribute('role', 'status');
  await expect(skeleton).toHaveAttribute('aria-live', 'polite');
  const bar = skeleton.locator('.skeleton-bar').first();
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
});

test('the recent list on the home view is a skeleton while it is read', async ({ page }) => {
  // The read is slow, not failed: the list request is held for a moment.
  await install(page);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const original = internal.invoke;
    internal.invoke = async (command, args) => {
      if (command === 'list_recent_files')
        await new Promise((resolve) => setTimeout(resolve, 2000));
      return original(command, args);
    };
  });
  await page.goto('/');
  const skeleton = page.locator('.home-recent-skeleton');
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-label', '正在读取最近查看');
  await expect(skeleton).toHaveText('');
  await expect(page.locator('.home-screen')).not.toContainText(loadingText);
  await expect(page.locator('.home-empty')).toHaveCount(0);
});

test('the settings window shows the page silhouette until its page has arrived', async ({
  page,
}) => {
  await slowRuntime(page, 1500, (url) => url.includes('channel='));
  await boot(page, '/?view=preferences');
  const skeleton = page.locator('.settings-skeleton');
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-label', '正在打开设置');
  await expect(skeleton).toHaveText('');
  // The way out stays a real control while the page is loading.
  await expect(page.getByRole('button', { name: '返回应用' })).toBeVisible();
  await expect(page.locator('.preferences-window')).not.toContainText(loadingText);

  const original = page.frameLocator('.runtime-preferences-frame');
  await expect(original.locator('.nav-group-item').first()).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回应用', exact: true })).toHaveCount(0);
});

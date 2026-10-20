import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const long = Array.from(
  { length: 120 },
  (_, index) => `## Section ${index}\n\nParagraph ${index}.\n`,
).join('\n');

async function boot(page: Page, host: 'windows' | 'macos', text = 'Alpha beta gamma') {
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: (host === 'windows' ? 'web' : 'appkit') as 'web' | 'appkit',
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'false'));
  await page.addInitScript((text) => {
    if (window !== window.top) return;
    const set = () => {
      const mock = (window as unknown as TestWindow).__desktopMock;
      if (mock) mock.nextDocument.text = text;
      else setTimeout(set, 0);
    };
    set();
  }, text);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    text.replace(/^#+ /, '').slice(0, 5),
  );
}
const count = (page: Page) => page.locator('.document-statistics-button');
const box = async (locator: ReturnType<Page['locator']>) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error('not visible');
  return value;
};

for (const host of ['windows', 'macos'] as const) {
  test(`${host}: the word count sits in the lower right corner of the document card`, async ({
    page,
  }) => {
    await boot(page, host);
    await expect(count(page)).toBeVisible();
    await expect(count(page)).toContainText('词');
    const area = await box(page.locator('main.document-area'));
    const label = await box(count(page));
    expect(Math.abs(area.x + area.width - (label.x + label.width) - 12)).toBeLessThan(2);
    expect(Math.abs(area.y + area.height - (label.y + label.height) - 6)).toBeLessThan(3);
    // It is no longer in the titlebar.
    await expect(page.locator('.titlebar .document-statistics-button')).toHaveCount(0);
  });
}

test('the word count never overlaps the back-to-top button, with or without the side panel', async ({
  page,
}) => {
  await boot(page, 'windows', long);
  await page.mouse.move(600, 300);
  await page
    .frameLocator('.marklyra-editor-frame')
    .locator('content')
    .evaluate((element) => {
      element.scrollTop = 1200;
    });
  const top = page.getByRole('button', { name: '回到顶部', exact: true });
  await expect(top).toBeVisible();
  const check = async () => {
    const label = await box(count(page));
    const button = await box(top);
    const apart =
      button.y + button.height <= label.y ||
      label.y + label.height <= button.y ||
      button.x + button.width <= label.x ||
      label.x + label.width <= button.x;
    expect(apart).toBe(true);
    // The button stays inside the card, above the count.
    expect(button.y + button.height).toBeLessThanOrEqual(label.y);
  };
  await check();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:outline'));
  await expect(page.getByRole('separator', { name: '调整目录宽度' })).toBeVisible();
  await check();
});

test('the unit menu opens upward from the count and keeps its choice', async ({ page }) => {
  await boot(page, 'windows');
  await count(page).click();
  const menu = page.getByRole('menu', { name: '字数统计' });
  await expect(menu).toBeVisible();
  const menuBox = await box(menu);
  const label = await box(count(page));
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(label.y);
  await page.getByRole('menuitemradio', { name: /字符$/ }).click();
  await expect(count(page)).toContainText('字符');
});

test('the word count steps aside for source mode, the home view and the settings page', async ({
  page,
}) => {
  await boot(page, 'windows');
  await expect(count(page)).toBeVisible();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  await expect(count(page)).toHaveCount(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  await expect(count(page)).toBeVisible();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('close-document'));
  await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
  await expect(count(page)).toHaveCount(0);
});

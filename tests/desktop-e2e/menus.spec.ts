import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
});

test('native statistics action toggles its existing panel without changing the draft', async ({
  page,
}) => {
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p');
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:statistics'));
  const panel = page.getByRole('dialog', { name: '文档统计' });
  await expect(panel).toBeVisible();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:statistics'));
  await expect(panel).toBeHidden();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(paragraph).toHaveText('Alpha');
});

test('compatibility menu events respect Source formatting restrictions and preserve history', async ({
  page,
}) => {
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#typora-source')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (window as TestWindow).__desktopMock.calls;
        const snapshot = calls.filter((call) => call.command === 'sync_editor_menu_state').at(-1)
          ?.args.snapshot;
        return (snapshot as { editor?: { sourceMode?: boolean } } | undefined)?.editor?.sourceMode;
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    for (const action of ['format:strong', 'heading:1', 'list:ul']) mock.emitMenu(action);
  });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
  expect(await draftSource(page)).toBeNull();
});

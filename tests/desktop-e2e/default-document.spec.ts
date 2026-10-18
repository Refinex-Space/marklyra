import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

test('fresh desktop starts with a blank document and saves the first real input', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect(page.locator('.document-title')).toHaveText('未命名');
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toHaveText('');
  await write.click();
  await page.keyboard.type('First document');
  await expect(write).toHaveText('First document');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  const saves = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter(
      (call) => call.command === 'save_document_as',
    ),
  );
  expect(saves).toHaveLength(1);
  expect(saves[0]?.args).toMatchObject({ text: 'First document' });
  expect(errors).toEqual([]);
});

test('a legacy draft requires explicit import and restore before exact save', async ({ page }) => {
  const source = '\ufeff# Existing\r\n\r\nSaved draft\n';
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript((text) => {
    if (window === window.top) localStorage.setItem('marklyra-draft', text);
  }, source);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const panel = page.getByRole('dialog', { name: '恢复未保存的文档' });
  await expect(panel).toBeVisible();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(source);
  await panel.getByRole('button', { name: '保护此本地副本', exact: true }).click();
  await panel.getByRole('button', { name: '恢复为新文档', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write h1')).toHaveText(
    'Existing',
  );
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write p')).toHaveText(
    'Saved draft',
  );
  await expect(page.locator('.document-title')).toHaveText('未命名 •');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  const saved = await page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls.find((call) => call.command === 'save_document_as')
        ?.args.text,
  );
  expect(saved).toBe(source);
});

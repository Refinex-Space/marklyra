import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const storedFolder = () =>
  JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').imageStorageFolder;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
});

test('image directory presets and custom preview persist the real template', async ({ page }) => {
  const select = page.getByLabel('图片保存位置', { exact: true });
  const preview = page.getByLabel('图片目录预览', { exact: true });
  await expect(select).toHaveValue('assets');
  await expect(preview).toHaveText('assets/');
  await select.selectOption('.');
  await expect(preview).toHaveText('文档所在目录/');
  await expect.poll(() => page.evaluate(storedFolder)).toBe('.');
  await select.selectOption('${filename}.assets');
  await expect(preview).toHaveText('笔记.assets/');
  await expect.poll(() => page.evaluate(storedFolder)).toBe('${filename}.assets');
  await select.selectOption('custom');
  await page.getByLabel('自定义图片目录', { exact: true }).fill('图片/${filename}/');
  await expect(preview).toHaveText('图片/笔记/');
  await expect.poll(() => page.evaluate(storedFolder)).toBe('图片/${filename}');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await expect(select).toHaveValue('custom');
  await expect(page.getByLabel('自定义图片目录', { exact: true })).toHaveValue('图片/${filename}');
  await expect(preview).toHaveText('图片/笔记/');
});

test('invalid custom image directories keep the last valid preference and document unchanged', async ({
  page,
}) => {
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByLabel('图片保存位置', { exact: true }).selectOption('custom');
  const input = page.getByLabel('自定义图片目录', { exact: true });
  await input.fill('images/notes');
  await expect.poll(() => page.evaluate(storedFolder)).toBe('images/notes');
  for (const invalid of ['C:\\images', 'https://example.test/images', 'CON']) {
    await input.fill(invalid);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toContainText('当前保存位置仍为 images/notes/');
    expect(await page.evaluate(storedFolder)).toBe('images/notes');
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '偏好设置' })).toBeHidden();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('Alpha');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((call) =>
        ['save_document', 'save_document_as', 'import_document_image'].includes(call.command),
      ),
    ),
  ).toEqual([]);
});

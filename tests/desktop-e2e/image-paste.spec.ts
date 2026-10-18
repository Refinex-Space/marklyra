import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

test('desktop native image clipboard respects saved storage preference and exact undo/save', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const target = window as TestWindow;
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internals.invoke;
    internals.invoke = async (command, args = {}) => {
      if (command === 'clipboard_read_image' || command === 'import_document_image') {
        target.__desktopMock.calls.push({ command, args });
        const base64 = String(Reflect.get(window, '__nativeImagePng'));
        return command === 'clipboard_read_image'
          ? { name: 'fixture.png', type: 'image/png', base64 }
          : { source: 'assets/fixture.png', url: `data:image/png;base64,${base64}` };
      }
      return previous(command, args);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    canvas.getContext('2d')?.fillRect(0, 0, 2, 1);
    Reflect.set(window, '__nativeImagePng', canvas.toDataURL('image/png').split(',')[1]);
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByLabel('图片保存位置', { exact: true }).selectOption('${filename}.assets');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write p').click();
  await frame.locator('#write p').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      }),
    );
  });
  await expect
    .poll(() =>
      frame
        .locator('#write img')
        .evaluateAll((items) =>
          items.some((item) => (item as HTMLImageElement).naturalWidth === 2),
        ),
    )
    .toBe(true);
  const importCall = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.find(
      (call) => call.command === 'import_document_image',
    ),
  );
  expect(importCall?.args).toMatchObject({
    id: 'doc-a',
    storageFolder: '${filename}.assets',
    referenceRoot: '',
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = () =>
    page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'save_document')
          .at(-1)?.args.text,
    );
  await expect.poll(saved).toContain('assets/fixture.png');
  const inserted = await saved();
  expect(String(inserted).indexOf('fixture')).toBeGreaterThan(String(inserted).indexOf('Alpha'));
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(saved).toBe('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(frame.locator('#write img')).toBeVisible();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(saved).toBe(inserted);
  expect(errors).toEqual([]);
});

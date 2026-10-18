import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const ticket = '00000000-0000-4000-8000-000000000018';
type NativeWindow = TestWindow & {
  __sameDrop?: boolean;
  __TAURI_INTERNALS__: {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
};
async function start(page: Page) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const target = window as NativeWindow;
    const invoke = target.__TAURI_INTERNALS__.invoke;
    let saved = false;
    target.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (
        command === 'initialise_native_drop' ||
        command === 'create_image_draft' ||
        command === 'import_native_input_images' ||
        command === 'open_native_input_document' ||
        command === 'cancel_native_input'
      ) {
        target.__desktopMock.calls.push({ command, args });
        if (command === 'initialise_native_drop') return true;
        if (command === 'create_image_draft') return 'native-draft';
        if (command === 'import_native_input_images')
          return [{ kind: 'link', name: 'linked.md', source: '../linked.md' }];
        if (command === 'open_native_input_document' && saved)
          throw new Error('Old source receipt invalidated by Save');
        if (command === 'open_native_input_document')
          return {
            id: 'doc-b',
            path: '/mock/B.md',
            nativeSameDocument: target.__sameDrop === true,
            text: 'Beta',
            encoding: 'UTF-8',
          };
        return null;
      }
      if (command === 'save_document' || command === 'save_document_as') saved = true;
      return invoke(command, args);
    };
  });
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) => call.command === 'editor_window_ready',
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    'Alpha',
  );
}
async function emitDrop(
  page: Page,
  kind: 'file' | 'image' | 'directory',
  name: string,
  id = ticket,
) {
  await page.evaluate(
    ({ kind, name, id }) => {
      const frame = document.querySelector<HTMLIFrameElement>('.marklyra-editor-frame');
      if (!frame) throw new Error('Editor missing');
      const box = frame.getBoundingClientRect();
      (window as TestWindow).__desktopMock.emitEvent('native-file-drop', {
        ticket: id,
        entries: [{ kind, name }],
        position: { x: box.left + box.width / 2, y: 150 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
    },
    { kind, name, id },
  );
}

test('native attachment receipt crosses React once, preserves iframe and original Undo/Redo', async ({
  page,
}) => {
  await start(page);
  const before = page.frames().find((frame) => frame.url().includes('4174'));
  await emitDrop(page, 'file', 'linked.zip');
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toContainText('linked.md');
  await emitDrop(page, 'file', 'linked.zip');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (call) => call.command === 'import_native_input_images',
          ).length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toContain('../linked.md');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write).not.toContainText('linked.md');
  await expect(write).toContainText('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write).toContainText('linked.md');
  expect(page.frames().find((frame) => frame.url().includes('4174'))).toBe(before);
});

test('native document drop waits for dirty confirmation and cancel preserves current source', async ({
  page,
}) => {
  await start(page);
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await write.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' dirty');
  await emitDrop(page, 'file', 'B.md');
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (call) => call.command === 'open_native_input_document',
        ).length,
    ),
  ).toBe(1);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(write).toContainText('dirty');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) => call.command === 'close_document' && call.args.id === 'doc-b',
        ),
      ),
    )
    .toBe(true);
});

test('native document drop cleanly opens only its receipt, and link preference keeps current document', async ({
  page,
}) => {
  await start(page);
  await emitDrop(page, 'file', 'B.md');
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toContainText('Beta');
  await page.evaluate(() => {
    Object.assign((window as TestWindow).__desktopMock.filePreferences, {
      actionWhenDropFile: 'link',
    });
  });
  await emitDrop(page, 'file', 'C.md', '00000000-0000-4000-8000-000000000019');
  await expect(write).toContainText('linked.md');
  await expect(write).toContainText('Beta');
  const calls = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter(
      (call) => call.command === 'open_native_input_document',
    ),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args).toEqual({ ticket });
});

test('native document candidate survives Save confirmation without reusing its old owner receipt', async ({
  page,
}) => {
  await start(page);
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await write.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' saved before opening');
  await emitDrop(page, 'file', 'B.md');
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await expect(write).toContainText('Alpha');
  await dialog.getByRole('button', { name: '保存后继续', exact: true }).click();
  await expect(write).toContainText('Beta');
  const calls = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  expect(calls.filter((call) => call.command === 'open_native_input_document')).toHaveLength(1);
  expect(calls.filter((call) => call.command === 'save_document').at(-1)?.args.text).toContain(
    'saved before opening',
  );
});

test('dropping the current Native entity preserves its dirty editor instead of reloading old disk text', async ({
  page,
}) => {
  await start(page);
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await write.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' keep current');
  await page.evaluate(() => {
    (window as NativeWindow).__sameDrop = true;
  });
  await emitDrop(page, 'file', 'Alias.md');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) => call.command === 'close_document' && call.args.id === 'doc-b',
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(write).toContainText('keep current');
  await expect(write).not.toContainText('Beta');
});

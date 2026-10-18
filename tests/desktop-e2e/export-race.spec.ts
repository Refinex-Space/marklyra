import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type RaceWindow = TestWindow & {
  exportPreferenceGate: { waiting: boolean; release(): void };
};

async function deferExportPreferences(page: Page) {
  await page.evaluate(() => {
    const target = window as RaceWindow;
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internals.invoke;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    target.exportPreferenceGate = { waiting: false, release };
    internals.invoke = async (command, args) => {
      if (command === 'get_export_preferences') {
        target.exportPreferenceGate.waiting = true;
        await gate;
      }
      return previous(command, args);
    };
    target.__desktopMock.emitMenu('export-html');
  });
  await expect
    .poll(() => page.evaluate(() => (window as RaceWindow).exportPreferenceGate.waiting))
    .toBe(true);
}

async function expectCancelledWithoutOutput(page: Page) {
  await page.evaluate(() => (window as RaceWindow).exportPreferenceGate.release());
  await expect(page.locator('.statusbar')).toContainText(
    '读取导出设置期间文稿已有更改，已取消导出',
  );
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'save_export_html' || call.command === 'open_print_preview',
      ),
    ),
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  const runtimeUrl = process.env.RECOVERY_TEST_RUNTIME_URL;
  if (runtimeUrl)
    await page.addInitScript((url) => {
      if (window !== window.top) return;
      const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      const previous = internals.invoke;
      internals.invoke = (command, args) =>
        command === 'editor_runtime_url' ? Promise.resolve(url) : previous(command, args);
    }, runtimeUrl);
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

test('switching documents while export preferences load cancels the old request', async ({
  page,
}) => {
  await deferExportPreferences(page);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = {
      id: 'doc-b',
      path: '/mock/B.md',
      text: 'Only B document',
      encoding: 'UTF-8',
    };
    mock.emitMenu('open');
  });
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await expectCancelledWithoutOutput(page);
});

test('switching away and back with identical bytes still cancels the old export', async ({
  page,
}) => {
  await deferExportPreferences(page);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = { id: 'doc-b', path: '/mock/B.md', text: 'Alpha', encoding: 'UTF-8' };
    mock.emitMenu('open');
  });
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = { id: 'doc-a', path: '/mock/A.md', text: 'Alpha', encoding: 'UTF-8' };
    mock.emitMenu('open');
  });
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expectCancelledWithoutOutput(page);
});

test('editing the same document while preferences load cancels without saving the draft', async ({
  page,
}) => {
  await deferExportPreferences(page);
  await page.frameLocator('.marklyra-editor-frame').locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expectCancelledWithoutOutput(page);
  const source = await page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write')
    .evaluate(() => Reflect.get(window, 'editor').getMarkdown() as string);
  expect(source).toBe('AlphaX');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'save_document' || call.command === 'save_document_as',
      ),
    ),
  ).toEqual([]);
});

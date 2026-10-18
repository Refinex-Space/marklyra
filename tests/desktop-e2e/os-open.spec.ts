import { expect, type Page, test } from '@playwright/test';
import { installMock, type MockDocument, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

interface OsMock {
  queue: MockDocument[];
  takes: { reuseCurrent: boolean }[];
  completions: { token: string; accepted: boolean }[];
  windows: MockDocument[];
  defer: boolean;
  pending: boolean;
  release(): void;
}
type OsWindow = TestWindow & { __osMock: OsMock };
function installOsMock() {
  if (window !== window.top) return;
  const target = window as OsWindow;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internals.invoke;
  let serial = 0;
  let release: (() => void) | null = null;
  const candidates = new Map<string, MockDocument>();
  const mock: OsMock = {
    queue: [],
    takes: [],
    completions: [],
    windows: [],
    defer: false,
    pending: false,
    release() {
      release?.();
      release = null;
    },
  };
  target.__osMock = mock;
  internals.invoke = async (command, args = {}) => {
    if (command === 'take_os_open') {
      const reuse = args.reuseCurrent === true;
      mock.takes.push({ reuseCurrent: reuse });
      const next = mock.queue.shift();
      if (!next) return null;
      if (!reuse) {
        mock.windows.push(next);
        return { kind: 'handled' };
      }
      const token = `os-open-${++serial}`;
      candidates.set(token, next);
      const result = { kind: 'document', token, document: next };
      if (mock.defer) {
        mock.pending = true;
        return new Promise((resolve) => {
          release = () => {
            mock.pending = false;
            resolve(result);
          };
        });
      }
      return result;
    }
    if (command === 'complete_os_open') {
      const token = String(args.token),
        accepted = args.accepted === true;
      mock.completions.push({ token, accepted });
      const file = candidates.get(token);
      if (file && !accepted) mock.windows.push(file);
      candidates.delete(token);
      return null;
    }
    return previous(command, args);
  };
}
async function setup(page: Page) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installOsMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
}
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const mock = (window as OsWindow).__osMock;
    return { takes: mock.takes, completions: mock.completions, windows: mock.windows };
  });
async function enqueue(page: Page) {
  await page.evaluate(() => {
    const target = window as OsWindow;
    const file = {
      id: 'os-a',
      path: '/mock/系统 中文.md',
      text: '\ufeff# 系统打开\r\n\r\nkeep  \n',
      encoding: 'UTF-8 BOM',
    };
    target.__desktopMock.nextDocument = file;
    target.__osMock.queue.push(file);
    target.__desktopMock.emitEvent('os-open-pending', null);
  });
}
test('OS queue reuses the blank runtime editor and preserves BOM/mixed endings on no-op save', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
  expect(identity).toBeTruthy();
  await enqueue(page);
  await expect(page.locator('.document-title')).toHaveText('系统 中文.md');
  await expect
    .poll(async () => (await snapshot(page)).completions)
    .toEqual([{ token: 'os-open-1', accepted: true }]);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('\ufeff# 系统打开\r\n\r\nkeep  \n');
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
  expect((await snapshot(page)).windows).toEqual([]);
  expect(errors).toEqual([]);
});
test('dirty OS-open routing preserves the original SDK instance, source, undo and draft without a save dialog', async ({
  page,
}) => {
  await setup(page);
  await write(page).click();
  await page.keyboard.type('Keep this draft');
  await expect(write(page)).toHaveText('Keep this draft');
  const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
  expect(identity).toBeTruthy();
  await enqueue(page);
  await expect.poll(async () => (await snapshot(page)).windows.length).toBe(1);
  expect((await snapshot(page)).takes.at(-1)?.reuseCurrent).toBe(false);
  await expect(write(page)).toHaveText('Keep this draft');
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeHidden();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toHaveText('Keep this draf');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toHaveText('Keep this draft');
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
});
test('input arriving while Native prepares an OS candidate is retained and candidate is moved to its own window', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as OsWindow).__osMock.defer = true;
  });
  await enqueue(page);
  await expect.poll(() => page.evaluate(() => (window as OsWindow).__osMock.pending)).toBe(true);
  await write(page).click();
  await page.keyboard.type('Concurrent draft');
  await expect(write(page)).toHaveText('Concurrent draft');
  await page.evaluate(() => (window as OsWindow).__osMock.release());
  await expect
    .poll(async () => (await snapshot(page)).completions)
    .toEqual([{ token: 'os-open-1', accepted: false }]);
  await expect.poll(async () => (await snapshot(page)).windows.length).toBe(1);
  await expect(write(page)).toHaveText('Concurrent draft');
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeHidden();
});
test('modal UI defers OS delivery until the current operation closes', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '偏好设置', exact: true });
  await expect(dialog).toBeVisible();
  const before = (await snapshot(page)).takes.length;
  await enqueue(page);
  await page.waitForTimeout(1200);
  expect((await snapshot(page)).takes).toHaveLength(before);
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).completions.length).toBe(1);
  await expect(page.locator('.document-title')).toHaveText('系统 中文.md');
});

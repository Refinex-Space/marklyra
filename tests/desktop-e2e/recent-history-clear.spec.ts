import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';
import { installRecentMock, type RecentMockWindow } from './recent.helpers.js';

type ClearWindow = RecentMockWindow & {
  historyClear: { confirm: boolean; calls: number };
};

// Model only the native confirmation and metadata IPC; Rust tests exercise the real stores.
function installHistoryClearMock() {
  if (window !== window.top) return;
  const host = window as ClearWindow;
  host.historyClear = { confirm: false, calls: 0 };
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke;
  internal.invoke = async (command, args = {}) => {
    if (command !== 'ask_clear_recent_history') return previous(command, args);
    host.historyClear.calls++;
    if (!host.historyClear.confirm) return false;
    await previous('clear_recent_files');
    return true;
  };
}

test('confirmed settings clear empties recent-file access while cancel preserves entries and files', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(installRecentMock);
  await page.addInitScript(installHistoryClearMock);
  await readyLayout(page, 'marklyra-light');
  const path = '/mock/README.md';
  const source = '\uFEFF# Original\r\n\r\nKeep  \n';
  await page.evaluate(
    ({ path, source }) => (window as ClearWindow).__recentMock.seed(path, source),
    { path, source },
  );
  const panel = page.getByRole('dialog', { name: '最近文件', exact: true });
  await emitLayoutMenu(page, 'recent-files');
  await expect(
    panel.getByRole('button', { name: `打开最近文件 ${path}`, exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: `打开最近文件 ${path}`, exact: true }).click();
  const heading = page.frameLocator('.marklyra-editor-frame').locator('#write h1');
  await expect(heading).toHaveText('Original');
  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  const clear = ui.getByRole('button', { name: '清除历史文件记录', exact: true });
  await clear.click();
  await expect.poll(() => page.evaluate(() => (window as ClearWindow).historyClear.calls)).toBe(1);
  await expect(clear).toBeEnabled();
  expect(await page.evaluate(() => (window as ClearWindow).__recentMock.entries.length)).toBe(1);
  await page.evaluate(() => {
    (window as ClearWindow).historyClear.confirm = true;
  });
  await clear.click();
  await expect.poll(() => page.evaluate(() => (window as ClearWindow).historyClear.calls)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => (window as ClearWindow).__recentMock.entries.length))
    .toBe(0);
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(heading).toHaveText('Original');
  await emitLayoutMenu(page, 'recent-files');
  await expect(panel).toContainText('暂无最近打开的文件');
  await expect(panel.locator('.recent-file-open')).toHaveCount(0);
  expect(
    await page.evaluate((path) => (window as ClearWindow).__recentMock.files[path]?.text, path),
  ).toBe(source);
  await panel.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await emitLayoutMenu(page, 'recent-files');
  await expect(panel).toContainText('暂无最近打开的文件');
  await expect(panel.locator('.recent-file-open')).toHaveCount(0);
});

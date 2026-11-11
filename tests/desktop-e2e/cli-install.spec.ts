import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

/** `cli_*` commands answer from an in-page status; `foreign` simulates someone else's file. */
async function setup(page: Page, start: { installed: boolean; ours: boolean }) {
  await installLayout(page);
  await page.addInitScript((initial) => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const previous = host.__TAURI_INTERNALS__.invoke;
    const status = {
      path: '/Users/me/.local/bin/marklyra',
      directory: '/Users/me/.local/bin',
      installed: initial.installed,
      ours: initial.ours,
      current: initial.installed && initial.ours,
      onPath: false,
    };
    host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
      if (!name.startsWith('cli_')) return previous(name, args);
      host.__desktopMock.calls.push({ command: name, args });
      if (name === 'cli_install')
        Object.assign(status, { installed: true, ours: true, current: true });
      if (name === 'cli_uninstall')
        Object.assign(status, { installed: false, ours: false, current: false });
      return { ...status };
    };
  }, start);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'cli:install');
  return page.getByRole('dialog', { name: '命令行工具' });
}

test('installing the command line shows where it goes and how to reach it from PATH', async ({
  page,
}) => {
  const dialog = await setup(page, { installed: false, ours: false });
  await expect(dialog).toContainText('/Users/me/.local/bin/marklyra');
  await expect(dialog).toContainText('未安装');
  await dialog.getByRole('button', { name: '安装' }).click();
  await expect(dialog).toContainText('已安装');
  await expect(dialog).toContainText('export PATH="/Users/me/.local/bin:$PATH"');
  await expect(dialog.getByRole('button', { name: '完成' })).toBeVisible();
  await dialog.getByRole('button', { name: '卸载' }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        // Status reads may repeat (development effects run twice); writes happen once each.
        .filter((c) => c.command.startsWith('cli_') && c.command !== 'cli_status')
        .map((c) => c.command),
    ),
  ).toEqual(['cli_install', 'cli_uninstall']);
});

test("someone else's marklyra file is left alone", async ({ page }) => {
  const dialog = await setup(page, { installed: true, ours: false });
  await expect(dialog).toContainText('不是 MarkLyra 安装的');
  await expect(dialog.getByRole('button', { name: /安装/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '卸载' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

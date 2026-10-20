import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

test('settings updater persists opt-in, reports failures, downloads only on request and closes its modal before install', async ({
  page,
}, info) => {
  await installLayout(page);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const previous = host.__TAURI_INTERNALS__.invoke;
    const state = {
      currentVersion: '0.1.0',
      automatic: sessionStorage.getItem('update-auto') === 'true',
      phase: '',
      version: null as string | null,
      downloaded: 0,
      total: null as number | null,
      message: '',
    };
    let checks = 0;
    host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (!command.startsWith('app_update_')) return previous(command, args);
      host.__desktopMock.calls.push({ command, args });
      if (command === 'app_update_status') return { ...state };
      if (command === 'app_update_automatic') {
        state.automatic = args.automatic === true;
        sessionStorage.setItem('update-auto', String(state.automatic));
      }
      if (command === 'app_update_check') {
        if (++checks === 1) throw Error('无法连接更新服务');
        if (state.phase !== 'ready') {
          state.phase = 'available';
          state.version = '0.2.0';
        }
      }
      if (command === 'app_update_download') {
        state.phase = 'downloading';
        state.downloaded = 50;
        state.total = 100;
        host.__desktopMock.emitEvent('app-update-changed', { ...state });
        await new Promise<void>((resolve) => {
          Reflect.set(window, '__completeUpdateDownload', resolve);
        });
        state.phase = 'ready';
        state.downloaded = 100;
      }
      host.__desktopMock.emitEvent('app-update-changed', { ...state });
    };
  });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await ui.getByRole('button', { name: '通用', exact: true }).click();
  const automatic = ui.locator('[data-marklyra-preference="enableAutoUpdate"]');
  await expect(automatic).toBeEnabled();
  await expect(automatic).not.toBeChecked();
  await automatic.check();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('update-auto'))).toBe('true');
  await ui.locator('[data-marklyra-update-check]').click();
  const dialog = page.getByRole('dialog', { name: '软件更新' });
  await expect(dialog.getByRole('alert')).toContainText('无法连接更新服务');
  await expect(dialog).toBeFocused();
  await expect(dialog.getByRole('button', { name: '关闭弹窗' })).not.toBeFocused();
  await page.screenshot({ path: info.outputPath('update-initial.png') });
  await dialog.getByRole('button', { name: '检查更新', exact: true }).hover();
  await page.screenshot({ path: info.outputPath('update-hover.png') });
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeFocused();
  await dialog.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(dialog).toContainText('新版本 0.2.0');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (call) => call.command === 'app_update_download',
          ).length,
      ),
    )
    .toBe(0);
  await dialog.getByRole('button', { name: '下载更新' }).click();
  await expect(dialog).toContainText('50%');
  await page.evaluate(() => {
    const complete = Reflect.get(window, '__completeUpdateDownload') as () => void;
    complete();
    Reflect.deleteProperty(window, '__completeUpdateDownload');
  });
  await expect(dialog).toContainText('签名校验通过');
  await page.screenshot({ path: info.outputPath('update-ready.png') });
  await dialog.getByRole('button', { name: '安装并重启' }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (call) => call.command === 'app_update_install',
          ).length,
      ),
    )
    .toBe(1);
  // Native save/cancel/restart is tested separately; IPC double does not install anything.
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(page.locator('.runtime-preferences-frame')).toHaveCount(0);
  await emitLayoutMenu(page, 'preferences');
  await ui.getByRole('button', { name: '通用', exact: true }).click();
  await expect(automatic).toBeChecked();
});

for (const fallback of [false, true]) {
  test(`automatic discovery only shows a dismissible notice in the dark theme (fallback=${fallback})`, async ({
    page,
  }, info) => {
    await installLayout(page);
    if (fallback)
      await page.addInitScript(() => {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          value: undefined,
          configurable: true,
        });
      });
    await readyLayout(page, 'marklyra-dark');
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.emitEvent('app-update-changed', {
        currentVersion: '0.1.0',
        automatic: true,
        phase: 'available',
        version: '0.2.0',
        downloaded: 0,
        total: null,
        message: '',
      }),
    );
    const notice = page.locator('.app-update-notice');
    await expect(notice).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some((call) =>
          ['app_update_download', 'app_update_install'].includes(call.command),
        ),
      ),
    ).toBe(false);
    await notice.getByRole('button', { name: '查看更新' }).click();
    const dialog = page.getByRole('dialog', { name: '软件更新' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(dialog).toHaveCSS('background-color', 'rgb(13, 17, 23)');
    await page.screenshot({ path: info.outputPath('update-dark.png') });
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '下载更新' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(notice).not.toBeVisible();
  });
}

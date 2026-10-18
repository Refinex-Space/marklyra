import { expect, test } from '@playwright/test';
import { baseFileTypes } from '../../apps/desktop/src/features/settings/runtime-preferences/file-types.js';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

function installTypesMock(catalog: string[]) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  };
  const original = host.__TAURI_INTERNALS__.invoke;
  const state = {
    ...host.__desktopMock.filePreferences,
    supportedFileTypes: catalog,
    disabledFileTypes: [] as string[],
    fail: false,
  };
  Reflect.set(window, '__fileTypesState', state);
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'get_file_preferences') return structuredClone(state);
    if (command === 'put_file_preference') {
      if (state.fail) throw Error('文件类型保存失败测试');
      if (args.expectedRevision !== state.revision) throw Error('文件类型版本冲突');
      const change = args.change as { key: string; value: unknown };
      if (change.key === 'disabledFileTypes') {
        state.disabledFileTypes = [...(change.value as string[])];
        if (state.disabledFileTypes.includes(state.defaultExtension))
          state.defaultExtension =
            state.supportedFileTypes.find((id) => id && !state.disabledFileTypes.includes(id)) ||
            'md';
      } else if (change.key === 'defaultExtension') {
        state.defaultExtension = String(change.value);
        if (!state.supportedFileTypes.includes(state.defaultExtension))
          state.supportedFileTypes.push(state.defaultExtension);
      } else throw Error('Unexpected preference');
      state.revision++;
      host.__desktopMock.emitEvent('file-preferences-changed', structuredClone(state));
      host.__desktopMock.emitEvent('workspace-files-changed', null);
      return structuredClone(state);
    }
    return original(command, args);
  };
}
for (const theme of ['github', 'night']) {
  test(`${theme}: file types save, restore, update the default and preserve the active document`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(installTypesMock, [...baseFileTypes]);
    await readyLayout(page, theme);
    const source = '# Enabled file types\n\nExisting document stays editable.\n';
    await openLayoutDocument(page, source);
    const editor = await page.locator('.runtime-area iframe').elementHandle();
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await expect(ui.locator('.settings-file-types-count')).toHaveText('16 / 16 已启用');
    await expect(ui.getByRole('switch')).toHaveCount(16);
    const txt = ui.getByRole('switch', { name: '.txt 文件类型', exact: true });
    await txt.scrollIntoViewIfNeeded();
    await txt.focus();
    await expect(txt).toBeFocused();
    const node = await txt.elementHandle();
    const scroll = await ui.locator('.pane').evaluate((el) => el.scrollTop);
    await txt.press('Space');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Reflect.get(window, '__fileTypesState').disabledFileTypes.includes('txt'),
        ),
      )
      .toBe(true);
    expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
    expect(await ui.locator('.pane').evaluate((el) => el.scrollTop)).toBe(scroll);
    await expect(txt).toBeFocused();
    await expect(ui.getByRole('switch', { name: '.txt 文件类型', exact: true })).not.toBeChecked();
    await ui.getByRole('switch', { name: '.md 文件类型', exact: true }).uncheck();
    await expect(ui.getByRole('combobox', { name: '默认新建文件类型' })).toHaveValue('markdown');
    await expect(ui.locator('.settings-file-types-count')).toHaveText('14 / 16 已启用');
    await expect(ui.locator('.settings-default-type option[value="md"]')).toHaveCount(0);
    await ui.getByRole('button', { name: '返回应用', exact: true }).click();
    expect(await editor?.evaluate((el) => el.isConnected)).toBe(true);
    await saveLayoutSource(page, info, 'disabled-type-keeps-active-document', source);
    await emitLayoutMenu(page, 'preferences');
    await expect(ui.getByRole('switch', { name: '.md 文件类型', exact: true })).not.toBeChecked();
    await expect(ui.getByRole('switch', { name: '.txt 文件类型', exact: true })).not.toBeChecked();
    await ui.getByRole('switch', { name: '.md 文件类型', exact: true }).check();
    await expect(ui.getByRole('switch', { name: '.md 文件类型', exact: true })).toBeChecked();
    await ui.getByRole('combobox', { name: '默认新建文件类型' }).selectOption(':custom');
    const custom = ui.getByRole('textbox', { name: '自定义扩展名', exact: true });
    await custom.fill('notes.md');
    await ui.locator('.settings-page-heading').click();
    await expect(ui.getByRole('combobox', { name: '默认新建文件类型' })).toHaveValue('notes.md');
    await expect(ui.getByRole('switch', { name: '.notes.md 文件类型', exact: true })).toBeChecked();
    await ui.getByRole('switch', { name: '.notes.md 文件类型', exact: true }).uncheck();
    await expect(
      ui.getByRole('switch', { name: '.notes.md 文件类型', exact: true }),
    ).not.toBeChecked();
    await expect(ui.getByRole('combobox', { name: '默认新建文件类型' })).toHaveValue('md');
    await page.screenshot({ path: info.outputPath('file-types.png') });
    await page.setViewportSize({ width: 700, height: 700 });
    expect(await ui.locator('.pane').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

test('a failed file type save restores its switch and preserves the confirmed configuration', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(installTypesMock, [...baseFileTypes]);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.getByRole('switch', { name: '.txt 文件类型', exact: true })).toBeChecked();
  await page.evaluate(() => {
    Reflect.get(window, '__fileTypesState').fail = true;
  });
  await ui.getByRole('switch', { name: '.txt 文件类型', exact: true }).click();
  await expect(page.locator('.preferences-window-error')).toBeVisible();
  await expect(ui.getByRole('switch', { name: '.txt 文件类型', exact: true })).toBeChecked();
  expect(
    await page.evaluate(() => Reflect.get(window, '__fileTypesState').disabledFileTypes),
  ).toEqual([]);
});

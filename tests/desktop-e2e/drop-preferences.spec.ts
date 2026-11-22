import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const keys = ['actionWhenDropFolder', 'actionWhenDropFile', 'actionWhenDropImport'] as const;

for (const platform of ['windows', 'macos'] as const) {
  test(`${platform}: file settings reflect support for dropping documents and folders`, async ({
    page,
  }) => {
    await installLayout(page, undefined, platform === 'windows' ? 'web' : 'appkit');
    await readyLayout(page, 'marklyra-light');
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '文件', exact: true }).click();
    const group = ui.locator('.input-group[data-section-title="拖放行为"]');
    await expect(group).toBeVisible();
    for (const key of keys) {
      const select = group.locator(`select[data-marklyra-preference="${key}"]`);
      await expect(select).toBeVisible();
      if (platform === 'windows') await expect(select).toBeDisabled();
      else {
        await expect(select).toBeEnabled();
        await select.selectOption('link');
        await expect
          .poll(() =>
            page.evaluate((key) => (window as TestWindow).__desktopMock.filePreferences[key], key),
          )
          .toBe('link');
      }
    }
    if (platform === 'windows') {
      await expect(group).toContainText(/Windows.*暂不支持/);
      await expect(group).toContainText('打开文件夹…');
      await expect(group).toContainText('打开…');
      await expect(group).toContainText('导入…');
      await expect(group).toContainText(/图片.*拖入/);
      await ui.getByRole('searchbox', { name: '搜索设置' }).fill('拖入文件夹');
      await expect(group.getByText(/Windows.*暂不支持/)).toBeVisible();
      for (const key of keys)
        await expect(group.locator(`select[data-marklyra-preference="${key}"]`)).toBeDisabled();
    } else {
      await expect(group).not.toContainText('Windows');
    }
  });
}

test('Windows still imports a browser File dropped into the editor', async ({ page }) => {
  await installLayout(page, undefined, 'web');
  await page.addInitScript(() => {
    if (window !== window.top) {
      Reflect.set(window, '__dropTestFile', File);
      return;
    }
    const host = window as TestWindow;
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internals.invoke;
    internals.invoke = async (command, args = {}) => {
      if (command === 'initialise_native_drop') return false;
      if (command === 'import_document_image') {
        host.__desktopMock.calls.push({ command, args });
        return { source: 'assets/drop.png', url: `data:image/png;base64,${args.base64}` };
      }
      return previous(command, args);
    };
  });
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, '# 图片\n\n正文');
  const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
  const paragraph = frame.locator('#write > p').last();
  await paragraph.click();
  await paragraph.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1] ?? ''), (c) =>
      c.charCodeAt(0),
    );
    const NativeFile = Reflect.get(window, '__dropTestFile') as typeof File;
    const transfer = new DataTransfer();
    transfer.items.add(new NativeFile([bytes], 'drop.png', { type: 'image/png' }));
    const box = el.getBoundingClientRect();
    el.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: box.x + 2,
        clientY: box.y + 2,
      }),
    );
  });
  await expect(frame.locator('#write img')).toBeVisible();
  await expect
    .poll(() => frame.locator('#write img').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(2);
  const imports = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'import_document_image'),
  );
  expect(imports).toHaveLength(1);
  expect(imports[0]?.args).toMatchObject({ id: 'layout-current', name: 'drop.png' });
});

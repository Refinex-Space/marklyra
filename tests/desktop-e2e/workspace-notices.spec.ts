import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const SKIPPED = '已跳过 1 个符号链接、不可读或不支持的名称。';

async function installSkippedListing(page: Page) {
  await installLayout(page);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const original = internal.invoke;
    internal.invoke = async (command, args = {}) => {
      if (command === 'list_directory') {
        const listing = (await original(command, args)) as Record<string, unknown>;
        return { ...listing, skipped: 1 };
      }
      return original(command, args);
    };
  });
}

async function openTree(page: Page) {
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
}

test('skipped names are announced in the window corner, not in the tree, and fade away', async ({
  page,
}) => {
  await installSkippedListing(page);
  await openTree(page);
  const notice = page.locator('.notice-host .notice');
  await expect(notice).toHaveText(new RegExp(SKIPPED));
  await expect(page.locator('.workspace-sidebar').getByText(SKIPPED)).toHaveCount(0);
  await expect(page.locator('.workspace-hint, .workspace-limit')).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const box = document.querySelector('.notice-host .notice')?.getBoundingClientRect();
    if (!box) throw new Error('missing notice');
    return {
      rightGap: window.innerWidth - box.right,
      bottomGap: window.innerHeight - box.bottom,
      left: box.left,
      width: window.innerWidth,
    };
  });
  expect(geometry.rightGap).toBeLessThan(40);
  expect(geometry.bottomGap).toBeLessThan(80);
  expect(geometry.left).toBeGreaterThan(geometry.width / 2);

  await expect(notice).toHaveCount(0, { timeout: 9000 });
});

test('a notice can be dismissed by hand', async ({ page }) => {
  await installSkippedListing(page);
  await openTree(page);
  const notice = page.locator('.notice-host .notice');
  await expect(notice).toHaveCount(1);
  await notice.getByRole('button', { name: '关闭提示' }).click();
  await expect(notice).toHaveCount(0);
});

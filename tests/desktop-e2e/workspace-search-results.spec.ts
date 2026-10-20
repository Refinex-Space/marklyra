import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const MATCHES = 450;

/** The host answers every search with `total` matches spread over files; 450 means "cut at the cap". */
async function installSearch(page: Page, total = MATCHES) {
  await installLayout(page);
  await page.addInitScript(
    ({ total, capped }) => {
      if (window !== window.top) return;
      const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      const original = internal.invoke;
      const searches: Record<string, unknown>[] = [];
      Reflect.set(window, '__searches', searches);
      internal.invoke = async (command, args = {}) => {
        if (command !== 'search_workspace') return original(command, args);
        searches.push(args);
        return {
          matches: Array.from({ length: total }, (_, index) => ({
            relativePath: `folder/note-${String(index % 90).padStart(3, '0')}.md`,
            line: index + 1,
            column: 1,
            matchLength: 2,
            expectedText: '需要',
            matchFingerprint: '0000000000000000',
            sourceFingerprint: '0000000000000000',
            preview: `第 ${index} 处 需要 预览`,
            previewMatchStart: 6,
            previewMatchLength: 2,
          })),
          scannedFiles: 90,
          scannedEntries: 120,
          readBytes: 1000,
          skipped: {
            nonUtf8: 0,
            unsupportedEncoding: 0,
            tooLarge: 0,
            unreadable: 0,
            symlinks: 0,
            unsupportedNames: 0,
            ignored: 7,
          },
          truncated: capped,
          truncationReasons: capped ? ['results'] : [],
        };
      };
    },
    { total, capped: total >= MATCHES },
  );
}

async function search(page: Page, text: string) {
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:workspace-search');
  const box = page.getByRole('searchbox', { name: '搜索文件', exact: true });
  await expect(box).toBeFocused();
  await box.fill(text);
}

test('search shows no limit or filter prose, counts matches and draws rows a page at a time', async ({
  page,
}) => {
  await installSearch(page);
  await search(page, '需要');
  const rows = page.locator('.workspace-results button');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('.workspace-search-status')).toHaveText(
    `找到 ${MATCHES}+ 处匹配，位于 90 个文件`,
  );
  // Neither the filter note nor the "limit reached" warning is shown any more.
  await expect(
    page.getByText(/按文件浏览过滤规则|已达到搜索或读取上限|结果不完整|上限/),
  ).toHaveCount(0);
  await expect(page.locator('.workspace-search .workspace-limit')).toHaveCount(0);
  // The whole set is held but only a page of rows is drawn; scrolling draws more.
  expect(await rows.count()).toBeLessThanOrEqual(100);
  const panel = page.locator('aside.sidebar .workspace-panel:not([hidden])');
  for (let step = 0; step < 8; step++) {
    await panel.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => rows.count()).toBe(MATCHES);
  // One request carries the generous default instead of a small page.
  const calls = await page.evaluate(
    () => Reflect.get(window, '__searches') as { maxResults: number }[],
  );
  expect(calls.at(-1)?.maxResults).toBe(5000);
});

test('a small result set is counted exactly', async ({ page }) => {
  await installSearch(page, 3);
  await search(page, '需要');
  await expect(page.locator('.workspace-search-status')).toHaveText('找到 3 处匹配，位于 3 个文件');
  await expect(page.locator('.workspace-results button')).toHaveCount(3);
  await expect(page.getByText(/按文件浏览过滤规则|上限/)).toHaveCount(0);
});

test('an empty result says so plainly without mentioning scan ranges', async ({ page }) => {
  await installSearch(page, 0);
  await search(page, '需要');
  await expect(page.getByText('没有找到匹配。')).toBeVisible();
  await expect(page.getByText(/已扫描范围|上限/)).toHaveCount(0);
});

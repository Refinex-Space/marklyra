import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const TOTAL = 600;

/** The document list is an index of names; previews are read only for rows that are shown. */
async function installArticles(page: Page, options: { listDelay?: number } = {}) {
  await installLayout(page);
  await page.addInitScript(
    ({ total, listDelay }) => {
      if (window !== window.top) return;
      const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      const original = internal.invoke;
      const summaryCalls: string[][] = [];
      Reflect.set(window, '__summaryCalls', summaryCalls);
      internal.invoke = async (command, args = {}) => {
        if (command === 'list_workspace_documents') {
          await new Promise((resolve) => setTimeout(resolve, listDelay));
          const entries = Array.from({ length: total }, (_, index) => {
            const name = `note-${String(index).padStart(4, '0')}.md`;
            return {
              name,
              relativePath: name,
              folderName: 'Layout Fixtures',
              folderRelativePath: '',
              size: 10,
              modifiedAt: 1_700_000_000_000 + index,
              createdAt: 1_700_000_000_000 + index,
              summary: '',
              summaryTruncated: false,
            };
          });
          return {
            entries,
            truncated: false,
            scannedFiles: total,
            scannedEntries: total,
            readBytes: 0,
            skipped: {
              symlinks: 0,
              unsupportedNames: 0,
              unreadable: 0,
              unsupportedEncoding: 0,
              ignored: 0,
            },
            truncationReasons: [],
          };
        }
        if (command === 'read_workspace_document_summaries') {
          const paths = args.relativePaths as string[];
          summaryCalls.push(paths);
          return paths.map((relativePath) => ({
            relativePath,
            state: relativePath === 'note-0003.md' ? 'ignored' : 'ready',
            size: 10,
            modifiedAt: 1_700_000_000_000,
            createdAt: 1_700_000_000_000,
            summary: `Preview of ${relativePath}`,
            summaryTruncated: false,
          }));
        }
        return original(command, args);
      };
    },
    { total: TOTAL, listDelay: options.listDelay ?? 0 },
  );
}

async function openArticles(page: Page) {
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:articles');
}

const requested = (page: Page) =>
  page.evaluate(() => (Reflect.get(window, '__summaryCalls') as string[][]).flat());

test('the document list shows a quiet skeleton, not loading text, while it is read', async ({
  page,
}) => {
  await installArticles(page, { listDelay: 1500 });
  await openArticles(page);
  const skeleton = page.locator('.sidebar-skeleton[data-variant="articles"]');
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-label', '正在读取');
  await expect(skeleton).toHaveText('');
  await expect(page.getByText(/读取文档|读取目录|加载中/)).toHaveCount(0);
  await expect(skeleton).toHaveCount(0);
  await expect(page.locator('button.workspace-article').first()).toBeVisible();
});

test('rows are drawn a page at a time and previews are read only for visible rows', async ({
  page,
}) => {
  await installArticles(page);
  await openArticles(page);
  const rows = page.locator('button.workspace-article');
  await expect(rows.first()).toBeVisible();
  // Never the whole index at once.
  expect(await rows.count()).toBeLessThanOrEqual(120);
  await expect(page.locator('.workspace-article-summary').first()).toContainText('Preview of');
  const firstWave = await requested(page);
  expect(firstWave.length).toBeGreaterThan(0);
  expect(firstWave.length).toBeLessThan(250);
  expect(firstWave).toContain('note-0000.md');
  expect(firstWave).not.toContain('note-0599.md');
  // A hidden / unavailable document leaves the list.
  await expect(page.locator('button[data-article-path="note-0003.md"]')).toHaveCount(0);
  // Scrolling to the end draws further pages and reads their previews.
  const panel = page.locator('aside.sidebar .workspace-panel:not([hidden])');
  for (let step = 0; step < 8; step++) {
    await panel.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => rows.count()).toBeGreaterThan(120);
  await expect.poll(async () => (await requested(page)).length).toBeGreaterThan(firstWave.length);
  const last = page.locator('button.workspace-article').last();
  await expect(last.locator('.workspace-article-summary')).toContainText('Preview of');
  // Each preview is requested once.
  const all = await requested(page);
  expect(new Set(all).size).toBe(all.length);
});

test('the change check no longer shows a time-limit message', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const original = internal.invoke;
    Reflect.set(window, '__snapshotCalls', 0);
    internal.invoke = async (command, args = {}) => {
      if (command !== 'snapshot_workspace') return original(command, args);
      Reflect.set(
        window,
        '__snapshotCalls',
        (Reflect.get(window, '__snapshotCalls') as number) + 1,
      );
      return {
        fingerprint: 'a',
        scannedEntries: 571,
        unreadable: 0,
        truncated: true,
        truncationReasons: ['time'],
      };
    };
  });
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await expect(page.locator('.workspace-limit')).toHaveCount(0);
  await expect(page.getByText(/目录变化检查/)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__snapshotCalls') as number))
    .toBeGreaterThan(0);
});

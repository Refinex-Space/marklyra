import { expect, type Page, test } from '@playwright/test';
import type {
  WorkspaceArticlesReport,
  WorkspaceCatalogSnapshot,
  WorkspaceSearchMatch,
  WorkspaceSearchReport,
} from '../../apps/desktop/src/services/workspaces.js';
import { installCreationMock } from './creation-test-util.js';
import { installMock } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';
import { installRenameMock, type RenameWindow } from './rename-test-util.js';

interface ExplorerProbe {
  fingerprint: string;
  snapshotCalls: number;
  holdSnapshot: boolean;
  snapshotError: boolean;
  truncated: boolean;
  unreadable: number;
  snapshots: (() => void)[];
  lists: (() => void)[];
  holdList: boolean;
  searches: ((report: WorkspaceSearchReport) => void)[];
  searchCalls: number;
  modificationTimes: Record<string, number>;
  releaseSnapshots(): void;
  releaseLists(): void;
  releaseSearch(index: number, path: string, truncated?: boolean): void;
}
type ExplorerWindow = RenameWindow & { __explorerProbe: ExplorerProbe };
const runtimeUrl = process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
const source = '\uFEFFAlpha 😀needle\r\n\r\nTail  \n';

function installExplorerProbe(configuration: { holdInitialSnapshot: boolean }) {
  if (window !== window.top) return;
  const host = window as ExplorerWindow;
  host.__desktopMock.startupBoot.document = {
    id: 'explorer-document',
    path: '/mock/Creation/Existing.md',
    text: '\uFEFFAlpha 😀needle\r\n\r\nTail  \n',
    encoding: 'UTF-8',
  };
  host.__desktopMock.nextDocument = { ...host.__desktopMock.startupBoot.document };
  host.__creationMock.entries.push({
    name: 'Nested.md',
    relativePath: 'Folder/Nested.md',
    kind: 'file',
    size: 5,
  });
  host.__creationMock.entries.push({
    name: 'Second.md',
    relativePath: 'Second.md',
    kind: 'file',
    size: 5,
  });
  const probe: ExplorerProbe = {
    fingerprint: 'first',
    snapshotCalls: 0,
    holdSnapshot: configuration.holdInitialSnapshot,
    snapshotError: false,
    truncated: false,
    unreadable: 0,
    snapshots: [],
    lists: [],
    holdList: false,
    searches: [],
    searchCalls: 0,
    modificationTimes: { 'Existing.md': 100, 'Second.md': 200 },
    releaseSnapshots() {
      this.holdSnapshot = false;
      for (const release of this.snapshots.splice(0)) release();
    },
    releaseLists() {
      this.holdList = false;
      for (const release of this.lists.splice(0)) release();
    },
    releaseSearch(index, path, truncated = false) {
      const resolve = this.searches.splice(index, 1)[0];
      if (!resolve) throw Error('No pending search');
      const match: WorkspaceSearchMatch = {
        relativePath: path,
        line: 1,
        column: 9,
        matchLength: 6,
        preview: 'Alpha 😀needle',
        previewMatchStart: 8,
        previewMatchLength: 6,
      };
      resolve({
        matches: [match],
        scannedFiles: 1,
        scannedEntries: 3,
        readBytes: 40,
        truncated,
        truncationReasons: truncated ? ['entries', 'depth', 'bytes', 'time'] : [],
        skipped: {
          nonUtf8: 1,
          unsupportedEncoding: 1,
          ignored: 2,
          tooLarge: 1,
          unreadable: 1,
          symlinks: 1,
          unsupportedNames: 0,
        },
      });
    },
  };
  host.__explorerProbe = probe;
  const internal = Reflect.get(host, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke;
  internal.invoke = async (command, args = {}) => {
    if (command === 'snapshot_workspace') {
      probe.snapshotCalls++;
      if (probe.holdSnapshot) await new Promise<void>((resolve) => probe.snapshots.push(resolve));
      const snapshot: WorkspaceCatalogSnapshot = {
        fingerprint: probe.fingerprint,
        scannedEntries: 3,
        unreadable: probe.unreadable,
        truncated: probe.truncated,
        truncationReasons: probe.truncated ? ['entries', 'depth'] : [],
      };
      if (probe.snapshotError) throw Error('Permission denied');
      return snapshot;
    }
    if (command === 'search_workspace') {
      probe.searchCalls++;
      return new Promise<WorkspaceSearchReport>((resolve) => probe.searches.push(resolve));
    }
    if (command === 'list_directory') {
      const listing: unknown = structuredClone(await previous(command, args));
      if (probe.holdList) await new Promise<void>((resolve) => probe.lists.push(resolve));
      return listing;
    }
    if (command === 'list_workspace_documents') {
      const report = (await previous(command, args)) as WorkspaceArticlesReport;
      return {
        ...report,
        entries: report.entries.map((entry) => ({
          ...entry,
          modifiedAt: probe.modificationTimes[entry.relativePath] ?? entry.modifiedAt,
        })),
      };
    }
    return previous(command, args);
  };
}

async function boot(page: Page, articles = false, holdInitialSnapshot = false) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, { runtimeUrl, articles });
  await page.addInitScript(installRenameMock);
  await page.addInitScript(installExplorerProbe, { holdInitialSnapshot });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.snapshotCalls))
    .toBeGreaterThan(0);
}
const row = (page: Page, path: string) => page.locator(`button[data-entry-path="${path}"]:visible`);
const lists = (page: Page) =>
  page.evaluate(
    () =>
      (window as ExplorerWindow).__desktopMock.calls.filter(
        (call) => call.command === 'list_directory',
      ).length,
  );
async function history(page: Page) {
  return page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write')
    .evaluate(() => {
      const runtime = Reflect.get(window, 'editor') as {
        undo: { commandStack: unknown; index: number };
      };
      return JSON.stringify([runtime.undo.commandStack, runtime.undo.index]);
    });
}
async function editorSelection(page: Page) {
  return page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write')
    .evaluate(() => {
      const selection = getSelection();
      return [
        selection?.anchorNode?.textContent,
        selection?.anchorOffset,
        selection?.focusNode?.textContent,
        selection?.focusOffset,
        document.activeElement?.id,
      ];
    });
}

test('a late initial metadata baseline refreshes mutations that occurred after the initial listing', async ({
  page,
}) => {
  await boot(page, false, true);
  await expect(row(page, 'Existing.md')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.snapshots.length))
    .toBe(1);
  await page.evaluate(() => {
    const host = window as ExplorerWindow;
    host.__creationMock.entries.push({
      name: 'DuringBaseline.md',
      relativePath: 'DuringBaseline.md',
      kind: 'file',
      size: 5,
    });
    host.__explorerProbe.fingerprint = 'changed-during-baseline';
    host.__explorerProbe.releaseSnapshots();
  });
  await expect(row(page, 'DuringBaseline.md')).toBeVisible();
});

test('metadata checks refresh external add/remove while keeping the expanded tree and editor history', async ({
  page,
}) => {
  await boot(page);
  await row(page, 'Folder').click();
  await expect(row(page, 'Folder/Nested.md')).toBeVisible();
  await page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write > p')
    .first()
    .evaluate((paragraph) => {
      const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode();
      if (!text) throw Error('Expected editor text');
      paragraph.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(text, 2, text, 2);
    });
  const selection = await editorSelection(page);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const beforeHistory = await history(page);
  await page.evaluate(() => {
    const host = window as ExplorerWindow;
    host.__creationMock.entries.push({
      name: 'New.md',
      relativePath: 'Folder/New.md',
      kind: 'file',
      size: 5,
    });
    host.__creationMock.entries.splice(
      host.__creationMock.entries.findIndex((entry) => entry.relativePath === 'Folder/Nested.md'),
      1,
    );
    host.__explorerProbe.fingerprint = 'external-add-remove';
  });
  await expect(row(page, 'Folder/New.md')).toBeVisible({ timeout: 6000 });
  await expect(row(page, 'Folder/Nested.md')).toHaveCount(0);
  await expect(row(page, 'Folder')).toHaveAttribute('aria-expanded', 'true');
  expect(await history(page)).toBe(beforeHistory);
  expect(await editorSelection(page)).toEqual(selection);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await page.evaluate(() => (window as ExplorerWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as ExplorerWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe(source);
});

test('refresh signals during naming are deferred and consumed after the name commits', async ({
  page,
}) => {
  await boot(page);
  await row(page, 'Existing.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '重命名…', exact: true }).click();
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  await input.fill('命名草稿.md');
  const before = await lists(page);
  await page.evaluate(() => {
    const host = window as ExplorerWindow;
    host.__creationMock.entries.push({
      name: 'External.md',
      relativePath: 'External.md',
      kind: 'file',
      size: 5,
    });
    host.__desktopMock.emitEvent('workspace-files-changed', null);
  });
  await expect(input).toHaveValue('命名草稿.md');
  expect(await lists(page)).toBe(before);
  await expect(row(page, 'External.md')).toHaveCount(0);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(row(page, 'External.md')).toBeVisible();
  await expect(row(page, '命名草稿.md')).toBeVisible();
});

test('a relocated capability invalidates late listings and late metadata checks', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const host = window as ExplorerWindow;
    host.__explorerProbe.holdList = true;
    host.__explorerProbe.holdSnapshot = true;
    host.__desktopMock.emitEvent('workspace-files-changed', null);
  });
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.lists.length))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.snapshots.length))
    .toBe(1);
  await page.evaluate(async () => {
    const host = window as ExplorerWindow;
    host.__creationMock.entries.splice(1, 1, {
      name: 'Relocated.md',
      relativePath: 'Relocated.md',
      kind: 'file',
      size: 2,
    });
    host.__explorerProbe.holdList = false;
    host.__explorerProbe.holdSnapshot = false;
    host.__explorerProbe.fingerprint = 'new-root';
    const internal = Reflect.get(host, '__TAURI_INTERNALS__') as {
      invoke(command: string, args: Record<string, unknown>): Promise<unknown>;
    };
    await internal.invoke('__test_relocate_workspace', { path: '/mock/Relocated', revision: 2 });
  });
  await expect(row(page, 'Relocated.md')).toBeVisible();
  const before = await lists(page);
  await page.evaluate(() => {
    const probe = (window as ExplorerWindow).__explorerProbe;
    probe.releaseLists();
    probe.releaseSnapshots();
  });
  await expect(row(page, 'Existing.md')).toHaveCount(0);
  await expect(row(page, 'Relocated.md')).toBeVisible();
  expect(await lists(page)).toBe(before);
});

test('directory changes cancel an old search and show explicit scan and encoding boundaries', async ({
  page,
}) => {
  await boot(page);
  await page.getByRole('button', { name: '全文搜索', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('needle');
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.searches.length))
    .toBe(1);
  await page.evaluate(() =>
    (window as ExplorerWindow).__desktopMock.emitEvent('workspace-files-changed', null),
  );
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.searches.length))
    .toBe(2);
  await page.evaluate(() =>
    (window as ExplorerWindow).__explorerProbe.releaseSearch(1, '新位置/目标😀.md', true),
  );
  await expect(page.locator('.workspace-result-path')).toHaveText('目标😀.md');
  await expect(page.locator('.workspace-result-hit')).toHaveText('needle');
  await expect(page.getByText(/达到扫描条目数、目录深度、读取字节数、扫描时间上限/)).toBeVisible();
  await expect(page.getByText(/1 个不支持的编码文件/)).toBeVisible();
  await expect(page.getByText(/过滤规则排除了 2 个项目/)).toBeVisible();
  await page.evaluate(() => (window as ExplorerWindow).__explorerProbe.releaseSearch(0, 'Old.md'));
  await expect(page.locator('.workspace-result-path')).toHaveText('目标😀.md');
  await expect(page.getByText('Old.md', { exact: true })).toHaveCount(0);
});

test('metadata checks stay serial and disclose truncation and unreadable roots', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const probe = (window as ExplorerWindow).__explorerProbe;
    probe.holdSnapshot = true;
    probe.truncated = true;
  });
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.snapshots.length))
    .toBe(1);
  const before = await page.evaluate(
    () => (window as ExplorerWindow).__explorerProbe.snapshotCalls,
  );
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => (window as ExplorerWindow).__explorerProbe.snapshotCalls)).toBe(
    before,
  );
  await page.evaluate(() => (window as ExplorerWindow).__explorerProbe.releaseSnapshots());
  await expect(page.getByText(/目录变化检查已达到条目数、目录深度上限/)).toBeVisible();
  await page.evaluate(() => {
    (window as ExplorerWindow).__explorerProbe.unreadable = 1;
  });
  await expect(page.getByText(/目录变化检查有 1 项无法检查/)).toBeVisible({ timeout: 6000 });
  await page.evaluate(() => {
    (window as ExplorerWindow).__explorerProbe.snapshotError = true;
  });
  await expect(page.getByText(/目录变化检查失败：Error: Permission denied/)).toBeVisible({
    timeout: 6000,
  });
});

test('external save metadata refreshes article dates and the existing modified-time sort', async ({
  page,
}) => {
  await boot(page, true);
  await expect(row(page, 'Second.md')).toBeVisible();
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '修改时间', exact: true }).click();
  await page.keyboard.press('Escape');
  const rootOrder = () =>
    page
      .locator('[data-article-path]')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('data-article-path'))
          .filter((path) => !path?.includes('/')),
      );
  await expect.poll(rootOrder).toEqual(['Existing.md', 'Second.md']);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const before = await history(page);
  await page.evaluate(() => {
    const probe = (window as ExplorerWindow).__explorerProbe;
    probe.modificationTimes['Existing.md'] = Date.now();
    probe.fingerprint = 'external-save-time';
  });
  await expect.poll(rootOrder, { timeout: 6000 }).toEqual(['Second.md', 'Existing.md']);
  await expect(row(page, 'Existing.md').locator('.workspace-article-time')).toHaveText('just now');
  expect(await history(page)).toBe(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
});

test('different partial metadata observations do not repeatedly refresh or restart a search', async ({
  page,
}) => {
  await boot(page);
  const before = await lists(page);
  await page.evaluate(() => {
    const probe = (window as ExplorerWindow).__explorerProbe;
    probe.truncated = true;
    probe.fingerprint = 'partial-prefix-one';
  });
  await expect(page.getByText(/目录变化检查已达到条目数、目录深度上限/)).toBeVisible({
    timeout: 6000,
  });
  await expect.poll(() => lists(page)).toBeGreaterThan(before);
  await page.getByRole('button', { name: '全文搜索', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('needle');
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.searchCalls))
    .toBe(1);
  const stable = await lists(page);
  const snapshotCalls = await page.evaluate(
    () => (window as ExplorerWindow).__explorerProbe.snapshotCalls,
  );
  await page.evaluate(() => {
    (window as ExplorerWindow).__explorerProbe.fingerprint = 'partial-prefix-two';
  });
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.snapshotCalls), {
      timeout: 6000,
    })
    .toBeGreaterThan(snapshotCalls);
  expect(await lists(page)).toBe(stable);
  expect(await page.evaluate(() => (window as ExplorerWindow).__explorerProbe.searchCalls)).toBe(1);
  await page.evaluate(() => {
    const probe = (window as ExplorerWindow).__explorerProbe;
    probe.truncated = false;
    probe.fingerprint = 'complete-again';
  });
  await expect
    .poll(() => page.evaluate(() => (window as ExplorerWindow).__explorerProbe.searchCalls), {
      timeout: 6000,
    })
    .toBe(2);
});

import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type Flow = {
  disk: Record<string, string>;
  events: string[];
  saveError: boolean;
  catalogReads: number;
};
type FileWindow = TestWindow & {
  fileFlow: Flow;
  __TAURI_INTERNALS__: {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
};
const raw = 'Alpha\r\n\r\nTail';
function installFileFlow(options: { save: boolean; system: boolean; failure?: boolean }) {
  if (window !== window.top) return;
  const host = window as FileWindow,
    previous = host.__TAURI_INTERNALS__.invoke;
  host.__desktopMock.filePreferences.saveFileOnSwitch = options.save;
  host.__desktopMock.filePreferences.alwaysConfirmsChanges = options.system;
  host.fileFlow = {
    disk: { 'A.md': 'Alpha\r\n\r\nTail', 'B.md': 'Beta' },
    events: [],
    saveError: false,
    catalogReads: 0,
  };
  if (options.failure) host.__desktopMock.filePreferencesError = 'Preference storage failed';
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'select_workspace') return { id: 'files', path: '/mock/files', name: 'Files' };
    if (command === 'search_workspace')
      return {
        matches: [{ relativePath: 'A.md', line: 3, column: 1, matchLength: 4, preview: 'Tail' }],
        scannedFiles: 2,
        skipped: { nonUtf8: 0, tooLarge: 0, unreadable: 0, symlinks: 0, unsupportedNames: 0 },
        truncated: false,
      };
    if (command === 'list_workspace_documents') {
      host.fileFlow.catalogReads++;
      return {
        entries: Object.entries(host.fileFlow.disk).map(([name, summary]) => ({
          name,
          relativePath: name,
          folderName: 'Files',
          folderRelativePath: '',
          summary,
          summaryTruncated: false,
          size: summary.length,
          modifiedAt: 0,
          createdAt: 0,
        })),
        truncated: false,
        scannedFiles: 2,
        scannedEntries: 2,
        readBytes: 32,
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
    if (command === 'list_directory')
      return {
        entries: Object.keys(host.fileFlow.disk).map((name) => ({
          name,
          relativePath: name,
          kind: 'file',
          size: 20,
        })),
        truncated: false,
        skipped: 0,
      };
    if (command === 'open_workspace_document' || command === 'open_recent_file') {
      const name = command === 'open_recent_file' ? 'B.md' : String(args.relativePath);
      host.fileFlow.events.push(`open:${name}`);
      const file = {
        id: name,
        path: `/mock/files/${name}`,
        text: host.fileFlow.disk[name] ?? '',
        encoding: 'UTF-8',
      };
      host.__desktopMock.nextDocument = file;
      return file;
    }
    if (command === 'save_document') {
      const name = String(args.id);
      host.fileFlow.events.push(`save-start:${name}`);
      if (host.fileFlow.saveError) throw Error('Automatic save failed');
      const result = (await previous(command, args)) as {
        id: string;
        path: string;
        text: string;
        encoding: string;
      };
      host.fileFlow.disk[name] = String(args.text);
      host.fileFlow.events.push(`save-finish:${name}`);
      return { ...result, path: `/mock/files/${name}` };
    }
    return previous(command, args);
  };
}
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
async function start(page: Page, save: boolean, system = true, failure = false) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installFileFlow, { save, system, failure });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
  await expect(page.locator('[data-article-path]')).toHaveCount(2);
  await page.locator('[data-article-path="A.md"]').click();
  await expect(write(page)).toHaveText('AlphaTail');
}
async function edit(page: Page, text = 'X') {
  await write(page)
    .locator('p')
    .first()
    .evaluate((p) => {
      const node = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
      if (!node) throw Error('Missing paragraph');
      p.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(
        node,
        node.textContent?.length ?? 0,
        node,
        node.textContent?.length ?? 0,
      );
    });
  await page.keyboard.type(text);
  await expect(write(page)).toContainText(`Alpha${text}`);
}
const flow = (page: Page) => page.evaluate(() => structuredClone((window as FileWindow).fileFlow));

for (const policy of [
  { save: true, system: true },
  { save: false, system: false },
])
  test(`workspace switching saves named dirty source before load (stored=${policy.save}, system confirms=${policy.system})`, async ({
    page,
  }) => {
    await start(page, policy.save, policy.system);
    const instance = await page.locator('.marklyra-editor-frame').elementHandle();
    await edit(page);
    await page.locator('[data-article-path="B.md"]').click();
    await expect(write(page)).toHaveText('Beta');
    await expect(
      page.locator('[data-article-path="A.md"] .workspace-article-summary'),
    ).toContainText('AlphaX');
    expect((await flow(page)).disk['A.md']).toBe(raw.replace('Alpha', 'AlphaX'));
    expect((await flow(page)).events).toEqual([
      'open:A.md',
      'save-start:A.md',
      'save-finish:A.md',
      'open:B.md',
    ]);
    await expect(page.getByRole('dialog', { name: '保存更改' })).toHaveCount(0);
    expect(await instance?.evaluate((element) => element.isConnected)).toBe(true);
  });
for (const policy of [
  { save: true, system: true, automatic: true },
  { save: false, system: false, automatic: true },
  { save: false, system: true, automatic: false },
])
  test(`recent-file switching honors the same save policy (stored=${policy.save}, system confirms=${policy.system})`, async ({
    page,
  }) => {
    await start(page, policy.save, policy.system);
    await edit(page);
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.emitMenu(
        'recent-open:00000000-0000-4000-8000-00000000000b',
      ),
    );
    if (policy.automatic) {
      await expect(write(page)).toHaveText('Beta');
      expect((await flow(page)).disk['A.md']).toBe(raw.replace('Alpha', 'AlphaX'));
      expect((await flow(page)).events).toEqual([
        'open:A.md',
        'save-start:A.md',
        'save-finish:A.md',
        'open:B.md',
      ]);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } else {
      await expect(page.getByRole('dialog')).toBeVisible();
      expect((await flow(page)).events).toEqual(['open:A.md']);
      expect((await flow(page)).disk['A.md']).toBe(raw);
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(write(page)).toContainText('AlphaX');
    }
  });
for (const failure of [false, true])
  test(`switch confirmation retains unsaved source when automatic writes are ${failure ? 'unavailable' : 'disabled'}`, async ({
    page,
  }) => {
    await start(page, false, true, failure);
    await edit(page);
    await page.locator('[data-article-path="B.md"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await flow(page)).events).toEqual(['open:A.md']);
    expect((await flow(page)).disk['A.md']).toBe(raw);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(write(page)).toContainText('AlphaX');
  });
test('failed switch save leaves the old document and opens explicit save/discard/cancel', async ({
  page,
}) => {
  await start(page, true);
  await edit(page);
  await page.evaluate(() => {
    (window as FileWindow).fileFlow.saveError = true;
  });
  await page.locator('[data-article-path="B.md"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await flow(page)).events).toEqual(['open:A.md', 'save-start:A.md']);
  expect((await flow(page)).disk['A.md']).toBe(raw);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(write(page)).toContainText('AlphaX');
});
test('input during automatic save remains dirty and prevents silently replacing the editor', async ({
  page,
}) => {
  await start(page, true);
  await edit(page);
  await page.evaluate(() => {
    (window as FileWindow).__desktopMock.deferSave = true;
  });
  await page.locator('[data-article-path="B.md"]').click();
  await expect
    .poll(() => page.evaluate(() => (window as FileWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await write(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('Y');
  await page.evaluate(() => {
    (window as FileWindow).__desktopMock.finishSave();
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await flow(page)).disk['A.md']).toBe(raw.replace('Alpha', 'AlphaX'));
  expect((await flow(page)).events).not.toContain('open:B.md');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(write(page)).toContainText('AlphaXY');
});
test('new unnamed SaveAs passes the actual original suggested title without changing content', async ({
  page,
}) => {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await write(page).click();
  await page.keyboard.type('New Title');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.find(
            (call) => call.command === 'save_document_as',
          )?.args,
      ),
    )
    .toMatchObject({ text: 'New Title', sourceId: null, suggestedName: 'New Title' });
  await expect(write(page)).toHaveText('New Title');
});

test('activating the current file neither saves nor reloads and keeps its original Undo', async ({
  page,
}) => {
  await start(page, true);
  await edit(page);
  await page.locator('[data-article-path="A.md"]').click();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toHaveText('AlphaTail');
  expect((await flow(page)).events).toEqual(['open:A.md']);
  expect((await flow(page)).disk['A.md']).toBe(raw);
});
test('a search hit in the current dirty file navigates without saving or replacing history', async ({
  page,
}) => {
  await start(page, true);
  await edit(page);
  await page.getByRole('button', { name: '全文搜索', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('Tail');
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).press('Enter');
  const result = page.getByRole('list', { name: '全文搜索结果' }).getByRole('button');
  await expect(result).toHaveCount(1);
  await result.click();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toHaveText('AlphaTail');
  expect((await flow(page)).events).toEqual(['open:A.md']);
  expect((await flow(page)).disk['A.md']).toBe(raw);
});

test('a native file-type change refreshes the existing catalog without replacing source or Undo', async ({
  page,
}) => {
  await start(page, true);
  await edit(page);
  const before = await flow(page),
    instance = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(() => {
    const host = window as FileWindow;
    host.__desktopMock.filePreferences.defaultExtension = 'vault';
    host.__desktopMock.emitEvent('file-preferences-changed', {
      ...host.__desktopMock.filePreferences,
    });
  });
  await expect
    .poll(async () => (await flow(page)).catalogReads)
    .toBeGreaterThan(before.catalogReads);
  await expect(write(page)).toContainText('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toHaveText('AlphaTail');
  expect((await flow(page)).events).toEqual(['open:A.md']);
  expect((await flow(page)).disk['A.md']).toBe(raw);
  expect(await instance?.evaluate((element) => element.isConnected)).toBe(true);
});

test('a newer catalog supersedes the previous save receipt without touching the active editor', async ({
  page,
}) => {
  await start(page, true);
  await edit(page);
  await page.locator('[data-article-path="B.md"]').click();
  await expect(write(page)).toHaveText('Beta');
  await expect(page.locator('[data-article-path="A.md"] .workspace-article-summary')).toContainText(
    'AlphaX',
  );
  const before = await flow(page),
    instance = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(() => {
    const host = window as FileWindow;
    host.fileFlow.disk['A.md'] = 'External update';
    host.fileFlow.disk['New.md'] = 'New file from another window';
    host.__desktopMock.emitEvent('workspace-files-changed', null);
  });
  await expect
    .poll(async () => (await flow(page)).catalogReads)
    .toBeGreaterThan(before.catalogReads);
  await expect(page.locator('[data-article-path]')).toHaveCount(3);
  await expect(page.locator('[data-article-path="A.md"] .workspace-article-summary')).toHaveText(
    'External update',
  );
  await expect(write(page)).toHaveText('Beta');
  expect((await flow(page)).events).toEqual(before.events);
  expect(await instance?.evaluate((element) => element.isConnected)).toBe(true);
});

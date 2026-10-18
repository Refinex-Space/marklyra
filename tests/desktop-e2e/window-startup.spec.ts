import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type StartupWindow = TestWindow & {
  startupControl: { release(): void };
  __TAURI_INTERNALS__: {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
};
const raw = '\uFEFF# Restored\r\n\r\nAlpha **bold** 中文\n\nTail\r\n';
function startupMock(options: {
  deferred?: boolean;
  trackFailure?: boolean;
  dirtyHandoff?: boolean;
}) {
  if (window !== window.top) return;
  const host = window as StartupWindow,
    previous = host.__TAURI_INTERNALS__.invoke;
  host.__desktopMock.startupBoot = {
    document: {
      id: 'startup-document',
      path: '/mock/startup/A.md',
      text: '\uFEFF# Restored\r\n\r\nAlpha **bold** 中文\n\nTail\r\n',
      encoding: 'UTF-8 BOM',
    },
    workspace: { id: 'startup-workspace', path: '/mock/startup', name: 'Startup' },
    warnings: [],
  };
  const saved = host.__desktopMock.startupBoot.document;
  if (!saved) throw Error('Missing startup document fixture');
  host.__desktopMock.nextDocument = saved;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  host.startupControl = { release: () => release?.() };
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'get_window_startup') {
      const result = await previous(command, args);
      if (options.deferred) await gate;
      return options.dirtyHandoff
        ? {
            ...(result as Record<string, unknown>),
            draft: { text: saved.text.replace('Alpha', 'AlphaX'), savedText: saved.text },
          }
        : result;
    }
    if (command === 'track_window_session' && options.trackFailure) {
      await previous(command, args);
      throw Error('Session metadata unavailable');
    }
    if (command === 'list_workspace_documents')
      return {
        entries: [
          {
            name: 'A.md',
            relativePath: 'A.md',
            folderName: 'Startup',
            folderRelativePath: '',
            summary: 'Restored Alpha bold 中文 Tail',
            summaryTruncated: false,
            size: 58,
            modifiedAt: 0,
            createdAt: 0,
          },
        ],
        truncated: false,
        scannedFiles: 1,
        scannedEntries: 1,
        readBytes: 58,
        skipped: {
          symlinks: 0,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 0,
        },
        truncationReasons: [],
      };
    if (command === 'list_directory')
      return {
        entries: [{ name: 'A.md', relativePath: 'A.md', kind: 'file', size: 58 }],
        truncated: false,
        skipped: 0,
      };
    return previous(command, args);
  };
}
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const calls = (page: Page, command: string) =>
  page.evaluate(
    (name) => (window as TestWindow).__desktopMock.calls.filter((call) => call.command === name),
    command,
  );
async function start(
  page: Page,
  options: { deferred?: boolean; trackFailure?: boolean; dirtyHandoff?: boolean } = {},
) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(startupMock, options);
  await page.goto('/');
  if (!options.deferred)
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}

test('native startup loads the saved file and authorized folder once, with exact save and Undo', async ({
  page,
}) => {
  await start(page);
  await expect(write(page)).toContainText('Alpha');
  await expect(page.locator('[data-article-path="A.md"]')).toBeVisible();
  expect(await calls(page, 'select_workspace')).toHaveLength(0);
  expect(await calls(page, 'get_window_startup')).toHaveLength(1);
  await expect
    .poll(async () => (await calls(page, 'track_window_session')).at(-1)?.args)
    .toEqual({
      documentId: 'startup-document',
      workspaceId: 'startup-workspace',
    });
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await write(page)
    .locator('p')
    .first()
    .evaluate((p) => {
      const text = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
      if (!text) throw Error('Missing text');
      p.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(text, 5, text, 5);
    });
  await page.keyboard.type('X');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args?.text)
    .toBe(raw.replace('Alpha', 'AlphaX'));
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toContainText('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect.poll(async () => (await calls(page, 'save_document')).at(-1)?.args?.text).toBe(raw);
  expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
});

test('late startup cannot replace input already entered into the editor', async ({ page }) => {
  await start(page, { deferred: true });
  await expect(write(page)).toBeVisible();
  await write(page).click();
  await page.keyboard.type('My input');
  await expect(write(page)).toHaveText('My input');
  const history = () =>
    write(page).evaluate(() => {
      const native = window as unknown as {
        editor: { undo: { index: number; commandStack: unknown[] } };
      };
      return {
        index: native.editor.undo.index,
        stack: JSON.stringify(native.editor.undo.commandStack),
      };
    });
  const before = await history();
  await page.evaluate(() => (window as StartupWindow).startupControl.release());
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(write(page)).toHaveText('My input');
  await expect
    .poll(async () => (await calls(page, 'close_document')).map((call) => call.args?.id))
    .toContain('startup-document');
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await history()).toEqual(before);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).not.toHaveText('My input');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toHaveText('My input');
});

test('new document and new window preserve distinct native intents after current session tracking', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('new'));
  await expect
    .poll(async () => (await calls(page, 'create_editor_window')).at(-1)?.args)
    .toEqual({ kind: 'document' });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('new-window'));
  await expect
    .poll(async () => (await calls(page, 'create_editor_window')).at(-1)?.args)
    .toEqual({ kind: 'window' });
  const all = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  for (let index = 0; index < all.length; index++)
    if (all[index]?.command === 'create_editor_window')
      expect(all[index - 1]).toMatchObject({
        command: 'track_window_session',
        args: { documentId: 'startup-document', workspaceId: 'startup-workspace' },
      });
  await expect(write(page)).toContainText('Alpha');
});

test('empty source after an Undo still owns its history when startup arrives late', async ({
  page,
}) => {
  await start(page, { deferred: true });
  await expect(write(page)).toBeVisible();
  await write(page).click();
  await page.keyboard.type('Z');
  await expect(write(page)).toHaveText('Z');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toHaveText('');
  const history = () =>
    write(page).evaluate(() => {
      const native = window as unknown as {
        editor: { undo: { index: number; commandStack: unknown[] } };
      };
      return {
        index: native.editor.undo.index,
        stack: JSON.stringify(native.editor.undo.commandStack),
      };
    });
  const before = await history();
  await page.evaluate(() => (window as StartupWindow).startupControl.release());
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(write(page)).toHaveText('');
  expect(await history()).toEqual(before);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toHaveText('Z');
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('new shortcuts inside the editing iframe keep Shift intent and preserve the document', async ({
  page,
}) => {
  await start(page);
  await write(page).locator('p').first().click();
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.keyboard.press('Meta+Shift+n');
  await expect
    .poll(async () => (await calls(page, 'create_editor_window')).at(-1)?.args)
    .toEqual({ kind: 'window' });
  await write(page).locator('p').first().click();
  await page.keyboard.press('Meta+n');
  await expect
    .poll(async () => (await calls(page, 'create_editor_window')).at(-1)?.args)
    .toEqual({ kind: 'document' });
  expect(await calls(page, 'create_editor_window')).toHaveLength(2);
  await expect(write(page)).toContainText('Alpha');
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
});

test('failed optional session metadata cannot trap a clean document window', async ({ page }) => {
  await start(page, { trackFailure: true });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('close'));
  await expect.poll(async () => (await calls(page, 'close_editor_window')).length).toBe(1);
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('a native file-window handoff retains the dirty source over its independent disk baseline', async ({
  page,
}) => {
  await start(page, { dirtyHandoff: true });
  await expect(write(page)).toContainText('AlphaX');
  await expect
    .poll(async () =>
      (await calls(page, 'update_editor_chrome')).some(
        (c) => (c.args.payload as { dirty?: boolean } | undefined)?.dirty === true,
      ),
    )
    .toBe(true);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  const paragraph = write(page).locator('p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type('Y');
  await expect(write(page)).toContainText('Y');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toContainText('AlphaX');
  await expect(write(page)).not.toContainText('Y');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toContainText('Y');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(raw.replace('Alpha', 'AlphaX'));
});

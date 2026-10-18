import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

type Decision = 'cancel' | 'discard' | 'saved' | 'unsupported';
interface Request {
  text: string;
  encoding: string | null;
  suggestedName: string | null;
}
interface Probe {
  pending: number;
  rejectWindowClose: boolean;
  requests: Request[];
  reply(choice: Decision): Promise<void>;
  fail(): void;
}
type Host = TestWindow & { __untitledClose: Probe };
function installCloseMock() {
  if (window !== window.top) return;
  const host = window as Host;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const original = internals.invoke;
  const pending: { request: Request; resolve(value: unknown): void; reject(error: Error): void }[] =
    [];
  const requests: Request[] = [];
  host.__untitledClose = {
    rejectWindowClose: false,
    get pending() {
      return pending.length;
    },
    requests,
    async reply(choice) {
      const next = pending.shift();
      if (!next) throw Error('Missing native close request');
      if (choice === 'saved') {
        // Simulated native writer; the Shell must not issue a second save dialog.
        const document = await original('save_document_as', {
          text: next.request.text,
          encoding: next.request.encoding,
          sourceId: null,
        });
        next.resolve({ kind: 'saved', document });
      } else next.resolve({ kind: choice });
    },
    fail() {
      pending.shift()?.reject(Error('controlled close save failure'));
    },
  };
  internals.invoke = (command, args) => {
    if (command === 'close_editor_window' && host.__untitledClose.rejectWindowClose) {
      host.__desktopMock.calls.push({ command, args: args ?? {} });
      return Promise.reject(Error('controlled window close failure'));
    }
    if (command !== 'prepare_untitled_close') return original(command, args);
    host.__desktopMock.calls.push({ command, args: args ?? {} });
    const request = args?.request as Request;
    requests.push(structuredClone(request));
    return new Promise((resolve, reject) => pending.push({ request, resolve, reject }));
  };
}
const area = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) => (window as Host).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
async function boot(page: Page) {
  await page.addInitScript({
    content: `(${installMock.toString()})();(${installRecoveryMock.toString()})();(${installCloseMock.toString()})();`,
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await area(page).click();
  await page.keyboard.type('Own draft');
  await expect(area(page)).toHaveText('Own draft');
}
async function close(page: Page, quit = false) {
  await page.evaluate((quit) => {
    if (quit)
      (window as Host).__desktopMock.emitEvent('application-quit-request', { token: 'quit' });
    else (window as Host).__desktopMock.emitMenu('close');
  }, quit);
  await expect.poll(() => page.evaluate(() => (window as Host).__untitledClose.pending)).toBe(1);
  expect(await page.evaluate(() => (window as Host).__untitledClose.requests[0]?.text)).toBe(
    'Own draft',
  );
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toHaveCount(0);
}
async function reply(page: Page, choice: Decision) {
  await page.evaluate((choice) => (window as Host).__untitledClose.reply(choice), choice);
}

test('untitled native cancellation preserves the editor/history/selection and cancels application quit', async ({
  page,
}) => {
  await boot(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  const before = await area(page).evaluate((area) => {
    const editor = (window as unknown as { editor: LegacyEditor }).editor;
    const selected = getSelection();
    const value = {
      editor,
      undo: editor.undo,
      commands: [...editor.undo.commandStack],
      anchor: selected?.anchorNode,
      offset: selected?.anchorOffset,
      sourceOffset: (() => {
        const range = document.createRange();
        range.selectNodeContents(area);
        if (!selected?.anchorNode) return null;
        range.setEnd(selected.anchorNode, selected.anchorOffset);
        return range.toString().length;
      })(),
    };
    Reflect.set(window, '__marklyraBeforeClose', value);
    return { hasUndo: editor.undo.hasUndo() };
  });
  expect(before.hasUndo).toBe(true);
  await close(page, true);
  await reply(page, 'cancel');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  expect((await calls(page, 'cancel_application_quit')).at(-1)?.args).toEqual({
    token: 'quit',
  });
  const preserved = await area(page).evaluate((area) => {
    const editor = (window as unknown as { editor: LegacyEditor }).editor;
    const old = Reflect.get(window, '__marklyraBeforeClose') as {
      editor: LegacyEditor;
      undo: LegacyEditor['undo'];
      commands: object[];
      anchor: Node;
      offset: number;
      sourceOffset: number | null;
    };
    const selection = getSelection();
    return {
      same:
        editor === old.editor &&
        editor.undo === old.undo &&
        old.commands.every((command, index) => editor.undo.commandStack[index] === command),
      anchor: selection?.anchorNode === old.anchor && selection.anchorOffset === old.offset,
      hasUndo: editor.undo.hasUndo(),
      sourceOffset: (() => {
        const range = document.createRange();
        range.selectNodeContents(area);
        if (!selection?.anchorNode) return null;
        range.setEnd(selection.anchorNode, selection.anchorOffset);
        return range.toString().length;
      })(),
      beforeSourceOffset: old.sourceOffset,
      oldNodeConnected: old.anchor.isConnected,
      anchorText: selection?.anchorNode?.textContent,
      anchorOffset: selection?.anchorOffset,
      beforeOffset: old.offset,
      collapsed: selection?.isCollapsed,
    };
  });
  await test.info().attach('cancel-caret-diagnostic', {
    body: JSON.stringify(preserved),
    contentType: 'application/json',
  });
  expect(preserved).toMatchObject({
    same: true,
    hasUndo: true,
    sourceOffset: 9,
    beforeSourceOffset: 9,
    collapsed: true,
  });
  await page.keyboard.type('Y');
  await expect(area(page)).toHaveText('Own draftY');
  await expect.poll(() => draftSource(page)).toBe('Own draftY');
});
for (const choice of ['discard', 'saved'] as const)
  test(`untitled native ${choice} closes only after its confirmed result`, async ({ page }) => {
    await boot(page);
    await close(page);
    expect(await calls(page, 'close_editor_window')).toEqual([]);
    await reply(page, choice);
    await expect.poll(async () => (await calls(page, 'close_editor_window')).length).toBe(1);
    expect((await calls(page, 'save_document_as')).length).toBe(choice === 'saved' ? 1 : 0);
    if (choice === 'saved')
      expect((await calls(page, 'save_document_as'))[0]?.args.text).toBe('Own draft');
  });
for (const choice of ['discard', 'saved'] as const)
  test(`late text during native ${choice} is retained instead of closing`, async ({ page }) => {
    await boot(page);
    await close(page);
    await page.keyboard.type('Y');
    await expect(area(page)).toHaveText('Own draftY');
    await reply(page, choice);
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    expect(await calls(page, 'close_editor_window')).toEqual([]);
    await expect(area(page)).toHaveText('Own draftY');
    await expect.poll(() => draftSource(page)).toBe('Own draftY');
    await expect(page.locator('.document-status')).toContainText('保存确认期间文档又有更改');
  });
test('native save failure retains the draft and does not silently retry or close', async ({
  page,
}) => {
  await boot(page);
  await close(page);
  await page.evaluate(() => (window as Host).__untitledClose.fail());
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await expect(page.locator('.document-status')).toContainText('controlled close save failure');
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  expect(await calls(page, 'save_document_as')).toEqual([]);
  await expect.poll(() => draftSource(page)).toBe('Own draft');
});
test('unsupported host explicitly retains the previous confirmation route', async ({ page }) => {
  await boot(page);
  await close(page);
  await reply(page, 'unsupported');
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeVisible();
  expect(await calls(page, 'close_editor_window')).toEqual([]);
});

test('composition arriving during the native decision refuses late discard', async ({ page }) => {
  await boot(page);
  await close(page);
  await area(page).evaluate((area) =>
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' })),
  );
  await reply(page, 'discard');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  await expect(area(page)).toHaveText('Own draft');
  await expect(page.locator('.document-status')).toContainText(/候选|compos/iu);
  await area(page).evaluate((area) =>
    area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
});

test('a failed window close after explicit discard re-protects the still-visible draft', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as Host).__untitledClose.rejectWindowClose = true;
  });
  await close(page);
  await reply(page, 'discard');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await expect(page.locator('.document-status')).toContainText('controlled window close failure');
  await expect(area(page)).toHaveText('Own draft');
  await expect.poll(() => draftSource(page)).toBe('Own draft');
  expect(await calls(page, 'close_editor_window')).toHaveLength(1);
  expect(await calls(page, 'save_document_as')).toEqual([]);
});

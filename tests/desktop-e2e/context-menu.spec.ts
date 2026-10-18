import type { ClipboardContent, ContextAction, ContextMenuRequest } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type ContextWindow = TestWindow & {
  contextMock: {
    menu: ContextMenuRequest | null;
    clipboard: ClipboardContent;
    error: boolean;
    writes: ClipboardContent[];
    openLinks: string[];
  };
};
function installContextMock() {
  if (window !== window.top) return;
  const target = window as ContextWindow;
  target.contextMock = {
    menu: null,
    clipboard: { text: 'clipboard fixture' },
    error: false,
    writes: [],
    openLinks: [],
  };
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const invoke = internal.invoke;
  internal.invoke = async (command, args = {}) => {
    const mock = target.contextMock;
    if (command === 'show_editor_context_menu') {
      mock.menu = args.request as ContextMenuRequest;
      return;
    }
    if (command === 'close_editor_context_menu') return;
    if (command === 'clipboard_read') return mock.clipboard;
    if (command === 'clipboard_write') {
      if (mock.error) throw new Error('fixture clipboard denied');
      mock.writes.push(args.data as ClipboardContent);
      return;
    }
    if (command === 'open_external_link') {
      mock.openLinks.push(String(args.url));
      return;
    }
    return invoke(command, args);
  };
}
const child = (page: Page) => page.frameLocator('.marklyra-editor-frame');
async function ready(page: Page, source = 'Alpha Bravo') {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installContextMock);
  await page.goto('/');
  await expect(child(page).locator('#write')).toBeVisible();
  await page.evaluate((text) => {
    (window as ContextWindow).__desktopMock.nextDocument.text = text;
  }, source);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write > p').first()).toBeVisible();
}
async function selectAlpha(page: Page) {
  const p = child(page).locator('#write > p').first();
  await p.click();
  await p.evaluate((p) => {
    const text = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
    if (!text || text.nodeType !== 3) throw Error('Missing text fixture');
    p.ownerDocument.getSelection()?.setBaseAndExtent(text, 5, text, 0);
  });
  const point = await p.evaluate((p) => {
    const text = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) throw Error('Missing text fixture');
    const range = p.ownerDocument.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    const box = range.getBoundingClientRect(),
      parent = p.getBoundingClientRect();
    return { x: box.left - parent.left + box.width / 2, y: box.top - parent.top + box.height / 2 };
  });
  await p.click({ button: 'right', position: point });
  await expect
    .poll(() => page.evaluate(() => (window as ContextWindow).contextMock.menu?.requestId))
    .toBeTruthy();
}
async function choose(page: Page, actionId: ContextAction) {
  await page.evaluate((actionId) => {
    const host = window as ContextWindow,
      request = host.contextMock.menu;
    if (!request) throw Error('No native menu request');
    host.__desktopMock.emitEvent('editor-context-menu-action', {
      requestId: request.requestId,
      actionId,
    });
  }, actionId);
}
async function saved(page: Page) {
  await page.evaluate(() => (window as ContextWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as ContextWindow).__desktopMock.calls.filter((c) => c.command === 'save_document')
            .length,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    () =>
      (window as ContextWindow).__desktopMock.calls
        .filter((c) => c.command === 'save_document')
        .at(-1)?.args.text,
  );
}
test('late native menu event cuts only after clipboard publication and Undo restores source', async ({
  page,
}) => {
  await ready(page);
  await selectAlpha(page);
  await choose(page, 'edit.cut');
  await expect
    .poll(() => page.evaluate(() => (window as ContextWindow).contextMock.writes.length))
    .toBe(1);
  await expect(child(page).locator('#write > p').first()).toHaveText(' Bravo');
  expect(await saved(page)).toBe(' Bravo');
  expect(await page.evaluate(() => (window as ContextWindow).contextMock.writes[0]?.text)).toBe(
    'Alpha',
  );
  await page.evaluate(() => (window as ContextWindow).__desktopMock.emitMenu('undo'));
  await expect(child(page).locator('#write > p').first()).toHaveText('Alpha Bravo');
});
test('native clipboard error reports failure and leaves the selected document untouched', async ({
  page,
}) => {
  await ready(page);
  await selectAlpha(page);
  await page.evaluate(() => {
    (window as ContextWindow).contextMock.error = true;
  });
  await choose(page, 'edit.cut');
  await expect(page.getByText(/fixture clipboard denied/)).toBeVisible();
  await expect(child(page).locator('#write > p').first()).toHaveText('Alpha Bravo');
  expect(await saved(page)).toBe('Alpha Bravo');
});
test('native paste transport uses text fallback when no HTML format is present', async ({
  page,
}) => {
  await ready(page);
  await selectAlpha(page);
  await choose(page, 'edit.pastePlain');
  await expect(child(page).locator('#write > p').first()).toHaveText('clipboard fixture Bravo');
  expect(await saved(page)).toBe('clipboard fixture Bravo');
});

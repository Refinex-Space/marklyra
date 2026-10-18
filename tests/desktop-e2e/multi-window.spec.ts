import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

const secondary = 'editor-00000000-0000-4000-8000-000000000001';
async function setup(page: Page, label: string) {
  await page.addInitScript(installMock, label);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
}
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const menu = (page: Page, action: string) =>
  page.evaluate((value) => (window as TestWindow).__desktopMock.emitMenu(value), action);
const calls = (page: Page, command: string) =>
  page.evaluate(
    (value) => (window as TestWindow).__desktopMock.calls.filter((call) => call.command === value),
    command,
  );

async function restoreLegacy(page: Page, text: string, automatic = true) {
  const panel = page.getByRole('dialog', { name: '恢复未保存的文档' });
  if (!automatic) await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel).toBeVisible();
  await panel
    .locator('li')
    .filter({ has: page.getByText(text, { exact: true }) })
    .getByRole('button', { name: '保护此本地副本', exact: true })
    .click();
  await panel
    .locator('li')
    .filter({ hasText: `${new TextEncoder().encode(text).length} 字节` })
    .getByRole('button', { name: '恢复为新文档', exact: true })
    .click();
  await expect(write(page)).toHaveText(text);
}

test('two editor windows keep independent source, undo, drafts and close cancellation', async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page, 'main');
  await page.evaluate(() => {
    localStorage.setItem('marklyra-draft', 'Main legacy draft');
    localStorage.setItem(
      'marklyra-draft:editor-00000000-0000-4000-8000-000000000099',
      'Second draft',
    );
  });
  await page.reload();
  await restoreLegacy(page, 'Main legacy draft');
  const second = await context.newPage();
  second.on('pageerror', (error) => errors.push(error.message));
  await setup(second, secondary);
  await restoreLegacy(second, 'Second draft', false);
  await write(second).click();
  await write(second).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.querySelector('p') ?? element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await second.keyboard.type('X');
  await expect(write(second)).toHaveText('Second draftX');
  await menu(second, 'undo');
  await expect(write(second)).toHaveText('Second draft');
  await expect(write(page)).toHaveText('Main legacy draft');
  await menu(second, 'redo');
  await expect(write(second)).toHaveText('Second draftX');
  await menu(second, 'close');
  const dialog = second.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
  expect(await calls(second, 'close_editor_window')).toHaveLength(0);
  await expect(write(second)).toHaveText('Second draftX');
  await expect(write(page)).toHaveText('Main legacy draft');
  // Explicit main-window restore has a native journal. A newly discovered
  // legacy copy must still survive a different window's save.
  await expect.poll(() => draftSource(page)).toBe('Main legacy draft');
  await page.evaluate(() => localStorage.setItem('marklyra-draft', 'Main legacy draft'));
  await second.getByRole('button', { name: '保存', exact: true }).click();
  await expect(second.locator('.document-title')).toHaveText('A.md');
  expect((await calls(second, 'save_document_as'))[0]?.args.text).toBe('Second draftX');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(
    'Main legacy draft',
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem('marklyra-draft:editor-00000000-0000-4000-8000-000000000099'),
    ),
  ).toBeNull();
  expect(errors).toEqual([]);
});

test('new window starts blank without consuming another window draft or offering global recovery', async ({
  context,
  page,
}) => {
  await setup(page, 'main');
  await page.evaluate(() => localStorage.setItem('marklyra-draft', 'Other unsaved text'));
  const second = await context.newPage();
  await setup(second, secondary);
  await expect(write(second)).toHaveText('');
  expect(await calls(second, 'list_recovery_drafts')).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(
    'Other unsaved text',
  );
  await second.getByRole('button', { name: '恢复草稿' }).click();
  await expect(second.getByRole('dialog', { name: '恢复未保存的文档' })).toBeVisible();
  // StrictMode mounts the manually opened panel twice in this development harness.
  expect((await calls(second, 'list_recovery_drafts')).length).toBeGreaterThan(0);
});

test('new-window button and native menu preserve dirty document and reject modal actions', async ({
  page,
}) => {
  await setup(page, 'main');
  await write(page).click();
  await page.keyboard.type('Keep this');
  await expect(page.locator('.document-title')).toHaveText('未命名 •');
  await page.getByRole('button', { name: '新建窗口' }).click();
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
  await expect(write(page)).toHaveText('Keep this');
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeHidden();
  await menu(page, 'new-window');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(2);
  await page.getByRole('button', { name: '偏好设置' }).click();
  await menu(page, 'new-window');
  await page.keyboard.press('ControlOrMeta+Shift+N');
  expect(await calls(page, 'create_editor_window')).toHaveLength(2);
  await page
    .getByRole('dialog', { name: '偏好设置' })
    .getByRole('button', { name: '完成' })
    .click();
  await expect(write(page)).toHaveText('Keep this');
  await menu(page, 'new');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(3);
  await expect(write(page)).toHaveText('Keep this');
  await write(page).click();
  await page.keyboard.press('Meta+n');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(4);
  await expect(write(page)).toHaveText('Keep this');
  await menu(page, 'close');
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeVisible();
  await menu(page, 'new-window');
  expect(await calls(page, 'create_editor_window')).toHaveLength(4);
});

test('failed native window creation reports an error without changing the current document', async ({
  page,
}) => {
  await setup(page, 'main');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await page.evaluate(() => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (name: string, args?: unknown) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;
    const invoke = internals.invoke;
    internals.invoke = (name, args) =>
      name === 'create_editor_window'
        ? Promise.reject(new Error('window capacity reached'))
        : invoke(name, args);
  });
  await page.getByRole('button', { name: '新建窗口' }).click();
  await expect(page.locator('.document-status')).toContainText('无法新建窗口');
  await expect(write(page)).toHaveText('Alpha');
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

const quit = (page: Page, token: string) =>
  page.evaluate(
    (value) =>
      (window as TestWindow).__desktopMock.emitEvent('application-quit-request', { token: value }),
    token,
  );

test('application quit cancels dirty confirmation and preserves text, then confirms a fresh token', async ({
  page,
}) => {
  await setup(page, 'main');
  await expect.poll(async () => (await calls(page, 'editor_window_ready')).length).toBe(1);
  await write(page).click();
  await page.keyboard.type('Keep on cancel');
  await expect(page.locator('.document-title')).toHaveText('未命名 •');
  await quit(page, 'quit-first');
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect.poll(async () => (await calls(page, 'cancel_application_quit')).length).toBe(1);
  expect((await calls(page, 'cancel_application_quit'))[0]?.args).toEqual({ token: 'quit-first' });
  expect(await calls(page, 'close_editor_window')).toHaveLength(0);
  await expect(write(page)).toHaveText('Keep on cancel');
  await quit(page, 'quit-second');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '保存后继续' }).click();
  await expect.poll(async () => (await calls(page, 'close_editor_window')).length).toBe(1);
  expect((await calls(page, 'close_editor_window'))[0]?.args).toEqual({ quitToken: 'quit-second' });
  expect((await calls(page, 'save_document_as'))[0]?.args.text).toBe('Keep on cancel');
});

test('application quit is cancelled during a modal and close failures reset the quit token', async ({
  page,
}) => {
  await setup(page, 'main');
  await page.getByRole('button', { name: '偏好设置' }).click();
  await quit(page, 'quit-modal');
  await expect.poll(async () => (await calls(page, 'cancel_application_quit')).length).toBe(1);
  await expect(page.getByRole('dialog', { name: '偏好设置' })).toBeVisible();
  expect(await calls(page, 'close_editor_window')).toHaveLength(0);
  await page
    .getByRole('dialog', { name: '偏好设置' })
    .getByRole('button', { name: '完成' })
    .click();
  await page.evaluate(() => {
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (name: string, args?: unknown) => Promise<unknown>;
    };
    const invoke = internals.invoke;
    internals.invoke = async (name, args) => {
      const result = await invoke(name, args);
      if (name === 'close_editor_window') throw new Error('simulated close error');
      return result;
    };
  });
  await quit(page, 'quit-error');
  await expect.poll(async () => (await calls(page, 'cancel_application_quit')).length).toBe(2);
  expect((await calls(page, 'cancel_application_quit'))[1]?.args).toEqual({ token: 'quit-error' });
  await expect(page.locator('.document-status')).toContainText('simulated close error');
  await menu(page, 'close');
  await expect.poll(async () => (await calls(page, 'close_editor_window')).length).toBe(2);
  expect((await calls(page, 'close_editor_window'))[1]?.args).toEqual({ quitToken: null });
});

test('composition blocks window creation and cancels application quit without losing input', async ({
  page,
}) => {
  await setup(page, 'main');
  await write(page).click();
  await page.keyboard.type('Original');
  await write(page).evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })),
  );
  await menu(page, 'new-window');
  await expect(page.locator('.document-status')).toContainText('请先完成输入法候选');
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  await quit(page, 'quit-composing');
  await expect.poll(async () => (await calls(page, 'cancel_application_quit')).length).toBe(1);
  expect(await calls(page, 'close_editor_window')).toHaveLength(0);
  await write(page).evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await expect(write(page)).toHaveText('Original');
});

test('failed save during application quit cancels the quit while preserving the dirty dialog', async ({
  page,
}) => {
  await setup(page, 'main');
  await write(page).click();
  await page.keyboard.type('Do not lose');
  await page.evaluate(() => {
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (name: string, args?: unknown) => Promise<unknown>;
    };
    const invoke = internals.invoke;
    internals.invoke = (name, args) =>
      name === 'save_document_as' ? Promise.reject(new Error('disk full')) : invoke(name, args);
  });
  await quit(page, 'quit-save-error');
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '保存后继续' }).click();
  await expect.poll(async () => (await calls(page, 'cancel_application_quit')).length).toBe(1);
  expect((await calls(page, 'cancel_application_quit'))[0]?.args).toEqual({
    token: 'quit-save-error',
  });
  await expect(dialog).toBeVisible();
  await expect(write(page)).toHaveText('Do not lose');
  expect(await calls(page, 'close_editor_window')).toHaveLength(0);
});

for (const sourceMode of [false, true]) {
  for (const application of [false, true]) {
    test(`cancel ${application ? 'application quit' : 'window close'} restores immediate ${sourceMode ? 'source' : 'WYSIWYG'} input and undo`, async ({
      page,
    }) => {
      await setup(page, 'main');
      await page.evaluate(() => localStorage.setItem('marklyra-draft', 'Alpha'));
      await page.reload();
      await restoreLegacy(page, 'Alpha');
      await expect(page.locator('.document-title')).toHaveText('未命名 •');
      const mirror = page
        .frameLocator('.marklyra-editor-frame')
        .locator('#typora-source .CodeMirror');
      if (sourceMode) {
        await menu(page, 'view:source');
        await expect(mirror).toBeVisible();
        await mirror.evaluate((element) => {
          const cm = Reflect.get(element, 'CodeMirror') as {
            focus(): void;
            setCursor(line: number, ch: number): void;
          };
          cm.setCursor(0, 5);
          cm.focus();
        });
      } else {
        await write(page).click();
        await write(page).evaluate((element) => {
          const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
          if (!node) throw new Error('missing Alpha text');
          const range = document.createRange();
          range.setStart(node, 5);
          range.collapse(true);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        });
      }
      if (application) await quit(page, 'quit-focus');
      else await menu(page, 'close');
      const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: '取消' }).click();
      await expect(dialog).toBeHidden();
      // No click, iframe.focus, explicit selection restore or timer after dismissal.
      await page.keyboard.type('Z');
      const value = () =>
        sourceMode
          ? mirror.evaluate((element) =>
              (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
            )
          : write(page).innerText();
      await expect.poll(value).toBe('AlphaZ');
      await menu(page, 'undo');
      await expect.poll(value).toBe('Alpha');
      expect(await calls(page, 'close_editor_window')).toHaveLength(0);
    });
  }
}

test('window-private listeners reject another window target rather than registering Any', async ({
  context,
  page,
}) => {
  await setup(page, 'main');
  const second = await context.newPage();
  await setup(second, secondary);
  for (const [target, label] of [
    [page, 'main'],
    [second, secondary],
  ] as const) {
    await target.getByRole('button', { name: '打开', exact: true }).click();
    await expect(target.locator('.document-title')).toHaveText('A.md');
    await expect
      .poll(
        async () =>
          (await calls(target, 'plugin:event|listen')).filter(
            (call) => call.args.event === 'document-disk-change',
          ).length,
      )
      .toBeGreaterThan(0);
    for (const event of [
      'menu-action',
      'application-quit-request',
      'document-disk-change',
      'tauri://close-requested',
    ]) {
      const registrations = (await calls(target, 'plugin:event|listen')).filter(
        (call) => call.args.event === event,
      );
      expect(registrations.length).toBeGreaterThan(0);
      for (const registration of registrations)
        expect(registration.args.target).toEqual({ kind: 'Window', label });
    }
    await write(target).click();
    await target.keyboard.type(label === 'main' ? 'X' : 'Y');
  }
  const before = await write(second).textContent();
  for (const target of [page, second])
    await target.evaluate(() =>
      (window as TestWindow).__desktopMock.emitTarget('main', 'menu-action', 'undo'),
    );
  await expect(write(page)).toHaveText('Alpha');
  await expect.poll(() => write(second).textContent()).toBe(before);
  await second.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'application-quit-request', {
      token: 'other-window',
    }),
  );
  expect(await calls(second, 'close_editor_window')).toHaveLength(0);
  expect(await calls(second, 'cancel_application_quit')).toHaveLength(0);
  await expect(second.getByRole('dialog', { name: '保存当前更改？' })).toBeHidden();
});

test('unsaved confirmation constrains a late iframe focus without changing the document', async ({
  page,
}) => {
  await setup(page, 'main');
  await write(page).click();
  await page.keyboard.type('Keep');
  await menu(page, 'close');
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  // A deterministic external focus request models the missing focus boundary;
  // it does not claim to identify the cause of the earlier intermittent failure.
  await page.locator('.marklyra-editor-frame').focus();
  const focus = await dialog.evaluate((element) => ({
    inside: element.contains(document.activeElement),
    active: document.activeElement?.outerHTML.slice(0, 300),
  }));
  expect(focus.inside, JSON.stringify(focus)).toBe(true);
  await expect(write(page)).toHaveText('Keep');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
});

import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import type { RecoveryMockWindow } from './recovery.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const raw = '\uFEFF# Tabs\r\n\r\nAlpha **bold** 中文\n\nTail\r\n';
const actions = ['next', 'previous', 'detach', 'merge', 'toggle'] as const;
type TabWindow = RecoveryMockWindow & {
  __tabControl: {
    defer: boolean;
    deferTrack: boolean;
    fail: boolean;
    failTrack: boolean;
    pendingTracks: number;
    release(): void;
    releaseTrack(): void;
    observations: { command: string; texts: string[] }[];
  };
};

function observeTabs() {
  if (window !== window.top) return;
  const target = window as TabWindow;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internals.invoke;
  let finish: (() => void) | undefined;
  let finishTrack: (() => void) | undefined;
  target.__tabControl = {
    defer: false,
    deferTrack: false,
    fail: false,
    failTrack: false,
    pendingTracks: 0,
    release: () => finish?.(),
    releaseTrack: () => finishTrack?.(),
    observations: [],
  };
  internals.invoke = async (command, args) => {
    if (command === 'track_window_session') {
      const result = await previous(command, args);
      const control = target.__tabControl;
      if (control.failTrack) throw new Error('Session metadata unavailable');
      if (control.deferTrack) {
        control.pendingTracks++;
        await new Promise<void>((resolve) => {
          finishTrack = resolve;
        });
        control.pendingTracks--;
      }
      return result;
    }
    if (command !== 'create_editor_window' && command !== 'native_tab_action')
      return previous(command, args);
    const control = target.__tabControl;
    control.observations.push({
      command,
      texts: Object.values(target.__recoveryMock.records)
        .filter((draft) => draft.active)
        .map((draft) => draft.text),
    });
    const result = await previous(command, args);
    if (control.fail) throw new Error('Native tabs unavailable');
    if (control.defer)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return result;
  };
}

const editorFrame = '#root .marklyra-editor-frame';
const write = (page: Page) => page.frameLocator(editorFrame).locator('#write');
const menu = (page: Page, action: string) =>
  page.evaluate((value) => (window as TestWindow).__desktopMock.emitMenu(value), action);
const calls = (page: Page, command: string) =>
  page.evaluate(
    (value) => (window as TestWindow).__desktopMock.calls.filter((call) => call.command === value),
    command,
  );
const history = (page: Page) =>
  write(page).evaluate(() => {
    const undo = (
      Reflect.get(window, 'editor') as { undo: { commandStack: unknown; index: number } }
    ).undo;
    return JSON.stringify([undo.commandStack, undo.index]);
  });

async function setup(page: Page, label = 'main', nativeChrome = false) {
  await page.addInitScript(installMock, { label, nativeChrome });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(observeTabs);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => (await calls(page, 'editor_window_ready')).length).toBe(1);
  await page.evaluate((text) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = {
      id: 'tabs-document',
      path: '/mock/Tabs.md',
      text,
      encoding: 'UTF-8 BOM',
    };
    mock.emitMenu('open');
  }, raw);
  if (!nativeChrome) await expect(page.locator('.document-title')).toHaveText('Tabs.md');
  await expect(write(page)).toContainText('Alpha');
}

async function edit(page: Page, nativeChrome = false) {
  await write(page)
    .locator('p')
    .first()
    .evaluate((element) => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
      if (!text) throw new Error('Missing Alpha text');
      element.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(text, 5, text, 5);
    });
  await page.keyboard.type('X');
  await expect(write(page)).toContainText('AlphaX');
  if (!nativeChrome) await expect(page.locator('.document-title')).toHaveText('Tabs.md •');
}

async function expectUnchangedOwner(page: Page, beforeHistory: string) {
  await expect(write(page)).toContainText('AlphaX');
  await expect(page.locator('.document-title')).toHaveText('Tabs.md •');
  expect(await history(page)).toBe(beforeHistory);
  for (const command of [
    'save_document',
    'save_document_as',
    'close_document',
    'open_native_input_document',
  ])
    expect(await calls(page, command)).toHaveLength(0);
  expect(await calls(page, 'open_document')).toHaveLength(1);
}

test('new-tab checkpoints exact dirty source and preserves editor identity and Undo/Redo', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  const iframe = await page.locator(editorFrame).elementHandle();
  const beforeHistory = await history(page);
  await menu(page, 'new-tab');
  await expect
    .poll(async () => (await calls(page, 'create_editor_window')).at(-1)?.args)
    .toEqual({
      kind: 'tab',
    });
  await expectUnchangedOwner(page, beforeHistory);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(
    await page.evaluate(() => (window as TabWindow).__tabControl.observations.at(-1)?.texts),
  ).toContain(raw.replace('Alpha', 'AlphaX'));
  const all = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  const create = all.findIndex((call) => call.command === 'create_editor_window');
  expect(all.slice(0, create).some((call) => call.command === 'track_window_session')).toBe(true);
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeHidden();
  await menu(page, 'undo');
  await expect(write(page)).not.toContainText('AlphaX');
  await menu(page, 'redo');
  await expect(write(page)).toContainText('AlphaX');
  await menu(page, 'save');
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(raw.replace('Alpha', 'AlphaX'));
});

test('native tab actions use owner IPC without loading, replacing or saving the document', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  const iframe = await page.locator(editorFrame).elementHandle();
  const beforeHistory = await history(page);
  for (const [index, action] of actions.entries()) {
    await menu(page, `tab:${action}`);
    await expect.poll(async () => (await calls(page, 'native_tab_action')).length).toBe(index + 1);
    expect((await calls(page, 'native_tab_action')).at(-1)?.args).toEqual({ action });
  }
  await expectUnchangedOwner(page, beforeHistory);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  const observations = await page.evaluate(() => (window as TabWindow).__tabControl.observations);
  expect(observations).toHaveLength(actions.length);
  for (const observation of observations)
    expect(observation.texts).toContain(raw.replace('Alpha', 'AlphaX'));
});

test('source-mode native tab operations preserve CodeMirror selection and history', async ({
  page,
}) => {
  await setup(page);
  await menu(page, 'view:source');
  const mirror = page.frameLocator(editorFrame).locator('#typora-source .CodeMirror');
  await expect(mirror).toBeVisible();
  await mirror.evaluate((element) => {
    const cm = Reflect.get(element, 'CodeMirror') as {
      getValue(): string;
      posFromIndex(offset: number): unknown;
      setCursor(position: unknown): void;
      focus(): void;
    };
    cm.setCursor(cm.posFromIndex(cm.getValue().indexOf('Alpha') + 5));
    cm.focus();
  });
  await page.keyboard.type('X');
  const state = () =>
    mirror.evaluate((element) => {
      const cm = Reflect.get(element, 'CodeMirror') as {
        getValue(): string;
        getHistory(): unknown;
        listSelections(): unknown;
      };
      return JSON.stringify([cm.getValue(), cm.getHistory(), cm.listSelections()]);
    });
  await expect(page.locator('.document-title')).toHaveText('Tabs.md •');
  const before = await state();
  const iframe = await page.locator(editorFrame).elementHandle();
  await menu(page, 'new-tab');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
  await menu(page, 'tab:detach');
  await expect.poll(async () => (await calls(page, 'native_tab_action')).length).toBe(1);
  expect(await state()).toBe(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  await menu(page, 'undo');
  await expect
    .poll(() =>
      mirror.evaluate((element) =>
        (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
      ),
    )
    .not.toContain('AlphaX');
  await menu(page, 'redo');
  await expect
    .poll(() =>
      mirror.evaluate((element) =>
        (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
      ),
    )
    .toContain('AlphaX');
  await menu(page, 'save');
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(raw.replace('Alpha', 'AlphaX'));
});

test('modal and composition guard new tabs and every native tab action without losing dirty text', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  const beforeHistory = await history(page);
  await page.getByRole('button', { name: '偏好设置' }).click();
  const preferences = page.getByRole('dialog', { name: '偏好设置' });
  await expect(preferences).toBeVisible();
  await menu(page, 'new-tab');
  for (const action of actions) await menu(page, `tab:${action}`);
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  expect(await calls(page, 'native_tab_action')).toHaveLength(0);
  await preferences.getByRole('button', { name: '完成' }).click();
  await write(page).evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })),
  );
  await menu(page, 'new-tab');
  for (const action of actions) await menu(page, `tab:${action}`);
  await expect(page.locator('.document-status')).toContainText('请先完成输入法候选');
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  expect(await calls(page, 'native_tab_action')).toHaveLength(0);
  await write(page).evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await expectUnchangedOwner(page, beforeHistory);
});

test('one pending native tab operation excludes competing window and tab requests', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  await page.evaluate(() => {
    (window as TabWindow).__tabControl.defer = true;
  });
  await menu(page, 'tab:merge');
  await expect.poll(async () => (await calls(page, 'native_tab_action')).length).toBe(1);
  await menu(page, 'new-tab');
  await menu(page, 'new-window');
  await menu(page, 'tab:next');
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  expect(await calls(page, 'native_tab_action')).toHaveLength(1);
  await page.evaluate(() => {
    const control = (window as TabWindow).__tabControl;
    control.defer = false;
    control.release();
  });
  await expect(page.getByRole('button', { name: '新建窗口' })).toBeEnabled();
  await menu(page, 'new-tab');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
  await expect(write(page)).toContainText('AlphaX');
});

test('failed native action releases the guard while keeping dirty source and history', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  const beforeHistory = await history(page);
  await page.evaluate(() => {
    (window as TabWindow).__tabControl.fail = true;
  });
  await menu(page, 'tab:detach');
  await expect(page.locator('.document-status')).toContainText('Native tabs unavailable');
  await expectUnchangedOwner(page, beforeHistory);
  await page.evaluate(() => {
    (window as TabWindow).__tabControl.fail = false;
  });
  await menu(page, 'new-tab');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
  await expectUnchangedOwner(page, beforeHistory);
});

test('failed session tracking prevents tab creation and permits a later retry without data loss', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  const beforeHistory = await history(page);
  await page.evaluate(() => {
    (window as TabWindow).__tabControl.failTrack = true;
  });
  await menu(page, 'new-tab');
  await expect(page.locator('.document-status')).toContainText('Session metadata unavailable');
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  await expectUnchangedOwner(page, beforeHistory);
  await page.evaluate(() => {
    (window as TabWindow).__tabControl.failTrack = false;
  });
  await menu(page, 'new-tab');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
  await expectUnchangedOwner(page, beforeHistory);
});

test('failed recovery checkpoint prevents native tab switching and permits a durable retry', async ({
  page,
}) => {
  await setup(page);
  await edit(page);
  const beforeHistory = await history(page);
  await page.evaluate(() => {
    (window as TabWindow).__recoveryMock.fail.checkpoint_recovery = 'Recovery disk unavailable';
  });
  await menu(page, 'tab:next');
  await expect(page.locator('.document-status')).toContainText('Recovery disk unavailable');
  expect(await calls(page, 'native_tab_action')).toHaveLength(0);
  await expectUnchangedOwner(page, beforeHistory);
  await page.evaluate(() => {
    delete (window as TabWindow).__recoveryMock.fail.checkpoint_recovery;
  });
  await menu(page, 'tab:next');
  await expect.poll(async () => (await calls(page, 'native_tab_action')).length).toBe(1);
  expect(
    await page.evaluate(() => (window as TabWindow).__tabControl.observations.at(-1)?.texts),
  ).toContain(raw.replace('Alpha', 'AlphaX'));
  await expectUnchangedOwner(page, beforeHistory);
});

for (const race of ['composition', 'input'] as const)
  test(`${race} arriving during session tracking cancels the pending native tab operation`, async ({
    page,
  }) => {
    await setup(page);
    await edit(page);
    await page.evaluate(() => {
      (window as TabWindow).__tabControl.deferTrack = true;
    });
    const action = race === 'composition' ? 'new-tab' : 'tab:next';
    await menu(page, action);
    await expect
      .poll(() => page.evaluate(() => (window as TabWindow).__tabControl.pendingTracks))
      .toBe(1);
    if (race === 'composition')
      await write(page).evaluate((element) =>
        element.dispatchEvent(
          new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
        ),
      );
    else await page.keyboard.type('Z');
    await page.evaluate(() => {
      const control = (window as TabWindow).__tabControl;
      control.deferTrack = false;
      control.releaseTrack();
    });
    await expect(page.locator('.document-status')).toContainText(
      race === 'composition' ? '请先完成输入法候选' : '文稿或窗口状态已更改',
    );
    expect(await calls(page, 'create_editor_window')).toHaveLength(0);
    expect(await calls(page, 'native_tab_action')).toHaveLength(0);
    if (race === 'composition')
      await write(page).evaluate((element) =>
        element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
      );
    await expect(write(page)).toContainText(race === 'input' ? 'AlphaXZ' : 'AlphaX');
    await menu(page, action);
    await expect
      .poll(
        async () =>
          (await calls(page, race === 'composition' ? 'create_editor_window' : 'native_tab_action'))
            .length,
      )
      .toBe(1);
    expect(await calls(page, 'save_document')).toHaveLength(0);
  });

test('same-byte document replacement during session tracking cancels the retired owner tab action', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as TabWindow).__tabControl.deferTrack = true;
  });
  await menu(page, 'tab:next');
  await expect
    .poll(() => page.evaluate(() => (window as TabWindow).__tabControl.pendingTracks))
    .toBe(1);
  await page.evaluate((text) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = {
      id: 'tabs-second-document',
      path: '/mock/Tabs-Second.md',
      text,
      encoding: 'UTF-8 BOM',
    };
    mock.emitMenu('open');
  }, raw);
  await expect(page.locator('.document-title')).toHaveText('Tabs-Second.md');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  expect(await calls(page, 'open_document')).toHaveLength(2);
  await page.evaluate(() => {
    const control = (window as TabWindow).__tabControl;
    control.deferTrack = false;
    control.releaseTrack();
  });
  await expect(page.locator('.document-status')).toContainText('文稿或窗口状态已更改');
  expect(await calls(page, 'native_tab_action')).toHaveLength(0);
  expect(await calls(page, 'create_editor_window')).toHaveLength(0);
  await expect(page.locator('.document-title')).toHaveText('Tabs-Second.md');
  await expect(write(page)).toContainText('Alpha');
  await menu(page, 'save');
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({
      id: 'tabs-second-document',
      text: raw,
    });
});

test('native tab layout events change only the titlebar inset and reject another window owner', async ({
  page,
}) => {
  await setup(page, 'main', true);
  const iframe = await page.locator(editorFrame).elementHandle();
  const beforeHistory = await history(page);
  const inset = () =>
    page
      .frameLocator(editorFrame)
      .locator('html')
      .evaluate((element) => element.style.getPropertyValue('--marklyra-content-top'));
  await expect(page.locator('.shell')).toHaveAttribute('data-native-overlay', 'true');
  await expect(page.locator('.native-titlebar-drag')).toHaveCount(1);
  await expect.poll(inset).toBe('28px');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('another-owner', 'native-tab-layout', {
      overlay: false,
    }),
  );
  await expect(page.locator('.shell')).toHaveAttribute('data-native-overlay', 'true');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'native-tab-layout', {
      overlay: false,
    }),
  );
  await expect(page.locator('.shell')).toHaveAttribute('data-native-overlay', 'false');
  await expect(page.locator('.native-titlebar-drag')).toHaveCount(0);
  await expect.poll(inset).toBe('0px');
  await expect(page.locator('aside.sidebar')).toHaveCSS('padding-top', '0px');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'native-tab-layout', { overlay: true }),
  );
  await expect(page.locator('.shell')).toHaveAttribute('data-native-overlay', 'true');
  await expect(page.locator('.native-titlebar-drag')).toHaveCount(1);
  await expect.poll(inset).toBe('28px');
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await history(page)).toBe(beforeHistory);
  await expect(write(page)).toContainText('Alpha');
  expect(await calls(page, 'open_document')).toHaveLength(1);
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('Open from a named dirty native document creates a native owner and keeps the current source', async ({
  page,
}) => {
  await setup(page, 'main', true);
  await edit(page, true);
  const iframe = await page.locator(editorFrame).elementHandle();
  const beforeHistory = await history(page);
  await menu(page, 'open');
  await expect
    .poll(async () => (await calls(page, 'create_editor_window')).at(-1)?.args)
    .toEqual({
      kind: 'open',
    });
  expect(await calls(page, 'open_document')).toHaveLength(1);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await calls(page, 'close_document')).toHaveLength(0);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await history(page)).toBe(beforeHistory);
  await expect(write(page)).toContainText('AlphaX');
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeHidden();
  expect(
    await page.evaluate(() => (window as TabWindow).__tabControl.observations.at(-1)?.texts),
  ).toContain(raw.replace('Alpha', 'AlphaX'));
});

test('native tab menu events stay with their registered window owner', async ({
  context,
  page,
}) => {
  const secondary = 'editor-00000000-0000-4000-8000-000000000019';
  await setup(page);
  const second = await context.newPage();
  await setup(second, secondary);
  for (const target of [page, second])
    await target.evaluate(() => {
      const mock = (window as TestWindow).__desktopMock;
      mock.emitTarget('main', 'menu-action', 'new-tab');
      mock.emitTarget('main', 'menu-action', 'tab:next');
    });
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
  // The immediate competing action is guarded by the in-flight creation.
  expect(await calls(second, 'create_editor_window')).toHaveLength(0);
  expect(await calls(second, 'native_tab_action')).toHaveLength(0);
  await second.evaluate((label) => {
    (window as TestWindow).__desktopMock.emitTarget(label, 'menu-action', 'tab:previous');
  }, secondary);
  await expect
    .poll(async () => (await calls(second, 'native_tab_action')).at(-1)?.args)
    .toEqual({
      action: 'previous',
    });
  await expect(write(page)).toContainText('Alpha');
  await expect(write(second)).toContainText('Alpha');
});

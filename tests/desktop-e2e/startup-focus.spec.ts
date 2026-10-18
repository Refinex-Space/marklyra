import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

for (const label of ['main', 'editor-startup-test']) {
  test(`${label} accepts first keyboard input after ready without an editor click`, async ({
    page,
  }) => {
    await page.addInitScript(installMock, label);
    await page.addInitScript(installRecoveryMock);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
    const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
    await page.keyboard.type('Start');
    await expect(write).toHaveText('Start');
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
    await expect(write).toHaveText('Star');
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
    await expect(write).toHaveText('Start');
  });
}

test('closing the automatic startup recovery chooser accepts the first key without consuming its draft', async ({
  page,
}) => {
  const source = '\uFEFF# Preserved\r\n\r\nOriginal draft\n';
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript((source) => {
    if (window === window.top) localStorage.setItem('marklyra-draft', source);
  }, source);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const chooser = page.getByRole('dialog', { name: '恢复未保存的文档' });
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(chooser).toHaveCount(0);
  await page.keyboard.type('After recovery');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText(
    'After recovery',
  );
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(source);
});

test('closing a menu recovery chooser preserves a connected Shell control instead of assigning editor input', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const control = page.getByRole('button', { name: '搜索', exact: true });
  await control.focus();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('marklyra-drafts'));
  const chooser = page.getByRole('dialog', { name: '恢复未保存的文档' });
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(chooser).toHaveCount(0);
  await expect(control).toBeFocused();
  await page.keyboard.press('Space');
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('');
});

test('a shell control focused during runtime loading keeps focus when the editor becomes ready', async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/http:\/\/127\.0\.0\.1:4174\/index\.html/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const control = page.getByRole('button', { name: '搜索', exact: true });
  await control.focus();
  await expect(control).toBeFocused();
  release();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect(control).toBeFocused();
  await page.keyboard.press('Space');
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('');
});

test('a real preferences dialog opened during a delayed initial focus keeps its chosen control', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window === window.top) return;
    let held: MessageEvent | undefined;
    let heldOnce = false;
    Reflect.set(window, '__releaseStartupFocus', () => {
      if (!held) throw new Error('No held focus request');
      const event = held;
      held = undefined;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: event.data,
          origin: event.origin,
          source: event.source,
        }),
      );
    });
    window.addEventListener('message', (event) => {
      if (
        !heldOnce &&
        event.data?.protocol === 'marklyra/editor/v1' &&
        event.data.kind === 'request' &&
        event.data.operation === 'focus'
      ) {
        heldOnce = true;
        held = event;
        Reflect.set(window, '__startupFocusHeld', true);
        event.stopImmediatePropagation();
      }
    });
  });
  await page.goto('/');
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect
    .poll(() => frame.locator('body').evaluate(() => Reflect.get(window, '__startupFocusHeld')))
    .toBe(true);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  const dialog = page.getByRole('dialog', { name: '偏好设置' });
  await expect(dialog).toBeVisible();
  const control = dialog.getByLabel('阅读速度（词 / 分钟）');
  await control.focus();
  await frame.locator('body').evaluate(() => {
    const release = Reflect.get(window, '__releaseStartupFocus') as () => void;
    release();
  });
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const focused = await control.evaluate((element) => ({
    expected: element === document.activeElement,
    active: document.activeElement?.outerHTML,
  }));
  expect(focused.expected, JSON.stringify(focused)).toBe(true);
  await expect(frame.locator('#write')).toHaveText('');
});

test('initial focus preserves a pending BOM and mixed-newline draft until explicit recovery', async ({
  page,
}) => {
  const source = '\ufeff# Existing\r\n\r\nKeep raw\n';
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript((text) => {
    if (window === window.top) localStorage.setItem('marklyra-draft', text);
  }, source);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(source);
  const recovery = page.getByRole('dialog', { name: '恢复未保存的文档' });
  await recovery.getByRole('button', { name: '保护此本地副本', exact: true }).click();
  await recovery.getByRole('button', { name: '恢复为新文档', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('未命名 •');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.find(
          (call) => call.command === 'save_document_as',
        )?.args.text,
    ),
  ).toBe(source);
});

test('native foreground authority permits initial input when DOM focus reports false', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    document.hasFocus = () => false;
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (name: string, args?: unknown) => Promise<unknown>;
    };
    const invoke = internals.invoke;
    internals.invoke = (name, args) =>
      name === 'editor_window_focused' ? Promise.resolve(true) : invoke(name, args);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.keyboard.type('Foreground');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText(
    'Foreground',
  );
});

test('native background authority suppresses the initial SDK focus request', async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) {
      Reflect.set(window, '__initialFocusRequests', 0);
      window.addEventListener('message', (event) => {
        if (
          event.data?.protocol === 'marklyra/editor/v1' &&
          event.data.kind === 'request' &&
          event.data.operation === 'focus'
        )
          Reflect.set(
            window,
            '__initialFocusRequests',
            Number(Reflect.get(window, '__initialFocusRequests')) + 1,
          );
      });
      return;
    }
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (name: string, args?: unknown) => Promise<unknown>;
    };
    const invoke = internals.invoke;
    internals.invoke = (name, args) =>
      name === 'editor_window_focused' ? Promise.resolve(false) : invoke(name, args);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  expect(
    await page
      .frameLocator('.marklyra-editor-frame')
      .locator('body')
      .evaluate(() => Reflect.get(window, '__initialFocusRequests')),
  ).toBe(0);
});

test('background startup retries once on native activation and later activations preserve Shell focus', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) {
      Reflect.set(window, '__initialFocusRequests', 0);
      window.addEventListener('message', (event) => {
        if (
          event.data?.protocol === 'marklyra/editor/v1' &&
          event.data.kind === 'request' &&
          event.data.operation === 'focus'
        )
          Reflect.set(
            window,
            '__initialFocusRequests',
            Number(Reflect.get(window, '__initialFocusRequests')) + 1,
          );
      });
      return;
    }
    Reflect.set(window, '__nativeForeground', false);
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (name: string, args?: unknown) => Promise<unknown>;
    };
    const invoke = internals.invoke;
    internals.invoke = (name, args) =>
      name === 'editor_window_focused'
        ? Promise.resolve(Reflect.get(window, '__nativeForeground'))
        : invoke(name, args);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const frame = page.frameLocator('.marklyra-editor-frame');
  const count = () =>
    frame.locator('body').evaluate(() => Reflect.get(window, '__initialFocusRequests'));
  expect(await count()).toBe(0);
  await page.evaluate(() => {
    Reflect.set(window, '__nativeForeground', true);
    (window as TestWindow).__desktopMock.emitEvent('tauri://focus', true);
  });
  await expect(frame.locator('#write')).toBeFocused();
  await expect.poll(count).toBe(1);
  await page.keyboard.type('Activated');
  await expect(frame.locator('#write')).toHaveText('Activated');
  const control = page.getByRole('button', { name: '搜索', exact: true });
  await control.focus();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.emitEvent('tauri://blur', false);
    (window as TestWindow).__desktopMock.emitEvent('tauri://focus', true);
  });
  await expect(control).toBeFocused();
  expect(await count()).toBe(1);
});

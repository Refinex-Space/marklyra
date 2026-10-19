import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { waitForNativeUndo } from './native-menu.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const outlineRaw = '\uFEFF# One\r\n\r\nAlpha\n\n## Two\r\n\r\nTail';

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  if (testInfo.title.includes('statistics fail'))
    await page.addInitScript(() => {
      if (window === window.top) return;
      const failure = { count: 0 };
      Object.assign(window, { __marklyraStatisticsFailure: failure });
      window.addEventListener('message', (event) => {
        const packet = event.data;
        if (
          packet?.protocol !== 'marklyra/editor/v1' ||
          packet.kind !== 'request' ||
          packet.operation !== 'statistics'
        )
          return;
        event.stopImmediatePropagation();
        failure.count++;
        window.parent.postMessage(
          {
            protocol: packet.protocol,
            channel: packet.channel,
            kind: 'response',
            id: packet.id,
            error: 'MarkLyra injected statistics failure',
          },
          '*',
        );
      });
    });
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-native-chrome', 'true');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) => call.command === 'editor_window_ready',
        ),
      ),
    )
    .toBe(true);
  if (
    testInfo.title ===
    'native outline action toggles an independent right panel without the legacy popover'
  )
    await page.evaluate((text) => {
      const mock = (window as TestWindow).__desktopMock;
      mock.nextDocument = { ...mock.nextDocument, id: 'outline-ui', text };
    }, outlineRaw);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    'Alpha',
  );
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
});

test('native chrome uses one sidebar header and full viewport theme geometry without replacing the editor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1640, height: 900 });
  await expect(page.locator('.toolbar')).toHaveCount(0);
  await expect(page.locator('.statusbar')).toHaveCount(0);
  await expect(page.locator('.marklyra-sidebar-header')).toBeHidden();
  await expect(page.locator('.workspace-navigation-header')).toBeVisible();
  await expect(page.locator('.sidebar-search-target')).toBeHidden();
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await expect
    .poll(async () => {
      const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
      return frame?.evaluate(() => {
        const content = document.querySelector('content'),
          write = document.querySelector('#write');
        if (!content || !write) throw new Error('Missing original editor layout');
        return {
          width: innerWidth,
          inset: getComputedStyle(content).left,
          padding: getComputedStyle(write).paddingTop,
          max: getComputedStyle(write).maxWidth,
        };
      });
    })
    // 8px window gap + 270px sidebar card + 8px gap + 1px document pane border.
    .toEqual({ width: 1640, inset: '287px', padding: '30px', max: '1024px' });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:sidebar'));
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:outline'));
  await expect(page.getByRole('complementary', { name: '文档目录' })).toBeVisible();
  expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((c) => c.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('Alpha');
});

test('native titlebar follows accepted view mode when statistics fail and preserves editing history', async ({
  page,
}) => {
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const frame = page.frameLocator('.marklyra-editor-frame');
  const paragraph = frame.locator('#write > p').last();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(paragraph).toHaveText('AlphaX');
  await waitForNativeUndo(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(paragraph).toHaveText('Alpha');
  const history = () =>
    frame.locator('body').evaluate(() => {
      const undo = (
        Reflect.get(window, 'editor') as {
          undo: { commandStack: unknown; index: number };
        }
      ).undo;
      return JSON.stringify([undo.commandStack, undo.index]);
    });
  const beforeHistory = await history();
  const mode = () =>
    page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'update_editor_chrome')
          .at(-1)?.args.payload,
    );
  await expect.poll(mode).toMatchObject({ sourceMode: false });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#typora-source')).toBeVisible();
  await expect.poll(mode).toMatchObject({ sourceMode: true });
  await expect
    .poll(() =>
      frame
        .locator('body')
        .evaluate(
          () => (Reflect.get(window, '__marklyraStatisticsFailure') as { count: number }).count,
        ),
    )
    .toBeGreaterThan(0);
  await expect.poll(mode).toMatchObject({ sourceMode: true });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#typora-source')).toBeHidden();
  await expect.poll(mode).toMatchObject({ sourceMode: false });
  for (let index = 0; index < 3; index++) {
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
    await expect.poll(mode).toMatchObject({ sourceMode: true });
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
    await expect.poll(mode).toMatchObject({ sourceMode: false });
  }
  expect(await history()).toBe(beforeHistory);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(paragraph).toHaveText('AlphaX');
  await waitForNativeUndo(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(paragraph).toHaveText('Alpha');
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('Alpha');
});

test('native title layout follows the actual reading area through both pane sizes and delayed native replies', async ({
  page,
}) => {
  const lastLayout = () =>
    page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'update_editor_title_layout')
          .at(-1)?.args.payload as
          | { contentLeft: number; contentRight: number; viewportWidth: number }
          | undefined,
    );
  const aligned = async () => {
    await expect
      .poll(async () => {
        const layout = await lastLayout();
        const area = await page.locator('main.document-area').boundingBox();
        if (!layout || !area) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(layout.contentLeft - area.x),
          Math.abs(layout.contentRight - area.x - area.width),
          Math.abs(layout.viewportWidth - (page.viewportSize()?.width ?? 0)),
        );
      })
      .toBeLessThanOrEqual(0.5);
  };
  await aligned();
  const iframe = await page.locator('.runtime-area iframe').elementHandle();
  for (const width of [960, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const key of ['Home', 'End']) {
      await page.getByRole('separator', { name: '调整侧栏宽度' }).press(key);
      await aligned();
    }
  }
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:outline'));
  const panel = page.getByRole('complementary', { name: '文档目录' });
  await expect(panel).toBeVisible();
  for (const key of ['Home', 'End']) {
    await page.getByRole('separator', { name: '调整目录宽度' }).press(key);
    await aligned();
  }
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:sidebar'));
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await aligned();
  await page.evaluate(() => {
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
    };
    const previous = host.__TAURI_INTERNALS__.invoke;
    const state = { pending: 0, maximum: 0, hold: true, release: () => {} };
    Reflect.set(window, '__titleLayoutGate', state);
    host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command !== 'update_editor_title_layout') return previous(command, args);
      state.maximum = Math.max(state.maximum, ++state.pending);
      try {
        if (state.hold)
          await new Promise<void>((resolve) => {
            state.release = resolve;
          });
        return await previous(command, args);
      } finally {
        state.pending--;
      }
    };
  });
  await page.getByRole('separator', { name: '调整目录宽度' }).press('Home');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__titleLayoutGate').pending))
    .toBe(1);
  await page.getByRole('separator', { name: '调整目录宽度' }).press('End');
  for (const action of ['view:outline', 'view:sidebar', 'view:outline'])
    await page.evaluate((action) => (window as TestWindow).__desktopMock.emitMenu(action), action);
  await page.evaluate(() => {
    const state = Reflect.get(window, '__titleLayoutGate');
    state.hold = false;
    state.release();
  });
  await aligned();
  expect(await page.evaluate(() => Reflect.get(window, '__titleLayoutGate').maximum)).toBe(1);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
});

test('native outline action toggles an independent right panel without the legacy popover', async ({
  page,
}) => {
  const raw = outlineRaw;
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect(frame.locator('#write > h1')).toHaveText('One');
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const history = () =>
    frame.locator('body').evaluate(() => {
      const undo = (
        Reflect.get(window, 'editor') as { undo: { commandStack: unknown; index: number } }
      ).undo;
      return JSON.stringify([undo.commandStack, undo.index]);
    });
  const originalHistory = await history();
  const toggle = () =>
    page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:outline'));
  const panel = page.getByRole('complementary', { name: '文档目录' });
  await toggle();
  await expect(panel).toBeVisible();
  await expect(frame.locator('#toc-dropmenu')).toBeHidden();
  await expect(panel.getByRole('treeitem')).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'update_editor_chrome')
            .at(-1)?.args.payload,
      ),
    )
    .toMatchObject({ outlinePanelOpen: true });
  await expect(page.getByRole('button', { name: '全文搜索', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:workspace-search'));
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: '返回文件', exact: true }).click();
  await toggle();
  await expect(panel).toBeHidden();
  await toggle();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: '关闭目录' })).toHaveCount(0);
  await toggle();
  await expect(panel).toBeHidden();
  await expect(page.locator('.sidebar-current-title')).toHaveCount(0);
  expect(await history()).toBe(originalHistory);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe(raw);
});

test('inline preferences synchronize typed changes and restore editor commands on return', async ({
  page,
}) => {
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'open_preferences_window',
          ).length,
      ),
    )
    .toBe(1);
  await expect(page.getByRole('dialog', { name: '偏好设置' })).toHaveCount(0);
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}');
    localStorage.setItem(
      'marklyra-preferences-v1',
      JSON.stringify({
        ...value,
        statisticsUnit: 'characters',
        alwaysShowWordCount: false,
        imageStorageFolder: '${filename}.assets',
      }),
    );
    localStorage.setItem('marklyra-theme', 'marklyra-dark');
    (window as TestWindow).__desktopMock.emitEvent('preferences-changed', null);
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((c) => c.command === 'update_editor_chrome')
            .at(-1)?.args.payload,
      ),
    )
    .toMatchObject({ alwaysShowWordCount: false, statistics: { unit: 'characters' } });
  await page
    .frameLocator('.runtime-preferences-frame')
    .getByRole('button', { name: '返回应用', exact: true })
    .click();
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('statistics-unit:lines'));
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}')),
    )
    .toMatchObject({
      statisticsUnit: 'lines',
      alwaysShowWordCount: false,
      imageStorageFolder: '${filename}.assets',
    });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((c) => c.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('Alpha');
});

test('native preferences close restores the existing editor selection and saves retain the last known count', async ({
  page,
}) => {
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p').last();
  await paragraph.click();
  await page.keyboard.press('End');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((c) => c.command === 'update_editor_chrome')
            .at(-1)?.args.payload,
      ),
    )
    .toMatchObject({ statistics: { words: 1 }, statisticsLabel: '1 词' });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  await page
    .frameLocator('.runtime-preferences-frame')
    .getByRole('button', { name: '返回应用', exact: true })
    .click();
  await expect
    .poll(() =>
      paragraph.evaluate(
        (el) =>
          el.contains(el.ownerDocument.activeElement) ||
          el.ownerDocument.querySelector('#write') === el.ownerDocument.activeElement,
      ),
    )
    .toBe(true);
  await page.keyboard.type('X');
  await expect(paragraph).toHaveText('AlphaX');
  await waitForNativeUndo(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(paragraph).toHaveText('Alpha');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((c) => c.command === 'update_editor_chrome')
            .at(-1)?.args.payload,
      ),
    )
    .toMatchObject({ statistics: { words: 1 }, statisticsLabel: '1 词' });
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferSave = true;
    (window as TestWindow).__desktopMock.emitMenu('save');
  });
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'true');
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls
          .filter((c) => c.command === 'update_editor_chrome')
          .at(-1)?.args.payload,
    ),
  ).toMatchObject({ statistics: { words: 1 }, statisticsLabel: '1 词' });
  await page.evaluate(() => (window as TestWindow).__desktopMock.finishSave());
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
});

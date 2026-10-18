import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

function settingsMock() {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  };
  const original = host.__TAURI_INTERNALS__.invoke;
  let markdown = { ...host.__desktopMock.markdownPreferences };
  const requests = new Map<
    string,
    { value: unknown; resolve(value: unknown): void; reject(error: Error): void }
  >();
  const state = { hold: false, fail: false, pending: 0, release: () => {} };
  Reflect.set(window, '__settingsSave', state);
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'get_markdown_preferences') return { ...markdown };
    if (command === 'request_preference_theme' || command === 'request_preference_markdown') {
      const token = crypto.randomUUID();
      const isMarkdown = command === 'request_preference_markdown';
      if (isMarkdown && args.expectedRevision !== markdown.revision)
        throw Error('stale Markdown preference');
      const value = isMarkdown
        ? { ...markdown, ...(args.change as object), revision: markdown.revision + 1 }
        : null;
      const result = new Promise((resolve, reject) =>
        requests.set(token, { value, resolve, reject }),
      );
      host.__desktopMock.emitEvent(
        isMarkdown ? 'preference-markdown-request' : 'preference-theme-request',
        isMarkdown
          ? { token, before: { ...markdown }, change: args.change }
          : { token, themeId: args.themeId, target: args.target },
      );
      return result;
    }
    if (command === 'complete_preference_theme' || command === 'complete_preference_markdown') {
      const request = requests.get(String(args.token));
      if (!request) throw Error('Unknown preference ticket');
      requests.delete(String(args.token));
      if (args.error) {
        request.reject(Error(String(args.error)));
        return null;
      }
      if (command === 'complete_preference_markdown') markdown = request.value as typeof markdown;
      request.resolve(request.value);
      return request.value;
    }
    if (command === 'get_startup_preferences')
      return JSON.parse(
        localStorage.getItem('mock-startup') ??
          '{"revision":0,"restoreWhenLaunch":0,"pinFolder":null}',
      );
    if (command === 'set_startup_mode') {
      const value = JSON.parse(
        localStorage.getItem('mock-startup') ??
          '{"revision":0,"restoreWhenLaunch":0,"pinFolder":null}',
      );
      if (value.revision !== args.expectedRevision) throw Error('stale startup setting');
      const next = { ...value, revision: value.revision + 1, restoreWhenLaunch: args.mode };
      localStorage.setItem('mock-startup', JSON.stringify(next));
      return next;
    }
    if (command === 'put_application_preferences' && state.fail) throw Error('保存失败测试');
    if (command === 'put_application_preferences' && state.hold) {
      state.pending++;
      await new Promise<void>((resolve) => {
        state.release = resolve;
      });
      state.pending--;
    }
    return original(command, args);
  };
}

const source =
  '\uFEFF# Settings round trip\r\n\r\n' +
  Array.from(
    { length: 90 },
    (_, index) => `Paragraph ${index}: keep the current document and editing history.\r\n\r\n`,
  ).join('');
const settings = (page: import('@playwright/test').Page) =>
  page.frameLocator('.runtime-preferences-frame');

for (const theme of ['github', 'night']) {
  test(`${theme}: settings use the main window, centered groups and return to the unchanged editor`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installLayout(page);
    await page.addInitScript(settingsMock);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    const editor = page.frameLocator('.runtime-area iframe');
    await editor.locator('#write p').first().click();
    await editor.locator('content').evaluate((element) => {
      element.scrollTop = 400;
    });
    const iframe = await page.locator('.runtime-area iframe').elementHandle();
    const history = await layoutHistory(page);
    const scroll = await editor.locator('content').evaluate((element) => element.scrollTop);
    await emitLayoutMenu(page, 'preferences');
    await expect(
      settings(page).getByRole('button', { name: '返回应用', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.shell')).toHaveAttribute('data-settings-page', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
    expect(await editor.locator('content').evaluate((element) => element.scrollTop)).toBe(scroll);
    const settingsFrame = await page.locator('.runtime-preferences-frame').elementHandle();
    await expect(settings(page).locator('html')).toHaveAttribute(
      'data-settings-dark',
      String(theme === 'night'),
    );
    const geometry = await settings(page)
      .locator('.pane')
      .evaluate((element) => {
        const pane = element.getBoundingClientRect();
        const group = element
          .querySelector('.content:not(.display-none) .input-group')
          ?.getBoundingClientRect();
        if (!group) throw Error('Missing settings group');
        return {
          width: group.width,
          center: Math.abs(group.x + group.width / 2 - pane.x - pane.width / 2),
          overflow: element.scrollWidth > element.clientWidth,
        };
      });
    expect(geometry.width).toBeLessThanOrEqual(760);
    expect(geometry.center).toBeLessThanOrEqual(2);
    expect(geometry.overflow).toBe(false);
    await settings(page)
      .locator('[data-marklyra-preference="restoreWhenLaunch"]')
      .selectOption('2');
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('mock-startup') ?? '{}').restoreWhenLaunch,
        ),
      )
      .toBe(2);
    await settings(page)
      .locator('[data-marklyra-preference="can_collapse_outline_panel"]')
      .uncheck();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.applicationPreferences.values
              .can_collapse_outline_panel,
        ),
      )
      .toBe(false);
    await settings(page).getByRole('searchbox', { name: '搜索设置', exact: true }).fill('启动');
    await expect(settings(page).locator('.settings-page-heading h1')).toHaveText('搜索结果');
    await expect(
      settings(page).locator('[data-marklyra-preference="restoreWhenLaunch"]'),
    ).toBeVisible();
    await settings(page).getByRole('searchbox', { name: '搜索设置', exact: true }).fill('');
    await settings(page).locator('.nav-group-item').nth(1).click();
    await expect(settings(page).locator('.settings-page-heading h1')).toHaveText('编辑器');
    await settings(page).locator('.nav-group-item').first().click();
    await settings(page)
      .getByRole('searchbox', { name: '搜索设置', exact: true })
      .evaluate((element) => (element as HTMLElement).blur());
    await page.screenshot({ path: info.outputPath('settings-page.png') });
    await page.setViewportSize({ width: 700, height: 600 });
    for (let category = 0; category < 7; category++) {
      await settings(page).locator('.nav-group-item').nth(category).click();
      expect(
        await settings(page)
          .locator('.pane')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await settingsFrame?.evaluate((element) => element.isConnected)).toBe(true);
    expect(await editor.locator('content').evaluate((element) => element.scrollTop)).toBe(scroll);
    await settings(page).getByRole('button', { name: '返回应用', exact: true }).click();
    await expect(page.locator('.preferences-page')).toHaveCount(0);
    await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    expect(await layoutHistory(page)).toBe(history);
    expect(await editor.locator('content').evaluate((element) => element.scrollTop)).toBe(scroll);
    await saveLayoutSource(page, info, 'settings-page-retains-document', source);
    await emitLayoutMenu(page, 'preferences');
    await expect(
      settings(page).locator('[data-marklyra-preference="restoreWhenLaunch"]'),
    ).toHaveValue('2');
    await expect(
      settings(page).locator('[data-marklyra-preference="can_collapse_outline_panel"]'),
    ).not.toBeChecked();
    await settings(page).getByRole('button', { name: '返回应用', exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test('return waits for the in-flight preference before restoring the document', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(settingsMock);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  await expect(settings(page).getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Reflect.get(window, '__settingsSave').hold = true;
  });
  await settings(page).locator('[data-marklyra-preference="can_collapse_outline_panel"]').uncheck();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__settingsSave').pending))
    .toBe(1);
  await settings(page).getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(page.locator('.preferences-page')).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'close_preferences_window',
      ),
    ),
  ).toHaveLength(0);
  await page.evaluate(() => {
    const state = Reflect.get(window, '__settingsSave');
    state.hold = false;
    state.release();
  });
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.applicationPreferences.values
          .can_collapse_outline_panel,
    ),
  ).toBe(false);
});

test('application Quit closes the settings page before running the document close flow', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(settingsMock);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  await expect(settings(page).getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitEvent('application-quit-request', {
      token: 'settings-quit',
    }),
  );
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (call) => call.command === 'close_editor_window',
          ).length,
      ),
    )
    .toBe(1);
  const commands = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.map((call) => call.command),
  );
  expect(commands.indexOf('close_preferences_window')).toBeLessThan(
    commands.indexOf('close_editor_window'),
  );
  expect(commands).not.toContain('cancel_application_quit');
});

test('keyboard return commits a valid text field that has not blurred yet', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(settingsMock);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  const ui = settings(page);
  await ui.locator('select[data-marklyra-preference="defaultExtension"]').selectOption('custom');
  const input = ui.locator('input[data-marklyra-preference="defaultExtension"]');
  await input.fill('notes');
  await input.press('Escape');
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as TestWindow).__desktopMock.filePreferences.defaultExtension,
    ),
  ).toBe('notes');
});

test('a settings frame that has not initialized can still return to the document', async ({
  page,
}) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/preferences/setting.html*', async (route) => {
    await gate;
    await route.abort().catch(() => {});
  });
  try {
    await emitLayoutMenu(page, 'preferences');
    await expect(page.locator('.runtime-preferences-frame')).toHaveCount(1);
    await emitLayoutMenu(page, 'close');
    await expect(page.locator('.preferences-page')).toHaveCount(0);
    await expect(page.locator('main.document-area')).toBeVisible();
  } finally {
    release?.();
  }
});

test('settings search updates its empty state as the query changes', async ({ page }) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  const ui = settings(page);
  const search = ui.getByRole('searchbox', { name: '搜索设置', exact: true });
  await search.fill('no-setting-matches-19381');
  await expect(ui.locator('.settings-page-heading p')).toContainText('没有找到匹配的设置');
  await search.fill('启动');
  await expect(ui.locator('.settings-page-heading p')).toHaveText('与“启动”相关的设置');
  await expect(ui.locator('[data-marklyra-preference="restoreWhenLaunch"]')).toBeVisible();
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
});

test('inline theme and Markdown settings complete through the existing editor without replacing it', async ({
  page,
}, info) => {
  await installLayout(page);
  await page.addInitScript(settingsMock);
  await readyLayout(page, 'github');
  const raw = '\uFEFFAlpha\r\n\r\nKeep  \n';
  await page.evaluate((text) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument.text = text;
    mock.emitMenu('open');
  }, raw);
  await expect(page.frameLocator('.runtime-area iframe').locator('#write')).toContainText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  const iframe = await page.locator('.runtime-area iframe').elementHandle();
  await emitLayoutMenu(page, 'preferences');
  const ui = settings(page);
  await ui.locator('.nav-group-item').nth(5).click();
  await ui.locator('[data-marklyra-preference="theme"]').selectOption('night.css');
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'night');
  await expect(ui.locator('html')).toHaveAttribute('data-settings-dark', 'true');
  await ui.locator('.nav-group-item').nth(3).click();
  await ui.locator('[data-marklyra-preference="heading_style"]').selectOption('3');
  await expect
    .poll(() =>
      page
        .frameLocator('.runtime-area iframe')
        .locator('body')
        .evaluate(() => {
          return (Reflect.get(window, 'File') as unknown as { option: { headingStyle: number } })
            .option.headingStyle;
        }),
    )
    .toBe(3);
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await saveLayoutSource(page, info, 'inline-settings-source', raw);
});

test('settings sidebar resizes live and keeps help beside labels and controls aligned', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  const frame = settings(page);
  await expect(frame.getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
  await expect(frame.locator('.settings-file-content .settings-card-start')).toHaveCount(3);
  const checkLayout = async () => {
    const metrics = await frame
      .locator('.settings-inline-setting')
      .first()
      .evaluate((group) => {
        const heading = group.querySelector('.input-group-header')?.getBoundingClientRect();
        const control = group.querySelector('select')?.getBoundingClientRect();
        const hint = group.querySelector('.label-hint')?.getBoundingClientRect();
        const slot = group.querySelector('.settings-hint-slot')?.getBoundingClientRect();
        if (!heading || !control || !hint || !slot) throw new Error('Missing settings row');
        return {
          alignment: Math.abs(heading.y + heading.height / 2 - control.y - control.height / 2),
          hintGap: Math.abs(hint.left - slot.left - 4),
          hintY: Math.abs(hint.y - slot.y),
          controlGap: control.left - heading.right,
        };
      });
    expect(metrics.alignment).toBeLessThan(2);
    expect(metrics.hintGap).toBeLessThan(2);
    expect(metrics.hintY).toBeLessThan(3);
    expect(metrics.controlGap).toBeGreaterThan(10);
  };
  await checkLayout();
  const separator = page.locator('.settings-resize-track .sidebar-resize');
  const before = await frame.locator('.sidebar').boundingBox();
  const handle = await separator.boundingBox();
  if (!before || !handle) throw new Error('Settings divider missing');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 160);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + 160);
  await expect
    .poll(async () => (await frame.locator('.sidebar').boundingBox())?.width)
    .toBeCloseTo(before.width + 60, 0);
  await page.mouse.up();
  await checkLayout();
  const paint = await page.locator('.preferences-page').evaluate((element) => ({
    band: getComputedStyle(element, '::before').backgroundImage,
    sidebar: getComputedStyle(element).getPropertyValue('--settings-sidebar-bg'),
  }));
  expect(paint.band).toContain('linear-gradient');
  expect(paint.sidebar).toBeTruthy();
  await page.screenshot({ path: info.outputPath('settings-resized.png') });
  await separator.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '440');
  await separator.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '200');
  await frame.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  await emitLayoutMenu(page, 'preferences');
  await expect.poll(async () => (await frame.locator('.sidebar').boundingBox())?.width).toBe(200);
});

test('deferred preferences notify only after saving, refresh one toast and expire across return', async ({
  page,
}, info) => {
  await installLayout(page);
  await page.addInitScript(settingsMock);
  await readyLayout(page, 'github');
  await emitLayoutMenu(page, 'preferences');
  const ui = settings(page);
  const notice = page.locator('.settings-effect-notice');
  await expect(ui.getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await ui.locator('[data-marklyra-preference="can_collapse_outline_panel"]').uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.applicationPreferences.values
            .can_collapse_outline_panel,
      ),
    )
    .toBe(false);
  await expect(notice).toHaveCount(0);
  for (const category of ['编辑器', 'Markdown']) {
    await ui.getByRole('button', { name: category, exact: true }).click();
    await expect(ui.locator('.content:not(.display-none) .panel-content-hint')).toBeHidden();
  }
  await ui.locator('[data-marklyra-preference="auto_numbering_for_math"]').selectOption('');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.applicationPreferences.values
            .auto_numbering_for_math,
      ),
    )
    .toBe('');
  await expect(notice).toHaveCount(0);
  await page.clock.install();
  await page.evaluate(() => {
    Reflect.get(window, '__settingsSave').hold = true;
  });
  await ui.locator('[data-marklyra-preference="strict_mode"]').check();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__settingsSave').pending))
    .toBe(1);
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => {
    const state = Reflect.get(window, '__settingsSave');
    state.hold = false;
    state.release();
  });
  await expect(notice).toContainText('新建窗口或重启应用后生效');
  const box = await notice.boundingBox();
  if (!box) throw Error('Missing notice');
  expect(box.x).toBeGreaterThan(800);
  expect(box.y).toBeGreaterThan(700);
  await page.screenshot({ path: info.outputPath('saved-settings-notice.png') });
  await page.clock.fastForward(5000);
  await ui.locator('[data-marklyra-preference="enable_highlight"]').check();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as TestWindow).__desktopMock.applicationPreferences.values.enable_highlight,
      ),
    )
    .toBe(true);
  await expect(notice).toHaveCount(1);
  await page.clock.fastForward(2000);
  await expect(notice).toBeVisible();
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  await expect(notice).toBeVisible();
  await page.clock.fastForward(4100);
  await expect(notice).toHaveCount(0);
  await emitLayoutMenu(page, 'preferences');
  await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
  await ui.locator('[data-marklyra-preference="show_line_numbers_for_fence"]').click();
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: '关闭设置提示', exact: true }).click();
  await expect(notice).toHaveCount(0);
});

test('failed deferred preference saves do not announce success', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(settingsMock);
  await readyLayout(page, 'night');
  await emitLayoutMenu(page, 'preferences');
  const ui = settings(page);
  await ui.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.evaluate(() => {
    Reflect.get(window, '__settingsSave').fail = true;
  });
  await ui.locator('[data-marklyra-preference="strict_mode"]').click();
  await expect(page.locator('.preferences-window-error')).toBeVisible();
  await expect(page.locator('.settings-effect-notice')).toHaveCount(0);
});

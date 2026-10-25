import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';

type ThemeTestWindow = TestWindow & { themeCommitFailure: boolean };
const themeRoot = 'http://127.0.0.1:4174/__shell_theme__/';
const token = '00000000-0000-4000-8000-000000000019';

async function mount(page: Page) {
  await page.addInitScript(installMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as ThemeTestWindow;
    host.themeCommitFailure = false;
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const invoke = internals.invoke;
    internals.invoke = async (command, args = {}) => {
      if (command === 'load_theme_styles' && ['moon', 'broken'].includes(String(args.themeId))) {
        host.__desktopMock.calls.push({ command, args });
        return {
          token: `custom-${String(args.requestId)}`,
          theme: 'marklyra-light',
          styles: {
            theme: `http://127.0.0.1:4174/__shell_theme__/${String(args.themeId)}.css`,
            baseUser: null,
            themeUser: null,
          },
        };
      }
      if (command === 'complete_preference_theme') {
        host.__desktopMock.calls.push({ command, args });
        if (host.themeCommitFailure && args.error === null)
          throw new Error('Native theme commit failed');
        return null;
      }
      return invoke(command, args);
    };
  });
  await page.route(`${themeRoot}**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'shell.woff2') {
      await route.fulfill({
        contentType: 'font/woff2',
        body: readFileSync(
          new URL(
            '../../packages/editor-runtime/dist/page/style/Raleway-latin.woff2',
            import.meta.url,
          ),
        ),
      });
    } else
      await route.fulfill({
        status: name === 'moon.css' ? 200 : 404,
        contentType: 'text/css',
        body: '@font-face{font-family:"User Shell";src:url("shell.woff2")}body{background:rgb(230,231,232)}#marklyra-sidebar{font-family:"User Shell",sans-serif;font-size:17px}#write p{color:rgb(21,42,63)}',
      });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
}
async function completed(page: Page) {
  return page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter(
      (call) => call.command === 'complete_preference_theme',
    ),
  );
}
async function request(page: Page, themeId: string) {
  await page.evaluate(
    ({ token, themeId }) =>
      (window as TestWindow).__desktopMock.emitTarget('main', 'preference-theme-request', {
        token,
        themeId,
      }),
    { token, themeId },
  );
}

test('preferences theme request confirms the real CSS and transfers fonts into the same shell', async ({
  page,
}) => {
  await mount(page);
  const frame = page.frameLocator('.marklyra-editor-frame');
  const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
  await request(page, 'moon');
  await expect.poll(() => completed(page)).toHaveLength(1);
  expect((await completed(page))[0]?.args).toMatchObject({
    token,
    error: null,
    stylesToken: expect.stringMatching(/^custom-/),
  });
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  expect(
    await frame
      .locator('#write')
      .evaluate((element) => getComputedStyle(element.ownerDocument.body).backgroundColor),
  ).toBe('rgb(230, 231, 232)');
  expect(
    await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => face.family.includes('User Shell'))
        .map((face) => ({ family: face.family, status: face.status })),
    ),
  ).toEqual([{ family: expect.stringContaining('User Shell'), status: 'loaded' }]);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('marklyra-theme-choice-v1') ?? 'null').theme,
    ),
  ).toBe('moon');
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === 'save_document'),
    ),
  ).toEqual([]);
});

test('missing theme CSS reports failure to preferences and retains the confirmed selection', async ({
  page,
}) => {
  await mount(page);
  await request(page, 'broken');
  await expect.poll(() => completed(page)).toHaveLength(1);
  expect((await completed(page))[0]?.args).toMatchObject({
    token,
    stylesToken: null,
    error: expect.stringContaining('loaded'),
  });
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('marklyra-theme-choice-v1'))).toBeNull();
  expect(await page.locator('.shell').getAttribute('data-theme-name')).toBe('marklyra-light');
});

test('native confirmation failure restores original styles, font ownership and storage', async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    (window as ThemeTestWindow).themeCommitFailure = true;
  });
  await request(page, 'moon');
  await expect.poll(() => completed(page)).toHaveLength(2);
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('marklyra-theme-choice-v1'))).toBeNull();
  expect(
    await page.evaluate(
      () => Array.from(document.fonts).filter((face) => face.family.includes('User Shell')).length,
    ),
  ).toBe(0);
  expect(await page.locator('.shell').getAttribute('data-theme-name')).toBe('marklyra-light');
  expect((await completed(page))[1]?.args).toMatchObject({
    stylesToken: null,
    error: expect.stringContaining('Native theme commit failed'),
  });
});

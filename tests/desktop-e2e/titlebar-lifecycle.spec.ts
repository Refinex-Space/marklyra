import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

interface ChromePayload {
  documentId: string | null;
  dirty: boolean;
  outlinePanelOpen: boolean;
}
type ChromeWindow = TestWindow & {
  __TAURI_INTERNALS__: {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  chromeFixture: {
    arm: boolean;
    pending: { payload: ChromePayload; finish(error?: string): void }[];
    applied: ChromePayload[];
    reported: string[];
  };
};
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
async function boot(page: Page, autoSave = false) {
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: 'web' as const,
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(
    (enabled) => localStorage.setItem('marklyra-autosave', String(enabled)),
    autoSave,
  );
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(frame(page).locator('#write')).toHaveText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) =>
            call.command === 'update_editor_chrome' &&
            (call.args.payload as { documentId: string; statistics: { words: number } })
              .documentId === 'doc-a' &&
            (call.args.payload as { statistics: { words: number } }).statistics.words > 0,
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const host = window as ChromeWindow;
    const original = host.__TAURI_INTERNALS__.invoke;
    const fixture: ChromeWindow['chromeFixture'] = {
      arm: false,
      pending: [],
      applied: [],
      reported: [],
    };
    host.chromeFixture = fixture;
    new MutationObserver(() => {
      for (const notice of document.querySelectorAll('.notice-text')) {
        const text = notice.textContent ?? '';
        if (text.includes('标题栏更新失败') && !fixture.reported.includes(text))
          fixture.reported.push(text);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    host.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command !== 'update_editor_chrome') return original(command, args);
      const payload = structuredClone(args?.payload) as ChromePayload;
      if (fixture.arm) {
        fixture.arm = false;
        await new Promise<void>((resolve, reject) =>
          fixture.pending.push({
            payload,
            finish: (error) => (error ? reject(new Error(error)) : resolve()),
          }),
        );
      }
      const result = await original(command, args);
      fixture.applied.push(payload);
      return result;
    };
  });
}
async function holdTitle(page: Page) {
  await page.evaluate(() => {
    const host = window as ChromeWindow;
    host.chromeFixture.arm = true;
    host.__desktopMock.emitMenu('view:outline');
  });
  await expect
    .poll(() => page.evaluate(() => (window as ChromeWindow).chromeFixture.pending.length))
    .toBe(1);
}
async function releaseTitle(page: Page, error?: string) {
  await page.evaluate(async (error) => {
    (window as ChromeWindow).chromeFixture.pending.shift()?.finish(error);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, error);
}

for (const action of ['switch', 'close'] as const)
  test(`late titlebar failure cannot report against the document after ${action}`, async ({
    page,
  }) => {
    await boot(page);
    await holdTitle(page);
    await page.evaluate(() => {
      const host = window as TestWindow;
      host.__desktopMock.nextDocument = {
        id: 'doc-b',
        path: '/mock/B.md',
        text: 'Beta',
        encoding: 'UTF-8',
      };
      host.__desktopMock.emitMenu('close-document');
    });
    await expect(page.locator('.home-screen')).toBeVisible();
    if (action === 'switch') {
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
      await expect(frame(page).locator('#write')).toHaveText('Beta');
    }
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as TestWindow).__desktopMock.calls.some(
            (call) => call.command === 'close_document' && call.args.id === 'doc-a',
          ),
        ),
      )
      .toBe(true);
    await releaseTitle(page, 'closed document title request');
    await expect
      .poll(() =>
        page.evaluate(() => (window as ChromeWindow).chromeFixture.applied.at(-1)?.documentId),
      )
      .toBe(action === 'switch' ? 'doc-b' : null);
    expect(await page.evaluate(() => (window as ChromeWindow).chromeFixture.reported)).toEqual([]);
    await expect(page.locator('.notice-text').filter({ hasText: '标题栏更新失败' })).toHaveCount(0);
  });

for (const autoSave of [false, true])
  test(`late dirty title completion cannot overwrite the ${autoSave ? 'automatically' : 'manually'} saved title state`, async ({
    page,
  }) => {
    await boot(page, autoSave);
    await page.evaluate(() => {
      (window as ChromeWindow).chromeFixture.arm = true;
    });
    await frame(page).locator('#write > p').click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await expect
      .poll(() => page.evaluate(() => (window as ChromeWindow).chromeFixture.pending.length))
      .toBe(1);
    expect(
      await page.evaluate(() => (window as ChromeWindow).chromeFixture.pending[0]?.payload.dirty),
    ).toBe(true);
    if (!autoSave) await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as TestWindow).__desktopMock.calls.some(
            (call) => call.command === 'save_document' && call.args.text === 'AlphaX',
          ),
        ),
      )
      .toBe(true);
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.notice-text').filter({ hasText: '已保存' })).toBeVisible();
    await releaseTitle(page);
    await expect
      .poll(() => page.evaluate(() => (window as ChromeWindow).chromeFixture.applied.at(-1)?.dirty))
      .toBe(false);
    await expect(frame(page).locator('#write')).toHaveText('AlphaX');
  });

test('a superseded title failure does not interrupt editing after fresh statistics arrive', async ({
  page,
}) => {
  await boot(page);
  await holdTitle(page);
  await frame(page).locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' next');
  await expect(page.getByRole('button', { name: '字数统计：2 词', exact: true })).toBeVisible();
  await releaseTitle(page, 'superseded count title request');
  await expect
    .poll(() => page.evaluate(() => (window as ChromeWindow).chromeFixture.applied.at(-1)?.dirty))
    .toBe(true);
  expect(await page.evaluate(() => (window as ChromeWindow).chromeFixture.reported)).toEqual([]);
  await expect(frame(page).locator('#write')).toHaveText('Alpha next');
});

test('a current titlebar failure remains visible', async ({ page }) => {
  await boot(page);
  await holdTitle(page);
  await releaseTitle(page, 'current native title failure');
  await expect(
    page
      .locator('.notice-text')
      .filter({ hasText: '标题栏更新失败：Error: current native title failure' }),
  ).toBeVisible();
});

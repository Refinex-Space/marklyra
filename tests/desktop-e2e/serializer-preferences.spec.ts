import { expect, type Page, test } from '@playwright/test';
import type {
  MarkdownPreferenceChange,
  MarkdownPreferencesSnapshot,
} from '../../apps/desktop/src/services/markdownPreferences.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const storage = 'test-markdown-native-store';
function nativeMarkdownDouble() {
  if (window !== window.top) return;
  const native = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const invoke = native.invoke;
  native.invoke = async (command, args) => {
    if (command === 'get_markdown_preferences')
      return JSON.parse(
        localStorage.getItem('test-markdown-native-store') ??
          '{"schemaVersion":1,"revision":0,"indentSize":2,"prettyIndent":false}',
      );
    if (command === 'request_preference_markdown')
      return Reflect.apply(Reflect.get(window, 'markdownRequest'), window, [args]);
    if (command === 'complete_preference_markdown')
      return Reflect.apply(Reflect.get(window, 'markdownComplete'), window, [args]);
    return invoke(command, args);
  };
}
async function values(page: Page) {
  return page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write')
    .evaluate(() => {
      const option = (Reflect.get(window, 'File') as unknown as { option: Record<string, unknown> })
        .option;
      return [option.headingStyle, option.ulStyle, option.olStyle];
    });
}

for (const sourcePrefix of ['\uFEFF', '']) {
  test(`original style controls require the real opener rebase, persist, restart and preserve exact document history (${sourcePrefix ? 'literal BOM' : 'decoded BOM'})`, async ({
    page,
    context,
  }) => {
    // The CAS roundtrips need live JavaScript in both the editor page and the preferences
    // page; WebKit throttles whichever runs in the background tab, so the whole flow takes
    // well over the default budget there while Chromium finishes in seconds.
    test.slow();
    let serial = 0;
    const tickets = new Map<
      string,
      {
        before: MarkdownPreferencesSnapshot;
        change: MarkdownPreferenceChange;
        resolve(value: MarkdownPreferencesSnapshot): void;
        reject(error: Error): void;
      }
    >();
    await context.exposeBinding(
      'markdownRequest',
      async (_source, args: { expectedRevision: number; change: MarkdownPreferenceChange }) => {
        const before = (await page.evaluate(
          (storage) =>
            JSON.parse(
              localStorage.getItem(storage) ??
                '{"schemaVersion":1,"revision":0,"indentSize":2,"prettyIndent":false}',
            ),
          storage,
        )) as MarkdownPreferencesSnapshot;
        if (before.revision !== args.expectedRevision) throw Error('controlled stale CAS');
        const token = `de305d54-75b4-431b-adb2-${String(++serial).padStart(12, '0')}`;
        const pending = new Promise<MarkdownPreferencesSnapshot>((resolve, reject) =>
          tickets.set(token, { before, change: args.change, resolve, reject }),
        );
        await page.evaluate(
          (payload) =>
            (window as TestWindow).__desktopMock.emitTarget(
              'main',
              'preference-markdown-request',
              payload,
            ),
          { token, before, change: args.change },
        );
        return pending;
      },
    );
    await context.exposeBinding(
      'markdownComplete',
      async (_source, args: { token: string; error: string | null }) => {
        const ticket = tickets.get(args.token);
        if (!ticket) throw Error('controlled unknown ticket');
        tickets.delete(args.token);
        if (args.error) {
          ticket.reject(Error(args.error));
          return null;
        }
        const saved = { ...ticket.before, ...ticket.change, revision: ticket.before.revision + 1 };
        await page.evaluate(
          ({ storage, saved }) => localStorage.setItem(storage, JSON.stringify(saved)),
          { storage, saved },
        );
        ticket.resolve(saved);
        return saved;
      },
    );
    await page.addInitScript(installMock, { nativeChrome: true });
    await page.addInitScript(installRecoveryMock);
    await page.addInitScript(nativeMarkdownDouble);
    await page.goto('/');
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    const raw = `${sourcePrefix}Alpha\r\n\r\nKeep  \n`;
    await page.evaluate((raw) => {
      (window as TestWindow).__desktopMock.nextDocument.text = raw;
      (window as TestWindow).__desktopMock.emitMenu('open');
    }, raw);
    const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
    await expect(write).toContainText('Alpha');
    const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
    const preferences = await context.newPage();
    try {
      await preferences.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
      await preferences.addInitScript(nativeMarkdownDouble);
      await preferences.goto('/?view=preferences');
      const ui = preferences.frameLocator('.runtime-preferences-frame');
      await expect(ui.locator('.nav-group-item')).toHaveCount(11);
      await ui.locator('.nav-group-item').nth(3).click();
      for (const [key, value] of [
        ['heading_style', '3'],
        ['ul_style', '2'],
        ['ol_style', '1'],
      ] as const) {
        await ui.locator(`[data-marklyra-preference="${key}"]`).selectOption(value);
        await expect(ui.locator('#marklyra-preferences-status')).toBeHidden();
      }
      await expect.poll(() => values(page)).toEqual([3, 2, 1]);
      expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
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
        .toBe(raw);
      await preferences.reload();
      await expect(ui.locator('.nav-group-item')).toHaveCount(11);
      await ui.locator('.nav-group-item').nth(3).click();
      for (const [key, value] of [
        ['heading_style', '3'],
        ['ul_style', '2'],
        ['ol_style', '1'],
      ] as const)
        await expect(ui.locator(`[data-marklyra-preference="${key}"]`)).toHaveValue(value);
      await page.bringToFront();
      await write.locator('p').first().click();
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('heading:1'));
      await expect(write.locator('h1')).toHaveText('Alpha');
      for (const [action, expected] of [
        ['save', raw.replace('Alpha', 'Alpha\r\n=====')],
        ['undo', raw],
        ['redo', raw.replace('Alpha', 'Alpha\r\n=====')],
      ] as const) {
        if (action !== 'save')
          await page.evaluate(
            (action) => (window as TestWindow).__desktopMock.emitMenu(action),
            action,
          );
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
          .toBe(expected);
      }
      await page.reload();
      await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
      await expect.poll(() => values(page)).toEqual([3, 2, 1]);
      await expect(page.frameLocator('.marklyra-editor-frame').locator('body')).toHaveClass(
        /use-varible-width-setex/,
      );
    } finally {
      await preferences.close();
    }
  });
}

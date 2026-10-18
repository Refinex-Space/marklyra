import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

async function mount(page: import('@playwright/test').Page, dark = true) {
  await page.addInitScript(installMock, { nativeChrome: false });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript((dark) => {
    if (window !== window.top) return;
    Reflect.set(window, '__testSystemDark', dark);
    if (!localStorage.getItem('mock-application-preferences'))
      localStorage.setItem(
        'mock-application-preferences',
        JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          values: { useSeparateDarkTheme: true, darkTheme: 'night.css' },
        }),
      );
  }, dark);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
test('separate dark choice follows actual host appearance without changing normal choice or iframe and persists menu changes', async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'night');
  const frame = await page.locator('.marklyra-editor-frame').getAttribute('src');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-theme-choice-v1'))).toBeNull();
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'menu-action', 'theme:gothic'),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values.darkTheme,
      ),
    )
    .toBe('gothic.css');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-theme-choice-v1'))).toBeNull();
  await page.evaluate(() => {
    Reflect.set(window, '__testSystemDark', false);
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'github');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'menu-action', 'theme:whitey'),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('marklyra-theme-choice-v1') ?? '{}').theme,
      ),
    )
    .toBe('whitey');
  await page.evaluate(() => {
    Reflect.set(window, '__testSystemDark', true);
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'gothic');
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(frame);
  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'gothic');
});
test('outline preference controls existing context actions and persists without reconstructing the editor', async ({
  page,
}) => {
  await mount(page, false);
  const raw = '\uFEFF# Parent\r\n\r\n## Child\n\nTail  \n';
  await page.evaluate((raw) => {
    (window as TestWindow).__desktopMock.nextDocument.text = raw;
  }, raw);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.getByRole('button', { name: '文档目录', exact: true }).click();
  const frame = await page.locator('.marklyra-editor-frame').getAttribute('src');
  const tree = page.getByRole('tree', { name: '文档标题' });
  await tree.getByRole('treeitem', { name: 'Parent', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitemradio', { name: '平铺大纲', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values
            .can_collapse_outline_panel,
      ),
    )
    .toBe(false);
  await expect(tree.getByRole('treeitem', { name: 'Parent', exact: true })).not.toHaveAttribute(
    'aria-expanded',
  );
  await page.evaluate(() => {
    const m = (window as TestWindow).__desktopMock;
    const next = {
      ...m.applicationPreferences,
      revision: m.applicationPreferences.revision + 1,
      values: { ...m.applicationPreferences.values, can_collapse_outline_panel: true },
    };
    m.applicationPreferences = next;
    m.emitEvent('application-preferences-changed', next);
  });
  await expect(tree.getByRole('treeitem', { name: 'Parent', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(frame);
  await page.getByRole('button', { name: '保存', exact: true }).click();
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
});
test('original remaining controls use finite persistence and queue warning reset', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.goto('/?view=preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.locator('.nav-group-item')).toHaveCount(7);
  await expect(ui.locator('[data-marklyra-preference="can_collapse_outline_panel"]')).toHaveCount(
    0,
  );
  await ui.locator('.nav-group-item').nth(3).click();
  await ui.locator('[data-marklyra-preference="noLegacyMath"]').click();
  await ui.locator('[data-marklyra-preference="auto_numbering_for_math"]').selectOption('all');
  await ui.locator('[data-marklyra-preference="mathFormatOnCopy"]').selectOption('latex');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values,
      ),
    )
    .toMatchObject({
      noLegacyMath: true,
      auto_numbering_for_math: 'all',
      mathFormatOnCopy: 'latex',
    });
  await ui.locator('.nav-group-item').nth(6).click();
  await ui.locator('[data-marklyra-preference="quitAfterWindowClose"]').check();
  await ui.locator('[data-marklyra-file-action="reset-dialog-warnings"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'reset_dialog_warnings',
          ).length,
      ),
    )
    .toBe(1);
});

test('a missing passive dark theme retains the previous view without a retry loop', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    Reflect.set(window, '__testSystemDark', true);
    localStorage.setItem(
      'mock-application-preferences',
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        values: { useSeparateDarkTheme: true, darkTheme: 'missing.css' },
      }),
    );
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    const original = internal.invoke;
    internal.invoke = (command, args) =>
      command === 'load_theme_styles' && args?.themeId === 'missing'
        ? ((window as TestWindow).__desktopMock.calls.push({ command, args }),
          Promise.reject(Error('Missing theme file')))
        : original(command, args);
  });
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toContainText('主题加载失败');
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'github');
  await page.waitForTimeout(1100);
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'load_theme_styles' && c.args.themeId === 'missing',
        ).length,
    ),
  ).toBe(1);
});
test('a committed dark theme with a lost reply is read back without replaying the preference write', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    Reflect.set(window, '__testSystemDark', true);
    localStorage.setItem(
      'mock-application-preferences',
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        values: { useSeparateDarkTheme: true, darkTheme: 'night.css' },
      }),
    );
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    const original = internal.invoke;
    internal.invoke = async (command, args) => {
      const result = await original(command, args);
      if (command === 'put_editor_appearance_preference') throw Error('committed reply lost');
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'night');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'menu-action', 'theme:gothic'),
  );
  await expect(page.getByRole('contentinfo')).toContainText('未确认');
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'gothic');
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'put_editor_appearance_preference',
        ).length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values.darkTheme,
    ),
  ).toBe('gothic.css');
});

test('removing the focused outline arrow in another window restores its row only after returning', async ({
  page,
}) => {
  await mount(page, false);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.nextDocument.text = '# Parent\n\n## Child\n';
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.getByRole('button', { name: '文档目录', exact: true }).click();
  await page.getByRole('button', { name: '折叠 Parent', exact: true }).focus();
  const other = await page.context().newPage();
  await other.goto('about:blank');
  await page.evaluate(() => {
    const m = (window as TestWindow).__desktopMock;
    m.applicationPreferences = {
      schemaVersion: 1,
      revision: 2,
      values: { can_collapse_outline_panel: false },
    };
    m.emitEvent('application-preferences-changed', m.applicationPreferences);
  });
  await expect(page.getByRole('button', { name: '折叠 Parent', exact: true })).toHaveCount(0);
  await expect.poll(() => other.evaluate(() => document.hasFocus())).toBe(true);
  await other.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('treeitem', { name: 'Parent', exact: true })).toBeFocused();
});

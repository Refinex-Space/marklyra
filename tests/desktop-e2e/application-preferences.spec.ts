import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const area = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
async function boot(page: Page) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
async function options(page: Page) {
  return area(page).evaluate(
    () => (Reflect.get(window, 'File') as unknown as { option: Record<string, unknown> }).option,
  );
}
async function publish(
  page: Page,
  values: Record<string, boolean | number | string>,
  revision = 1,
) {
  await page.evaluate(
    ({ values, revision }) => {
      const mock = (window as TestWindow).__desktopMock;
      mock.applicationPreferences = { schemaVersion: 1, revision, values };
      mock.emitEvent('application-preferences-changed', mock.applicationPreferences);
    },
    { values, revision },
  );
}
test('live native overrides preserve source/history and reject late stale snapshots', async ({
  page,
}) => {
  await boot(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'apply_application_zoom',
          ).length,
      ),
    )
    .toBe(1);
  await area(page).click();
  await page.keyboard.type('Alpha');
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await publish(
    page,
    {
      no_mid_caret: false,
      copy_markdown_by_default: true,
      line_ending_crlf: true,
      defaultCodeLang: 'javascript',
      defaultCodeLangOption: 3,
    },
    7,
  );
  await expect
    .poll(async () => {
      const o = await options(page);
      return [
        o.scrollWithCursor,
        o.copyMarkdownByDefault,
        o.preferCRLF,
        o.defaultCodeLang,
        o.defaultCodeLangOption,
      ];
    })
    .toEqual([true, true, true, 'javascript', 3]);
  await publish(page, { no_mid_caret: true, copy_markdown_by_default: false }, 6);
  await expect.poll(async () => (await options(page)).copyMarkdownByDefault).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'apply_application_zoom',
        ).length,
    ),
  ).toBe(1);
  expect(await frame?.evaluate((e) => e.isConnected)).toBe(true);
  await expect(area(page)).toHaveText('Alpha');
  await page.keyboard.type('Z');
  await expect(area(page)).toHaveText('AlphaZ');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(area(page)).toHaveText('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(area(page)).toHaveText('AlphaZ');
});
test('composition delays live input preferences while keeping the exact runtime mounted', async ({
  page,
}) => {
  await boot(page);
  await area(page).click();
  await page.keyboard.type('Own');
  await area(page).evaluate((e) =>
    e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' })),
  );
  await publish(page, { no_pairing_match: true, copy_markdown_by_default: true }, 2);
  await expect.poll(async () => (await options(page)).copyMarkdownByDefault).toBe(false);
  await area(page).evaluate((e) =>
    e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await expect.poll(async () => (await options(page)).copyMarkdownByDefault).toBe(true);
  await expect(area(page)).toHaveText('Own');
});
test('new-window parser settings never reparse the current document and cold reversals are isolated', async ({
  page,
  context,
}) => {
  await boot(page);
  const raw = '\uFEFFAlpha ==marked== ~sub~ ^sup^\r\n\r\nTail  \n';
  await page.evaluate((raw) => {
    const m = (window as TestWindow).__desktopMock;
    m.nextDocument = { id: 'syntax', path: '/mock/syntax.md', text: raw, encoding: 'UTF-8 BOM' };
    m.emitMenu('open');
  }, raw);
  await expect(area(page)).toContainText('Alpha');
  await area(page).evaluate((e) =>
    Reflect.set(window, '__marklyraBefore', {
      node: e.firstElementChild,
      undo: (Reflect.get(window, 'editor') as { undo: unknown }).undo,
    }),
  );
  const values = {
    enable_highlight: true,
    enable_subscript: true,
    enable_superscript: true,
    strict_mode: true,
    enable_diagram: false,
  };
  await page.evaluate(
    (values) =>
      localStorage.setItem(
        'mock-application-preferences',
        JSON.stringify({ schemaVersion: 1, revision: 3, values }),
      ),
    values,
  );
  await publish(page, values, 3);
  await expect.poll(async () => (await options(page)).enableHighlight).toBe(false);
  expect(
    await area(page).evaluate((e) => {
      const old = Reflect.get(window, '__marklyraBefore') as { node: Element; undo: unknown };
      return (
        old.node === e.firstElementChild &&
        old.undo === (Reflect.get(window, 'editor') as { undo: unknown }).undo
      );
    }),
  ).toBe(true);
  const next = await context.newPage();
  try {
    await boot(next);
    await next.evaluate((raw) => {
      const m = (window as TestWindow).__desktopMock;
      m.nextDocument = {
        id: 'syntax-next',
        path: '/mock/syntax-next.md',
        text: raw,
        encoding: 'UTF-8 BOM',
      };
      m.emitMenu('open');
    }, raw);
    await expect(area(next).locator('mark')).toHaveText('marked');
    for (const [tag, expected] of [
      ['sub', 'sub'],
      ['sup', 'sup'],
    ] as const) {
      await expect(area(next).locator(tag)).toHaveCount(1);
      const content = await area(next)
        .locator(tag)
        .evaluate((e) => {
          const copy = e.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('.md-meta').forEach((n) => {
            n.remove();
          });
          return copy.textContent;
        });
      expect(content).toBe(expected);
    }
    const disabledModes = await area(next).evaluate(() =>
      JSON.stringify(
        (Reflect.get(window, 'editor') as { fences: { ALL: unknown } }).fences.ALL,
      ).toLowerCase(),
    );
    expect(disabledModes).not.toContain('"mermaid"');
    expect(await options(next)).toMatchObject({
      enableHighlight: true,
      enableSubscript: true,
      enableSuperscript: true,
      enableDiagram: false,
      strictMarkdown: true,
    });
    await next.evaluate(() => {
      const m = (window as TestWindow).__desktopMock;
      m.emitMenu('save');
    });
    await expect
      .poll(() =>
        next.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls
              .filter((c) => c.command === 'save_document')
              .at(-1)?.args.text,
        ),
      )
      .toBe(raw);
    await next.evaluate(() =>
      localStorage.setItem(
        'mock-application-preferences',
        JSON.stringify({
          schemaVersion: 1,
          revision: 4,
          values: {
            enable_highlight: false,
            enable_subscript: false,
            enable_superscript: false,
            strict_mode: false,
            enable_diagram: true,
          },
        }),
      ),
    );
    await next.reload();
    await expect(next.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    const enabledModes = await area(next).evaluate(() =>
      JSON.stringify(
        (Reflect.get(window, 'editor') as { fences: { ALL: unknown } }).fences.ALL,
      ).toLowerCase(),
    );
    expect(enabledModes).toContain('"mermaid"');
    expect(await options(next)).toMatchObject({
      enableHighlight: false,
      enableSubscript: false,
      enableSuperscript: false,
      enableDiagram: true,
      strictMarkdown: false,
    });
  } finally {
    await next.close();
  }
});
test('native autosave preference drives the existing real save controller without opening a picker', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(area(page)).toHaveText('Alpha');
  await publish(page, { enableAutoSave: true }, 1);
  await area(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(area(page)).toHaveText('AlphaX');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls
              .filter((c) => c.command === 'save_document')
              .at(-1)?.args.text,
        ),
      { timeout: 8000 },
    )
    .toBe('AlphaX');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_document_as'),
    ),
  ).toEqual([]);
});

test('CRLF default applies to a real new-window lifecycle while an existing file stays byte-identical', async ({
  page,
  context,
}) => {
  await boot(page);
  const raw = 'Existing\n\nTail  \r\n';
  await page.evaluate((raw) => {
    const m = (window as TestWindow).__desktopMock;
    m.nextDocument = { id: 'eol-old', path: '/mock/eol-old.md', text: raw, encoding: 'UTF-8' };
    m.emitMenu('open');
  }, raw);
  await expect(area(page)).toContainText('Existing');
  const snapshot = { schemaVersion: 1, revision: 1, values: { line_ending_crlf: true } };
  await page.evaluate(
    (s) => localStorage.setItem('mock-application-preferences', JSON.stringify(s)),
    snapshot,
  );
  await publish(page, snapshot.values, 1);
  await expect.poll(async () => (await options(page)).preferCRLF).toBe(true);
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
  const next = await context.newPage();
  try {
    await boot(next);
    await expect.poll(async () => (await options(next)).preferCRLF).toBe(true);
    await area(next).locator('p').first().click();
    await next.keyboard.type('First');
    await next.keyboard.press('Enter');
    await next.keyboard.type('Second');
    await expect(area(next)).toContainText('Second');
    await next.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
    await expect
      .poll(() =>
        next.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls
              .filter((c) => c.command === 'save_document_as')
              .at(-1)?.args.text,
        ),
      )
      .toBe('First\r\n\r\nSecond');
  } finally {
    await next.close();
  }
});

test('a committed native preference with a lost reply is never replayed and is reread on reopening', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.addInitScript(() => {
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const original = internals.invoke;
    internals.invoke = async (command, args) => {
      const result = await original(command, args);
      if (command === 'put_application_preferences') throw Error('controlled lost native reply');
      return result;
    };
  });
  await page.goto('/?view=preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.locator('.nav-group-item')).toHaveCount(11);
  await ui.locator('.nav-group-item').nth(5).click();
  const custom = ui.locator('[data-marklyra-preference="useCustomFontSize"][value="true"]');
  await custom.click();
  await expect(ui.locator('#marklyra-preferences-status')).toContainText('保存结果未确认');
  await expect(custom).not.toBeChecked();
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (c) => c.command === 'put_application_preferences',
      ),
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values
          .useCustomFontSize,
    ),
  ).toBe(true);
  await page.reload();
  await expect(ui.locator('.nav-group-item')).toHaveCount(11);
  await ui.locator('.nav-group-item').nth(5).click();
  await expect(custom).toBeChecked();
});

test('original reading-speed reset and presets atomically confirm the speed and custom flag', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.goto('/?view=preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.locator('.nav-group-item')).toHaveCount(11);
  await ui.locator('.nav-group-item').nth(5).click();

  await expect(ui.locator('.btn-split-left[data-marklyra-reading-speed]')).toHaveCount(1);
  await ui.locator('.btn-split-left[data-marklyra-reading-speed]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values,
      ),
    )
    .toMatchObject({ wordsPerMinute: 382, customWordsPerMinute: true });
  for (const speed of [120, 240, 382]) {
    await ui.locator('.btn-split-right[data-marklyra-reading-speed="toggle"]').click();
    await ui.locator(`li[data-marklyra-reading-speed="${speed}"]`).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values,
        ),
      )
      .toMatchObject({ wordsPerMinute: speed, customWordsPerMinute: true });
    await expect(ui.locator('[data-marklyra-preference="wordsPerMinute"]')).toHaveValue(
      String(speed),
    );
    await expect(ui.locator('.btn-split-group ul.dropdown-menu')).not.toHaveClass(/\bshown\b/);
  }
  await page.reload();
  await expect(ui.locator('.nav-group-item')).toHaveCount(11);
  await ui.locator('.nav-group-item').nth(5).click();
  await expect(ui.locator('[data-marklyra-preference="wordsPerMinute"]')).toHaveValue('382');
});

test('default code language uses the actual future code/menu consumer and retains existing fences', async ({
  page,
}) => {
  await boot(page);
  const raw = '```javascript\r\nconst value = 1;\r\n```\n';
  await page.evaluate((raw) => {
    const m = (window as TestWindow).__desktopMock;
    m.nextDocument = {
      id: 'code-default',
      path: '/mock/code-default.md',
      text: raw,
      encoding: 'UTF-8',
    };
    m.emitMenu('open');
  }, raw);
  await expect(area(page).locator('.CodeMirror')).toHaveCount(1);
  for (const [mask, expected] of [
    [1, ['python', '']],
    [2, ['', 'python']],
    [3, ['python', 'python']],
  ] as const) {
    await publish(page, { defaultCodeLang: 'python', defaultCodeLangOption: mask }, mask);
    await expect
      .poll(() =>
        area(page).evaluate(() => {
          const fences = (
            Reflect.get(window, 'editor') as {
              fences: { getCodeLangSuggest(menu: boolean): string };
            }
          ).fences;
          return [fences.getCodeLangSuggest(false), fences.getCodeLangSuggest(true)];
        }),
      )
      .toEqual(expected);
  }
  await expect(area(page).locator('.CodeMirror')).toContainText('const value = 1;');
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
});

test('original zoom reset uses the fixed typed value and keeps other reset buttons scoped', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.goto('/?view=preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.locator('.nav-group-item')).toHaveCount(11);
  await ui.locator('.nav-group-item').nth(5).click();
  await ui.locator('[data-marklyra-preference="zoomFactor"]').selectOption('1.25');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values
            .zoomFactor,
      ),
    )
    .toBe(1.25);
  await expect(ui.locator('[data-marklyra-zoom-reset]')).toHaveCount(1);
  await ui.locator('[data-marklyra-zoom-reset]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values
            .zoomFactor,
      ),
    )
    .toBe(1);
  await expect(ui.locator('[data-marklyra-preference="zoomFactor"]')).toHaveValue('1');
});
for (const focus of ['wrapper', 'child'] as const) {
  test(`Escape from the ${focus} waits for the current native preference before closing`, async ({
    page,
  }) => {
    await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
    await page.addInitScript(() => {
      const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      const original = internals.invoke;
      internals.invoke = (command, args) =>
        command !== 'put_application_preferences'
          ? original(command, args)
          : new Promise((resolve, reject) =>
              Reflect.set(window, '__marklyraReleasePut', () =>
                original(command, args).then(resolve, reject),
              ),
            );
    });
    await page.goto('/?view=preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await expect(ui.locator('.nav-group-item')).toHaveCount(11);
    await ui.locator('.nav-group-item').nth(5).click();
    await ui.locator('[data-marklyra-preference="useCustomFontSize"][value="true"]').check();
    await expect
      .poll(() => page.evaluate(() => typeof Reflect.get(window, '__marklyraReleasePut')))
      .toBe('function');
    if (focus === 'wrapper')
      await page.locator('.preferences-drag-region').click({ position: { x: 10, y: 10 } });
    else await ui.locator('[data-marklyra-preference="useCustomFontSize"][value="true"]').focus();
    await page.keyboard.press('Escape');
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'close_preferences_window',
        ),
      ),
    ).toEqual([]);
    await page.evaluate(() => {
      (Reflect.get(window, '__marklyraReleasePut') as () => void)();
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls.filter(
              (c) => c.command === 'close_preferences_window',
            ).length,
        ),
      )
      .toBe(1);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values
            .useCustomFontSize,
      ),
    ).toBe(true);
  });
}

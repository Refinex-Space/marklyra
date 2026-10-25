import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import type { RecoveryMockWindow } from './recovery.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

for (const mode of ['wysiwyg', 'source'] as const) {
  test(`${mode}: adjacent native Undo/Save and Redo/Save persist the resulting history state`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(installMock);
    await page.addInitScript(installRecoveryMock);
    await page.goto('/');
    await page.getByRole('button', { name: '打开', exact: true }).click();
    const frame = page.frameLocator('.marklyra-editor-frame');
    await expect(frame.locator('#write')).toHaveText('Alpha');
    await page.locator('.marklyra-editor-frame').focus();
    if (mode === 'source') {
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
      await frame.locator('#marklyra-source .CodeMirror textarea').focus();
      await frame.locator('#marklyra-source .CodeMirror').evaluate((element) => {
        const cm = Reflect.get(element, 'CodeMirror') as {
          getValue(): string;
          posFromIndex(index: number): unknown;
          setCursor(position: unknown): void;
        };
        cm.setCursor(cm.posFromIndex(cm.getValue().length));
      });
    } else {
      await frame.locator('#write > p').evaluate((element) => {
        (element as HTMLElement).focus();
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = element.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    }
    await page.keyboard.type('X');
    const source = () =>
      mode === 'source'
        ? frame
            .locator('#marklyra-source .CodeMirror')
            .evaluate((element) =>
              (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
            )
        : frame.locator('#write').textContent();
    await expect.poll(source).toBe('AlphaX');
    // Both native events arrive in one host task. No wait for Undo's SDK reply.
    await page.evaluate(() => {
      const mock = (window as TestWindow).__desktopMock;
      mock.emitMenu('undo');
      mock.emitMenu('save');
    });
    const saves = () =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'save_document')
          .map((call) => call.args.text),
      );
    await expect.poll(source).toBe('Alpha');
    await expect.poll(saves).toEqual(['Alpha']);
    await expect(page.locator('.document-title')).toHaveText('A.md');
    await page.evaluate(() => {
      const mock = (window as TestWindow).__desktopMock;
      mock.emitMenu('redo');
      mock.emitMenu('save');
    });
    await expect.poll(source).toBe('AlphaX');
    await expect.poll(saves).toEqual(['Alpha', 'AlphaX']);
    await expect(page.locator('.document-title')).toHaveText('A.md');
    expect(errors).toEqual([]);
  });
}

for (const nativeChrome of [false, true])
  for (const mode of ['wysiwyg', 'source'] as const)
    for (const history of ['undo', 'redo'] as const)
      test(`save requested during an earlier save persists the later ${history} state (native=${nativeChrome}, ${mode})`, async ({
        page,
      }) => {
        await page.addInitScript(installMock, { nativeChrome });
        await page.addInitScript(installRecoveryMock);
        await page.goto('/');
        await expect
          .poll(() =>
            page.evaluate(() =>
              (window as TestWindow).__desktopMock.calls.some(
                (call) => call.command === 'editor_window_ready',
              ),
            ),
          )
          .toBe(true);
        await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
        await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
        const frame = page.frameLocator('.marklyra-editor-frame');
        await expect(frame.locator('#write')).toHaveText('Alpha');
        await page.locator('.marklyra-editor-frame').focus();
        if (mode === 'source') {
          await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
          await frame.locator('#marklyra-source .CodeMirror textarea').focus();
          await frame.locator('#marklyra-source .CodeMirror').evaluate((element) => {
            const cm = Reflect.get(element, 'CodeMirror') as {
              getValue(): string;
              posFromIndex(index: number): unknown;
              setCursor(position: unknown): void;
            };
            cm.setCursor(cm.posFromIndex(cm.getValue().length));
          });
        } else {
          await frame.locator('#write > p').evaluate((element) => {
            (element as HTMLElement).focus();
            const range = element.ownerDocument.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            const selection = element.ownerDocument.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          });
        }
        const source = () =>
          mode === 'source'
            ? frame
                .locator('#marklyra-source .CodeMirror')
                .evaluate((element) =>
                  (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
                )
            : frame.locator('#write').textContent();
        await page.keyboard.type('X');
        await expect.poll(source).toBe('AlphaX');
        if (history === 'redo') {
          await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
          await expect.poll(source).toBe('Alpha');
        }
        await page.evaluate(() => {
          const mock = (window as TestWindow).__desktopMock;
          mock.deferSave = true;
          mock.emitMenu('save');
        });
        await expect
          .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
          .toBe(1);
        await page.evaluate((history) => {
          const mock = (window as TestWindow).__desktopMock;
          mock.emitMenu(history);
          mock.emitMenu('save');
        }, history);
        const later = history === 'undo' ? 'Alpha' : 'AlphaX';
        await expect.poll(source).toBe(later);
        await page.evaluate(() => (window as TestWindow).__desktopMock.finishSave());
        const saves = () =>
          page.evaluate(() =>
            (window as TestWindow).__desktopMock.calls
              .filter((call) => call.command === 'save_document')
              .map((call) => call.args.text),
          );
        await expect
          .poll(saves, { timeout: 5000 })
          .toEqual([history === 'undo' ? 'AlphaX' : 'Alpha', later]);
        await expect
          .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
          .toBe(1);
        await page.evaluate(() => (window as TestWindow).__desktopMock.finishSave());
        await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
        if (!nativeChrome) await expect(page.locator('.document-title')).toHaveText('A.md');
      });

test('repeated Save and Save As during an unchanged save do not write or open a later dialog', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('Alpha');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.deferSave = true;
    mock.emitMenu('save');
  });
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    for (let index = 0; index < 12; index++) mock.emitMenu('save');
    mock.emitMenu('save-as');
    mock.finishSave();
  });
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  const calls = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter(
      (call) => call.command === 'save_document' || call.command === 'save_document_as',
    ),
  );
  expect(calls.map((call) => [call.command, call.args.text])).toEqual([['save_document', 'Alpha']]);
});

test('a Save rejected during an in-flight Open is not replayed into the newly opened document', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await page.locator('.marklyra-editor-frame').focus();
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = { id: 'doc-b', path: '/mock/B.md', text: 'Beta', encoding: 'UTF-8' };
    mock.deferOpen = true;
    mock.emitMenu('open');
  });
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingOpens))
    .toBe(1);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.emitMenu('save');
    mock.finishOpen();
  });
  await expect(frame.locator('#write')).toHaveText('Beta');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'save_document' || call.command === 'save_document_as',
      ),
    ),
  ).toEqual([]);
});

test('a failed save does not automatically retry a queued Save or discard newer text', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await page.locator('.marklyra-editor-frame').focus();
  await frame.locator('#write > p').evaluate((element) => {
    (element as HTMLElement).focus();
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type('X');
  await expect(frame.locator('#write')).toHaveText('AlphaX');
  await page.evaluate(() => {
    const win = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const invoke = win.__TAURI_INTERNALS__.invoke;
    win.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'save_document') throw new Error('simulated save acknowledgement failure');
      return result;
    };
    win.__desktopMock.deferSave = true;
    win.__desktopMock.emitMenu('save');
  });
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await page.keyboard.type('Y');
  await expect(frame.locator('#write')).toHaveText('AlphaXY');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.emitMenu('save');
    mock.finishSave();
  });
  await expect(
    page.getByText('simulated save acknowledgement failure', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(frame.locator('#write')).toHaveText('AlphaXY');
  await expect(page.locator('.document-title')).toContainText('•');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'save_document')
        .map((call) => call.args.text),
    ),
  ).toEqual(['AlphaX']);
  expect(await page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves)).toBe(0);
});

test('manual Save during a slow autosave persists the new input without waiting for another idle timer', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'true'));
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await page.locator('.marklyra-editor-frame').focus();
  await frame.locator('#write > p').evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferSave = true;
  });
  await page.keyboard.type('X');
  await expect(frame.locator('#write')).toHaveText('AlphaX');
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  // Freeze only the parent scheduler's wall time. Timers and the real input
  // runtime keep running; a second autosave cannot mask a lost explicit Save.
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now;
  });
  await page.keyboard.type('Y');
  await expect(frame.locator('#write')).toHaveText('AlphaXY');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.emitMenu('save');
    mock.finishSave();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'save_document')
          .map((call) => call.args.text),
      ),
    )
    .toEqual(['AlphaX', 'AlphaXY']);
  await page.evaluate(() => (window as TestWindow).__desktopMock.finishSave());
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

test('autosave suppresses the exact failed coalesced source until another edit', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'true'));
  await page.goto('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await page.locator('.marklyra-editor-frame').focus();
  await frame.locator('#write > p').evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.evaluate(() => {
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const invoke = internals.invoke;
    let writes = 0;
    internals.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'save_document' && ++writes >= 2) throw new Error('coalesced source failed');
      return result;
    };
    (window as TestWindow).__desktopMock.deferSave = true;
  });
  await page.keyboard.type('X');
  await expect(frame.locator('#write')).toHaveText('AlphaX');
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await page.evaluate(() => {
    let now = Date.now();
    Date.now = () => now;
    Object.assign(window, {
      __advanceSaveClock: () => {
        now += 5000;
      },
    });
  });
  await page.keyboard.type('Y');
  await expect(frame.locator('#write')).toHaveText('AlphaXY');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.emitMenu('save');
    mock.deferSave = false;
    mock.finishSave();
  });
  await expect(page.getByText('coalesced source failed', { exact: false })).toBeVisible();
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() =>
    (window as unknown as Window & { __advanceSaveClock(): void }).__advanceSaveClock(),
  );
  // Observe two real 500ms scheduler ticks after the idle deadline. A stale
  // attempted-source latch would issue a third write without any new edit.
  await page.waitForTimeout(1200);
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'save_document')
        .map((call) => call.args.text),
    ),
  ).toEqual(['AlphaX', 'AlphaXY']);
  await expect(frame.locator('#write')).toHaveText('AlphaXY');
  await expect(page.locator('.document-title')).toContainText('•');
  await page.locator('.marklyra-editor-frame').focus();
  await page.keyboard.type('Z');
  await expect(frame.locator('#write')).toHaveText('AlphaXYZ');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values((window as RecoveryMockWindow).__recoveryMock.records).some(
          (record) => record.text === 'AlphaXYZ',
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as unknown as Window & { __advanceSaveClock(): void }).__advanceSaveClock(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'save_document')
          .map((call) => call.args.text),
      ),
    )
    .toEqual(['AlphaX', 'AlphaXY', 'AlphaXYZ']);
});

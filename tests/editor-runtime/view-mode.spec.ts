import { fileURLToPath } from 'node:url';
import type { MarkLyraEditor, MarkLyraViewMode } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

interface ViewFixture {
  editor: MarkLyraEditor;
  modes: MarkLyraViewMode[];
  errors: string[];
  throwObserver: boolean;
  throwDiagnostics: boolean;
  holdStatistics: boolean;
  held: MessageEvent[];
  statisticsJob?: Promise<string>;
  release(): void;
}
type Host = Window & { marklyraEditor: MarkLyraEditor; viewFixture: ViewFixture };
const raw = '\uFEFFAlpha\r\n\r\nTail \n';
const area = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).viewFixture.editor.flush());
const toggle = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Host).viewFixture.editor.execute({ type: 'toggleSource' }),
  );
const modes = (page: Page) => page.evaluate(() => (window as unknown as Host).viewFixture.modes);
const history = (page: Page) =>
  area(page).evaluate(() => {
    const editor = (window as unknown as LegacyGlobals).editor;
    if (!editor) throw Error('Missing actual editor');
    return JSON.stringify([editor.undo.commandStack, editor.undo.index]);
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const current = (window as unknown as Host).marklyraEditor;
    await current.ready;
    const Constructor = current.constructor as typeof MarkLyraEditor;
    current.destroy();
    const container = document.querySelector<HTMLElement>('#editor');
    if (!container) throw Error('Missing fixture mount');
    const f: ViewFixture = {
      editor: current,
      modes: [],
      errors: [],
      throwObserver: false,
      throwDiagnostics: false,
      holdStatistics: false,
      held: [],
      release() {
        this.holdStatistics = false;
        for (const event of this.held.splice(0))
          window.dispatchEvent(
            new MessageEvent('message', {
              data: event.data,
              source: event.source,
              origin: event.origin,
            }),
          );
      },
    };
    // Delay an actual statistics response before the new SDK listener, without
    // fabricating mode/source/checkpoint fields or changing the private runtime.
    window.addEventListener('message', (event) => {
      if (
        f.holdStatistics &&
        event.data?.kind === 'response' &&
        typeof event.data.payload?.renderEpoch === 'number' &&
        event.data.payload?.state
      ) {
        f.held.push(event);
        event.stopImmediatePropagation();
      }
    });
    f.editor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      configuration: { sourceBOM: 'text' },
      onViewModeChange(mode) {
        f.modes.push(mode);
        if (f.throwObserver) throw Error('MarkLyra view observer failure');
      },
      onError(error) {
        f.errors.push(error.message);
        if (f.throwDiagnostics) throw Error('MarkLyra diagnostic observer failure');
      },
    });
    (window as unknown as Host).viewFixture = f;
    (window as unknown as Host).marklyraEditor = f.editor;
    await f.editor.ready;
  }, raw);
});

test('accepted view events include the initial mode, deduplicate reads, and do not mutate source/history', async ({
  page,
}) => {
  expect(await modes(page)).toEqual(['wysiwyg']);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const beforeHistory = await history(page);
  expect(await flush(page)).toBe(raw);
  expect(await flush(page)).toBe(raw);
  expect(await modes(page)).toEqual(['wysiwyg']);
  for (let index = 0; index < 4; index++) {
    await toggle(page);
    await toggle(page);
  }
  expect(await modes(page)).toEqual([
    'wysiwyg',
    ...Array.from({ length: 4 }, () => ['source', 'wysiwyg']).flat(),
  ]);
  expect(await flush(page)).toBe(raw);
  expect(await history(page)).toBe(beforeHistory);
  expect(await iframe?.evaluate((node) => node.isConnected)).toBe(true);
});

test('a delayed genuine statistics receipt cannot publish a stale view mode after a newer toggle', async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as unknown as Host).viewFixture;
    f.holdStatistics = true;
    f.statisticsJob = f.editor.getStatistics().then(
      () => 'resolved',
      (error: unknown) => String(error),
    );
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).viewFixture.held.length))
    .toBe(1);
  await toggle(page);
  expect(await modes(page)).toEqual(['wysiwyg', 'source']);
  await page.evaluate(async () => {
    const f = (window as unknown as Host).viewFixture;
    f.release();
    await f.statisticsJob;
  });
  expect(await modes(page)).toEqual(['wysiwyg', 'source']);
  expect(await flush(page)).toBe(raw);
  await toggle(page);
  expect(await modes(page)).toEqual(['wysiwyg', 'source', 'wysiwyg']);
});

test('failed replacement and throwing view/diagnostic observers cannot invent a mode or fault the current document', async ({
  page,
}) => {
  await toggle(page);
  await area(page).evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw Error('Missing Source CodeMirror');
    cm.setCursor({ line: 2, ch: 5 });
    cm.focus();
  });
  await page.keyboard.type('X');
  const edited = raw.replace('Tail ', 'Tail X');
  expect(await flush(page)).toBe(edited);
  const error = await page.evaluate(async () => {
    try {
      await (window as unknown as Host).viewFixture.editor.load('Invalid \uD800 source');
      return '';
    } catch (error) {
      return String(error);
    }
  });
  expect(error).toMatch(/normalization|surrogate/);
  expect(await modes(page)).toEqual(['wysiwyg', 'source']);
  expect(await flush(page)).toBe(edited);
  // Original rollback may seed an equal-text WYS reload entry when its stack
  // was empty. The existing document-lifecycle contract checks Source history
  // by real Undo/Redo, rather than imposing an unchanged empty WYS stack.
  await page.evaluate(() =>
    (window as unknown as Host).viewFixture.editor.execute({ type: 'undo' }),
  );
  expect(await flush(page)).toBe(raw);
  await page.evaluate(() =>
    (window as unknown as Host).viewFixture.editor.execute({ type: 'redo' }),
  );
  expect(await flush(page)).toBe(edited);
  await page.evaluate(() => {
    const f = (window as unknown as Host).viewFixture;
    f.throwObserver = f.throwDiagnostics = true;
  });
  await toggle(page);
  expect(await modes(page)).toEqual(['wysiwyg', 'source', 'wysiwyg']);
  expect(await flush(page)).toBe(edited);
  expect(await page.evaluate(() => (window as unknown as Host).viewFixture.errors)).toContain(
    'MarkLyra view observer failure',
  );
  await page.evaluate(() => {
    const f = (window as unknown as Host).viewFixture;
    f.editor.destroy();
  });
  expect(await modes(page)).toEqual(['wysiwyg', 'source', 'wysiwyg']);
});

test('React forwards the latest mode callback without remounting and ignores a delayed reply after unmount', async ({
  page,
}) => {
  // Keep a genuinely served loopback document: Chromium treats route.fulfill
  // main documents as a different network address space and blocks the iframe.
  const fixtureUrl = `/@fs${fileURLToPath(new URL('../../apps/desktop/test/view-mode-react-fixture.tsx', import.meta.url))}`;
  await page.evaluate(async (moduleUrl) => {
    (window as unknown as Host).viewFixture.editor.destroy();
    const { mountViewModeReactFixture } = (await import(
      moduleUrl
    )) as typeof import('../../apps/desktop/test/view-mode-react-fixture.js');
    Reflect.set(window, 'reactViewFixture', mountViewModeReactFixture());
  }, fixtureUrl);
  await page.waitForFunction(() => Boolean(Reflect.get(window, 'reactViewFixture')?.editor));
  const read = () => page.evaluate(() => Reflect.get(window, 'reactViewFixture').events);
  await expect.poll(read).toEqual([[1, 'wysiwyg']]);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.getByRole('button', { name: 'Latest callback' }).click();
  await page.evaluate(() =>
    (Reflect.get(window, 'reactViewFixture').editor as MarkLyraEditor).execute({
      type: 'toggleSource',
    }),
  );
  expect(await read()).toEqual([
    [1, 'wysiwyg'],
    [2, 'source'],
  ]);
  expect(await iframe?.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => {
    const f = Reflect.get(window, 'reactViewFixture');
    f.hold = true;
    f.pending = (f.editor as MarkLyraEditor).execute({ type: 'toggleSource' }).catch(() => {});
  });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'reactViewFixture').held.length))
    .toBeGreaterThan(0);
  await page.evaluate(async () => {
    const f = Reflect.get(window, 'reactViewFixture');
    f.unmount();
    f.hold = false;
    for (const event of f.held.splice(0) as MessageEvent[])
      window.dispatchEvent(
        new MessageEvent('message', {
          data: event.data,
          source: event.source,
          origin: event.origin,
        }),
      );
    await f.pending;
  });
  expect(await read()).toEqual([
    [1, 'wysiwyg'],
    [2, 'source'],
  ]);
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(0);
});

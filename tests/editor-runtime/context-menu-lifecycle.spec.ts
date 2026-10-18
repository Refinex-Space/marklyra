import { fileURLToPath } from 'node:url';
import type {
  ClipboardContent,
  ContextAction,
  ContextMenuRequest,
  MarkLyraEditor,
} from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { browserContextMenu } from '../../packages/editor-runtime/src/context-menu/browser.js';

type Kind = 'read' | 'write' | 'external';
type Switch = 'load' | 'reload';
type LifeWindow = Window & {
  marklyraEditor: MarkLyraEditor;
  lifecycle: {
    request?: ContextMenuRequest;
    choose?: (action: ContextAction | null) => void;
    gate?: { signal: AbortSignal; resolve(): void; reject(): void };
    gateState: 'absent' | 'pending' | 'resolved' | 'rejected';
    writes: ClipboardContent[];
    opened: string[];
    errors: string[];
    unhandled: string[];
    switchState: 'idle' | 'pending' | 'applied' | 'failed';
    switchError?: string;
  };
};
const original = 'Alpha Bravo Charlie\r\nkeep';
const replacement = '\uFEFFNext document\r\n\r\n保留😀';

async function pendingClipboard(page: Page, kind: Kind, source = original) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as LifeWindow).marklyraEditor));
  await page.evaluate(
    async ({ kind, source }) => {
      const host = window as unknown as LifeWindow;
      const old = host.marklyraEditor;
      await old.ready;
      const Constructor = old.constructor as typeof MarkLyraEditor;
      const mount = old.element.parentElement;
      if (!mount) throw Error('Missing editor mount');
      old.destroy();
      host.lifecycle = {
        gateState: 'absent',
        writes: [],
        opened: [],
        errors: [],
        unhandled: [],
        switchState: 'idle',
      };
      const state = host.lifecycle;
      window.addEventListener('unhandledrejection', (event) =>
        state.unhandled.push(String(event.reason)),
      );
      const hold = <T>(value: T, signal: AbortSignal): Promise<T> =>
        new Promise((resolve, reject) => {
          state.gateState = 'pending';
          // Deliberately ignore signal: native permission dialogs and some host
          // adapters cannot cancel their pending external operation.
          state.gate = {
            signal,
            resolve: () => {
              state.gateState = 'resolved';
              resolve(value);
            },
            reject: () => {
              state.gateState = 'rejected';
              reject(Error('Late clipboard failure'));
            },
          };
        });
      host.marklyraEditor = new Constructor(mount, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: source,
        onError: (error) => state.errors.push(error.message),
        host: {
          contextMenu: {
            show(request, choose) {
              state.request = request;
              state.choose = choose;
            },
          },
          openExternal(url, signal) {
            state.opened.push(url);
            return hold(undefined, signal);
          },
          clipboard: {
            read: (signal) =>
              kind === 'read'
                ? hold({ text: 'Late paste must not arrive' }, signal)
                : Promise.resolve({ text: 'unused' }),
            write(content, signal) {
              state.writes.push(content);
              return kind === 'write' ? hold(undefined, signal) : Promise.resolve();
            },
          },
        },
      });
      await host.marklyraEditor.ready;
    },
    { kind, source },
  );
  const editorFrame = page.frameLocator('.marklyra-editor-frame');
  if (kind === 'external') await editorFrame.locator('#write a').first().click({ button: 'right' });
  else {
    const paragraph = editorFrame.locator('#write > p').first();
    await paragraph.click();
    const point = await paragraph.evaluate((element) => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
      if (!text) throw Error('Missing selection text');
      const selection = element.ownerDocument.getSelection();
      selection?.setBaseAndExtent(text, 11, text, 6);
      const rect = selection?.getRangeAt(0).getClientRects()[0];
      if (!rect) throw Error('Missing selection bounds');
      return { x: rect.left + Math.min(8, rect.width / 2), y: rect.top + rect.height / 2 };
    });
    const box = await page.locator('.marklyra-editor-frame').boundingBox();
    if (!box) throw Error('Missing frame geometry');
    await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  }
  await page.waitForFunction(() => Boolean((window as unknown as LifeWindow).lifecycle.request));
  await page.evaluate((kind) => {
    (window as unknown as LifeWindow).lifecycle.choose?.(
      kind === 'external' ? 'link.open' : kind === 'read' ? 'edit.paste' : 'edit.cut',
    );
  }, kind);
  await page.waitForFunction(
    () => (window as unknown as LifeWindow).lifecycle.gateState === 'pending',
  );
  expect(await page.evaluate(() => (window as unknown as LifeWindow).marklyraEditor.flush())).toBe(
    source,
  );
  if (kind === 'write') {
    const writes = await page.evaluate(() => (window as unknown as LifeWindow).lifecycle.writes);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.text).toBe('Bravo');
  }
}

for (const kind of ['read', 'write'] as const)
  for (const operation of ['load', 'reload'] as const)
    for (const late of ['resolve', 'reject'] as const) {
      test(`${operation} releases pending noncooperative clipboard ${kind}; late ${late} cannot alter document`, async ({
        page,
      }) => {
        await pendingClipboard(page, kind);
        await page.evaluate(
          async ({ operation, replacement }) => {
            const host = window as unknown as LifeWindow;
            const editor = host.marklyraEditor;
            const source = await editor.flush();
            const revision = editor.revision;
            host.lifecycle.switchState = 'pending';
            const switching =
              operation === 'load'
                ? editor.load(replacement, { expectedSource: source })
                : editor.reloadFromDisk(replacement, {
                    expectedSource: source,
                    expectedRevision: revision,
                  });
            void switching.then(
              () => {
                host.lifecycle.switchState = 'applied';
              },
              (error: unknown) => {
                host.lifecycle.switchState = 'failed';
                host.lifecycle.switchError = String(error);
              },
            );
          },
          { operation, replacement },
        );
        // This must finish before the provider is allowed to resolve or reject.
        await expect
          .poll(() => page.evaluate(() => (window as unknown as LifeWindow).lifecycle.switchState))
          .toBe('applied');
        const waiting = await page.evaluate(() => ({
          aborted: (window as unknown as LifeWindow).lifecycle.gate?.signal.aborted,
          gate: (window as unknown as LifeWindow).lifecycle.gateState,
          source: (window as unknown as LifeWindow).marklyraEditor.getMarkdown(),
        }));
        expect(waiting).toEqual({ aborted: true, gate: 'pending', source: replacement });
        await page.evaluate(async (late) => {
          const host = window as unknown as LifeWindow;
          host.lifecycle.gate?.[late]();
          await Promise.resolve();
          await Promise.resolve();
        }, late);
        expect(
          await page.evaluate(() => (window as unknown as LifeWindow).marklyraEditor.flush()),
        ).toBe(replacement);
        if (operation === 'reload') {
          await page.evaluate(() =>
            (window as unknown as LifeWindow).marklyraEditor.execute({ type: 'undo' }),
          );
          expect(
            await page.evaluate(() => (window as unknown as LifeWindow).marklyraEditor.flush()),
          ).toBe(original);
          await page.evaluate(() =>
            (window as unknown as LifeWindow).marklyraEditor.execute({ type: 'redo' }),
          );
          expect(
            await page.evaluate(() => (window as unknown as LifeWindow).marklyraEditor.flush()),
          ).toBe(replacement);
        }
        const messages = await page.evaluate(() => ({
          errors: (window as unknown as LifeWindow).lifecycle.errors,
          unhandled: (window as unknown as LifeWindow).lifecycle.unhandled,
        }));
        expect(messages).toEqual({ errors: [], unhandled: [] });
      });
    }

for (const operation of ['load', 'reload'] as const satisfies readonly Switch[]) {
  test(`${operation} cancels a noncooperative external-link adapter without launching a URL`, async ({
    page,
  }) => {
    const source = '[Site](https://example.test/review) Tail';
    await pendingClipboard(page, 'external', source);
    expect(await page.evaluate(() => (window as unknown as LifeWindow).lifecycle.opened)).toEqual([
      'https://example.test/review',
    ]);
    await page.evaluate(
      async ({ operation, replacement }) => {
        const host = window as unknown as LifeWindow;
        const editor = host.marklyraEditor;
        const expectedSource = await editor.flush(),
          expectedRevision = editor.revision;
        host.lifecycle.switchState = 'pending';
        const switching =
          operation === 'load'
            ? editor.load(replacement, { expectedSource })
            : editor.reloadFromDisk(replacement, { expectedSource, expectedRevision });
        void switching.then(
          () => {
            host.lifecycle.switchState = 'applied';
          },
          (error: unknown) => {
            host.lifecycle.switchState = 'failed';
            host.lifecycle.switchError = String(error);
          },
        );
      },
      { operation, replacement },
    );
    await expect
      .poll(() => page.evaluate(() => (window as unknown as LifeWindow).lifecycle.switchState))
      .toBe('applied');
    expect(
      await page.evaluate(() => ({
        aborted: (window as unknown as LifeWindow).lifecycle.gate?.signal.aborted,
        state: (window as unknown as LifeWindow).lifecycle.gateState,
      })),
    ).toEqual({ aborted: true, state: 'pending' });
    await page.evaluate(async (operation) => {
      const host = window as unknown as LifeWindow;
      if (operation === 'load') host.lifecycle.gate?.resolve();
      else host.lifecycle.gate?.reject();
      await Promise.resolve();
      await Promise.resolve();
    }, operation);
    expect(
      await page.evaluate(() => (window as unknown as LifeWindow).marklyraEditor.flush()),
    ).toBe(replacement);
    expect(
      await page.evaluate(() => ({
        errors: (window as unknown as LifeWindow).lifecycle.errors,
        unhandled: (window as unknown as LifeWindow).lifecycle.unhandled,
        opened: (window as unknown as LifeWindow).lifecycle.opened,
      })),
    ).toEqual({ errors: [], unhandled: [], opened: ['https://example.test/review'] });
  });
}

// This tests the DOM adapter directly, independently of native menu/clipboard.
test('synchronous focus loss cancellation removes the menu before a late callback', async ({
  page,
}) => {
  await page.route('**/__context_lifecycle__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body><button id="origin">Origin</button></body>',
    }),
  );
  await page.goto('/__context_lifecycle__');
  const module = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/context-menu/browser.ts', import.meta.url))}`;
  const actual = await page.evaluate(async (module) => {
    const { browserContextMenu: create } = (await import(module)) as {
      browserContextMenu: typeof browserContextMenu;
    };
    const origin = document.querySelector<HTMLButtonElement>('#origin');
    if (!origin) throw Error('Missing focus origin');
    origin.focus();
    const controller = new AbortController();
    const selected: (ContextAction | null)[] = [];
    let detached: HTMLButtonElement | null = null;
    origin.addEventListener(
      'blur',
      () => {
        detached = document.querySelector('[role=menuitem]');
        controller.abort();
      },
      { once: true },
    );
    create(document).show(
      {
        requestId: 'focus-cancel',
        point: { x: 10, y: 10 },
        items: [{ type: 'item', actionId: 'edit.copy', label: 'Copy', enabled: true }],
      },
      (action) => selected.push(action),
      controller.signal,
    );
    const retained = detached as HTMLButtonElement | null;
    retained?.click();
    return {
      aborted: controller.signal.aborted,
      remaining: document.querySelectorAll('[role=menu]').length,
      selected,
    };
  }, module);
  expect(actual).toEqual({ aborted: true, remaining: 0, selected: [] });
});

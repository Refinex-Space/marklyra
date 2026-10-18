import type {
  ClipboardContent,
  ContextAction,
  ContextMenuRequest,
  MarkLyraEditor,
} from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type CM = NonNullable<LegacyEditor['sourceView']['cm']> & {
  refresh(): void;
  getHistory(): unknown;
  swapDoc(document: CM['doc']): CM['doc'];
  charCoords(
    position: { line: number; ch: number },
    mode: string,
  ): {
    left: number;
    top: number;
    bottom: number;
  };
};
type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  cmMenu: {
    request?: ContextMenuRequest;
    choose?: (action: ContextAction | null) => void;
    writes: ClipboardContent[];
    errors: string[];
  };
};
type Runtime = Window & {
  editor: LegacyEditor;
  cmMenuTarget?: Element;
  cmMenuIdentity?: { cm: CM; wrapper: HTMLElement; doc: CM['doc']; history: unknown };
  sourceContextReplay?: {
    hold: boolean;
    callbacks: { started: boolean; completed: boolean }[];
    held: (() => void)[];
  };
};
const source = 'Alpha\r\nBravo\nCharlie';
const selected = [{ anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 1 } }];
const runtimeFrame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    const runtime = window as unknown as Runtime;
    const probe = {
      hold: false,
      callbacks: [] as { started: boolean; completed: boolean }[],
      held: [] as (() => void)[],
    };
    runtime.sourceContextReplay = probe;
    const schedule = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (
        typeof handler !== 'function' ||
        timeout !== 180 ||
        !handler.toString().includes('setSelection')
      )
        return schedule(handler, timeout, ...args);
      const item = { started: false, completed: false };
      probe.callbacks.push(item);
      return schedule(() => {
        item.started = true;
        const execute = () => {
          try {
            Reflect.apply(handler, window, args);
          } finally {
            item.completed = true;
          }
        };
        if (probe.hold) probe.held.push(execute);
        else execute();
      }, timeout);
    }) as typeof setTimeout;
  });
});
async function waitReplay(page: Page, completed = true) {
  await expect
    .poll(() =>
      runtimeFrame(page)
        .locator('body')
        .evaluate((_body, completed) => {
          const items = (window as unknown as Runtime).sourceContextReplay?.callbacks;
          return (
            items?.length === 1 &&
            items.every((item) => (completed ? item.completed : item.started))
          );
        }, completed),
    )
    .toBe(true);
}
async function releaseReplay(page: Page) {
  await runtimeFrame(page)
    .locator('body')
    .evaluate(() => {
      const probe = (window as unknown as Runtime).sourceContextReplay;
      if (!probe) throw Error('Missing source replay probe');
      probe.hold = false;
      for (const work of probe.held.splice(0)) work();
    });
  await waitReplay(page);
}
async function mount(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor,
      root = old.element.parentElement;
    if (!root) throw Error('Missing host mount');
    old.destroy();
    host.cmMenu = { writes: [], errors: [] };
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.cmMenu.errors.push(error.message),
      host: {
        contextMenu: {
          show(request, choose) {
            host.cmMenu.request = request;
            host.cmMenu.choose = choose;
          },
        },
        clipboard: {
          async write(content) {
            host.cmMenu.writes.push(structuredClone(content));
          },
          async read() {
            return { text: '' };
          },
        },
      },
    });
    await host.marklyraEditor.ready;
  }, source);
}
async function openSourceMenu(page: Page, holdReplay = false) {
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  const point = await runtimeFrame(page)
    .locator('body')
    .evaluate(
      (_body, { selected, holdReplay }) => {
        const runtime = window as unknown as Runtime,
          cm = runtime.editor.sourceView.cm as CM;
        const wrapper = cm.getWrapperElement();
        if (runtime.sourceContextReplay) runtime.sourceContextReplay.hold = holdReplay;
        document.addEventListener(
          'contextmenu',
          (event) => {
            if (event.target instanceof Element) runtime.cmMenuTarget = event.target;
          },
          { capture: true, once: true },
        );
        cm.focus();
        cm.setSelections(selected, 0);
        runtime.cmMenuIdentity = { cm, wrapper, doc: cm.doc, history: cm.getHistory() };
        const rect = cm.charCoords({ line: 0, ch: 2 }, 'window');
        return { x: rect.left + 2, y: (rect.top + rect.bottom) / 2 };
      },
      { selected, holdReplay },
    );
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing runtime frame');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as unknown as Host).cmMenu.request));
}
async function redraw(page: Page) {
  await runtimeFrame(page)
    .locator('body')
    .evaluate(() => {
      const runtime = window as unknown as Runtime,
        identity = runtime.cmMenuIdentity;
      if (!identity || !runtime.cmMenuTarget || runtime.cmMenuTarget === identity.wrapper)
        throw Error('Missing rendered menu leaf');
      identity.cm.refresh();
    });
  await expect
    .poll(() =>
      runtimeFrame(page)
        .locator('body')
        .evaluate(() => (window as unknown as Runtime).cmMenuTarget?.isConnected),
    )
    .toBe(false);
}
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());

for (const action of ['edit.copy', 'edit.cut'] as const)
  test(`source ${action} survives real CodeMirror view redraw with directed selection and history`, async ({
    page,
  }) => {
    await mount(page);
    await openSourceMenu(page);
    await redraw(page);
    await page.evaluate((action) => (window as unknown as Host).cmMenu.choose?.(action), action);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const menu = (window as unknown as Host).cmMenu;
          return menu.writes.length + menu.errors.length;
        }),
      )
      .toBe(1);
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.errors)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.writes)).toHaveLength(1);
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.writes[0]?.text)).toBe(
      'lph',
    );
    if (action === 'edit.copy') {
      await waitReplay(page);
      expect(await flush(page)).toBe(source);
      const after = await runtimeFrame(page)
        .locator('body')
        .evaluate(() => {
          const runtime = window as unknown as Runtime,
            identity = runtime.cmMenuIdentity;
          if (!identity) throw Error('Missing identity');
          return {
            wrapper: identity.cm.getWrapperElement() === identity.wrapper,
            document: identity.cm.doc === identity.doc,
            ranges: identity.cm.listSelections(),
            history: identity.cm.getHistory(),
            beforeHistory: identity.history,
          };
        });
      expect(after.wrapper && after.document).toBe(true);
      expect(after.ranges).toEqual(selected);
      expect(after.history).toEqual(after.beforeHistory);
    } else {
      await expect.poll(() => flush(page)).toBe('Aa\r\nBravo\nCharlie');
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }),
      );
      expect(await flush(page)).toBe(source);
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }),
      );
      expect(await flush(page)).toBe('Aa\r\nBravo\nCharlie');
      await waitReplay(page);
    }
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.errors)).toEqual([]);
  });

for (const next of ['input', 'document'] as const)
  test(`an accepted source cut replay cannot overwrite a newer ${next}`, async ({ page }) => {
    await mount(page);
    await openSourceMenu(page, true);
    // The real original 180ms timer has fired; hold only this callback while
    // exercising a later user action. Its original body is then allowed to finish.
    await waitReplay(page, false);
    await page.evaluate(() => (window as unknown as Host).cmMenu.choose?.('edit.cut'));
    await expect.poll(() => flush(page)).toBe('Aa\r\nBravo\nCharlie');
    if (next === 'input') {
      await page.keyboard.type('Z');
      expect(await flush(page)).toBe('AZa\r\nBravo\nCharlie');
    } else {
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.load('Unrelated document\r\nKeep\n'),
      );
      await runtimeFrame(page)
        .locator('body')
        .evaluate(() => {
          const runtime = window as unknown as Runtime,
            cm = runtime.editor.sourceView.cm as CM;
          if (cm !== runtime.cmMenuIdentity?.cm)
            throw Error('Expected retained original source CM');
          cm.focus();
          cm.setSelections([{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }], 0);
        });
    }
    const before = await runtimeFrame(page)
      .locator('body')
      .evaluate(() => {
        const cm = (window as unknown as Runtime).editor.sourceView.cm as CM;
        return { ranges: cm.listSelections(), history: cm.getHistory(), value: cm.getValue() };
      });
    await releaseReplay(page);
    const after = await runtimeFrame(page)
      .locator('body')
      .evaluate(() => {
        const cm = (window as unknown as Runtime).editor.sourceView.cm as CM;
        return { ranges: cm.listSelections(), history: cm.getHistory(), value: cm.getValue() };
      });
    expect(after).toEqual(before);
    await page.keyboard.type('Y');
    expect(await flush(page)).toBe(
      next === 'input' ? 'AZYa\r\nBravo\nCharlie' : 'YUnrelated document\r\nKeep\n',
    );
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.errors)).toEqual([]);
  });

for (const change of ['wrapper', 'instance', 'document'] as const)
  test(`source menu rejects a changed CodeMirror ${change} after view redraw`, async ({ page }) => {
    await mount(page);
    await openSourceMenu(page);
    await redraw(page);
    await runtimeFrame(page)
      .locator('body')
      .evaluate((_body, change) => {
        const identity = (window as unknown as Runtime).cmMenuIdentity;
        if (!identity) throw Error('Missing identity');
        if (change === 'wrapper') identity.wrapper.replaceWith(identity.wrapper.cloneNode(true));
        if (change === 'instance') Reflect.set(identity.wrapper, 'CodeMirror', {});
        if (change === 'document') {
          const Constructor = identity.doc.constructor as new (value: string) => CM['doc'];
          identity.cm.swapDoc(new Constructor(identity.cm.getValue()));
        }
      }, change);
    await page.evaluate(() => (window as unknown as Host).cmMenu.choose?.('edit.copy'));
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).cmMenu.errors.length))
      .toBe(1);
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.errors[0])).toContain(
      '上下文',
    );
    expect(await page.evaluate(() => (window as unknown as Host).cmMenu.writes)).toEqual([]);
    expect(await flush(page)).toBe(source);
  });

test('prose menu still rejects replacement of its bound DOM target', async ({ page }) => {
  await mount(page);
  const point = await runtimeFrame(page)
    .locator('#write > p')
    .first()
    .evaluate((p) => {
      (p as HTMLElement).focus();
      const text = p.firstElementChild?.firstChild;
      if (!text) throw Error('Missing prose text');
      document.getSelection()?.setBaseAndExtent(text, 1, text, 4);
      const rect = document.getSelection()?.getRangeAt(0).getBoundingClientRect();
      if (!rect) throw Error('Missing selected rect');
      return { x: rect.x + 2, y: rect.y + rect.height / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing runtime frame');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as unknown as Host).cmMenu.request));
  await runtimeFrame(page)
    .locator('#write > p')
    .first()
    .evaluate((p) => p.replaceWith(p.cloneNode(true)));
  await page.evaluate(() => (window as unknown as Host).cmMenu.choose?.('edit.copy'));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).cmMenu.errors.length))
    .toBe(1);
  expect(await page.evaluate(() => (window as unknown as Host).cmMenu.errors[0])).toContain(
    '上下文',
  );
  expect(await page.evaluate(() => (window as unknown as Host).cmMenu.writes)).toEqual([]);
});

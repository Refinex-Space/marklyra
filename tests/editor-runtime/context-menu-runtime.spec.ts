import type {
  ClipboardContent,
  ContextAction,
  ContextMenuRequest,
  MarkLyraEditor,
} from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { settleMarkerClick } from './marker-selection.helpers.js';

type Host = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    menu: {
      request?: ContextMenuRequest;
      pick?: (action: ContextAction | null) => void;
      signals: AbortSignal[];
      writes: ClipboardContent[];
      read: ClipboardContent;
      errors: string[];
      hold: boolean;
      fail: boolean;
      pending?: () => void;
      opened: string[];
    };
  };
async function mount(page: Page, source = 'Alpha Bravo Charlie') {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    host.menu = {
      signals: [],
      writes: [],
      read: { text: 'Pasted 中文😀' },
      errors: [],
      hold: false,
      fail: false,
      opened: [],
    };
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing host');
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.menu.errors.push(error.message),
      host: {
        contextMenu: {
          show(request, pick, signal) {
            host.menu.request = request;
            host.menu.pick = pick;
            host.menu.signals.push(signal);
          },
        },
        clipboard: {
          async read() {
            return host.menu.read;
          },
          async write(content, signal) {
            host.menu.writes.push(content);
            if (host.menu.fail) throw Error('Denied clipboard write');
            if (host.menu.hold)
              await new Promise<void>((resolve, reject) => {
                host.menu.pending = resolve;
                signal.addEventListener('abort', () => reject(Error('Clipboard aborted')), {
                  once: true,
                });
              });
          },
        },
        openExternal: async (url) => {
          host.menu.opened.push(url);
        },
      },
    });
    await host.marklyraEditor.ready;
  }, source);
}
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const flush = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as Host).marklyraEditor.execute({ type }), type);
async function select(
  page: Page,
  anchor: number,
  head: number,
  selector = '#write > p',
  activate = true,
) {
  await page.locator('.marklyra-editor-frame').focus();
  if (activate) await frame(page).locator(selector).first().click();
  await frame(page)
    .locator(selector)
    .first()
    .evaluate(
      (element, { anchor, head }) => {
        const point = (offset: number): [Node, number] => {
          const walker = element.ownerDocument.createTreeWalker(element, 4);
          let at = 0,
            node = walker.nextNode();
          while (node) {
            const size = node.textContent?.length ?? 0;
            if (at <= offset && offset <= at + size) return [node, offset - at];
            at += size;
            node = walker.nextNode();
          }
          throw Error('No selection endpoint');
        };
        element.ownerDocument.getSelection()?.setBaseAndExtent(...point(anchor), ...point(head));
      },
      { anchor, head },
    );
}
async function open(page: Page, selector?: string) {
  await page.evaluate(() => {
    delete (window as Host).menu.request;
  });
  if (selector) await frame(page).locator(selector).first().click({ button: 'right' });
  else {
    const point = await frame(page)
      .locator('#write')
      .evaluate((root) => {
        const selection = root.ownerDocument.getSelection();
        if (!selection?.rangeCount) throw Error('Missing selected range');
        const rects = [...selection.getRangeAt(0).getClientRects()];
        const rect = rects.find((rect) => rect.width > 2 && rect.height > 0) ?? rects[0];
        if (!rect) throw Error('Missing selection geometry');
        return {
          x: rect.x + (rect.width ? Math.min(8, rect.width / 2) : 2),
          y: rect.y + rect.height / 2,
        };
      });
    const box = await page.locator('.marklyra-editor-frame').boundingBox();
    if (!box) throw Error('Missing frame bounds');
    await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  }
  await page.waitForFunction(() => Boolean((window as Host).menu.request));
  return page.evaluate(() => (window as Host).menu.request);
}
async function choose(page: Page, action: ContextAction | null) {
  await page.evaluate((action) => (window as Host).menu.pick?.(action), action);
}
const errors = (page: Page) => page.evaluate(() => (window as Host).menu.errors);
const writes = (page: Page) => page.evaluate(() => (window as Host).menu.writes);
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const values: string[] = [];
  pageErrors.set(page, values);
  page.on('pageerror', (error) => values.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(await errors(page)).toEqual([]);
  expect(pageErrors.get(page)).toEqual([]);
});

for (const action of [
  'edit.copy',
  'edit.copyMarkdown',
  'edit.copyHTML',
  'edit.copySemanticHTML',
] as const)
  test(`original ${action} keeps reverse selection and source`, async ({ page }) => {
    const raw = 'Alpha **Bravo** Charlie\r\nkeep';
    await mount(page, raw);
    await settleMarkerClick(page);
    await select(page, 12, 9, '#write > p', false);
    await open(page);
    await choose(page, action);
    await expect.poll(async () => (await writes(page)).length).toBe(1);
    const content = (await writes(page))[0];
    expect(content?.text).toContain('rav');
    if (action === 'edit.copySemanticHTML') expect(content?.html).toContain('rav');
    if (action === 'edit.copyHTML') expect(content?.text).toBe('rav');
    expect(await flush(page)).toBe(raw);
    const selected = await frame(page)
      .locator('#write > p')
      .evaluate((p) => {
        const s = p.ownerDocument.getSelection();
        return { text: s?.toString(), anchor: s?.anchorOffset, head: s?.focusOffset };
      });
    expect(selected).toEqual({ text: 'rav', anchor: 4, head: 1 });
  });
test('two-phase cut retains mixed-EOL repeated soft-line identity and Undo', async ({ page }) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 0);
  await open(page);
  await choose(page, 'edit.cut');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  await expect.poll(() => flush(page)).toBe('same\nsame');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await command(page, 'redo');
  expect(await flush(page)).toBe('same\nsame');
});
test('failed clipboard write cannot delete selected text', async ({ page }) => {
  const raw = 'Alpha Bravo Charlie';
  await mount(page, raw);
  await select(page, 11, 6);
  await open(page);
  await page.evaluate(() => {
    (window as Host).menu.fail = true;
  });
  await choose(page, 'edit.cut');
  await expect.poll(async () => (await errors(page)).length).toBe(1);
  expect(await errors(page)).toEqual(['Denied clipboard write']);
  expect(await flush(page)).toBe(raw);
  await page.evaluate(() => (window as Host).menu.errors.splice(0));
});
test('input during clipboard write cancels late cut and retains user text', async ({ page }) => {
  const raw = 'Alpha Bravo Charlie';
  await mount(page, raw);
  await select(page, 11, 6);
  await open(page);
  await page.evaluate(() => {
    (window as Host).menu.hold = true;
  });
  await choose(page, 'edit.cut');
  await page.waitForFunction(() => Boolean((window as Host).menu.pending));
  await select(page, raw.length, raw.length);
  await page.keyboard.insertText('X');
  await page.evaluate(() => (window as Host).menu.pending?.());
  expect(await flush(page)).toBe(`${raw}X`);
});
for (const action of ['edit.paste', 'edit.pastePlain'] as const)
  test(`original ${action} and history`, async ({ page }) => {
    const raw = 'Alpha Bravo Charlie\r\nkeep';
    await mount(page, raw);
    await select(page, 11, 6);
    await open(page);
    await page.evaluate(() => {
      (window as Host).menu.read = { text: 'World', html: '<strong>World</strong>' };
    });
    await choose(page, action);
    const expected =
      action === 'edit.paste' ? 'Alpha **World** Charlie\r\nkeep' : 'Alpha World Charlie\r\nkeep';
    await expect.poll(() => flush(page)).toBe(expected);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    await command(page, 'redo');
    expect(await flush(page)).toBe(expected);
  });
test('cancel and forged action preserve content', async ({ page }) => {
  const raw = 'Alpha Bravo Charlie';
  await mount(page, raw);
  await select(page, 11, 6);
  const request = await open(page);
  expect(request?.items.length).toBeGreaterThan(0);
  await choose(page, null);
  expect(await flush(page)).toBe(raw);
  await choose(page, 'table.delete');
  expect(await flush(page)).toBe(raw);
  expect(await writes(page)).toEqual([]);
});
test('link copy/open use explicit host effects', async ({ page }) => {
  const raw = 'See [site](https://example.test/a) now';
  await mount(page, raw);
  await open(page, '#write a');
  await choose(page, 'link.copyAddress');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  expect((await writes(page))[0]?.text).toBe('https://example.test/a');
  await open(page, '#write a');
  await choose(page, 'link.open');
  await expect
    .poll(() => page.evaluate(() => (window as Host).menu.opened))
    .toEqual(['https://example.test/a']);
  expect(await flush(page)).toBe(raw);
});

test('copy HTML source includes selected strong wrapper', async ({ page }) => {
  const raw = 'Alpha **Bravo** Charlie';
  await mount(page, raw);
  await select(page, 15, 6);
  await open(page);
  await choose(page, 'edit.copyHTML');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  expect((await writes(page))[0]?.text).toMatch(/<strong[\s>]/);
  expect((await writes(page))[0]?.text).toContain('Bravo');
  expect(await flush(page)).toBe(raw);
});
const tableSource = '| A | B |\r\n| --- | --- |\r\n| one | two |\n| three | four |';
for (const action of [
  'table.insertRowBefore',
  'table.insertRowAfter',
  'table.insertColumnBefore',
  'table.insertColumnAfter',
  'table.deleteRow',
  'table.deleteColumn',
  'table.delete',
  'table.moveRowUp',
  'table.moveRowDown',
  'table.moveColumnRight',
] as const)
  test(`original ${action} retains one reversible command`, async ({ page }) => {
    await mount(page, tableSource);
    await select(page, 1, 1, '#write tbody tr:first-child td:first-child');
    await open(page, '#write tbody tr:first-child td:first-child');
    await choose(page, action);
    await expect.poll(() => flush(page)).not.toBe(tableSource);
    const edited = await flush(page);
    if (action === 'table.delete') await expect(frame(page).locator('#write table')).toHaveCount(0);
    await command(page, 'undo');
    expect(await flush(page)).toBe(tableSource);
    await command(page, 'redo');
    expect(await flush(page)).toBe(edited);
  });
test('original move-column-left uses current cell and retains Undo', async ({ page }) => {
  await mount(page, tableSource);
  await select(page, 1, 1, '#write tbody tr:first-child td:nth-child(2)');
  await open(page, '#write tbody tr:first-child td:nth-child(2)');
  await choose(page, 'table.moveColumnLeft');
  await expect.poll(() => flush(page)).not.toBe(tableSource);
  const edited = await flush(page);
  await command(page, 'undo');
  expect(await flush(page)).toBe(tableSource);
  await command(page, 'redo');
  expect(await flush(page)).toBe(edited);
});
test('table copy is read-only and includes all cells', async ({ page }) => {
  await mount(page, tableSource);
  await select(page, 1, 1, '#write tbody tr:first-child td:first-child');
  await open(page, '#write tbody tr:first-child td:first-child');
  await choose(page, 'table.copy');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  expect((await writes(page))[0]?.text).toContain('three');
  expect((await writes(page))[0]?.html).toContain('<table');
  expect(await flush(page)).toBe(tableSource);
});
test('source CodeMirror multiselection retains direction and primary through paste', async ({
  page,
}) => {
  const raw = 'Alpha\r\nBravo\nCharlie';
  await mount(page, raw);
  await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'toggleSource' }));
  const point = await frame(page)
    .locator('body')
    .evaluate(() => {
      const editor = (window as unknown as { editor: LegacyEditor }).editor,
        cm = editor.sourceView.cm;
      if (!cm) throw Error('Missing source editor');
      cm.focus();
      cm.setSelections(
        [
          { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 4 } },
          { anchor: { line: 1, ch: 4 }, head: { line: 1, ch: 1 } },
        ],
        1,
      );
      const charCoords = Reflect.get(cm, 'charCoords') as (
        p: { line: number; ch: number },
        mode: string,
      ) => { left: number; top: number; bottom: number };
      const point = charCoords.call(cm, { line: 0, ch: 2 }, 'window');
      return { x: point.left + 2, y: (point.top + point.bottom) / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('No frame');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as Host).menu.request));
  const before = await frame(page)
    .locator('body')
    .evaluate(() => {
      const cm = (window as unknown as { editor: LegacyEditor }).editor.sourceView.cm;
      return {
        ranges: cm?.listSelections(),
        anchor: cm?.getCursor('anchor'),
        head: cm?.getCursor('head'),
      };
    });
  expect(before.ranges).toHaveLength(2);
  await page.evaluate(() => {
    (window as Host).menu.read = { text: 'X' };
  });
  await choose(page, 'edit.pastePlain');
  await expect.poll(() => flush(page)).toBe('AXa\r\nBXo\nCharlie');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  const after = await frame(page)
    .locator('body')
    .evaluate(() => {
      const cm = (window as unknown as { editor: LegacyEditor }).editor.sourceView.cm;
      return {
        ranges: cm?.listSelections(),
        anchor: cm?.getCursor('anchor'),
        head: cm?.getCursor('head'),
      };
    });
  expect(after).toEqual(before);
});

const codeSource =
  'Before\r\n\r\n```javascript\r\nif (true) {\r\nconsole.log("x");\r\n}\r\n```\n\nAfter';
async function openCode(page: Page, selected = false) {
  await frame(page).locator('#write [mdtype="fences"]').click();
  await frame(page).locator('#write .CodeMirror').waitFor();
  const point = await frame(page)
    .locator('#write .CodeMirror')
    .evaluate((element, selected) => {
      const cm = Reflect.get(element, 'CodeMirror') as NonNullable<
        LegacyEditor['sourceView']['cm']
      >;
      cm.focus();
      cm.setSelections(
        [{ anchor: { line: 1, ch: selected ? 17 : 3 }, head: { line: 1, ch: selected ? 0 : 3 } }],
        0,
      );
      const coords = Reflect.get(cm, 'charCoords') as (
        p: { line: number; ch: number },
        mode: string,
      ) => { left: number; top: number; bottom: number };
      const p = coords.call(cm, { line: 1, ch: 2 }, 'window');
      return { x: p.left + 2, y: (p.top + p.bottom) / 2 };
    }, selected);
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('No frame');
  await page.evaluate(() => {
    delete (window as Host).menu.request;
  });
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as Host).menu.request));
}
test('code copy uses original content and keeps source unchanged', async ({ page }) => {
  await mount(page, codeSource);
  await openCode(page);
  await choose(page, 'code.copy');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  expect((await writes(page))[0]?.text).toContain('console.log("x");');
  expect(await flush(page)).toBe(codeSource);
});
for (const action of ['code.format', 'code.formatSelection'] as const)
  test(`original synchronous ${action} produces reversible indentation`, async ({ page }) => {
    await mount(page, codeSource);
    await openCode(page, action === 'code.formatSelection');
    await choose(page, action);
    await expect.poll(() => flush(page)).not.toBe(codeSource);
    const formatted = await flush(page);
    expect(formatted).toMatch(/\n[ \t]+console\.log/);
    await command(page, 'undo');
    expect(await flush(page)).toBe(codeSource);
    await command(page, 'redo');
    expect(await flush(page)).toBe(formatted);
  });
for (const action of [
  'block.insertParagraphBefore',
  'block.insertParagraphAfter',
  'block.delete',
] as const)
  test(`original ${action} around a code block uses native history`, async ({ page }) => {
    await mount(page, codeSource);
    await openCode(page);
    await choose(page, action);
    await expect.poll(() => flush(page)).not.toBe(codeSource);
    const changed = await flush(page);
    if (action === 'block.delete')
      await expect(frame(page).locator('#write [mdtype="fences"]')).toHaveCount(0);
    await command(page, 'undo');
    expect(await flush(page)).toBe(codeSource);
    await command(page, 'redo');
    expect(await flush(page)).toBe(changed);
  });
test('block edit enters original HTML source control without modifying the document', async ({
  page,
}) => {
  const raw = '<div>\r\n<span>Hello</span>\r\n</div>\n\nAfter';
  await mount(page, raw);
  await open(page, '#write [mdtype="html_block"]');
  await choose(page, 'block.edit');
  await expect(frame(page).locator('#write [mdtype="html_block"] .CodeMirror')).toBeVisible();
  expect(await flush(page)).toBe(raw);
});
test('table formatting is an explicit original history operation', async ({ page }) => {
  const raw = '| A | B |\r\n| --- | --- |\r\n|one|two|\n|three|four|';
  await mount(page, raw);
  await select(page, 1, 1, '#write tbody tr:first-child td:first-child');
  await open(page, '#write tbody tr:first-child td:first-child');
  await choose(page, 'table.format');
  await expect.poll(() => flush(page)).not.toBe(raw);
  const formatted = await flush(page);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await command(page, 'redo');
  expect(await flush(page)).toBe(formatted);
});
test('document switch during clipboard write cannot cut the new document', async ({ page }) => {
  await mount(page);
  await select(page, 11, 6);
  await open(page);
  await page.evaluate(() => {
    (window as Host).menu.hold = true;
  });
  await choose(page, 'edit.cut');
  await page.waitForFunction(() => Boolean((window as Host).menu.pending));
  await page.evaluate(() => (window as Host).marklyraEditor.load('Replacement document'));
  await page.evaluate(() => (window as Host).menu.pending?.());
  expect(await flush(page)).toBe('Replacement document');
});
test('composition invalidates a prepared cut without deleting text', async ({ page }) => {
  const raw = 'Alpha Bravo Charlie';
  await mount(page, raw);
  await select(page, 11, 6);
  await open(page);
  await page.evaluate(() => {
    (window as Host).menu.hold = true;
  });
  await choose(page, 'edit.cut');
  await page.waitForFunction(() => Boolean((window as Host).menu.pending));
  await frame(page)
    .locator('#write')
    .evaluate((root) =>
      root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '候' })),
    );
  await page.evaluate(() => (window as Host).menu.pending?.());
  await frame(page)
    .locator('#write')
    .evaluate((root) =>
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  await expect.poll(() => flush(page)).toBe(raw);
});
for (const action of ['edit.copy', 'edit.cut'] as const)
  test(`original linewise ${action} uses an explicit captured line`, async ({ page }) => {
    const raw = 'Alpha\r\nBravo\nCharlie';
    await mount(page, raw);
    await frame(page)
      .locator('body')
      .evaluate(() => {
        (
          window as unknown as { File: { option: { lineWiseCopyCut: boolean } } }
        ).File.option.lineWiseCopyCut = true;
      });
    await select(page, 8, 8);
    await open(page);
    await choose(page, action);
    await expect.poll(async () => (await writes(page)).length).toBe(1);
    expect((await writes(page))[0]?.text).toContain('Bravo');
    if (action === 'edit.cut') {
      await expect.poll(() => flush(page)).not.toBe(raw);
      await command(page, 'undo');
    }
    expect(await flush(page)).toBe(raw);
  });

async function sourceMenu(page: Page) {
  await page.evaluate(() => {
    delete (window as Host).menu.request;
  });
  await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'toggleSource' }));
  const point = await frame(page)
    .locator('body')
    .evaluate(() => {
      const cm = (window as unknown as { editor: LegacyEditor }).editor.sourceView.cm;
      if (!cm) throw Error('Missing source CM');
      cm.focus();
      cm.setSelections([{ anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 1 } }], 0);
      const coords = Reflect.get(cm, 'charCoords') as (
        p: { line: number; ch: number },
        mode: string,
      ) => { left: number; top: number; bottom: number };
      const p = coords.call(cm, { line: 0, ch: 2 }, 'window');
      return { x: p.left + 2, y: (p.top + p.bottom) / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('No frame');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as Host).menu.request));
}
test('HTML-only clipboard cannot delete a CodeMirror selection', async ({ page }) => {
  const raw = 'Alpha\r\nBravo\nCharlie';
  await mount(page, raw);
  await sourceMenu(page);
  await page.evaluate(() => {
    (window as Host).menu.read = { text: '', html: '<p>HTML only</p>' };
  });
  await choose(page, 'edit.paste');
  await expect.poll(async () => (await errors(page)).length).toBe(1);
  expect((await errors(page))[0]).toContain('没有纯文本');
  expect(await flush(page)).toBe(raw);
  await page.evaluate(() => (window as Host).menu.errors.splice(0));
});
test('source-mode copy and cut preserve directed selection and original history', async ({
  page,
}) => {
  const raw = 'Alpha\r\nBravo\nCharlie';
  await mount(page, raw);
  await sourceMenu(page);
  await choose(page, 'edit.copy');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  expect((await writes(page))[0]?.text).toBe('lph');
  expect(await flush(page)).toBe(raw);
  await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'toggleSource' }));
  await sourceMenu(page);
  await choose(page, 'edit.cut');
  await expect.poll(() => flush(page)).toBe('Aa\r\nBravo\nCharlie');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
});
test('original plain paste trims one trailing LF while preserving surviving source and Undo', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 0);
  await open(page);
  await page.evaluate(() => {
    (window as Host).menu.read = { text: 'Changed\n' };
  });
  await choose(page, 'edit.pastePlain');
  await expect.poll(() => flush(page)).toBe('Changedsame\nsame');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
});
function flatten(
  items: ContextMenuRequest['items'],
): { actionId: ContextAction; enabled: boolean }[] {
  return items.flatMap((item) =>
    item.type === 'item' ? [item] : item.type === 'submenu' ? flatten(item.items) : [],
  );
}
test('header-before row insertion is offered with source proof and cancellation is read-only', async ({
  page,
}) => {
  await mount(page, tableSource);
  await open(page, '#write thead th:first-child');
  const request = await page.evaluate(() => (window as Host).menu.request);
  expect(request).toBeDefined();
  expect(
    flatten(request?.items ?? []).find((item) => item.actionId === 'table.insertRowBefore')
      ?.enabled,
  ).toBe(true);
  await choose(page, null);
  expect(await flush(page)).toBe(tableSource);
});
for (const url of ['file:///private/no-authority.md', 'javascript:alert(1)'])
  test(`unsafe link opening is disabled: ${url.split(':')[0]}`, async ({ page }) => {
    const raw = `[site](${url})`;
    await mount(page, raw);
    await open(page, '#write a');
    const request = await page.evaluate(() => (window as Host).menu.request);
    expect(
      flatten(request?.items ?? []).find((item) => item.actionId === 'link.open')?.enabled,
    ).toBe(false);
    await choose(page, null);
    expect(await flush(page)).toBe(raw);
    expect(await page.evaluate(() => (window as Host).menu.opened)).toEqual([]);
  });
test('runtime rejects unoffered actions and consumed request replay independently of host checks', async ({
  page,
}) => {
  const raw = 'Alpha Bravo Charlie';
  await mount(page, raw);
  await select(page, 11, 6);
  const request = await open(page);
  if (!request) throw Error('Missing request');
  await expect(
    page.evaluate(async (requestId) => {
      const editor = (window as Host).marklyraEditor;
      const invoke = Reflect.get(editor, 'request') as (
        op: string,
        payload: unknown,
      ) => Promise<unknown>;
      return invoke.call(editor, 'context-menu-execute', { requestId, actionId: 'table.delete' });
    }, request.requestId),
  ).rejects.toThrow();
  expect(await flush(page)).toBe(raw);
  await choose(page, null);
  await open(page);
  const current = await page.evaluate(() => (window as Host).menu.request);
  await choose(page, 'edit.copy');
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  await expect(
    page.evaluate(async (requestId) => {
      const editor = (window as Host).marklyraEditor;
      const invoke = Reflect.get(editor, 'request') as (
        op: string,
        payload: unknown,
      ) => Promise<unknown>;
      return invoke.call(editor, 'context-menu-execute', { requestId, actionId: 'edit.copy' });
    }, current?.requestId),
  ).rejects.toThrow('失效');
  expect(await flush(page)).toBe(raw);
  expect((await writes(page)).length).toBe(1);
});

test('formatted computed-width table rows retain identity-proven source edits', async ({
  page,
}) => {
  const raw = '| A | B |\r\n| --- | --- |\r\n|one|two|\n|three|four|';
  await mount(page, raw);
  await select(page, 1, 1, '#write tbody tr:first-child td:first-child');
  await open(page, '#write tbody tr:first-child td:first-child');
  await choose(page, 'table.format');
  await expect.poll(() => flush(page)).not.toBe(raw);
  const formatted = await flush(page);
  await open(page, '#write tbody tr:first-child td:first-child');
  const request = await page.evaluate(() => (window as Host).menu.request);
  for (const id of ['table.insertRowBefore', 'table.insertRowAfter', 'table.deleteRow'])
    expect(flatten(request?.items ?? []).find((item) => item.actionId === id)?.enabled).toBe(true);
  await choose(page, 'table.insertRowAfter');
  await expect.poll(() => flush(page)).not.toBe(formatted);
  const edited = await flush(page);
  await expect(frame(page).locator('#write table tr')).toHaveCount(4);
  await command(page, 'undo');
  expect(await flush(page)).toBe(formatted);
  await command(page, 'redo');
  expect(await flush(page)).toBe(edited);
  await command(page, 'undo');
  expect(await flush(page)).toBe(formatted);
  await open(page, '#write tbody tr:first-child td:first-child');
  await choose(page, null);
  expect(await flush(page)).toBe(formatted);
});

test('plain paste internal LF uses exact selected range and preserves untouched EOL', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 0);
  await open(page);
  await page.evaluate(() => {
    (window as Host).menu.read = { text: 'Changed\nnext' };
  });
  await choose(page, 'edit.pastePlain');
  await expect.poll(() => flush(page)).toBe('Changed\r\nnextsame\nsame');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
});
for (const action of ['edit.copy', 'edit.cut'] as const)
  test(`ordinary ${action} supplies original rich HTML for strong/link paste`, async ({ page }) => {
    const source = '**Bold** and [link](https://example.test)';
    await mount(page, source);
    await select(page, source.length, 0);
    await open(page);
    await choose(page, action);
    await expect.poll(async () => (await writes(page)).length).toBe(1);
    const content = (await writes(page))[0];
    expect(content?.html).toMatch(/<strong[\s>]/);
    expect(content?.html).toContain('https://example.test');
    expect(content?.text).toBe('Bold and link');
    expect(
      await page.evaluate((html) => {
        const template = document.createElement('template');
        template.innerHTML = html ?? '';
        return template.content.textContent;
      }, content?.html),
    ).toBe('Bold and link');
    if (action === 'edit.copy') expect(await flush(page)).toBe(source);
    else {
      await expect.poll(() => flush(page)).not.toBe(source);
      await command(page, 'undo');
      expect(await flush(page)).toBe(source);
    }
    await page.evaluate(async () => {
      const host = window as Host;
      host.menu.read = host.menu.writes[0] ?? { text: '' };
      await host.marklyraEditor.load('Target');
    });
    await select(page, 6, 0);
    await open(page);
    await choose(page, 'edit.paste');
    await expect.poll(() => flush(page)).toBe(source);
    await command(page, 'undo');
    expect(await flush(page)).toBe('Target');
  });

for (const fallback of [false, true])
  test(`input before task-boundary offer cancels ${fallback ? 'fallback' : 'bridge'} context`, async ({
    page,
  }) => {
    const raw = 'Alpha Bravo Charlie';
    await mount(page, raw);
    await select(page, 11, 6);
    await frame(page)
      .locator('#write')
      .evaluate((root, fallback) => {
        const host = window as unknown as { editor: LegacyEditor; File: { isMac: boolean } };
        if (fallback) host.File.isMac = false;
        root.ownerDocument.addEventListener(
          'contextmenu',
          () => {
            host.File.isMac = true;
            // Controlled negative: an input notification and a real original edit occur
            // in the same event task before the deferred offer; this is not an IME claim.
            root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
            host.editor.insertText('X');
          },
          { once: true },
        );
      }, fallback);
    const point = await frame(page)
      .locator('#write')
      .evaluate((root) => {
        const rect = [
          ...(root.ownerDocument.getSelection()?.getRangeAt(0).getClientRects() ?? []),
        ].find((r) => r.width > 2);
        if (!rect) throw Error('Missing selected text');
        return { x: rect.x + 3, y: rect.y + rect.height / 2 };
      });
    const box = await page.locator('.marklyra-editor-frame').boundingBox();
    if (!box) throw Error('No frame');
    await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as Host).menu.request)).toBeUndefined();
    expect(await flush(page)).toBe('Alpha X Charlie');
    expect(await writes(page)).toEqual([]);
  });
test('original classifier precedes publication once and post-event table selection is used', async ({
  page,
}) => {
  await mount(page, tableSource);
  await select(page, 1, 1, '#write tbody tr:first-child td:first-child');
  await frame(page)
    .locator('body')
    .evaluate(() => {
      const editor = (window as unknown as { editor: LegacyEditor }).editor,
        original = editor.contextMenu.getMenuItemsForMac;
      Reflect.set(window, 'menuOrder', []);
      editor.contextMenu.getMenuItemsForMac = function (target) {
        (Reflect.get(window, 'menuOrder') as string[]).push('classifier');
        return original.call(this, target);
      };
      document.addEventListener(
        'contextmenu',
        () => {
          (Reflect.get(window, 'menuOrder') as string[]).push('bubble');
          Reflect.set(window, 'menuBubbleBookmark', editor.selection.buildUndo());
        },
        { once: true },
      );
    });
  await open(page, '#write tbody tr:first-child td:first-child');
  const order = await frame(page)
    .locator('body')
    .evaluate(() => Reflect.get(window, 'menuOrder'));
  expect(order).toEqual(['classifier', 'bubble']);
  await choose(page, 'table.moveColumnRight');
  await expect.poll(() => flush(page)).not.toBe(tableSource);
  expect(await flush(page)).toContain('| B | A |');
  await command(page, 'undo');
  expect(await flush(page)).toBe(tableSource);
});

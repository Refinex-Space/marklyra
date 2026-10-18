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
    bodyCopy: {
      request?: ContextMenuRequest;
      pick?: (action: ContextAction | null) => void;
      clipboard: ClipboardContent;
      writes: ClipboardContent[];
      reads: ClipboardContent[];
      errors: string[];
    };
  };
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const flush = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
async function mount(page: Page, raw: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (raw) => {
    const host = window as Host,
      previous = host.marklyraEditor;
    await previous.ready;
    const Constructor = previous.constructor as typeof MarkLyraEditor;
    previous.destroy();
    host.bodyCopy = { clipboard: { text: '' }, writes: [], reads: [], errors: [] };
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing host');
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: raw,
      onError: (error) => host.bodyCopy.errors.push(error.message),
      host: {
        contextMenu: {
          show(request, pick) {
            host.bodyCopy.request = request;
            host.bodyCopy.pick = pick;
          },
        },
        clipboard: {
          async write(content) {
            host.bodyCopy.clipboard = structuredClone(content);
            host.bodyCopy.writes.push(structuredClone(content));
          },
          async read() {
            const content = structuredClone(host.bodyCopy.clipboard);
            host.bodyCopy.reads.push(content);
            return content;
          },
        },
      },
    });
    await host.marklyraEditor.ready;
  }, raw);
}
async function open(page: Page) {
  await page.evaluate(() => {
    delete (window as Host).bodyCopy.request;
  });
  const point = await frame(page)
    .locator('#write')
    .evaluate((root) => {
      const s = root.ownerDocument.getSelection();
      if (!s?.rangeCount) throw Error('Missing range');
      const rect = [...s.getRangeAt(0).getClientRects()].find((r) => r.width > 2 && r.height > 0);
      if (!rect) throw Error('No visible selected content');
      return { x: rect.x + Math.min(5, rect.width / 2), y: rect.y + rect.height / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing frame');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as Host).bodyCopy.request));
}
// Observe the exact menu binding rather than a later live selection. WebKit's
// original marker expansion may extend the latter after the menu was offered.
// This spy delegates unchanged and reads only when captureContextSelection calls
// the original bookmark builder; it never rewrites a range or a bookmark.
async function observeBinding(page: Page) {
  await frame(page)
    .locator('#write')
    .evaluate((root) => {
      const host = window as unknown as { editor: LegacyEditor; bodyBinding?: unknown };
      const original = host.editor.selection.buildUndo;
      host.editor.selection.buildUndo = function (...args: Parameters<typeof original>) {
        const bookmark = original.apply(this, args);
        if (new Error().stack?.includes('captureContextSelection')) {
          const s = root.ownerDocument.getSelection();
          if (!s?.anchorNode || !s.focusNode) throw Error('Missing bound selection');
          const point = (node: Node, offset: number) => {
            const p = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest(
              'p[cid]',
            );
            if (!p) throw Error('Missing bound paragraph');
            const r = root.ownerDocument.createRange();
            r.selectNodeContents(p);
            r.setEnd(node, offset);
            return { cid: p.getAttribute('cid'), prefix: r.cloneContents().textContent };
          };
          host.bodyBinding = {
            anchor: point(s.anchorNode, s.anchorOffset),
            head: point(s.focusNode, s.focusOffset),
          };
        }
        return bookmark;
      };
    });
}
async function selection(page: Page) {
  return frame(page)
    .locator('#write')
    .evaluate((root) => {
      const s = root.ownerDocument.getSelection();
      if (!s?.anchorNode || !s.focusNode) throw Error('Missing selection');
      const point = (node: Node, offset: number) => {
        const p = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('p[cid]');
        if (!p) throw Error('No paragraph');
        const r = root.ownerDocument.createRange();
        r.selectNodeContents(p);
        r.setEnd(node, offset);
        return { cid: p.getAttribute('cid'), prefix: r.cloneContents().textContent };
      };
      return {
        anchor: point(s.anchorNode, s.anchorOffset),
        head: point(s.focusNode, s.focusOffset),
      };
    });
}
const cases = [
  {
    name: 'whole strong body',
    word: '**Bravo**',
    selector: 'strong [md-inline="plain"]',
    start: 0,
  },
  {
    name: 'partial strong body',
    word: '**BeforeBravoAfter**',
    selector: 'strong [md-inline="plain"]',
    start: 6,
  },
  {
    name: 'partial body in nested strong link',
    word: '**[BeforeBravoAfter](https://example.test/path)**',
    selector: 'strong a [md-inline="plain"]',
    start: 6,
  },
] as const;
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as Host).bodyCopy.errors)).toEqual([]);
  expect(pageErrors.get(page)).toEqual([]);
});
for (const fixture of cases)
  for (const reverse of [false, true])
    for (const action of ['edit.copy', 'edit.cut'] as const)
      test(`${action}: ${fixture.name}, ${reverse ? 'reverse' : 'forward'} selection replaces Tail with Bravo`, async ({
        page,
      }, info) => {
        const raw = `Alpha ${fixture.word} Charlie\r\n\r\nTail`;
        await mount(page, raw);
        await settleMarkerClick(page);
        await observeBinding(page);
        await page.locator('.marklyra-editor-frame').focus();
        await frame(page)
          .locator('#write > p')
          .first()
          .evaluate(
            (p, { selector, start, reverse }) => {
              (p as HTMLElement).focus();
              const node = p.querySelector(selector)?.firstChild;
              if (!node) throw Error('Missing formatted body');
              p.ownerDocument
                .getSelection()
                ?.setBaseAndExtent(
                  node,
                  reverse ? start + 5 : start,
                  node,
                  reverse ? start : start + 5,
                );
            },
            { selector: fixture.selector, start: fixture.start, reverse },
          );
        await open(page);
        const selected = await frame(page)
          .locator('#write')
          .evaluate(() => {
            const binding = (window as unknown as { bodyBinding?: unknown }).bodyBinding;
            if (!binding) throw Error('Menu selection binding was not observed');
            return binding;
          });
        const canUndoBefore = await frame(page)
          .locator('body')
          .evaluate(() => (window as unknown as { editor: LegacyEditor }).editor.undo.hasUndo());
        await page.evaluate((action) => (window as Host).bodyCopy.pick?.(action), action);
        await page.waitForFunction(() => (window as Host).bodyCopy.writes.length === 1);
        const payload = await page.evaluate(() =>
          structuredClone((window as Host).bodyCopy.clipboard),
        );
        await info.attach('copy-flavor-and-inline', {
          body: JSON.stringify({
            payload,
            inline: await frame(page)
              .locator('#write')
              .evaluate(
                (area) => area.querySelector('strong')?.closest('[md-inline="strong"]')?.outerHTML,
              ),
          }),
          contentType: 'application/json',
        });
        expect(payload.text).toBe('Bravo');
        const semantic = await page.evaluate((html) => {
          const template = document.createElement('template');
          template.innerHTML = html ?? '';
          return {
            text: template.content.textContent,
            strong: template.content.querySelector('strong')?.textContent,
            href: template.content.querySelector('a')?.getAttribute('href'),
          };
        }, payload.html);
        expect(semantic.text).toBe('Bravo');
        expect(semantic.strong).toBe('Bravo');
        expect(payload.html).not.toMatch(/Before|After|Tail|\*\*|md-inline|cid=/);
        if (fixture.name.includes('link')) expect(semantic.href).toBe('https://example.test/path');
        if (action === 'edit.copy') {
          expect(await flush(page)).toBe(raw);
          expect(await selection(page)).toEqual(selected);
          expect(
            await frame(page)
              .locator('body')
              .evaluate(() =>
                (window as unknown as { editor: LegacyEditor }).editor.undo.hasUndo(),
              ),
          ).toBe(canUndoBefore);
        } else {
          await expect.poll(() => flush(page)).not.toBe(raw);
          await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'undo' }));
          expect(await flush(page)).toBe(raw);
        }
        await frame(page)
          .locator('#write > p')
          .last()
          .evaluate((p) => {
            (p as HTMLElement).focus();
            const node = p.querySelector('[md-inline="plain"]')?.firstChild;
            if (node?.textContent !== 'Tail') throw Error('Expected unchanged Tail target');
            p.ownerDocument.getSelection()?.setBaseAndExtent(node, 0, node, 4);
          });
        await open(page);
        await page.evaluate(() => (window as Host).bodyCopy.pick?.('edit.paste'));
        const expected =
          raw.slice(0, -4) +
          (fixture.name.includes('link') ? '**[Bravo](https://example.test/path)**' : '**Bravo**');
        await expect.poll(() => flush(page)).toBe(expected);
        expect(await page.evaluate(() => (window as Host).bodyCopy.reads)).toEqual([payload]);
        await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'undo' }));
        expect(await flush(page)).toBe(raw);
        await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'redo' }));
        expect(await flush(page)).toBe(expected);
        await info.attach('clipboard-source', {
          body: JSON.stringify({ raw, selected, payload, expected }, null, 2),
          contentType: 'application/json',
        });
      });

for (const fixture of [
  { style: 'underline', tag: 'u', markup: '<u>Bravo</u>' },
  { style: 'highlight', tag: 'mark', markup: '==Bravo==' },
  { style: 'subscript', tag: 'sub', markup: '~Bravo~' },
  { style: 'superscript', tag: 'sup', markup: '^Bravo^' },
] as const)
  test(`original enabled ${fixture.style} partial copy retains the Markdown HTML flavor through paste and history`, async ({
    page,
  }) => {
    await mount(page, 'BeforeBravoAfter\r\n\r\nTail');
    await frame(page)
      .locator('body')
      .evaluate(() => {
        const file = (window as unknown as { File: { option: Record<string, unknown> } }).File;
        file.option.enableHighlight = true;
        file.option.enableSubscript = true;
        file.option.enableSuperscript = true;
      });
    await frame(page)
      .locator('#write > p')
      .first()
      .evaluate((p) => {
        (p as HTMLElement).focus();
        const node = p.querySelector('[md-inline=plain]')?.firstChild;
        if (!node) throw Error('Missing body');
        p.ownerDocument.getSelection()?.setBaseAndExtent(node, 0, node, 16);
      });
    await page.evaluate(
      (style) => (window as Host).marklyraEditor.execute({ type: 'format', style }),
      fixture.style,
    );
    const styled = await flush(page);
    const nativeHistory = () =>
      frame(page)
        .locator('body')
        .evaluate(() => {
          const editor = (window as unknown as { editor: LegacyEditor }).editor;
          const describe = (value: unknown) =>
            Array.isArray(value)
              ? value.map((command) => {
                  if (!command || typeof command !== 'object') return null;
                  return Object.fromEntries(
                    Object.entries(command).filter(
                      ([, value]) =>
                        typeof value === 'string' ||
                        typeof value === 'number' ||
                        typeof value === 'boolean',
                    ),
                  );
                })
              : null;
          return {
            canonical: editor.getMarkdown(),
            index: editor.undo.index,
            entries: editor.undo.commandStack.map((entry) => ({
              undo: describe(Reflect.get(entry, 'undo')),
              redo: describe(entry.redo),
            })),
          };
        });
    const styledHistory = await nativeHistory();
    expect(styled).toBe(`${fixture.markup.replace('Bravo', 'BeforeBravoAfter')}\r\n\r\nTail`);
    await frame(page)
      .locator('#write > p')
      .first()
      .evaluate((p, tag) => {
        const node = p.querySelector(`${tag} [md-inline=plain]`)?.firstChild;
        if (!node) throw Error('Missing semantic body');
        p.ownerDocument.getSelection()?.setBaseAndExtent(node, 6, node, 11);
      }, fixture.tag);
    await open(page);
    await page.evaluate(() => (window as Host).bodyCopy.pick?.('edit.copy'));
    await page.waitForFunction(() => (window as Host).bodyCopy.writes.length === 1);
    const payload = await page.evaluate(() => (window as Host).bodyCopy.clipboard);
    await test
      .info()
      .attach('rich-flavors', { body: JSON.stringify(payload), contentType: 'application/json' });
    expect(payload.text).toBe('Bravo');
    const copied = await page.evaluate(
      ({ html, tag }) => {
        const template = document.createElement('template');
        template.innerHTML = html ?? '';
        return {
          text: template.content.textContent,
          semantic: template.content.querySelector(tag)?.textContent,
        };
      },
      { html: payload.html, tag: fixture.tag },
    );
    expect(copied).toEqual({ text: 'Bravo', semantic: 'Bravo' });
    expect(await flush(page)).toBe(styled);
    await frame(page)
      .locator('#write > p')
      .last()
      .evaluate((p) => {
        const node = p.querySelector('[md-inline=plain]')?.firstChild;
        if (!node) throw Error('Missing Tail');
        p.ownerDocument.getSelection()?.setBaseAndExtent(node, 0, node, 4);
      });
    await open(page);
    await page.evaluate(() => (window as Host).bodyCopy.pick?.('edit.paste'));
    // The shipped editor preserves these via text/markhtml, not its lossy
    // external-HTML converter. The host must carry both flavors independently.
    expect(payload.markHtml).toBeTruthy();
    const pasted = `${styled.slice(0, -4)}${fixture.markup}`;
    await expect.poll(() => flush(page)).toBe(pasted);
    await test.info().attach('before-rich-undo', {
      body: JSON.stringify({ styledHistory, pastedHistory: await nativeHistory() }),
      contentType: 'application/json',
    });
    try {
      await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'undo' }));
    } catch (error) {
      await test.info().attach('failed-rich-undo', {
        body: JSON.stringify(await nativeHistory()),
        contentType: 'application/json',
      });
      throw error;
    }
    expect(await flush(page)).toBe(styled);
    await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'redo' }));
    expect(await flush(page)).toBe(pasted);
  });

test('synthetic native copy event shares body-rich HTML projection with context copy', async ({
  page,
}) => {
  const raw = 'Alpha **Bravo** Charlie\r\n\r\nTail';
  await mount(page, raw);
  const payload = await frame(page)
    .locator('#write > p')
    .first()
    .evaluate((p) => {
      (p as HTMLElement).focus();
      const node = p.querySelector('strong [md-inline=plain]')?.firstChild;
      if (!node) throw Error('Missing strong body');
      p.ownerDocument.getSelection()?.setBaseAndExtent(node, 5, node, 0);
      const data = new DataTransfer();
      p.dispatchEvent(
        new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }),
      );
      const template = document.createElement('template');
      template.innerHTML = data.getData('text/html');
      return {
        text: data.getData('text/plain'),
        html: data.getData('text/html'),
        visible: template.content.textContent,
        strong: template.content.querySelector('strong')?.textContent,
        markHtml: data.getData('text/markhtml'),
      };
    });
  expect(payload.text).toBe('Bravo');
  expect(payload.visible).toBe('Bravo');
  expect(payload.strong).toBe('Bravo');
  expect(payload.markHtml).toContain('**');
  expect(payload.markHtml).toContain('Bravo');
  expect(payload.markHtml).not.toMatch(/Alpha|Charlie|Tail|cid=/u);
  expect(await flush(page)).toBe(raw);
});

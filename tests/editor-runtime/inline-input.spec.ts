import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    inlineErrors: string[];
  };
async function mount(page: Page, source: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as Host,
      previous = host.marklyraEditor;
    await previous.ready;
    const Constructor = previous.constructor as typeof MarkLyraEditor;
    previous.destroy();
    host.inlineErrors = [];
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing editor host');
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.inlineErrors.push(error.message),
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
  bodyBoundary = false,
  settledClick = false,
) {
  await page.locator('.marklyra-editor-frame').focus();
  await frame(page).locator('#write > p').first().click();
  // This fixture sets a precise DOM boundary programmatically. Let the original
  // real-click brush finish first so it cannot replace that independently set point.
  if (settledClick) await page.waitForTimeout(300);
  await frame(page)
    .locator('#write > p')
    .first()
    .evaluate(
      (p, { anchor, head, bodyBoundary }) => {
        const point = (offset: number): [Node, number] => {
          const walker = p.ownerDocument.createTreeWalker(p, 4);
          let node = walker.nextNode(),
            at = 0;
          const points: [Node, number][] = [];
          while (node) {
            const length = node.textContent?.length ?? 0;
            if (at <= offset && offset <= at + length) points.push([node, offset - at]);
            at += length;
            node = walker.nextNode();
          }
          const chosen = bodyBoundary
            ? points.find(([n]) => n.parentElement?.closest('strong,em,code,a'))
            : points[0];
          if (!chosen) throw Error(`Missing source endpoint ${offset}`);
          return chosen;
        };
        p.ownerDocument.getSelection()?.setBaseAndExtent(...point(anchor), ...point(head));
      },
      { anchor, head, bodyBoundary },
    );
}
async function selection(page: Page) {
  return frame(page)
    .locator('#write > p')
    .first()
    .evaluate((p) => {
      const selection = p.ownerDocument.getSelection();
      if (!selection?.anchorNode || !selection.focusNode) throw Error('Missing selection');
      const point = (node: Node, offset: number) => {
        const range = p.ownerDocument.createRange();
        range.selectNodeContents(p);
        range.setEnd(node, offset);
        const fragment = range.cloneContents();
        const roles: string[] = [];
        let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
        while (element && element !== p) {
          roles.unshift(
            `${element.tagName}:${element.getAttribute('md-inline') ?? ''}:${[...element.classList]
              .filter((c) => c !== 'md-expand')
              .sort()
              .join('.')}`,
          );
          element = element.parentElement;
        }
        return {
          sourceOffset: fragment.textContent?.length ?? 0,
          role: roles.join('/'),
          nodeType: node.nodeType,
          offset,
        };
      };
      return {
        anchor: point(selection.anchorNode, selection.anchorOffset),
        head: point(selection.focusNode, selection.focusOffset),
      };
    });
}
async function rejectedLoad(page: Page) {
  await expect(
    page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
  ).rejects.toThrow();
  const errors = await page.evaluate(() => (window as Host).inlineErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((error) => error.includes('normaliz'))).toBe(true);
}
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as Host).inlineErrors)).toEqual([]);
  expect(pageErrors.get(page)).toEqual([]);
});
const styles = [
  ['strong', '**same**'],
  ['em', '*same*'],
  ['del', '~~same~~'],
  ['link', '[same](https://example.test/x)'],
  ['code', '`same`'],
  ['nested', '**a *same* b**'],
] as const;
for (const [style, word] of styles)
  for (const reverse of [false, true])
    for (const index of [0, 1, 2]) {
      test(`inline ${style} soft-line ${index + 1} ${reverse ? 'reverse' : 'forward'}`, async ({
        page,
      }, info) => {
        const raw = `${word}\r\n${word}\n${word}`,
          size = word.length;
        const start = index === 2 ? 2 * size + 1 : index * (size + 1),
          end = index === 2 ? 3 * size + 2 : start + size + 1;
        await mount(page, raw);
        await select(page, reverse ? end : start, reverse ? start : end);
        const before = await selection(page);
        await page.keyboard.press(index === 1 ? 'Delete' : 'Backspace');
        const expected = word + (index === 0 ? '\n' : '\r\n') + word;
        expect(await flush(page)).toBe(expected);
        const after = await selection(page);
        expect(after.anchor.sourceOffset).toBe(start);
        expect(after.head.sourceOffset).toBe(start);
        await command(page, 'undo');
        expect(await flush(page)).toBe(raw);
        expect(await selection(page)).toEqual(before);
        await command(page, 'redo');
        expect(await flush(page)).toBe(expected);
        const redone = await selection(page);
        expect(redone.anchor.sourceOffset).toBe(start);
        expect(redone.head.sourceOffset).toBe(start);
        expect(redone).toEqual(after);
        // The engine's own boundary affinity differs across WebKit/Chromium.
        // Compare a fresh direct-edit branch, not an invented source-offset insertion.
        await page.keyboard.insertText('Z');
        const typedAfterRedo = await flush(page);
        expect(await page.evaluate(() => (window as Host).inlineErrors)).toEqual([]);
        await mount(page, raw);
        await select(page, reverse ? end : start, reverse ? start : end);
        await page.keyboard.press(index === 1 ? 'Delete' : 'Backspace');
        expect(await flush(page)).toBe(expected);
        expect(await selection(page)).toEqual(after);
        await page.keyboard.insertText('Z');
        expect(await flush(page)).toBe(typedAfterRedo);
        await info.attach('source-selection', {
          body: JSON.stringify({ raw, expected, before, after, redone }, null, 2),
          contentType: 'application/json',
        });
      });
    }
for (const text of ['中文😀', '👩‍👩‍👧‍👦'])
  test(`inline actual beforeinput ${text}`, async ({ page }) => {
    const raw = '**same**\r\n**same**\n**same**';
    await mount(page, raw);
    await select(page, 13, 13);
    const before = await selection(page);
    await page.keyboard.insertText(text);
    const expected = `**same**\r\n**sa${text}me**\n**same**`;
    expect(await flush(page)).toBe(expected);
    expect((await selection(page)).anchor.sourceOffset).toBe(13 + text.length);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    expect(await selection(page)).toEqual(before);
    await command(page, 'redo');
    expect(await flush(page)).toBe(expected);
    expect((await selection(page)).anchor.sourceOffset).toBe(13 + text.length);
  });
test('cross-inline reverse replacement keeps actual native parse and original EOL', async ({
  page,
}) => {
  const raw = 'Lead **same** and *same* Tail\r\nkeep';
  await mount(page, raw);
  await select(page, 20, 9);
  const before = await selection(page);
  await page.keyboard.insertText('中文😀');
  const expected = 'Lead **sa中文😀ame* Tail\r\nkeep';
  expect(await flush(page)).toBe(expected);
  expect((await selection(page)).anchor.sourceOffset).toBe(13);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual(before);
  await command(page, 'redo');
  expect(await flush(page)).toBe(expected);
  expect((await selection(page)).anchor.sourceOffset).toBe(13);
});
test('deleting a formatted body proves the empty-pair redo cursor', async ({ page }) => {
  const raw = '**same**\r\n**same**\n**same**';
  await mount(page, raw);
  await select(page, 15, 11);
  const before = await selection(page);
  await page.keyboard.press('Backspace');
  expect(await flush(page)).toBe('**same**\r\n****\n**same**');
  const after = await selection(page);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual(before);
  await command(page, 'redo');
  expect(await flush(page)).toBe('**same**\r\n****\n**same**');
  expect((await selection(page)).anchor.sourceOffset).toBe(after.anchor.sourceOffset);
  await page.keyboard.insertText('Z');
  expect(await flush(page)).toBe('**same**\r\n**Z**\n**same**');
});
for (const bodyBoundary of [false, true])
  for (const settleMs of [0, 250])
    test(`marker/body affinity snapshot ${bodyBoundary ? 'body' : 'marker'} after ${settleMs}ms`, async ({
      page,
    }) => {
      const raw = '**same**\r\n**same**\n**same**';
      await mount(page, raw);
      await select(page, 2, 2, bodyBoundary, true);
      const before = await selection(page);
      expect(before.anchor.role).toContain(bodyBoundary ? 'STRONG' : 'md-before');
      // The original WebKit delayed expansion changes Text-end to its equivalent
      // parent-end even without loading. Preserve source position and marker/body
      // role, then prove actual input and history rather than DOM representation.
      const logical = (value: typeof before) => ({
        anchor: { sourceOffset: value.anchor.sourceOffset, role: value.anchor.role },
        head: { sourceOffset: value.head.sourceOffset, role: value.head.role },
      });
      if (settleMs) await page.waitForTimeout(settleMs);
      await rejectedLoad(page);
      expect(await flush(page)).toBe(raw);
      expect(logical(await selection(page))).toEqual(logical(before));
      await page.keyboard.insertText('X');
      expect(await flush(page)).toBe('**Xsame**\r\n**same**\n**same**');
      await command(page, 'undo');
      expect(await flush(page)).toBe(raw);
      expect(logical(await selection(page))).toEqual(logical(before));
      await command(page, 'redo');
      expect(await flush(page)).toBe('**Xsame**\r\n**same**\n**same**');
      await page.keyboard.insertText('Y');
      expect(await flush(page)).toBe('**XYsame**\r\n**same**\n**same**');
    });
test('inline reverse history endpoint survives rejected load on undo and redo side', async ({
  page,
}) => {
  const raw = '**same**\r\n**same**\n**same**';
  await mount(page, raw);
  await select(page, 18, 9);
  const before = await selection(page);
  await page.keyboard.press('Delete');
  expect(await flush(page)).toBe('**same**\r\n**same**');
  await rejectedLoad(page);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual(before);
  await rejectedLoad(page);
  expect(await selection(page)).toEqual(before);
  await command(page, 'redo');
  expect(await flush(page)).toBe('**same**\r\n**same**');
  expect((await selection(page)).anchor.sourceOffset).toBe(9);
});

for (const index of [0, 1, 2])
  test(`inline CJK and emoji selected soft-line ${index + 1}`, async ({ page }) => {
    const word = '**中文👩‍💻**',
      size = word.length,
      raw = `${word}\r\n${word}\n${word}`;
    const start = index === 2 ? 2 * size + 1 : index * (size + 1),
      end = index === 2 ? 3 * size + 2 : start + size + 1;
    await mount(page, raw);
    await select(page, end, start);
    const before = await selection(page);
    await page.keyboard.press(index === 1 ? 'Delete' : 'Backspace');
    const expected = word + (index === 0 ? '\n' : '\r\n') + word;
    expect(await flush(page)).toBe(expected);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    expect(await selection(page)).toEqual(before);
    await command(page, 'redo');
    expect(await flush(page)).toBe(expected);
    expect((await selection(page)).anchor.sourceOffset).toBe(start);
  });

for (const key of ['Backspace', 'Delete'])
  test(`inline collapsed ${key} retains actual native deletion and surrounding EOL`, async ({
    page,
  }) => {
    const raw = '**same**\r\n**same**\n**same**';
    await mount(page, raw);
    await select(page, 13, 13);
    const before = await selection(page);
    await page.keyboard.press(key);
    const expected =
      key === 'Backspace' ? '**same**\r\n**sme**\n**same**' : '**same**\r\n**sae**\n**same**';
    expect(await flush(page)).toBe(expected);
    const after = await selection(page);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    expect(await selection(page)).toEqual(before);
    await command(page, 'redo');
    expect(await flush(page)).toBe(expected);
    expect((await selection(page)).anchor.sourceOffset).toBe(after.anchor.sourceOffset);
  });

test('synthetic clipboard keeps proven inline Element-end normalization', async ({ page }) => {
  const raw = '**same**\r\n**same**\n**same**';
  await mount(page, raw);
  await page.locator('.marklyra-editor-frame').focus();
  await frame(page).locator('#write > p').click();
  await frame(page)
    .locator('#write > p')
    .evaluate((p) => {
      const end = p.childNodes.length;
      p.ownerDocument.getSelection()?.setBaseAndExtent(p, end, p, end);
      const data = new DataTransfer();
      data.setData('text/plain', 'Z中文');
      p.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    });
  await expect.poll(() => flush(page)).toBe(`${raw}Z中文`);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await command(page, 'redo');
  expect(await flush(page)).toBe(`${raw}Z中文`);
});

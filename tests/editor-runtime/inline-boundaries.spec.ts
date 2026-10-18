import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window &
  typeof globalThis & { marklyraEditor: MarkLyraEditor; fixtureInlineErrors: string[] };
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
async function mount(page: Page, source: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as Host,
      previous = host.marklyraEditor;
    await previous.ready;
    const Constructor = previous.constructor as typeof MarkLyraEditor;
    previous.destroy();
    host.fixtureInlineErrors = [];
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing editor host');
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown,
      onError: (error) => host.fixtureInlineErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, source);
}
async function select(page: Page, anchor: number, head: number) {
  await page.locator('.marklyra-editor-frame').focus();
  await frame(page).locator('#write > p').first().click();
  await page.waitForTimeout(300);
  await frame(page)
    .locator('#write > p')
    .first()
    .evaluate(
      (paragraph, endpoints) => {
        const point = (at: number): [Node, number] => {
          const walker = paragraph.ownerDocument.createTreeWalker(paragraph, 4);
          let node = walker.nextNode(),
            offset = 0;
          while (node) {
            const size = node.textContent?.length ?? 0;
            if (at >= offset && at <= offset + size) return [node, at - offset];
            offset += size;
            node = walker.nextNode();
          }
          throw Error(`Missing DOM endpoint ${at}`);
        };
        paragraph.ownerDocument
          .getSelection()
          ?.setBaseAndExtent(...point(endpoints.anchor), ...point(endpoints.head));
      },
      { anchor, head },
    );
}
const flush = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo' | 'toggleSource') =>
  page.evaluate((type) => (window as Host).marklyraEditor.execute({ type }), type);
const errors = (page: Page) => page.evaluate(() => (window as Host).fixtureInlineErrors);
async function selection(page: Page) {
  return frame(page)
    .locator('#write > p')
    .first()
    .evaluate((paragraph) => {
      const value = paragraph.ownerDocument.getSelection();
      if (!value?.anchorNode || !value.focusNode) throw Error('Missing selection');
      const offset = (node: Node, at: number) => {
        const range = paragraph.ownerDocument.createRange();
        range.selectNodeContents(paragraph);
        range.setEnd(node, at);
        return range.cloneContents().textContent?.length ?? 0;
      };
      const role = (node: Node) => {
        const parts: string[] = [];
        let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
        while (element && element !== paragraph) {
          parts.unshift(
            `${element.tagName}:${element.getAttribute('md-inline') ?? ''}:${[...element.classList]
              .filter((name) => name !== 'md-expand')
              .sort()
              .join('.')}`,
          );
          element = element.parentElement;
        }
        return parts.join('/');
      };
      return {
        anchor: offset(value.anchorNode, value.anchorOffset),
        head: offset(value.focusNode, value.focusOffset),
        anchorRole: role(value.anchorNode),
        headRole: role(value.focusNode),
      };
    });
}

test('unknown inline shape keeps raw source and permits Undo then exact source retry', async ({
  page,
}, info) => {
  const word = '<kbd>same</kbd>',
    raw = `${word}\r\n${word}\n${word}`;
  await mount(page, raw);
  await select(page, 0, word.length + 1);
  const before = await selection(page);
  await page.keyboard.press('Backspace');
  await expect(flush(page)).rejects.toThrow('无法确定重复内容对应的原始源码位置');
  expect(await page.evaluate(() => (window as Host).marklyraEditor.getMarkdown())).toBe(raw);
  const rejected = await page.evaluate(() => (window as Host).fixtureInlineErrors.splice(0));
  expect(rejected.length).toBeGreaterThan(0);
  expect(rejected.every((error) => error.includes('请撤销本次修改，再使用源码模式编辑'))).toBe(
    true,
  );
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual(before);
  await command(page, 'toggleSource');
  const runtime = page
    .frames()
    .find((candidate) => candidate.url().startsWith('http://127.0.0.1:4174/'));
  if (!runtime) throw Error('Missing runtime');
  await runtime.evaluate(() => {
    const editor = Reflect.get(window, 'editor') as {
      sourceView: {
        cm: {
          setSelection(from: { line: number; ch: number }, to: { line: number; ch: number }): void;
          focus(): void;
        };
      };
    };
    editor.sourceView.cm.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 0 });
    editor.sourceView.cm.focus();
  });
  await page.keyboard.press('Backspace');
  const expected = `${word}\n${word}`;
  expect(await flush(page)).toBe(expected);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await command(page, 'redo');
  expect(await flush(page)).toBe(expected);
  expect(await errors(page)).toEqual([]);
  await info.attach('rejection-recovery', {
    body: JSON.stringify({ raw, expected, before, rejected }),
    contentType: 'application/json',
  });
});
const vectors = [
  ['escape', '\\*same\\*'],
  ['entity', '&amp;same'],
  ['hardbreak', 'same  \nsame'],
  ['nested', '**same *\\*same\\* &amp;same* same**'],
] as const;
for (const [kind, word] of vectors)
  for (const index of [0, 1, 2]) {
    test(`${kind} repeated unit ${index + 1} exact deletion/history`, async ({ page }, info) => {
      const raw = `${word}\r\n${word}\n${word}`;
      await mount(page, raw);
      const start = index === 2 ? 2 * word.length + 1 : index * (word.length + 1);
      const end = index === 2 ? 3 * word.length + 2 : start + word.length + 1;
      await select(page, end, start);
      const before = await selection(page);
      await page.keyboard.press(index === 1 ? 'Delete' : 'Backspace');
      const expected = word + (index === 0 ? '\n' : '\r\n') + word;
      expect(await flush(page)).toBe(expected);
      const after = await selection(page);
      expect(after).toMatchObject({ anchor: start, head: start });
      await command(page, 'undo');
      expect(await flush(page)).toBe(raw);
      expect(await selection(page)).toEqual(before);
      await command(page, 'redo');
      expect(await flush(page)).toBe(expected);
      expect(await selection(page)).toEqual(after);
      expect(await errors(page)).toEqual([]);
      await info.attach('source-selection', {
        body: JSON.stringify({ raw, expected, before, after }),
        contentType: 'application/json',
      });
      await info.attach('dom-proof', {
        body: JSON.stringify(
          await frame(page)
            .locator('#write > p')
            .first()
            .evaluate((paragraph) => ({
              html: paragraph.innerHTML,
              text: paragraph.textContent,
              raw: (Reflect.get(paragraph, 'rawText') as (controls?: boolean) => string).call(
                paragraph,
              ),
              clean: (Reflect.get(paragraph, 'rawText') as (controls?: boolean) => string).call(
                paragraph,
                true,
              ),
            })),
        ),
        contentType: 'application/json',
      });
      if (index === 0)
        await info.attach('rendered-after-redo', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
    });
  }

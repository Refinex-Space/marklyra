import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window &
  typeof globalThis & { marklyraEditor: MarkLyraEditor; historyErrors: string[] };

// The serializer spells trailing empty paragraphs (and a few other block gaps) differently
// from the checkpoint the shell journaled. Undo/Redo must keep the exact raw bytes instead of
// reporting "History checkpoint does not match canonical".
const documents = {
  'code block': (eol: string) => ['Intro', '', '```js', 'let a = 1;', '```', ''].join(eol),
  'single line': (eol: string) => `单行文字，没有更多内容${eol}`,
  paragraphs: (eol: string) => ['First', '', 'Second', ''].join(eol),
};
for (const eol of ['\r\n', '\n'])
  for (const [name, make] of Object.entries(documents))
    for (const enters of [1, 2, 3])
      test(`Undo and Redo after ${enters} Enter at the end of a ${name} document (${JSON.stringify(eol)})`, async ({
        page,
      }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto('/');
        const source = make(eol);
        await page.evaluate(async (text) => {
          const target = window as Host;
          await target.marklyraEditor.ready;
          target.historyErrors = [];
          Reflect.get(target.marklyraEditor, 'options').onError = (error: Error) =>
            target.historyErrors.push(error.message);
          await target.marklyraEditor.load(text);
        }, source);
        const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
        await write.evaluate((area) => {
          area.focus();
          const last = area.lastElementChild;
          if (!last) throw new Error('Missing last block');
          const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
          let text: Text | null = null;
          for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next as Text;
          if (!text) throw new Error('Missing last text');
          getSelection()?.setBaseAndExtent(text, text.length, text, text.length);
        });
        for (let index = 0; index < enters; index++) await page.keyboard.press('Enter');
        const flush = () => page.evaluate(() => (window as Host).marklyraEditor.flush());
        const run = (type: 'undo' | 'redo') =>
          page.evaluate(
            (command) => (window as Host).marklyraEditor.execute({ type: command }),
            type,
          );
        for (const type of ['undo', 'redo', 'undo', 'redo', 'undo'] as const) {
          await run(type);
          const current = await flush();
          if (type === 'undo')
            expect(current.startsWith(source.replace(/(\r?\n)+$/, ''))).toBe(true);
        }
        // Undo until nothing is left to undo: the very first state is restored byte for byte.
        for (let index = 0; index < enters + 1; index++) await run('undo');
        expect(await flush()).toBe(source);
        expect(await page.evaluate(() => (window as Host).historyErrors)).toEqual([]);
        expect(pageErrors).toEqual([]);
      });

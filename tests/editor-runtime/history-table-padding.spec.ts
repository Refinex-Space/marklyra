import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window &
  typeof globalThis & { marklyraEditor: MarkLyraEditor; historyErrors: string[] };

// Editing a table cell makes the original serializer re-pad the whole table, and its own Undo
// restores the cell inside the padded table. The journaled original is unpadded; History must keep
// those exact raw bytes instead of reporting "History checkpoint does not match canonical".
const tables: Record<string, string> = {
  'spaced dashes': '| a | b |\r\n| --- | --- |\r\n| 1 | 2 |\r\n',
  'single dashes': '| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n',
  'tight pipes': '|a|b|\r\n|---|---|\r\n|1|2|\r\n',
  alignment: '| a | b |\r\n| :-- | --: |\r\n| 1 | 2 |\r\n',
  'CJK cells': '| 名称 | 说明 |\r\n| --- | --- |\r\n| 表 | dr_ai_turn |\r\n',
};
for (const [name, table] of Object.entries(tables))
  for (const edit of ['type', 'backspace', 'paste'] as const)
    test(`Undo and Redo of a ${edit} in a table with ${name}`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto('/');
      const source = `前文\r\n\r\n${table}\r\n后文\r\n`;
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
        const cells = area.querySelectorAll('td');
        const cell = cells[cells.length - 1];
        if (!cell) throw new Error('Missing table cell');
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let text: Text | null = null;
        for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next as Text;
        if (!text) throw new Error('Missing cell text');
        getSelection()?.setBaseAndExtent(text, text.length, text, text.length);
      });
      if (edit === 'type') await page.keyboard.type('xy');
      else if (edit === 'backspace') await page.keyboard.press('Backspace');
      else
        await write.evaluate((area) => {
          const data = new DataTransfer();
          data.setData('text/plain', 'pasted');
          area.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
        });
      const flush = () => page.evaluate(() => (window as Host).marklyraEditor.flush());
      const run = (type: 'undo' | 'redo') =>
        page.evaluate(
          (command) => (window as Host).marklyraEditor.execute({ type: command }),
          type,
        );
      const edited = await flush();
      expect(edited).not.toBe(source);
      for (const type of ['undo', 'redo', 'undo', 'redo'] as const) {
        await run(type);
        await flush();
      }
      expect(await flush()).toBe(edited);
      await run('undo');
      await run('undo');
      expect(await flush()).toBe(source);
      expect(await page.evaluate(() => (window as Host).historyErrors)).toEqual([]);
      expect(pageErrors).toEqual([]);
    });

test('Backspace in extra blank lines at the end of the file does not report an ambiguous edit', async ({
  page,
}) => {
  await page.goto('/');
  const source = 'Intro\r\n\r\n\r\n';
  await page.evaluate(async (text) => {
    const target = window as Host;
    await target.marklyraEditor.ready;
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
    if (text) getSelection()?.setBaseAndExtent(text, text.length, text, text.length);
  });
  await page.keyboard.press('Backspace');
  const edited = await page.evaluate(() => (window as Host).marklyraEditor.flush());
  expect(edited.startsWith('Intro')).toBe(true);
  expect(edited.length).toBeLessThan(source.length);
  await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await page.evaluate(() => (window as Host).marklyraEditor.flush())).toBe(source);
});

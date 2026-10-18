import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window & typeof globalThis & { marklyraEditor: MarkLyraEditor; pasteErrors: string[] };
for (const reverse of [false, true]) {
  for (const selected of [false, true]) {
    test(`plain Element ${selected ? 'range' : 'end'} paste retains exact source and Undo (${reverse ? 'reverse' : 'forward'})`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      const source = '\uFEFFBefore\r\n\r\nAlpha\r\nline\nEnd\r\n\r\nAfter\n';
      await page.evaluate(async (text) => {
        const target = window as Host;
        await target.marklyraEditor.ready;
        target.pasteErrors = [];
        Reflect.get(target.marklyraEditor, 'options').onError = (error: Error) =>
          target.pasteErrors.push(error.message);
        await target.marklyraEditor.load(text);
      }, source);
      const frame = page.frameLocator('.marklyra-editor-frame');
      const block = frame.locator('#write > p').nth(1);
      await block.evaluate(
        (element, selection) => {
          const area = element.closest<HTMLElement>('#write');
          area?.focus();
          const range = window.getSelection();
          if (!range) throw new Error('Missing selection');
          const end = element.childNodes.length;
          if (selection.selected)
            range.setBaseAndExtent(
              element,
              selection.reverse ? end : 0,
              element,
              selection.reverse ? 0 : end,
            );
          else range.setBaseAndExtent(element, end, element, end);
        },
        { selected, reverse },
      );
      const payload = 'Pasted 中文😀';
      await block.evaluate((element, text) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        element.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      }, payload);
      const wanted = selected
        ? source.replace('Alpha\r\nline\nEnd', payload)
        : source.replace('End\r\n\r\nAfter', `End${payload}\r\n\r\nAfter`);
      await expect
        .poll(() => page.evaluate(() => (window as Host).marklyraEditor.flush()))
        .toBe(wanted);
      await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'undo' }));
      expect(await page.evaluate(() => (window as Host).marklyraEditor.flush())).toBe(source);
      await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'redo' }));
      expect(await page.evaluate(() => (window as Host).marklyraEditor.flush())).toBe(wanted);
      expect(await page.evaluate(() => (window as Host).pasteErrors)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

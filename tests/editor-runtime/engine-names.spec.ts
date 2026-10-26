import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

test('runtime functions expose descriptive names and preserve parser and callback behavior', async ({
  page,
}) => {
  const source = '\uFEFF# Heading\r\n\r\nAlpha **Bold** tail\n';
  await mountAdvanced(page, source);
  const result = await advancedFrame(page)
    .locator('#write')
    .evaluate(() => {
      interface Deferred {
        done(callback: (value: number) => void): Deferred;
        resolve(value: number): Deferred;
      }
      const runtime = window as unknown as {
        editor: {
          MarkParser: {
            InlineLexer: { name: string };
            splitTableCell: ((text: string) => string[]) & { name: string };
          };
        };
        Node: { name: string };
        jQuery: { Deferred(): Deferred };
      };
      const parser = runtime.editor.MarkParser;
      const callbacks: number[] = [];
      const deferred = runtime.jQuery.Deferred();
      deferred.done((value) => callbacks.push(value));
      deferred.resolve(7);
      deferred.done((value) => callbacks.push(value + 1));
      return {
        names: [parser.splitTableCell.name, parser.InlineLexer.name, runtime.Node.name],
        cells: parser.splitTableCell('|Alpha|**Bold**|a\\|b|'),
        callbacks,
      };
    });
  expect(result).toEqual({
    names: ['splitTableCells', 'InlineLexer', 'DocumentNode'],
    cells: ['Alpha', '**Bold**', 'a\\|b'],
    callbacks: [7, 8],
  });
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});

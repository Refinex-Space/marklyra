import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

test('plain Markdown paste replaces the selected repeated root and preserves mixed endings', async ({
  page,
}) => {
  const raw = '\ufeffTARGET\r\n\r\nTARGET\n\nTail  \r\n';
  const text =
    'Before **START Alpha**\r\n\r\n[local](file:///Users/refinex/Documents/note.md)\r\n\r\n[Omega END](target.md) After  ';
  await mountAdvanced(page, raw);
  const target = advancedFrame(page).locator('#write > p').nth(1);
  await target.click();
  await target.evaluate((element, text) => {
    const node = element.querySelector('[md-inline="plain"]')?.firstChild;
    if (!node) throw Error('Missing plain paste target');
    getSelection()?.setBaseAndExtent(node, 0, node, 'TARGET'.length);
    const data = new DataTransfer();
    data.setData('text/plain', text);
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, text);
  const point = raw.lastIndexOf('TARGET');
  const expected = raw.slice(0, point) + text.replace(/\r\n/g, '\n') + raw.slice(point + 6);
  expect(await advancedSource(page)).toBe(expected);
  await advancedHistory(page, 'undo');
  expect(await advancedSource(page)).toBe(raw);
  await advancedHistory(page, 'redo');
  expect(await advancedSource(page)).toBe(expected);
  expect(await advancedErrors(page)).toEqual([]);
});

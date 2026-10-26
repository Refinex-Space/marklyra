import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

test('the lazy Emoji script preserves keyword suggestion order without changing the document', async ({
  page,
}) => {
  const loads: number[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('/appsrc/editor/EmojiSearchMap.js'))
      loads.push(response.status());
  });
  const source = '\ufeffEmoji source\r\n\r\nTail  \n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page);
  await expect
    .poll(() =>
      frame.locator('#write').evaluate(() => {
        const runtime = window as unknown as { EmojiSearchMap?: Record<string, string[]> };
        return runtime.EmojiSearchMap?.score;
      }),
    )
    .toEqual(['100', 'musical_note', 'notes', 'headphones']);
  const suggestions = await frame.locator('#write').evaluate(() => {
    const runtime = window as unknown as {
      editor: { emoji: { search: (keyword: string) => string[] } };
    };
    return runtime.editor.emoji.search('score');
  });
  // The search places name matches before the keyword table's suggestions.
  expect(suggestions).toEqual([
    ':musical_score:',
    ':100:',
    ':musical_note:',
    ':notes:',
    ':headphones:',
  ]);
  expect(loads.length).toBeGreaterThan(0);
  expect(loads.every((status) => status === 200)).toBe(true);
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});

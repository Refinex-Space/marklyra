import { expect, test } from '@playwright/test';
import { installLayout, readyLayout } from './layout.helpers.js';

test('a host-page selection does not tint the editor frame', async ({ page }) => {
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  const frame = page.locator('.marklyra-editor-frame');
  await expect(frame).toBeVisible();
  // Blank lower half of the card: no text or blinking caret, so only a tint can change it. (The
  // frame's own box also spans the sidebar, whose text legitimately highlights.)
  const card = await page.locator('.runtime-editor-mount').boundingBox();
  if (!card) throw new Error('editor mount is not laid out');
  const clip = {
    x: card.x + card.width / 2,
    y: card.y + card.height / 2,
    width: card.width / 2 - 24,
    height: card.height / 2 - 72,
  };
  // Focus on the shell page, as after clicking the sidebar or title bar; only the selection changes.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const before = await page.screenshot({ clip });
  await page.evaluate(() => getSelection()?.selectAllChildren(document.body));
  const selection = await page.evaluate(() => ({
    length: getSelection()?.toString().length ?? 0,
    frame: (() => {
      const frame = document.querySelector('.marklyra-editor-frame');
      return frame ? getSelection()?.containsNode(frame, true) : false;
    })(),
  }));
  expect(selection.length).toBeGreaterThan(0);
  expect(selection.frame).toBe(true);
  expect(await page.screenshot({ clip })).toEqual(before);
});

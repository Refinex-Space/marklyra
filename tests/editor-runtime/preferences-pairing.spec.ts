import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };

async function markdown(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}

async function history(page: Page, type: 'undo' | 'redo') {
  await page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
}

async function selectText(frame: Frame, start: number, end: number) {
  await frame.evaluate(
    ({ start, end }) => {
      const area = document.querySelector<HTMLElement>('#write');
      const paragraph = area?.querySelector('p');
      if (!area || !paragraph) throw new Error('Missing paragraph');
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const points: { node: Node; from: number; to: number }[] = [];
      let offset = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        points.push({ node, from: offset, to: offset + length });
        offset += length;
      }
      const point = (position: number) => {
        const entry = points.find((value) => position >= value.from && position <= value.to);
        if (!entry) throw new Error('Missing text boundary');
        return { node: entry.node, offset: position - entry.from };
      };
      const anchor = point(start),
        head = point(end);
      area.focus();
      getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    },
    { start, end },
  );
}

test('live Markdown pairing resets caches warmed before enabling, preserving real history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Host).marklyraEditor);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.ready;
    await editor.load('Alpha beta');
    await editor.setPreferences({ noPairingMatch: false, autoPairExtendSymbol: false });
  });
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw new Error('Missing runtime');
  await frame.locator('#write > p').first().click();
  await selectText(frame, 0, 5);
  await page.keyboard.type('(');
  expect(await markdown(page)).toBe('(Alpha) beta');
  // A normal opening-bracket deletion builds the separate removal expression while Markdown is off.
  await selectText(frame, 0, 1);
  await page.keyboard.press('Backspace');
  expect(await markdown(page)).toBe('Alpha) beta');
  // Loading resets this fixture's document/history, while Module56's private caches survive.
  // Ordinary pairing can produce an extra original cursor snapshot, unrelated to this toggle.
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.load('Alpha beta'));
  expect(await markdown(page)).toBe('Alpha beta');

  await selectText(frame, 0, 5);
  const before = await frame.evaluate(() => ({
    text: getSelection()?.toString(),
    anchor: getSelection()?.anchorOffset,
    head: getSelection()?.focusOffset,
    node: getSelection()?.anchorNode?.textContent,
  }));
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.setPreferences({ autoPairExtendSymbol: true }),
  );
  expect(await markdown(page)).toBe('Alpha beta');
  expect(
    await frame.evaluate(() => ({
      text: getSelection()?.toString(),
      anchor: getSelection()?.anchorOffset,
      head: getSelection()?.focusOffset,
      node: getSelection()?.anchorNode?.textContent,
    })),
  ).toEqual(before);
  await page.keyboard.type('*');
  expect(await markdown(page)).toBe('*Alpha* beta');
  await history(page, 'undo');
  expect(await markdown(page)).toBe('Alpha beta');
  await history(page, 'redo');
  expect(await markdown(page)).toBe('*Alpha* beta');

  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.load('');
    await editor.focus();
  });
  await page.keyboard.type('*');
  expect(await markdown(page)).toBe('**');
  await page.keyboard.press('Backspace');
  expect(await markdown(page)).toBe('');
  await history(page, 'undo');
  expect(await markdown(page)).toBe('**');
  await history(page, 'redo');
  expect(await markdown(page)).toBe('');
  expect(errors).toEqual([]);
});

import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

// Exercise native keyboard input and history while unrelated Markdown spelling,
// BOM, trailing spaces and mixed line endings remain byte-for-byte intact.
const contexts = {
  paragraph: 'First soft line\nMARK with two trailing spaces  \nlast soft line',
  heading: '### MARK ###',
  setext: 'MARK\n========',
  ordered: '9. first\n21. MARK\n25. last',
  nested: '- outer\n  - MARK\n  - sibling\n- last',
  quote: '> outer\n>\n> > MARK\n> > second',
  tasks: '- [x] complete\n- [ ] MARK\n- [ ] pending',
  table: '| first | second |\n|:------|-------:|\n| MARK | escaped \\| pipe |',
  emphasis: 'Before **bold *MARK* end** after',
  strike: 'Before ~~MARK~~ after',
  code: 'Before `MARK` after',
  link: 'Before [MARK](<https://example.test/a> "title") after',
  reference: 'Before [MARK][target] after\n\n[target]: <https://example.test> "title"',
  footnote: 'MARK with footnote[^note].\n\n[^note]: Footnote body',
  advanced:
    '```js\nconst untouched = "same";\n```\n\nMARK\n\n$$\nx^2 + y^2\n$$\n\n<div>Preserve HTML</div>',
} as const;

async function selectMarker(page: Page) {
  await advancedFrame(page)
    .locator('#write')
    .evaluate((area) => {
      (area as HTMLElement).focus();
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf('MARK') ?? -1;
        if (at < 0) continue;
        document.getSelection()?.setBaseAndExtent(node, at + 2, node, at + 2);
        return;
      }
      throw Error('Missing rendered edit marker');
    });
}

for (const [context, body] of Object.entries(contexts))
  for (const endings of ['lf', 'mixed'] as const) {
    const lines = ['---', 'title: "Keep spelling"', '---', '', body, '', 'Tail  ', ''].join('\n');
    let line = 0;
    const raw =
      endings === 'lf'
        ? lines
        : `\ufeff${lines.replace(/\n/g, () => (line++ % 2 === 0 ? '\r\n' : '\n'))}`;
    test(`native input/history/source roundtrip: ${context}, ${endings}`, async ({ page }) => {
      await mountAdvanced(page, raw);
      expect(await advancedSource(page)).toBe(raw);
      await selectMarker(page);
      const edited = raw.replace('MARK', 'MA新😀RK');
      await page.keyboard.insertText('新😀');
      expect(await advancedSource(page)).toBe(edited);
      // Repeated keyboard Undo/Redo uses the same user entry points as desktop
      // editing; direct Unicode insertion is not a system IME candidate test.
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.keyboard.press('ControlOrMeta+z');
        expect(await advancedSource(page)).toBe(raw);
        await page.keyboard.press('ControlOrMeta+Shift+z');
        expect(await advancedSource(page)).toBe(edited);
      }
      for (let toggle = 0; toggle < 4; toggle++) {
        await page.evaluate(() =>
          (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
            type: 'toggleSource',
          }),
        );
        expect(await advancedSource(page)).toBe(edited);
      }
      expect(await advancedErrors(page)).toEqual([]);
    });

    test(`native split/type/history branch: ${context}, ${endings}`, async ({ page }) => {
      await mountAdvanced(page, raw);
      await selectMarker(page);
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('续写😀');
      const edited = await advancedSource(page);
      expect(edited).toContain('续写😀');
      const untouchedHeader = raw.slice(0, raw.indexOf('---', raw.indexOf('title:')) + 3);
      expect(edited.startsWith(untouchedHeader)).toBe(true);
      expect(edited.endsWith(raw.slice(raw.lastIndexOf('Tail  ')))).toBe(true);
      // Different native block types group Enter and typing differently. Record
      // the actual undo chain and require exact inverse replay, not a guessed
      // number of engine transactions or canonical Markdown spelling.
      const history = [edited];
      while (history.at(-1) !== raw && history.length < 8) {
        await page.keyboard.press('ControlOrMeta+z');
        const previous = await advancedSource(page);
        expect(previous).not.toBe(history.at(-1));
        history.push(previous);
      }
      expect(history.at(-1)).toBe(raw);
      for (const expected of history.slice(0, -1).reverse()) {
        await page.keyboard.press('ControlOrMeta+Shift+z');
        expect(await advancedSource(page)).toBe(expected);
      }
      await page.keyboard.insertText('Z');
      const branched = await advancedSource(page);
      expect(await advancedErrors(page)).toEqual([]);
      // The restored Redo caret must behave exactly like the fresh edit path.
      await mountAdvanced(page, raw);
      await selectMarker(page);
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('续写😀');
      await page.keyboard.insertText('Z');
      expect(await advancedSource(page)).toBe(branched);
      expect(await advancedErrors(page)).toEqual([]);
    });
  }

import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };

for (const mode of ['wysiwyg', 'source'] as const)
  test(`retired composition-end callback cannot release a new ${mode} composition`, async ({
    page,
  }) => {
    const source = '\ufeffAlpha 中文\r\n\r\nTail  \n';
    await mountAdvanced(page, source);
    if (mode === 'source')
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
      );
    const target = advancedFrame(page).locator(
      mode === 'source' ? '#typora-source textarea' : '#write',
    );
    await target.evaluate((element) => {
      // Synthetic lifecycle ordering proves ownership only. No system IME
      // candidate or platform composition delivery is claimed by this test.
      for (const type of ['compositionstart', 'compositionend', 'compositionstart'])
        element.dispatchEvent(new CompositionEvent(type, { bubbles: true, data: '' }));
    });
    // A sentinel queued after the old end callback proves that it has run.
    await target.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
      .toBe(true);
    await expect(
      page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
      ),
    ).rejects.toThrow();
    await target.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
      .toBe(false);
    expect(await advancedSource(page)).toBe(source);
    await page.evaluate(async () => {
      const editor = (window as unknown as Host).marklyraEditor;
      await editor.execute({ type: 'toggleSource' });
      await editor.execute({ type: 'toggleSource' });
    });
    expect(await advancedSource(page)).toBe(source);
    expect(await advancedErrors(page)).toEqual([]);
  });

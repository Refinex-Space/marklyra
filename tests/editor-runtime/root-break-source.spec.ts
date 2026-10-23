import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

for (const literal of ['$&', '$`', "$'", '{0}'])
  test(`root Enter preserves literal replacement tokens ${literal} and physical endings`, async ({
    page,
  }) => {
    const raw = `\ufeffIntro\r\n\r\nLiteral ${literal} MARK\n\nTail  \r\n`;
    await mountAdvanced(page, raw);
    await advancedFrame(page)
      .locator('#write')
      .evaluate((area) => {
        (area as HTMLElement).focus();
        const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.textContent?.indexOf('MARK') ?? -1;
          if (index < 0) continue;
          getSelection()?.setBaseAndExtent(node, index + 2, node, index + 2);
          return;
        }
        throw Error('Missing source marker');
      });
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('续写😀');
    expect(await advancedSource(page)).toBe(raw.replace('MARK', 'MA\n\n续写😀RK'));
    await page.keyboard.press('ControlOrMeta+z');
    expect(await advancedSource(page)).toBe(raw.replace('MARK', 'MA\n\nRK'));
    await page.keyboard.press('ControlOrMeta+z');
    expect(await advancedSource(page)).toBe(raw);
    expect(await advancedErrors(page)).toEqual([]);
  });

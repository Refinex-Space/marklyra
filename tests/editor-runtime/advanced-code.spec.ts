import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  advancedSource,
  codeState,
  mountAdvanced,
  settledAdvancedSource,
} from './advanced-lifecycle.helpers.js';

test('code language control baseline uses the actual runtime CodeMirror and source', async ({
  page,
}, info) => {
  const source = '\ufeffIntro\r\n\r\n```javascript\r\nconst value = 1;\n```\r\n\r\nTail  \r\n';
  await mountAdvanced(page, source);
  await advancedFrame(page).locator('#write .md-fences .CodeMirror-line').first().click();
  const state = await codeState(page);
  await info.attach('actual-code-language-ui', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json',
  });
  expect(state).toHaveLength(1);
  expect(state[0]?.language).toBe('javascript');
  expect(state[0]?.value).toBe('const value = 1;');
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});

for (const nested of [false, true])
  for (const language of ['python', '', 'unknown-language'])
    test(`code language ${JSON.stringify(language)} changes only opening info, nested=${nested}`, async ({
      page,
    }, info) => {
      const prefix = nested ? '> ' : '',
        body = '```javascript\r\nconst value = 1;\n```\r\n',
        source =
          '\ufeffIntro\r\n\r\n' +
          body
            .split(/(?<=\n)/u)
            .map((line) => prefix + line)
            .join('') +
          '\r\nTail  \r\n',
        expected = source.replace('```javascript', '```' + language);
      await mountAdvanced(page, source);
      const frame = advancedFrame(page),
        cm = frame.locator('#write .md-fences .CodeMirror-line').first();
      await cm.click();
      const initial = await codeState(page),
        control = frame.locator('#write .md-fences .marklyra-cm-lang-input');
      await expect(control).toBeVisible();
      await control.dblclick();
      await control.press('Backspace');
      if (language) await control.pressSequentially(language);
      // The shipped control accepts unknown labels on blur. Its Enter path
      // additionally navigates/inserts a paragraph and owns separate history.
      if (language === 'unknown-language') await cm.click();
      else await control.press('Enter');
      await settledAdvancedSource(page, expected);
      const edited = await codeState(page);
      await info.attach('code-language-edit', {
        body: JSON.stringify({ source, expected, initial, edited }, null, 2),
        contentType: 'application/json',
      });
      expect(edited[0]?.id).toBe(initial[0]?.id);
      expect(edited[0]?.value).toBe(initial[0]?.value);
      expect(edited[0]?.language ?? '').toBe(language);
      if (language === 'python') expect(edited[0]?.mode).toBe('text/x-python');
      await advancedHistory(page, 'undo');
      await settledAdvancedSource(page, source);
      await advancedHistory(page, 'redo');
      await settledAdvancedSource(page, expected);
      expect(await advancedErrors(page)).toEqual([]);
      await mountAdvanced(page, expected);
      expect((await codeState(page))[0]?.language ?? '').toBe(language);
      expect(await advancedSource(page)).toBe(expected);
    });

for (const statistics of [false, true])
  test(`passive SDK notification and statistics=${statistics} do not commit an unfinished language field as an empty history step`, async ({
    page,
  }, info) => {
    const source = '```javascript\nconst value = 1;\n```\n\nTail\n';
    await mountAdvanced(page, source);
    const frame = advancedFrame(page),
      cm = frame.locator('#write .md-fences .CodeMirror-line').first(),
      control = frame.locator('#write .md-fences .marklyra-cm-lang-input');
    await cm.click();
    const initial = await codeState(page);
    await control.dblclick();
    await control.press('Backspace');
    const identity = await control.evaluate((element) => ({
      outer: element.outerHTML,
      active: document.activeElement?.outerHTML,
      contains: document.getElementById('write')?.contains(document.activeElement),
    }));
    await info.attach('language-field-identity', {
      body: JSON.stringify(identity),
      contentType: 'application/json',
    });
    await frame
      .locator('#write')
      .evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 800)));
    if (statistics)
      await page.evaluate(() =>
        (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.getStatistics(),
      );
    expect(await control.textContent()).toBe('');
    expect((await codeState(page))[0]?.language).toBe('javascript');
    await control.pressSequentially('python');
    await control.press('Enter');
    await settledAdvancedSource(page, source.replace('javascript', 'python'));
    await advancedHistory(page, 'undo');
    await settledAdvancedSource(page, source);
    await advancedHistory(page, 'redo');
    await settledAdvancedSource(page, source.replace('javascript', 'python'));
    const after = await codeState(page);
    expect(after[0]?.id).toBe(initial[0]?.id);
    expect(after[0]?.value).toBe(initial[0]?.value);
    expect(await advancedErrors(page)).toEqual([]);
  });
test.beforeEach(async ({ page }) => {
  const baseline = process.env.ADVANCED_BASELINE_FRAME;
  if (baseline)
    await page.route('http://127.0.0.1:4174/frame-host.js', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: await readFile(baseline),
      }),
    );
});

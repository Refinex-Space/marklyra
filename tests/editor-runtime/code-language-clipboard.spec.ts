import type { ClipboardContent, ContextAction, MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  codeState,
  mountAdvanced,
  settledAdvancedSource,
} from './advanced-lifecycle.helpers.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  advancedErrors: string[];
  languageClipboard: {
    reads: number;
    writes: ClipboardContent[];
    choose?: (action: ContextAction | null) => void;
  };
};
async function mountClipboard(page: Page) {
  await mountAdvanced(page, source);
  await page.evaluate(async (source) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    const Constructor = old.constructor as typeof MarkLyraEditor,
      root = old.element.parentElement;
    if (!root) throw Error('Missing mount');
    old.destroy();
    host.languageClipboard = { reads: 0, writes: [] };
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.advancedErrors.push(error.message),
      host: {
        clipboard: {
          readOnPaste: true,
          async read() {
            host.languageClipboard.reads++;
            return { text: 'Java', html: '<b>Java</b>' };
          },
          async write(content) {
            host.languageClipboard.writes.push(content);
          },
        },
        contextMenu: {
          show(_request, choose) {
            host.languageClipboard.choose = choose;
          },
        },
      },
    });
    await host.marklyraEditor.ready;
  }, source);
}
const source = '\ufeffBefore\r\n\r\n```text\r\nSystem.out.println("hello");\n```\r\n\r\nTail  \r\n';
for (const rich of [false, true]) {
  test(`language field paste replaces its selection as plain text, rich=${rich}`, async ({
    page,
  }) => {
    await mountClipboard(page);
    const frame = advancedFrame(page);
    await frame.locator('.md-fences .CodeMirror-line').first().click();
    const field = frame.locator('.ty-cm-lang-input');
    await field.dblclick();
    await field.evaluate((element, rich) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'Java');
      if (rich) {
        data.setData('text/html', '<b>Java</b>');
        data.setData('text/markhtml', '<p><strong>Java</strong></p>');
      }
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, rich);
    await expect(field).toHaveText('Java');
    expect(await page.evaluate(() => (window as unknown as Host).languageClipboard.reads)).toBe(0);
    await expect(field.locator('*')).toHaveCount(0);
    await field.press('Enter');
    const expected = source.replace('```text', '```Java');
    await settledAdvancedSource(page, expected);
    expect((await codeState(page))[0]?.value).toBe('System.out.println("hello");');
    expect((await codeState(page))[0]?.mode).toBe('text/x-java');
    await advancedHistory(page, 'undo');
    await settledAdvancedSource(page, source);
    await advancedHistory(page, 'redo');
    await settledAdvancedSource(page, expected);
    expect(await advancedErrors(page)).toEqual([]);
  });
}

for (const action of ['edit.paste', 'edit.pastePlain'] as const)
  test(`context menu ${action} stays in the language field`, async ({ page }) => {
    await mountClipboard(page);
    const frame = advancedFrame(page);
    await frame.locator('.md-fences .CodeMirror-line').first().click();
    const field = frame.locator('.ty-cm-lang-input');
    await field.dblclick();
    await field.click({ button: 'right' });
    await page.waitForFunction(() => Boolean((window as unknown as Host).languageClipboard.choose));
    await page.evaluate(
      (action) => (window as unknown as Host).languageClipboard.choose?.(action),
      action,
    );
    await expect(field).toHaveText('Java');
    await field.press('Enter');
    await settledAdvancedSource(page, source.replace('```text', '```Java'));
    await advancedHistory(page, 'undo');
    await settledAdvancedSource(page, source);
    await advancedHistory(page, 'redo');
    await settledAdvancedSource(page, source.replace('```text', '```Java'));
    expect(await advancedErrors(page)).toEqual([]);
  });

test('language paste respects a partial selection and ignores rich-only or composing input', async ({
  page,
}) => {
  await mountClipboard(page);
  const frame = advancedFrame(page);
  await frame.locator('.md-fences .CodeMirror-line').first().click();
  const field = frame.locator('.ty-cm-lang-input');
  await field.dblclick();
  await field.evaluate((element) => {
    const data = new DataTransfer();
    data.setData('text/html', '<b>Java</b>');
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    data.setData('text/plain', 'Java');
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  });
  await expect(field).toHaveText('text');
  await field.dispatchEvent('compositionend', { data: '' });
  await expect
    .poll(() => frame.locator('body').evaluate(() => Reflect.get(window, 'editor').isIME))
    .toBeFalsy();
  await field.evaluate((element) => {
    const leaf = element.firstChild;
    if (!leaf) throw Error('Missing language text');
    getSelection()?.setBaseAndExtent(leaf, 0, leaf, 2);
    const data = new DataTransfer();
    data.setData('text/plain', 'Java\r\n');
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  });
  await expect(field).toHaveText('Javaxt');
  await frame.locator('.md-fences .CodeMirror-line').first().click();
  await settledAdvancedSource(page, source.replace('```text', '```Javaxt'));
  await advancedHistory(page, 'undo');
  await settledAdvancedSource(page, source);
  expect(await advancedErrors(page)).toEqual([]);
});

for (const action of ['edit.copy', 'edit.cut'] as const)
  test(`language ${action} keeps the code body and clipboard text intact`, async ({ page }) => {
    await mountClipboard(page);
    const frame = advancedFrame(page);
    await frame.locator('.md-fences .CodeMirror-line').first().click();
    const field = frame.locator('.ty-cm-lang-input');
    await field.dblclick();
    await field.click({ button: 'right' });
    await page.waitForFunction(() => Boolean((window as unknown as Host).languageClipboard.choose));
    await page.evaluate(
      (action) => (window as unknown as Host).languageClipboard.choose?.(action),
      action,
    );
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).languageClipboard.writes))
      .toEqual([{ text: 'text' }]);
    if (action === 'edit.cut') {
      await expect(field).toHaveText('');
      await settledAdvancedSource(page, source.replace('```text', '```'));
      await advancedHistory(page, 'undo');
    }
    await settledAdvancedSource(page, source);
    expect(await advancedErrors(page)).toEqual([]);
  });

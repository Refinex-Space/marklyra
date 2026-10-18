import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    secondPlainEditor?: MarkLyraEditor;
    plainErrors: string[];
  };
async function mount(page: Page, source: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as Host,
      previous = host.marklyraEditor;
    await previous.ready;
    const Constructor = previous.constructor as typeof MarkLyraEditor;
    previous.destroy();
    host.plainErrors = [];
    const element = document.querySelector<HTMLElement>('#editor');
    if (!element) throw Error('Missing host');
    host.marklyraEditor = new Constructor(element, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.plainErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, source);
}
const flush = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as Host).marklyraEditor.execute({ type }), type);
const editor = (page: Page, index = 0) => page.frameLocator('.marklyra-editor-frame').nth(index);
async function select(
  page: Page,
  start: number,
  end: number,
  backward: boolean,
  elements = false,
  paragraph = 0,
  instance = 0,
) {
  await page.locator('.marklyra-editor-frame').nth(instance).focus();
  await editor(page, instance).locator('#write > p').nth(paragraph).click();
  await editor(page, instance)
    .locator('#write > p')
    .nth(paragraph)
    .evaluate(
      (p, { start, end, backward, elements }) => {
        const selection = p.ownerDocument.getSelection();
        if (!selection) throw Error('No selection');
        (p as HTMLElement).focus();
        const point = (offset: number): [Node, number] => {
          if (elements) {
            let at = 0;
            for (let index = 0; index <= p.childNodes.length; index++) {
              if (at === offset) return [p, index];
              at += p.childNodes[index]?.textContent?.length ?? 0;
            }
            throw Error('Not an element boundary');
          }
          const walker = p.ownerDocument.createTreeWalker(p, 4);
          let node = walker.nextNode(),
            at = 0;
          while (node) {
            const length = node.textContent?.length ?? 0;
            if (offset >= at && offset <= at + length) return [node, offset - at];
            at += length;
            node = walker.nextNode();
          }
          throw Error('No text boundary');
        };
        const a = point(start),
          b = point(end);
        selection.setBaseAndExtent(...(backward ? b : a), ...(backward ? a : b));
      },
      { start, end, backward, elements },
    );
}
async function selection(page: Page, instance = 0) {
  return editor(page, instance)
    .locator('#write')
    .evaluate((root) => {
      const s = root.ownerDocument.getSelection();
      if (!s?.anchorNode || !s.focusNode) return null;
      const count = (node: Node, offset: number) => {
        const r = root.ownerDocument.createRange();
        r.selectNodeContents(root);
        r.setEnd(node, offset);
        return r.toString().length;
      };
      return {
        anchor: count(s.anchorNode, s.anchorOffset),
        head: count(s.focusNode, s.focusOffset),
        text: s.toString(),
      };
    });
}
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as Host).plainErrors)).toEqual([]);
});
for (const word of ['same', '中文😀', '👩‍👩‍👧‍👦'])
  for (const backward of [false, true])
    for (const index of [0, 1, 2]) {
      test(`plain soft-line ${index + 1}, ${backward ? 'reverse' : 'forward'} selection, ${word}`, async ({
        page,
      }, info) => {
        const raw = `${word}\r\n${word}\n${word}`,
          size = word.length;
        const start = index === 2 ? 2 * size + 1 : index * (size + 1),
          end = index === 2 ? 3 * size + 2 : start + size + 1;
        await mount(page, raw);
        await select(page, start, end, backward);
        const before = await selection(page);
        expect(before?.text).toBe(index === 2 ? '\n' + word : word + '\n');
        await page.keyboard.press(index === 1 ? 'Delete' : 'Backspace');
        const expected = word + (index === 0 ? '\n' : '\r\n') + word;
        expect(await flush(page)).toBe(expected);
        const deleted = await selection(page);
        expect(deleted?.anchor).toBe(start);
        expect(deleted?.head).toBe(start);
        await command(page, 'undo');
        expect(await flush(page)).toBe(raw);
        const restored = await selection(page);
        expect(restored).toEqual(before);
        await command(page, 'redo');
        expect(await flush(page)).toBe(expected);
        const redone = await selection(page);
        expect(redone?.anchor).toBe(start);
        expect(redone?.head).toBe(start);
        await info.attach('source-selection-history', {
          body: JSON.stringify({ raw, expected, before, deleted, restored, redone }, null, 2),
          contentType: 'application/json',
        });
      });
    }
for (const index of [0, 1, 2])
  test(`element boundaries ${index + 1} preserve BOM and surrounding source`, async ({ page }) => {
    const body = 'same\r\nsame\nsame',
      prefix = '\uFEFFLead\r\n\r\n',
      suffix = '\r\n\r\nTail\n';
    await mount(page, prefix + body + suffix);
    const start = index === 2 ? 9 : index * 5,
      end = index === 2 ? 14 : start + 5;
    await select(page, start, end, true, true, 1);
    await page.keyboard.press('Backspace');
    expect(await flush(page)).toBe(
      prefix + 'same' + (index === 0 ? '\n' : '\r\n') + 'same' + suffix,
    );
    await command(page, 'undo');
    expect(await flush(page)).toBe(prefix + body + suffix);
  });

test('real beforeinput replacement validates target range without a synthetic IME claim', async ({
  page,
}) => {
  await mount(page, 'same\r\nsame\nsame');
  await select(page, 0, 5, false);
  await editor(page)
    .locator('#write')
    .evaluate((root) => {
      Reflect.set(window, '__plainBeforeInput', []);
      root.addEventListener(
        'beforeinput',
        (event) => {
          const value = event as InputEvent;
          (Reflect.get(window, '__plainBeforeInput') as unknown[]).push({
            type: value.inputType,
            data: value.data,
            targets: value.getTargetRanges().length,
            trusted: value.isTrusted,
          });
        },
        true,
      );
    });
  await page.keyboard.insertText('中文😀');
  expect(await flush(page)).toBe('中文😀same\nsame');
  const events = await editor(page)
    .locator('body')
    .evaluate(() => Reflect.get(window, '__plainBeforeInput'));
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'insertText', data: '中文😀', targets: 1, trusted: true }),
    ]),
  );
  await command(page, 'undo');
  expect(await flush(page)).toBe('same\r\nsame\nsame');
});

test('repaired original redo caret survives snapshot and rejected-load rollback', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 10, true);
  await page.keyboard.press('Delete');
  expect(await flush(page)).toBe('same\r\nsame');
  await expect(
    page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
  ).rejects.toThrow();
  const errors = await page.evaluate(() => (window as Host).plainErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((message) => message.includes('normaliz'))).toBe(true);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
  await command(page, 'redo');
  expect(await flush(page)).toBe('same\r\nsame');
  expect(await selection(page)).toMatchObject({ anchor: 5, head: 5, text: '' });
});

test('unproven HTML inline never obtains a guessed source hint', async ({ page }) => {
  const raw = '<em>same</em>\r\n<em>same</em>\n<em>same</em>';
  await mount(page, raw);
  const paragraph = editor(page).locator('#write > p');
  await paragraph.click();
  await paragraph.evaluate((p) => {
    p.ownerDocument.getSelection()?.setBaseAndExtent(p, 0, p, 2);
  });
  await page.keyboard.press('Backspace');
  await expect(flush(page)).rejects.toThrow('已保留原稿');
  expect(await page.evaluate(() => (window as Host).marklyraEditor.getMarkdown())).toBe(raw);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  const errors = await page.evaluate(() => (window as Host).plainErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((message) => message.includes('已保留原稿'))).toBe(true);
});

test('reverse Undo metadata survives rollback while its entry is on the redo side', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 10, true);
  await page.keyboard.press('Delete');
  expect(await flush(page)).toBe('same\r\nsame');
  await command(page, 'undo');
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
  await expect(
    page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
  ).rejects.toThrow();
  const errors = await page.evaluate(() => (window as Host).plainErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((message) => message.includes('normaliz'))).toBe(true);
  await command(page, 'redo');
  expect(await flush(page)).toBe('same\r\nsame');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
});

test('two independent runtimes keep plain input history and directed selections isolated', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame',
    other = 'other\r\nother\nother';
  await mount(page, raw);
  await page.evaluate(async (other) => {
    const host = window as Host,
      Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    const mount = document.createElement('div');
    mount.style.height = '300px';
    document.body.append(mount);
    host.secondPlainEditor = new Constructor(mount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: other,
      onError: (error) => host.plainErrors.push(error.message),
    });
    await host.secondPlainEditor.ready;
  }, other);
  await select(page, 5, 10, true);
  await page.keyboard.press('Delete');
  expect(await flush(page)).toBe('same\r\nsame');
  await command(page, 'undo');
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
  expect(await page.evaluate(() => (window as Host).secondPlainEditor?.getMarkdown())).toBe(other);
  await select(page, 11, 17, true, false, 0, 1);
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => (window as Host).secondPlainEditor?.flush())).toBe(
    'other\r\nother',
  );
  await page.evaluate(() => (window as Host).secondPlainEditor?.execute({ type: 'undo' }));
  expect(await selection(page, 1)).toEqual({ anchor: 17, head: 11, text: '\nother' });
  expect(await flush(page)).toBe(raw);
});

test('failed load immediately restores the active reversed plain selection without another Undo', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 10, true);
  await page.keyboard.press('Delete');
  await flush(page);
  await command(page, 'undo');
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
  await expect(
    page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
  ).rejects.toThrow();
  expect(await flush(page)).toBe(raw);
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
  // The runtime snapshot path schedules a refresh at 200 ms; verify it cannot
  // later replace the restored view selection after the API promise has settled.
  await page.waitForTimeout(300);
  expect(await selection(page)).toEqual({ anchor: 10, head: 5, text: 'same\n' });
  const errors = await page.evaluate(() => (window as Host).plainErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((message) => message.includes('normaliz'))).toBe(true);
});

test('failed background load keeps the host input focused instead of restoring an inactive frame selection', async ({
  page,
}) => {
  const raw = 'same\r\nsame\nsame';
  await mount(page, raw);
  await select(page, 5, 10, true);
  await page.keyboard.press('Delete');
  await flush(page);
  await command(page, 'undo');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'plain-host-focus';
    input.setAttribute('aria-label', 'host focus');
    document.body.prepend(input);
  });
  const input = page.getByRole('textbox', { name: 'host focus' });
  await input.fill('keep');
  await expect(input).toBeFocused();
  await expect(
    page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
  ).rejects.toThrow();
  expect(await flush(page)).toBe(raw);
  await expect(input).toBeFocused();
  await page.waitForTimeout(300);
  await expect(input).toBeFocused();
  expect(await input.inputValue()).toBe('keep');
  const errors = await page.evaluate(() => (window as Host).plainErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((message) => message.includes('normaliz'))).toBe(true);
});

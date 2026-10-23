import type { ClipboardContent, MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import { advancedFrame } from './advanced-lifecycle.helpers.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  widgetClipboard: { content: ClipboardContent; writes: number; errors: string[] };
};
const source = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const history = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
const code = Array.from({ length: 100 }, (_, index) => `const line${index} = ${index};`).join('\n');
const cases = [
  { name: 'fenced code', content: `\`\`\`javascript\n${code}\n\`\`\`` },
  { name: 'inline math', content: 'Alpha $x^2 + y$ Omega' },
  { name: 'block math', content: '$$\nx^2 + y\n$$' },
  { name: 'local file link', content: '[local](file:///Users/refinex/Documents/note.md)' },
  {
    name: 'mixed partial formatting',
    content: 'Alpha $x^2 + y$\n\n```js\nconst x = 1;\n```',
    partial: true,
  },
];
async function mount(page: Page, markdown: string) {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing clipboard host');
    host.widgetClipboard = { content: { text: '' }, writes: 0, errors: [] };
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown,
      onError: (error) => host.widgetClipboard.errors.push(error.message),
      host: {
        clipboard: {
          async read() {
            return structuredClone(host.widgetClipboard.content);
          },
          async write(content) {
            host.widgetClipboard.content = structuredClone(content);
            host.widgetClipboard.writes++;
          },
        },
      },
    });
    await host.marklyraEditor.ready;
  }, markdown);
}
async function select(page: Page, partial: boolean) {
  const area = advancedFrame(page).locator('#write');
  await area.locator('p').first().click();
  await area.evaluate((area, partial) => {
    (area as HTMLElement).focus();
    const range = document.createRange();
    if (partial) {
      const first = area.querySelector('strong [md-inline="plain"]')?.firstChild;
      const last = area.querySelector('a [md-inline="plain"]')?.firstChild;
      if (!first || !last) throw Error('Missing partial endpoints');
      range.setStart(first, 'START '.length);
      range.setEnd(last, 'Omega'.length);
    } else range.selectNodeContents(area);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, partial);
  await area.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function menu(page: Page) {
  const point = await advancedFrame(page)
    .locator('#write')
    .evaluate((area) => {
      const text = area.querySelector('strong [md-inline="plain"]')?.firstChild;
      if (!text) throw Error('Missing menu text');
      const range = document.createRange();
      range.setStart(text, 6);
      range.setEnd(text, 7);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
  const frame = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!frame) throw Error('Missing editor frame');
  await page.mouse.click(frame.x + point.x, frame.y + point.y, { button: 'right' });
}
for (const sample of cases)
  for (const transport of ['event', 'context-menu'] as const)
    for (const operation of ['copy', 'cut'] as const)
      test(`${transport} ${operation} projects ${sample.name} without widget DOM`, async ({
        page,
      }, info) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const initial = `\ufeffBefore **START Alpha**\r\n\r\n${sample.content}\n\n[Omega END](target.md) After  \r\n`;
        await mount(page, initial);
        await select(page, Boolean(sample.partial));
        if (transport === 'event') {
          const content = await advancedFrame(page)
            .locator('#write')
            .evaluate((area, operation) => {
              const data = new DataTransfer();
              area.dispatchEvent(
                new ClipboardEvent(operation, {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: data,
                }),
              );
              return {
                text: data.getData('text/plain'),
                html: data.getData('text/html'),
                markHtml: data.getData('text/markhtml'),
              };
            }, operation);
          await page.evaluate((content) => {
            (window as unknown as Host).widgetClipboard.content = content;
          }, content);
        } else {
          await menu(page);
          await page
            .getByRole('menuitem', { name: operation === 'copy' ? '复制' : '剪切', exact: true })
            .click();
          await expect
            .poll(() => page.evaluate(() => (window as unknown as Host).widgetClipboard.writes))
            .toBe(1);
        }
        const copied = await page.evaluate(
          () => (window as unknown as Host).widgetClipboard.content,
        );
        const textFallback = sample.name === 'local file link';
        if (textFallback) {
          expect(copied.markHtml || '').toBe('');
          expect(copied.html || '').toBe('');
          expect(copied.text.replace(/\r\n/g, '\n')).toBe(
            `Before **START Alpha**\n\n${sample.content}\n\n[Omega END](target.md) After  `,
          );
        } else expect(copied.markHtml).toBeTruthy();
        expect(copied.markHtml ?? '').not.toMatch(
          /CodeMirror|xxxxxxxxxx|<script|<textarea|md-rawblock-tooltip/,
        );
        expect(copied.html ?? '').not.toMatch(
          /CodeMirror|xxxxxxxxxx|<script|<textarea|md-rawblock-tooltip/,
        );
        if (sample.name === 'fenced code') {
          expect(copied.markHtml).toContain('lang="javascript"');
          expect(copied.markHtml).toContain(code);
          expect(copied.html).toContain(code);
        } else if (!textFallback) expect(copied.markHtml).toContain('x^2 + y');
        if (operation === 'cut') {
          expect(await source(page)).not.toBe(initial);
          await history(page, 'undo');
          expect(await source(page)).toBe(initial);
          await history(page, 'redo');
          expect(await source(page)).not.toBe(initial);
          await history(page, 'undo');
        }
        expect(await source(page)).toBe(initial);
        const target = '\ufeffKeep\r\n\r\nTARGET\n\nTail  \r\n';
        await page.evaluate(
          (target) => (window as unknown as Host).marklyraEditor.load(target),
          target,
        );
        await advancedFrame(page).locator('#write > p').nth(1).click();
        await advancedFrame(page)
          .locator('#write > p')
          .nth(1)
          .evaluate((p, copied) => {
            const text = p.querySelector('[md-inline="plain"]')?.firstChild;
            if (!text) throw Error('Missing paste target');
            getSelection()?.setBaseAndExtent(text, 0, text, 'TARGET'.length);
            const data = new DataTransfer();
            data.setData('text/plain', copied.text);
            if (copied.html) data.setData('text/html', copied.html);
            if (copied.markHtml) data.setData('text/markhtml', copied.markHtml);
            p.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
            );
          }, copied);
        const body = sample.partial
          ? `**Alpha**\n\n${sample.content}\n\n[Omega](target.md)`
          : `Before **START Alpha**\n\n${sample.content}\n\n[Omega END](target.md) After  `;
        const expected = target.replace('TARGET', () => body);
        await expect.poll(() => source(page)).toBe(expected);
        await history(page, 'undo');
        expect(await source(page)).toBe(target);
        await history(page, 'redo');
        expect(await source(page)).toBe(expected);
        expect(
          await page.evaluate(() => (window as unknown as Host).widgetClipboard.errors),
        ).toEqual([]);
        expect(errors).toEqual([]);
        await info.attach('clipboard-widget-roundtrip', {
          body: JSON.stringify({
            transport,
            operation,
            source: initial,
            pasted: expected,
            clipboard: copied,
            systemClipboard: false,
          }),
          contentType: 'application/json',
        });
      });

test('native cut cannot delete the selection when safe Markdown fallback produced no text', async ({
  page,
}) => {
  const initial = 'Before **START Alpha**\n\n[local](file:///tmp/marklyra-note.md)\n';
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mount(page, initial);
  await select(page, false);
  const cancelled = await advancedFrame(page)
    .locator('#write')
    .evaluate((area) => {
      const runtime = window as unknown as {
        editor: { UserOp: { copyAsMarkdown(editor: unknown): void } };
      };
      const operation = runtime.editor.UserOp.copyAsMarkdown;
      // Fault injection proves the fail-closed cut boundary. Ordinary copy/cut
      // round trips above continue to use the unmodified native writer.
      runtime.editor.UserOp.copyAsMarkdown = () => {};
      try {
        const data = new DataTransfer();
        Reflect.set(window, 'failedClipboardData', data);
        return !area.dispatchEvent(
          new ClipboardEvent('cut', {
            bubbles: true,
            cancelable: true,
            clipboardData: data,
          }),
        );
      } finally {
        runtime.editor.UserOp.copyAsMarkdown = operation;
      }
    });
  expect(cancelled).toBe(true);
  expect(await source(page)).toBe(initial);
  expect(pageErrors).toEqual(['未生成完整的 Markdown 剪贴板文本，已保留正文']);
  const retired = await advancedFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor');
      editor.UserOp.copyAsMarkdown(editor);
      return (Reflect.get(window, 'failedClipboardData') as DataTransfer).getData('text/plain');
    });
  expect(retired).toBe('');
  await select(page, false);
  await menu(page);
  await page.getByRole('menuitem', { name: '复制', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).widgetClipboard.writes))
    .toBe(1);
  expect(await source(page)).toBe(initial);
});

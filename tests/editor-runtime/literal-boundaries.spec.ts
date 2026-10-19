import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor; literalErrors: string[] };
interface SourceView {
  getValue(): string;
  lastLine(): number;
  getLine(line: number): string;
  setCursor(position: { line: number; ch: number }): void;
  focus(): void;
}
function frame(page: Page) {
  return page.frameLocator('iframe.marklyra-editor-frame');
}
async function setup(page: Page, markdown = '') {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as unknown as Host;
    const previous = host.marklyraEditor;
    await previous.ready;
    const Constructor = previous.constructor as typeof MarkLyraEditor;
    const mount = previous.element.parentElement;
    if (!mount) throw new Error('Missing mount');
    previous.destroy();
    host.literalErrors = [];
    host.marklyraEditor = new Constructor(mount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown,
      configuration: { sourceBOM: 'text' },
      onError: (error) => host.literalErrors.push(String(error)),
    });
    await host.marklyraEditor.ready;
  }, markdown);
}
async function source(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}
async function command(page: Page, type: 'undo' | 'redo' | 'toggleSource') {
  await page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
}
async function bodyEnd(page: Page) {
  const body = frame(page).locator('#write > p').last();
  await body.click();
  await body.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node as Text;
    if (!last) throw new Error('Missing body text');
    const range = document.createRange();
    range.setStart(last, last.length);
    range.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
}
async function caret(page: Page) {
  return frame(page)
    .locator('#write')
    .evaluate(() => {
      const selection = getSelection();
      return {
        anchor: selection?.anchorNode?.textContent,
        anchorOffset: selection?.anchorOffset,
        focus: selection?.focusNode?.textContent,
        focusOffset: selection?.focusOffset,
        collapsed: selection?.isCollapsed,
      };
    });
}

const fixtures = [
  { name: 'nonfirst rule', raw: 'Before\r\n\r\n\uFEFF---\n\nEnd', rules: 1 },
  { name: 'quoted rule', raw: '> \uFEFF---\r\n>\n> Quoted\n\nEnd', rules: 1 },
  { name: 'nested quote', raw: '> > \uFEFF* * *\r\n> >\n> > Quoted\n\nEnd', rules: 1 },
  {
    name: 'list indentation already preserves its literal',
    raw: '- Item\n\n  \uFEFF---\r\n\nEnd',
    rules: 1,
  },
  {
    name: 'fenced literal and actual rule repeat',
    raw: '```md\n\uFEFF---\n```\r\n\r\n\uFEFF---\n\nEnd',
    rules: 1,
  },
  {
    name: 'two actual rules with different patterns',
    raw: 'Before\n\n\uFEFF  * * *  \r\n\n\uFEFF___\n\nEnd',
    rules: 2,
  },
] as const;

for (const fixture of fixtures) {
  test(`${fixture.name} keeps exact source, native history, selection and mode/reload boundaries`, async ({
    page,
  }, testInfo) => {
    await setup(page);
    await page.evaluate((raw) => (window as unknown as Host).marklyraEditor.load(raw), fixture.raw);
    expect(await source(page)).toBe(fixture.raw);
    expect(
      await frame(page)
        .locator('html')
        .evaluate(() => Reflect.get(globalThis, '__MARKLYRA_NATIVE_LITERAL__')),
    ).toEqual({
      version: 1,
      moduleSha256: '713a28919e6cd278377be1590412dbecce450724015463f289d1bc7b0a1b5623',
      sites: 2,
    });
    await expect(frame(page).locator('#write hr')).toHaveCount(fixture.rules);
    await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(0);
    if (fixture.name.startsWith('fenced'))
      expect(
        await frame(page)
          .locator('.md-fences .CodeMirror')
          .evaluate((element) => (Reflect.get(element, 'CodeMirror') as SourceView).getValue()),
      ).toContain('\uFEFF---');
    await bodyEnd(page);
    await page.keyboard.type('X');
    expect(await source(page)).toBe(fixture.raw + 'X');
    expect(await caret(page)).toEqual({
      anchor: 'EndX',
      anchorOffset: 4,
      focus: 'EndX',
      focusOffset: 4,
      collapsed: true,
    });
    await command(page, 'undo');
    expect(await source(page)).toBe(fixture.raw);
    await command(page, 'redo');
    expect(await source(page)).toBe(fixture.raw + 'X');
    expect(await caret(page)).toEqual({
      anchor: 'EndX',
      anchorOffset: 4,
      focus: 'EndX',
      focusOffset: 4,
      collapsed: true,
    });
    await command(page, 'toggleSource');
    const code = frame(page).locator('#typora-source .CodeMirror');
    const canonical = await code.evaluate((element) =>
      (Reflect.get(element, 'CodeMirror') as SourceView).getValue(),
    );
    expect(canonical.split('\uFEFF').length).toBe(fixture.raw.split('\uFEFF').length);
    await code.evaluate((element) => {
      const cm = Reflect.get(element, 'CodeMirror') as SourceView;
      const line = cm.lastLine();
      cm.setCursor({ line, ch: cm.getLine(line).length });
      cm.focus();
    });
    await page.keyboard.type('Y');
    expect(await source(page)).toBe(fixture.raw + 'XY');
    await command(page, 'toggleSource');
    expect(await source(page)).toBe(fixture.raw + 'XY');
    await expect(frame(page).locator('#write hr')).toHaveCount(fixture.rules);
    const external = fixture.raw.replace(/End$/, 'External');
    await page.evaluate(async (value) => {
      const editor = (window as unknown as Host).marklyraEditor;
      await editor.reloadFromDisk(value, {
        expectedSource: await editor.flush(),
        expectedRevision: editor.revision,
      });
    }, external);
    expect(await source(page)).toBe(external);
    await command(page, 'undo');
    expect(await source(page)).toBe(fixture.raw + 'XY');
    await command(page, 'redo');
    expect(await source(page)).toBe(external);
    await expect(
      page.evaluate(() => (window as unknown as Host).marklyraEditor.load('invalid\ud800')),
    ).rejects.toThrow();
    expect(await source(page)).toBe(external);
    await command(page, 'undo');
    expect(await source(page)).toBe(fixture.raw + 'XY');
    await expect(frame(page).locator('#write hr')).toHaveCount(fixture.rules);
    // The rejected invalid replacement is deliberately excluded from the success error assertion.
    expect(
      (await page.evaluate(() => (window as unknown as Host).literalErrors)).filter(
        (error) => !error.includes('surrogate'),
      ),
    ).toEqual([]);
    await testInfo.attach('literal-final', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('without the proven parser hook a later FEFF rule is rejected and the old document retained', async ({
  page,
}) => {
  const original = await readFile(
    new URL('../../resources/editor/appsrc/main.js', import.meta.url),
  );
  await page.route('http://127.0.0.1:4174/appsrc/main.js', (route) =>
    route.fulfill({ body: original, contentType: 'text/javascript' }),
  );
  await setup(page, 'Kept');
  expect(
    await frame(page)
      .locator('html')
      .evaluate(() => Reflect.get(globalThis, '__MARKLYRA_NATIVE_LITERAL__')),
  ).toBeUndefined();
  await expect(
    page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.load('Before\n\n\uFEFF---\n\nEnd'),
    ),
  ).rejects.toThrow();
  expect(await source(page)).toBe('Kept');
});

test('a literal FEFF on its own line stays content rather than being equated to whitespace', async ({
  page,
}) => {
  const raw = 'Before\n\uFEFF\n\nEnd';
  await setup(page, raw);
  expect(await source(page)).toBe(raw);
  await command(page, 'toggleSource');
  expect(
    await frame(page)
      .locator('#typora-source .CodeMirror')
      .evaluate((element) => (Reflect.get(element, 'CodeMirror') as SourceView).getValue()),
  ).toContain('\uFEFF');
  await command(page, 'toggleSource');
  expect(await source(page)).toBe(raw);
});

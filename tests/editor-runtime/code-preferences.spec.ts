import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type CM = NonNullable<LegacyEditor['sourceView']['cm']> & {
  getHistory(): unknown;
  getInputField(): HTMLElement;
};
type Child = Window & {
  editor: LegacyEditor & { fences: LegacyEditor['fences'] & { getCm(cid: string): CM } };
  File: { option: Record<string, unknown> };
  _options: Record<string, unknown>;
  codePreferenceInput?: HTMLElement;
};
type Host = Window & { marklyraEditor: MarkLyraEditor; codePreferenceChanges: string[] };
const source =
  '\uFEFFIntro\r\n\r\n```javascript\r\nconst value = 1;\r\n```\n\n' +
  '```{.javascript .numberLines startFrom="8"}\nconst local = 2;\n```';
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');

async function mount(page: Page, numbered: boolean) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(
    async ({ source, numbered }) => {
      const host = window as unknown as Host;
      const old = host.marklyraEditor;
      await old.ready;
      const Constructor = old.constructor as typeof MarkLyraEditor;
      const root = old.element.parentElement;
      if (!root) throw Error('Missing host');
      old.destroy();
      host.codePreferenceChanges = [];
      host.marklyraEditor = new Constructor(root, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: source,
        configuration: { sourceBOM: 'text' },
        preferences: {
          showLineNumbersForFence: numbered,
          noLineWrapping: true,
          lineWiseCopyCut: true,
        },
        onChange: (value) => host.codePreferenceChanges.push(value),
      });
      await host.marklyraEditor.ready;
    },
    { source, numbered },
  );
  await expect(frame(page).locator('#write [mdtype="fences"]')).toHaveCount(2);
  await frame(page)
    .locator('#write')
    .evaluate((area) => {
      const child = window as unknown as Child;
      for (const element of area.querySelectorAll('[mdtype="fences"][cid]')) {
        const cid = element.getAttribute('cid');
        if (!cid) throw Error('Missing fence');
        child.editor.fences.getCm(cid);
      }
    });
}
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());

for (const numbered of [false, true])
  test(`initial code display preserves local attributes and source (global line numbers=${numbered})`, async ({
    page,
  }) => {
    await mount(page, numbered);
    const result = await frame(page)
      .locator('#write')
      .evaluate((area) => {
        const child = window as unknown as Child;
        const read = (cm: CM | undefined) =>
          cm && {
            numbers: cm.getOption('lineNumbers'),
            wrap: cm.getOption('lineWrapping'),
            lineWise: cm.getOption('lineWiseCopyCut'),
            first: cm.getOption('firstLineNumber'),
          };
        return {
          noWrap: area.classList.contains('fences-no-line-wrapping'),
          source: read(child.editor.sourceView.cm as CM),
          fences: [...area.querySelectorAll<HTMLElement>('[mdtype="fences"][cid]')].map(
            (element) => ({
              ...read(child.editor.fences.getCm(element.getAttribute('cid') ?? '')),
              outer: element.classList.contains('md-fences-with-lineno'),
            }),
          ),
          stored: {
            numbers: child._options.showLineNumbersForFence,
            wrap: child._options.noLineWrapping,
            lineWise: child._options.lineWiseCopyCut,
          },
        };
      });
    expect(result.noWrap).toBe(true);
    expect(result.fences[0]).toMatchObject({
      numbers: numbered,
      wrap: false,
      lineWise: true,
      outer: numbered,
    });
    expect(result.fences[1]).toMatchObject({ numbers: true, first: 8, wrap: false, outer: true });
    expect(result.stored).toEqual({ numbers: numbered, wrap: true, lineWise: true });
    expect(await flush(page)).toBe(source);
    // Source CM is lazy: inspect its options only after entering that mode.
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
    );
    expect(
      await frame(page)
        .locator('body')
        .evaluate(() => {
          const cm = (window as unknown as Child).editor.sourceView.cm;
          return (
            cm && {
              numbers: cm.getOption('lineNumbers'),
              wrap: cm.getOption('lineWrapping'),
              lineWise: cm.getOption('lineWiseCopyCut'),
            }
          );
        }),
    ).toEqual({ numbers: true, wrap: true, lineWise: true });
    expect(await flush(page)).toBe(source);
    // CM setup may notify with the same already-confirmed raw text.
    expect(
      await page.evaluate(
        (source) =>
          (window as unknown as Host).codePreferenceChanges.filter((value) => value !== source),
        source,
      ),
    ).toEqual([]);
  });

test('initialization-only changes reject atomically while live global copying preserves existing CM history', async ({
  page,
}) => {
  await mount(page, false);
  const capture = () =>
    frame(page)
      .locator('#write')
      .evaluate((area) => {
        const child = window as unknown as Child;
        const cm = Object.values(child.editor.fences.queue ?? {})[0] as CM;
        return {
          history: cm.getHistory(),
          ranges: cm.listSelections(),
          globalHistory: JSON.stringify(child.editor.undo.commandStack),
          index: child.editor.undo.index,
          noWrap: area.classList.contains('fences-no-line-wrapping'),
          instanceLineWise: cm.getOption('lineWiseCopyCut'),
          field: child.codePreferenceInput === cm.getInputField(),
        };
      });
  await frame(page)
    .locator('#write')
    .evaluate(() => {
      const child = window as unknown as Child;
      const cm = Object.values(child.editor.fences.queue ?? {})[0] as CM;
      cm.focus();
      cm.setSelections([{ anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 1 } }]);
      child.codePreferenceInput = cm.getInputField();
    });
  const before = await capture();
  await flush(page);
  const beforeChanges = await page.evaluate(() => [
    ...(window as unknown as Host).codePreferenceChanges,
  ]);
  for (const patch of [{ showLineNumbersForFence: true }, { noLineWrapping: false }]) {
    const error = await page.evaluate(async (patch) => {
      try {
        await (window as unknown as Host).marklyraEditor.setPreferences({
          ...patch,
          lineWiseCopyCut: false,
        });
        return '';
      } catch (reason) {
        return String(reason);
      }
    }, patch);
    expect(error).toContain('重新创建');
    expect(await capture()).toEqual(before);
    expect(await flush(page)).toBe(source);
  }
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.setPreferences({ lineWiseCopyCut: false }),
  );
  expect(await capture()).toEqual(before);
  expect(
    await frame(page)
      .locator('body')
      .evaluate(() => (window as unknown as Child).File.option.lineWiseCopyCut),
  ).toBe(false);
  expect(await flush(page)).toBe(source);
  expect(await page.evaluate(() => (window as unknown as Host).codePreferenceChanges)).toEqual(
    beforeChanges,
  );
});

test('isolated HTML export uses the active code display configuration without changing the document', async ({
  page,
}) => {
  await mount(page, true);
  const read = () =>
    frame(page)
      .locator('#write')
      .evaluate((area) => {
        const child = window as unknown as Child;
        const cm = Object.values(child.editor.fences.queue ?? {})[0] as CM;
        return {
          history: JSON.stringify(child.editor.undo.commandStack),
          index: child.editor.undo.index,
          codeHistory: cm.getHistory(),
          ranges: cm.listSelections(),
          active: area.ownerDocument.activeElement?.tagName,
        };
      });
  await flush(page);
  const before = await read();
  const html = await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.exportHTML({ styled: true }),
  );
  expect(await read()).toEqual(before);
  const result = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      fences: doc.querySelectorAll('.md-fences-with-lineno').length,
      wrapped: doc.querySelectorAll('.CodeMirror-wrap').length,
      text: doc.body.textContent,
    };
  }, html);
  expect(result.fences).toBe(2);
  expect(result.wrapped).toBe(0);
  expect(result.text).toContain('const value = 1;');
  // Unstyled export now reaches the noStyle path; display-only code
  // gutters are intentionally absent, while code content and live state remain.
  const plain = await page.evaluate(async () => {
    const html = await (window as unknown as Host).marklyraEditor.exportHTML({ styled: false });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      gutters: doc.querySelectorAll('.md-fences-with-lineno').length,
      text: doc.body.textContent,
    };
  });
  expect(plain.gutters).toBe(0);
  expect(plain.text).toContain('const value = 1;');
  expect(await read()).toEqual(before);
  expect(await flush(page)).toBe(source);
});

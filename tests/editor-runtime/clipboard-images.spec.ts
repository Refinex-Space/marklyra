import { readFileSync } from 'node:fs';
import type {
  ClipboardContent,
  ImageImportRequest,
  MarkLyraEditor,
  NativeImageImporter,
  NativeInputResult,
} from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

interface Fixture {
  editor: MarkLyraEditor;
  content: ClipboardContent;
  imports: { root: string; folder?: string; bytes: number[] }[];
  reads: number;
  errors: string[];
  hold: boolean;
  release(): void;
  png: string;
  nativeImport: NativeImageImporter;
  nativeCalls: { context: string | null; root: string; folder?: string; aborted: boolean }[];
  nativeResults: NativeInputResult[];
  nativeHold: boolean;
  nativeJob?: Promise<void>;
  nativeError?: string;
}
type FixtureWindow = Window &
  typeof globalThis & { marklyraEditor: MarkLyraEditor; imageClipboard: Fixture };
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const source = (page: Page) =>
  page.evaluate(() => (window as FixtureWindow).imageClipboard.editor.flush());
async function end(page: Page) {
  await page.locator('.marklyra-editor-frame').focus();
  await frame(page).locator('#write > p').last().click();
  await frame(page)
    .locator('#write > p')
    .last()
    .evaluate((element) => {
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
    });
}
async function paste(page: Page, html = '') {
  await frame(page)
    .locator('#write')
    .evaluate((element, html) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'event text');
      if (html) data.setData('text/html', html);
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, html);
}
async function setup(page: Page, initial = '\ufeff# Keep\r\n\r\nTail\n', nativeDrop = false) {
  await page.addInitScript(() => {
    if (window !== window.top)
      Object.defineProperty(window, '__imageTestNativeFile', { value: File });
  });
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as Partial<FixtureWindow>).marklyraEditor));
  await page.evaluate(
    async ({ initial, nativeDrop }) => {
      const target = window as FixtureWindow;
      const Constructor = target.marklyraEditor.constructor as typeof MarkLyraEditor;
      target.marklyraEditor.destroy();
      const container = document.querySelector<HTMLElement>('#editor');
      if (!container) throw new Error('Missing editor fixture');
      container.replaceChildren();
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      canvas.getContext('2d')?.fillRect(0, 0, 2, 1);
      const png = canvas.toDataURL('image/png');
      const bytes = Uint8Array.from(atob(png.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
      const pending: (() => void)[] = [];
      const fixture: Fixture = {
        editor: undefined as unknown as MarkLyraEditor,
        content: { text: 'native alt', image: { name: 'clipboard.png', type: 'image/png', bytes } },
        imports: [],
        reads: 0,
        errors: [],
        hold: false,
        png,
        nativeCalls: [],
        nativeResults: [],
        nativeHold: false,
        async nativeImport(request) {
          const call = {
            context: request.documentContext,
            root: request.referenceRoot,
            ...(request.storageFolder === undefined ? {} : { folder: request.storageFolder }),
            aborted: request.signal.aborted,
          };
          fixture.nativeCalls.push(call);
          request.signal.addEventListener(
            'abort',
            () => {
              call.aborted = true;
            },
            { once: true },
          );
          if (fixture.nativeHold) await new Promise<void>((resolve) => pending.push(resolve));
          return fixture.nativeResults;
        },
        release() {
          for (const complete of pending.splice(0)) complete();
        },
      };
      fixture.editor = new Constructor(container, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: initial,
        documentContext: 'doc-a',
        configuration: { locale: 'zh-Hans' },
        host: {
          clipboard: {
            readOnPaste: true,
            async read() {
              fixture.reads++;
              if (fixture.hold) await new Promise<void>((resolve) => pending.push(resolve));
              return fixture.content;
            },
            async write() {},
          },
          images: {
            nativeDrop,
            async resolve() {
              return { url: png };
            },
            async import(request: ImageImportRequest) {
              fixture.imports.push({
                root: request.referenceRoot,
                ...(request.storageFolder === undefined ? {} : { folder: request.storageFolder }),
                bytes: [...request.bytes],
              });
              return { source: 'assets/clipboard.png', url: png };
            },
          },
        },
        onError(error) {
          fixture.errors.push(error.message);
        },
      });
      target.imageClipboard = fixture;
      await fixture.editor.ready;
    },
    { initial, nativeDrop },
  );
  await end(page);
}
test('native clipboard image beats plain text and supports exact mixed-EOL undo/redo', async ({
  page,
}) => {
  const initial = '\ufeff# Keep\r\n\r\nTail\n';
  await setup(page, initial);
  await paste(page);
  const image = frame(page).locator('#write img');
  await expect
    .poll(() =>
      image.evaluateAll((items) =>
        items.some((item) => (item as HTMLImageElement).naturalWidth === 2),
      ),
    )
    .toBe(true);
  const inserted = await source(page);
  expect(inserted).toContain('assets/clipboard.png');
  expect(inserted.indexOf('clipboard')).toBeGreaterThan(inserted.indexOf('Tail'));
  expect(inserted).toContain('\ufeff# Keep\r\n\r\n');
  expect(inserted).not.toContain('native alt');
  expect(inserted).not.toContain('data:image');
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe(initial);
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'redo' }),
  );
  expect(await source(page)).toBe(inserted);
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.errors)).toEqual([]);
});
test('native text fallback uses current host content with source-exact history', async ({
  page,
}) => {
  await setup(page, 'Tail');
  await page.evaluate(() => {
    (window as FixtureWindow).imageClipboard.content = { text: '中文🙂' };
  });
  await paste(page);
  await expect.poll(() => source(page)).toBe('Tail中文🙂');
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe('Tail');
});

for (const mode of ['event', 'context-menu'] as const)
  test(`Cocoa RTF conversion survives ${mode} paste and history`, async ({ page }) => {
    const content: ClipboardContent = JSON.parse(
      readFileSync(new URL('../fixtures/clipboard/cocoa-rtf.json', import.meta.url), 'utf8'),
    );
    await setup(page, '\ufeffBefore\r\n\r\nTail  \n');
    await page.evaluate((content) => {
      (window as FixtureWindow).imageClipboard.content = content;
    }, content);
    await frame(page)
      .locator('#write > p')
      .last()
      .evaluate((element) => {
        const node = element.querySelector('[md-inline="plain"]')?.firstChild;
        if (!node) throw Error('Missing Tail');
        document.getSelection()?.setBaseAndExtent(node, 0, node, 4);
      });
    if (mode === 'event') await paste(page);
    else {
      const point = await frame(page)
        .locator('#write')
        .evaluate(() => {
          const rect = document.getSelection()?.getRangeAt(0).getClientRects()[0];
          if (!rect) throw Error('Missing selected rectangle');
          return { x: rect.left + Math.min(4, rect.width / 2), y: rect.top + rect.height / 2 };
        });
      const box = await page.locator('.marklyra-editor-frame').boundingBox();
      if (!box) throw Error('Missing frame');
      await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
    }
    await expect.poll(() => source(page)).toBe('\ufeffBefore\r\n\r\nPlain **Bravo** 中文  \n');
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
    );
    expect(await source(page)).toBe('\ufeffBefore\r\n\r\nTail  \n');
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'redo' }),
    );
    expect(await source(page)).toBe('\ufeffBefore\r\n\r\nPlain **Bravo** 中文  \n');
    expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.errors)).toEqual([]);
  });
test('HTML on the real event has priority and never reads native image data', async ({ page }) => {
  await setup(page, 'Tail');
  await paste(page, '<strong>DOM HTML</strong>');
  await expect(frame(page).locator('#write strong')).toHaveText('DOM HTML');
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.reads)).toBe(0);
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports)).toEqual([]);
});
test('context-menu paste imports the binary clipboard at the captured selection', async ({
  page,
}) => {
  await setup(page, 'Tail');
  await frame(page).locator('#write p').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  await expect.poll(() => source(page)).toContain('assets/clipboard.png');
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports.length)).toBe(
    1,
  );
});
for (const change of ['typing', 'load', 'composition'] as const) {
  test(`late native clipboard read is rejected after ${change}`, async ({ page }) => {
    await setup(page, 'Tail');
    await page.evaluate(() => {
      (window as FixtureWindow).imageClipboard.hold = true;
    });
    await paste(page);
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.reads))
      .toBe(1);
    if (change === 'typing') await page.keyboard.type('X');
    else if (change === 'load')
      await page.evaluate(() =>
        (window as FixtureWindow).imageClipboard.editor.load('Next', { documentContext: 'doc-b' }),
      );
    else
      await frame(page)
        .locator('#write')
        .evaluate((element) =>
          element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })),
        );
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.release());
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.errors.length))
      .toBeGreaterThan(0);
    if (change === 'composition') {
      await frame(page)
        .locator('#write')
        .evaluate((element) =>
          element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
        );
      await expect
        .poll(() =>
          page.evaluate(() => (window as FixtureWindow).imageClipboard.editor.isComposing),
        )
        .toBe(false);
    }
    expect(await source(page)).toBe(
      change === 'typing' ? 'TailX' : change === 'load' ? 'Next' : 'Tail',
    );
    expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports)).toEqual([]);
  });
}
for (const change of ['selection', 'composition-cycle'] as const) {
  test(`late host text cannot restore a retired destination after ${change}`, async ({ page }) => {
    await setup(page, 'Tail');
    await page.evaluate(() => {
      const fixture = (window as FixtureWindow).imageClipboard;
      fixture.hold = true;
      fixture.content = { text: 'Late text' };
    });
    await paste(page);
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.reads))
      .toBe(1);
    await frame(page)
      .locator('#write')
      .evaluate((area, change) => {
        if (change === 'selection') {
          const text = area.querySelector('p [md-inline="plain"]')?.firstChild;
          if (!text) throw Error('Missing current text');
          document.getSelection()?.setBaseAndExtent(text, 0, text, 0);
        } else {
          area.dispatchEvent(
            new CompositionEvent('compositionstart', { bubbles: true, data: 'p' }),
          );
          area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
        }
      }, change);
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.editor.isComposing))
      .toBe(false);
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.release());
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.errors.length))
      .toBeGreaterThan(0);
    expect(await source(page)).toBe('Tail');
    expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports)).toEqual([]);
    if (change === 'selection')
      expect(
        await frame(page)
          .locator('#write')
          .evaluate(() => {
            const selection = document.getSelection();
            return {
              text: selection?.anchorNode?.textContent,
              anchor: selection?.anchorOffset,
              head: selection?.focusOffset,
            };
          }),
      ).toEqual({ text: 'Tail', anchor: 0, head: 0 });
  });
}
test('Host Markdown HTML drops active DOM before insertion and retains exact history', async ({
  page,
}) => {
  await setup(page, 'Tail');
  await page.evaluate(() => {
    (window as FixtureWindow).imageClipboard.content = {
      text: 'Safe',
      markHtml:
        '<p mdtype="paragraph" onclick="globalThis.badClipboard=1"><script>globalThis.badClipboard=1</script><span md-inline="plain">Safe</span><iframe src="file:///private"></iframe></p>',
    };
  });
  await paste(page);
  await expect.poll(() => source(page)).toBe('TailSafe');
  expect(await frame(page).locator('#write script,#write iframe,[onclick]').count()).toBe(0);
  expect(
    await frame(page)
      .locator('body')
      .evaluate(() => Reflect.get(window, 'badClipboard')),
  ).toBeUndefined();
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe('Tail');
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'redo' }),
  );
  expect(await source(page)).toBe('TailSafe');
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.errors)).toEqual([]);
});

for (const invalidMarkup of [
  '<p mdtype="paragraph"><a href="javascript:alert(1)">bad</a></p>',
  '<script>globalThis.badClipboard=1</script>',
])
  test(
    'invalid Host Markdown HTML is rejected before deleting the paste destination ' +
      invalidMarkup.slice(0, 8),
    async ({ page }) => {
      await setup(page, 'Tail');
      await page.evaluate((invalidMarkup) => {
        (window as FixtureWindow).imageClipboard.content = {
          text: 'bad',
          markHtml: invalidMarkup,
        };
      }, invalidMarkup);
      await paste(page);
      await expect
        .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.errors.length))
        .toBeGreaterThan(0);
      expect(await source(page)).toBe('Tail');
      expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports)).toEqual(
        [],
      );
    },
  );
for (const mode of ['wysiwyg', 'source'] as const) {
  test(`copy-folder metadata ${mode === 'source' ? 'defers to host in source mode' : 'is parsed by the runtime metadata parser'}`, async ({
    page,
  }) => {
    await setup(
      page,
      '---\nmarklyra-copy-images-to: "media/${filename}"\nmarklyra-root-url: ./root\n---\n\nTail',
    );
    if (mode === 'source')
      await page.evaluate(() =>
        (window as FixtureWindow).imageClipboard.editor.execute({ type: 'toggleSource' }),
      );
    await page.evaluate(async () => {
      const f = (window as FixtureWindow).imageClipboard;
      const bytes = Uint8Array.from(atob(f.png.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
      await f.editor.insertImage(new Blob([bytes], { type: 'image/png' }), 'clipboard.png');
    });
    const request = await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports[0]);
    expect(request?.folder).toBe(mode === 'source' ? undefined : 'media/${filename}');
    expect(request?.root).toBe('./root');
  });
}

async function nativeBegin(page: Page, id = 'native-ticket', point?: { x: number; y: number }) {
  await page.evaluate(
    ({ id, point }) => {
      const f = (window as FixtureWindow).imageClipboard;
      f.nativeJob = f.editor
        .importNativeInput({ id, ...(point ? { point } : {}) }, f.nativeImport)
        .catch((error: Error) => {
          f.nativeError = error.message;
        });
    },
    { id, point },
  );
}
async function nativeResults(page: Page) {
  await page.evaluate(() => {
    const f = (window as FixtureWindow).imageClipboard;
    f.nativeResults = [
      { kind: 'image', name: 'first.png', source: 'assets/first.png', url: f.png },
      { kind: 'link', name: '文件.md', source: 'file:///outside/%E6%96%87%E4%BB%B6.md' },
      { kind: 'image', name: 'last.png', source: 'assets/last.png', url: f.png },
    ];
  });
}
for (const mode of ['wysiwyg', 'source'] as const)
  test(`native mixed batch is one exact source transaction in ${mode}`, async ({ page }) => {
    const initial = '\ufeff# Keep\r\n\r\nTail\n';
    await setup(page, initial, true);
    await nativeResults(page);
    if (mode === 'source')
      await page.evaluate(async () => {
        const f = (window as FixtureWindow).imageClipboard;
        await f.editor.execute({ type: 'toggleSource' });
        await f.editor.execute({ type: 'sourcePosition', line: 3, column: 4 });
      });
    await nativeBegin(page);
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
    const inserted = await source(page);
    expect(inserted).toContain('assets/first.png');
    expect(inserted).toContain('file:///outside/%E6%96%87%E4%BB%B6.md');
    expect(inserted).toContain('assets/last.png');
    expect(inserted).not.toContain('data:image');
    expect(inserted).toContain('\ufeff# Keep\r\n\r\n');
    expect(
      await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls),
    ).toMatchObject([{ context: 'doc-a', root: '', aborted: false }]);
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
    );
    expect(await source(page)).toBe(initial);
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'redo' }),
    );
    expect(await source(page)).toBe(inserted);
  });

test('native event replay and DOM Files delivery submit only once', async ({ page }) => {
  await setup(page, 'Tail', true);
  await nativeResults(page);
  await frame(page)
    .locator('#write')
    .evaluate((element) => {
      const FileConstructor = Reflect.get(window, '__imageTestNativeFile') as
        | typeof File
        | undefined;
      // File is the original model singleton in the runtime; use a realm-owned Blob-backed File via DataTransfer when available.
      const file = FileConstructor
        ? new FileConstructor([new Uint8Array([1])], 'duplicate.png', { type: 'image/png' })
        : null;
      const data = new DataTransfer();
      if (file) data.items.add(file);
      else data.setData('Files', '');
      element.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    });
  await nativeBegin(page);
  await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
  await nativeBegin(page);
  await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
  expect(
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls.length),
  ).toBe(1);
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports.length)).toBe(
    0,
  );
  expect((await source(page)).match(/assets\/first.png/g)).toHaveLength(1);
});

for (const change of [
  'typing',
  'selection',
  'selection-cycle',
  'composition-cycle',
  'load',
  'blur',
] as const)
  test(`native pending batch preserves the current draft after ${change}`, async ({ page }) => {
    await setup(page, 'Tail', true);
    await nativeResults(page);
    await page.evaluate(() => {
      (window as FixtureWindow).imageClipboard.nativeHold = true;
    });
    await nativeBegin(page);
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls.length))
      .toBe(1);
    if (change === 'typing') await page.keyboard.type('X');
    else if (change === 'selection-cycle') {
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
    } else if (change === 'load')
      await page.evaluate(() =>
        (window as FixtureWindow).imageClipboard.editor.load('Next', { documentContext: 'doc-b' }),
      );
    else
      await frame(page)
        .locator('#write')
        .evaluate((element, change) => {
          if (change === 'selection') {
            const node = element.querySelector('p [md-inline="plain"]')?.firstChild;
            if (!node) throw Error('Missing Tail');
            document.getSelection()?.setBaseAndExtent(node, 0, node, 0);
          } else if (change === 'blur') window.dispatchEvent(new FocusEvent('blur'));
          else {
            element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
          }
        }, change);
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.release());
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
    expect(
      await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeError),
    ).toBeTruthy();
    expect(await source(page)).toBe(
      change === 'typing' ? 'TailX' : change === 'load' ? 'Next' : 'Tail',
    );
  });

for (const mode of ['event', 'context-menu'] as const)
  test(`native file URL clipboard ${mode} batch uses original destination and one Undo`, async ({
    page,
  }) => {
    await setup(page, 'Tail', true);
    await nativeResults(page);
    await page.evaluate(() => {
      const f = (window as FixtureWindow).imageClipboard;
      f.content = { text: '', nativeImages: { id: 'clipboard-ticket', import: f.nativeImport } };
    });
    if (mode === 'event') await paste(page);
    else {
      await frame(page).locator('#write p').click({ button: 'right' });
      await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
    }
    await expect.poll(() => source(page)).toContain('assets/last.png');
    const inserted = await source(page);
    if (mode === 'event') {
      // The same native receipt delivered twice remains one physical event.
      await paste(page);
      await expect
        .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.reads))
        .toBe(2);
    }
    expect(
      await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls.length),
    ).toBe(1);
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
    );
    expect(await source(page)).toBe('Tail');
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'redo' }),
    );
    expect(await source(page)).toBe(inserted);
  });

test('a later invalid Native batch result leaves every source byte and history unchanged', async ({
  page,
}) => {
  await setup(page, 'Tail', true);
  await nativeResults(page);
  await page.evaluate(() => {
    const f = (window as FixtureWindow).imageClipboard;
    f.nativeResults.push({
      kind: 'image',
      name: 'bad.png',
      source: 'assets/bad.png',
      url: 'file:///secret.png',
    });
  });
  await nativeBegin(page);
  await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
  expect(await source(page)).toBe('Tail');
  expect(
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeError),
  ).toBeTruthy();
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe('Tail');
});

test('native file URL clipboard reaches the Source textarea and keeps one Undo', async ({
  page,
}) => {
  await setup(page, 'Tail', true);
  await nativeResults(page);
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).imageClipboard;
    f.content = { text: '', nativeImages: { id: 'source-clipboard', import: f.nativeImport } };
    await f.editor.execute({ type: 'toggleSource' });
    await f.editor.execute({ type: 'sourcePosition', line: 1, column: 5 });
  });
  await frame(page)
    .locator('#marklyra-source textarea')
    .evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'file:///outside/file.md');
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    });
  await expect.poll(() => source(page)).toContain('assets/last.png');
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe('Tail');
});

test('native point is transformed from the host viewport and rejects chrome before IO', async ({
  page,
}) => {
  await setup(page, 'Tail', true);
  await nativeResults(page);
  await nativeBegin(page, 'outside', { x: -1, y: -1 });
  await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
  expect(await source(page)).toBe('Tail');
  expect(
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls.length),
  ).toBe(0);
  const point = await frame(page)
    .locator('#write p')
    .evaluate((element) => {
      const text = element.querySelector('[md-inline="plain"]')?.firstChild;
      if (!text) throw Error('Missing Tail text');
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 0.25, y: rect.top + rect.height / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing editor frame');
  await nativeBegin(page, 'inside', { x: point.x + box.x, y: point.y + box.y });
  await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeJob);
  const inserted = await source(page);
  expect(inserted.indexOf('assets/first.png')).toBeLessThan(inserted.indexOf('Tail'));
  expect(
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls.length),
  ).toBe(1);
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe('Tail');
});

test('rich Host clipboard never consumes a native image receipt', async ({ page }) => {
  await setup(page, 'Tail', true);
  await nativeResults(page);
  await page.evaluate(() => {
    const f = (window as FixtureWindow).imageClipboard;
    f.content = {
      text: 'rich',
      html: '<strong>rich</strong>',
      nativeImages: { id: 'unused', import: f.nativeImport },
    };
  });
  await paste(page);
  await expect.poll(() => source(page)).toBe('Tail**rich**');
  expect(
    await page.evaluate(() => (window as FixtureWindow).imageClipboard.nativeCalls.length),
  ).toBe(0);
});

for (const rich of ['html', 'markHtml'] as const)
  test(`mixed DOM ${rich} and TIFF Files preserves rich priority without binary IO`, async ({
    page,
  }) => {
    await setup(page, 'Tail', true);
    await frame(page)
      .locator('#write')
      .evaluate((element, rich) => {
        const NativeFile = Reflect.get(window, '__imageTestNativeFile') as typeof File;
        const data = new DataTransfer();
        data.items.add(
          new NativeFile([new Uint8Array([73, 73, 42, 0])], 'raster.tiff', { type: 'image/tiff' }),
        );
        data.setData('text/plain', 'rich');
        data.setData(
          rich === 'html' ? 'text/html' : 'text/markhtml',
          rich === 'html'
            ? '<strong>rich</strong>'
            : '<p mdtype="paragraph"><span md-inline="strong">**rich**</span></p>',
        );
        element.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      }, rich);
    await expect.poll(() => source(page)).toBe('Tail**rich**');
    expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.reads)).toBe(0);
    expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports)).toEqual([]);
    await page.evaluate(() =>
      (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
    );
    expect(await source(page)).toBe('Tail');
  });

test('DOM TIFF without a rich format uses host PNG conversion instead of importing TIFF bytes', async ({
  page,
}) => {
  await setup(page, 'Tail', true);
  await frame(page)
    .locator('#write')
    .evaluate((element) => {
      const NativeFile = Reflect.get(window, '__imageTestNativeFile') as typeof File;
      const data = new DataTransfer();
      data.items.add(
        new NativeFile([new Uint8Array([73, 73, 42, 0])], 'raster.tiff', { type: 'image/tiff' }),
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    });
  await expect.poll(() => source(page)).toContain('assets/clipboard.png');
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.reads)).toBe(1);
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.imports.length)).toBe(
    1,
  );
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.errors)).toEqual([]);
});

test('readOnPaste without native ownership retains the DOM File batch and one Undo', async ({
  page,
}) => {
  await setup(page, 'Tail', false);
  const png = await page.evaluate(() => (window as FixtureWindow).imageClipboard.png);
  await frame(page)
    .locator('#write')
    .evaluate((element, png) => {
      const NativeFile = Reflect.get(window, '__imageTestNativeFile') as typeof File;
      const bytes = Uint8Array.from(atob(png.split(',')[1] ?? ''), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new NativeFile([bytes], 'first.png', { type: 'image/png' }));
      data.items.add(new NativeFile([bytes], 'second.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, png);
  await expect
    .poll(() => page.evaluate(() => (window as FixtureWindow).imageClipboard.imports.length))
    .toBe(2);
  await expect
    .poll(async () => (await source(page)).match(/assets\/clipboard.png/g)?.length)
    .toBe(2);
  expect(await page.evaluate(() => (window as FixtureWindow).imageClipboard.reads)).toBe(0);
  await page.evaluate(() =>
    (window as FixtureWindow).imageClipboard.editor.execute({ type: 'undo' }),
  );
  expect(await source(page)).toBe('Tail');
});

import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  focusEnd,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

test.beforeEach(async ({ page }) => {
  await setupImageHost(page);
});
for (const sourceMode of [false, true]) {
  test(`${sourceMode ? 'Source' : 'WYS'} original image transaction preserves raw bytes and earlier history`, async ({
    page,
  }) => {
    const source =
      '\uFEFF# MarkLyra\r\n\r\n![A](images/pixel.png "Title")\r\n\nPlain images/pixel.png and [link](images/pixel.png)\n\nAfter  \r\n';
    await createImageEditor(page, { source, context: 'doc-a' });
    await expectDecodedImage(page);
    if (sourceMode)
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
      );
    if (sourceMode)
      await imageFrame(page)
        .locator('#write')
        .evaluate(() => {
          const editor = Reflect.get(window, 'editor') as {
            sourceView: {
              cm: {
                getValue(): string;
                setCursor(pos: { line: number; ch: number }): void;
                focus(): void;
              };
            };
          };
          const cm = editor.sourceView.cm,
            value = cm.getValue();
          const offset = value.lastIndexOf('After  ') + 'After  '.length;
          const lines = value.slice(0, offset).split(/\r\n|\r|\n/);
          cm.setCursor({ line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 });
          cm.focus();
        });
    else await focusEnd(page);
    await page.keyboard.type('X');
    const before = await imageSource(page);
    expect(before).toBe(source.replace('After  ', 'After  X'));

    const iframe = imageFrame(page);
    const identity = await iframe.locator('#write').evaluate((write) => {
      const target = [...write.children].find((item) => item.textContent?.includes('Plain'));
      (window as unknown as { fixtureNeighbor: Element | undefined }).fixtureNeighbor = target;
      return Boolean(target);
    });
    expect(identity).toBe(true);
    const selectionBefore = await iframe.locator('#write').evaluate((_write, sourceMode) => {
      const native = Reflect.get(window, 'editor') as {
        sourceView: {
          cm: {
            getValue(): string;
            setSelections(
              ranges: {
                anchor: { line: number; ch: number };
                head: { line: number; ch: number };
              }[],
            ): void;
            listSelections(): unknown;
          };
        };
      };
      if (sourceMode) {
        const lines = native.sourceView.cm.getValue().split(/\r\n|\r|\n/);
        const line = lines.findIndex((line) => line.startsWith('After'));
        native.sourceView.cm.setSelections([{ anchor: { line, ch: 6 }, head: { line, ch: 1 } }]);
        return native.sourceView.cm.listSelections();
      }
      const p = [...document.querySelectorAll('#write > p')].find((p) =>
        p.textContent?.startsWith('After'),
      );
      const walker = p ? document.createTreeWalker(p, NodeFilter.SHOW_TEXT) : undefined;
      let text = walker?.nextNode();
      while (text && !text.textContent?.includes('After')) text = walker?.nextNode();
      if (!text) throw Error('Missing selection text');
      document.getSelection()?.setBaseAndExtent(text, 4, text, 1);
      const selection = document.getSelection();
      return {
        anchor: selection?.anchorOffset,
        head: selection?.focusOffset,
        text: selection?.toString(),
      };
    }, sourceMode);
    expect(
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageReferences(),
      ),
    ).toEqual(['images/pixel.png']);
    await page.evaluate(async () => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw Error('Missing editor');
      const source = await editor.flush();
      await editor.updateImageReferences(
        [{ source: 'images/pixel.png', target: 'new/pixel.png' }],
        { expectedSource: source, expectedRevision: editor.revision },
      );
    });
    const after = before.replace('![A](images/pixel.png', '![A](new/pixel.png');
    expect(await imageSource(page)).toBe(after);
    expect(
      await iframe.locator('#write').evaluate((_write, sourceMode) => {
        if (sourceMode) {
          const native = Reflect.get(window, 'editor') as {
            sourceView: { cm: { listSelections(): unknown } };
          };
          return native.sourceView.cm.listSelections();
        }
        const selection = document.getSelection();
        return {
          anchor: selection?.anchorOffset,
          head: selection?.focusOffset,
          text: selection?.toString(),
        };
      }, sourceMode),
    ).toEqual(selectionBefore);
    if (!sourceMode) {
      expect(
        await iframe
          .locator('#write')
          .evaluate(
            () => (window as unknown as { fixtureNeighbor: Element }).fixtureNeighbor.isConnected,
          ),
      ).toBe(true);
      await expectDecodedImage(page);
    }
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(before);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(after);
    await imageCommand(page, 'undo');

    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
  });
}

test('migration rejects stale source or revision without changing source or history', async ({
  page,
}) => {
  const source = '![A](images/pixel.png)\r\n\r\nAfter';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  const result = await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw Error('Missing editor');
    const source = await editor.flush();
    const errors: string[] = [];
    for (const options of [
      { expectedSource: source + 'stale', expectedRevision: editor.revision },
      { expectedSource: source, expectedRevision: editor.revision + 1 },
    ]) {
      try {
        await editor.updateImageReferences(
          [{ source: 'images/pixel.png', target: 'new/pixel.png' }],
          options,
        );
      } catch (error) {
        errors.push(String(error));
      }
    }
    return { errors, source: await editor.flush() };
  });
  expect(result.errors).toHaveLength(2);
  expect(result.source).toBe(source);
});

test('explicit absolute/file/network references reach only the host resolver', async ({ page }) => {
  const source =
    '![A](/tmp/pixel.png)\n\n![B](file:///tmp/other.png)\n\n![C](https://example.invalid/remote.png)\n';
  const remote: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.invalid')) remote.push(request.url());
  });
  await createImageEditor(page, { source, context: 'doc-a' });
  await expect
    .poll(() =>
      imageFrame(page)
        .locator('#write img')
        .evaluateAll((images) => images.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  const resolves = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.resolves.map((item) => item.reference),
  );
  expect(resolves).toEqual(
    expect.arrayContaining([
      '/tmp/pixel.png',
      'file:///tmp/other.png',
      'https://example.invalid/remote.png',
    ]),
  );
  expect(remote).toEqual([]);
  expect(await imageSource(page)).toBe(source);
});

test('image context actions use source URLs, explicit host import and original Undo', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const f = (window as ImageTestWindow).imageHostFixture;
    const editor0 = (window as ImageTestWindow).marklyraEditor;
    const Constructor =
      editor0.constructor as typeof import('@marklyra/editor-runtime').MarkLyraEditor;
    const host = window as unknown as { fixtureActions: string[]; fixtureClipboard: string };
    host.fixtureActions = [];
    host.fixtureClipboard = '';
    const container = document.createElement('div');
    container.dataset.imageEditor = '0';
    container.style.cssText = 'height:550px;width:100%';
    document.querySelector('#editor')?.append(container);
    const editor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: '![A](images/pixel.png)\r\n\r\nAfter',
      documentContext: 'doc-a',
      host: {
        images: {
          resolve: async () => ({ url: 'http://127.0.0.1:4174/__image_fixture__/doc-a.png' }),
          actions: ['reveal', 'copyToStorage'],
          action: async (request) => {
            host.fixtureActions.push(
              `${request.action}:${request.source}:${request.documentContext}`,
            );
            return request.action === 'reveal'
              ? null
              : {
                  source: 'new/pixel.png',
                  url: 'http://127.0.0.1:4174/__image_fixture__/doc-a.png',
                };
          },
        },
        clipboard: {
          read: async () => ({ text: '' }),
          write: async (content) => {
            host.fixtureClipboard = content.text;
          },
        },
      },
      onError: (error) => f.errors.push(error.message),
    });
    f.editors[0] = editor;
    await editor.ready;
  });
  await expectDecodedImage(page);
  const image = imageFrame(page).locator('#write img').first();
  await image.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '复制图片地址', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { fixtureClipboard: string }).fixtureClipboard),
    )
    .toBe('images/pixel.png');
  await image.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '在访达中显示', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { fixtureActions: string[] }).fixtureActions.length,
      ),
    )
    .toBe(1);
  await image.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '复制图片到图片目录', exact: true }).click();
  await expect.poll(() => imageSource(page)).toBe('![A](new/pixel.png)\r\n\r\nAfter');
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe('![A](images/pixel.png)\r\n\r\nAfter');
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});

for (const namespace of ['marklyra', 'legacy-editor'])
  test(`storage context follows ${namespace} WYS YAML override and Source preference fallback without an edit`, async ({
    page,
  }) => {
    const source = `---\r\n${namespace}-root-url: ./root\n${namespace}-copy-images-to: ./\${filename}.assets\r\n---\r\n\r\n![A](images/pixel.png)\n\nAfter`;
    await createImageEditor(page, { source, context: 'doc-a' });
    await expectDecodedImage(page);
    await focusEnd(page);
    const before = await page.evaluate(() => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      return {
        source: editor?.getMarkdown(),
        revision: editor?.revision,
        selection: editor?.getSelection(),
      };
    });
    expect(
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageStorageContext(),
      ),
    ).toEqual({ referenceRoot: './root', storageFolder: '${filename}.assets', sourceMode: false });
    expect(
      await page.evaluate(() => {
        const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
        return {
          source: editor?.getMarkdown(),
          revision: editor?.revision,
          selection: editor?.getSelection(),
        };
      }),
    ).toEqual(before);
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
    );
    expect(
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageStorageContext(),
      ),
    ).toEqual({ referenceRoot: './root', sourceMode: true });
    expect(await imageSource(page)).toBe(source);
  });

for (const sourceMode of [false, true])
  test(`${sourceMode ? 'Source' : 'WYS'} migrates distinct inline HTML and reference-definition images`, async ({
    page,
  }) => {
    const source =
      '![A][image-id]\r\n\n[image-id]: images/pixel.png "Title"\n\nBefore <img src="images/other.png" alt="B" width="1"> After\r\n';
    await createImageEditor(page, { source, context: 'doc-a' });
    await expect
      .poll(() =>
        imageFrame(page)
          .locator('#write img')
          .evaluateAll(
            (images) =>
              images.length === 2 &&
              images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
          ),
      )
      .toBe(true);
    if (sourceMode)
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
      );
    expect(
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageReferences(),
      ),
    ).toEqual(['images/pixel.png', 'images/other.png']);
    await page.evaluate(async () => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw Error('Missing editor');
      const source = await editor.flush();
      await editor.updateImageReferences(
        [
          { source: 'images/pixel.png', target: 'new/a.png' },
          { source: 'images/other.png', target: 'new/b.png' },
        ],
        { expectedSource: source, expectedRevision: editor.revision },
      );
    });
    const after = source
      .replace('[image-id]: images/pixel.png', '[image-id]: new/a.png')
      .replace('src="images/other.png"', 'src="new/b.png"');
    expect(await imageSource(page)).toBe(after);
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(after);
  });

for (const operation of ['syntax', 'zoom', 'delete'] as const)
  test(`image ${operation} menu uses original local transaction and history`, async ({ page }) => {
    const source = '\uFEFFBefore ![A](images/pixel.png) After\r\n\r\nTail  \n';
    await createImageEditor(page, { source, context: 'doc-a' });
    await expectDecodedImage(page);
    await imageFrame(page).locator('#write img').first().click({ button: 'right' });
    if (operation === 'zoom') {
      await page.getByRole('menuitem', { name: /^缩放图片/ }).hover();
      await page.getByRole('menuitem', { name: '50%', exact: true }).click();
    } else
      await page
        .getByRole('menuitem', {
          name: operation === 'syntax' ? '转换为 HTML 图片' : '删除图片',
          exact: true,
        })
        .click();
    await expect.poll(() => imageSource(page)).not.toBe(source);
    const changed = await imageSource(page);
    expect(changed.startsWith('\uFEFFBefore ')).toBe(true);
    expect(changed.endsWith(' After\r\n\r\nTail  \n')).toBe(true);
    expect(changed).not.toContain('__image_fixture__');
    if (operation === 'delete') expect(changed).not.toContain('images/pixel.png');
    else {
      expect(changed).toContain('<img ');
      expect(changed).toContain('images/pixel.png');
    }
    if (operation === 'zoom') expect(changed).toMatch(/zoom\s*:\s*50%/);
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(changed);
  });

test('Source semantic proof rejects an image example inside an HTML attribute and preserves current CM/history', async ({
  page,
}) => {
  const source =
    '<div data-note="![literal](images/pixel.png)">x</div>\r\n\r\n![real](images/pixel.png)\n';
  await createImageEditor(page, { source, context: 'doc-a' });
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  const result = await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw Error('Missing editor');
    let error = '';
    let references: string[] = [];
    try {
      references = await editor.getImageReferences();
    } catch (reason) {
      error = String(reason);
    }
    return {
      error,
      references,
      mode: Reflect.get(editor, 'viewMode'),
      source: await editor.flush(),
    };
  });
  expect(result.error, JSON.stringify(result)).not.toBe('');
  expect(result.source).toBe(source);
});

test('YAML slash copy folder stays document-relative while Source skips the override', async ({
  page,
}) => {
  const source = '---\r\nmarklyra-copy-images-to: /shared\r\n---\r\n\r\nBody';
  await createImageEditor(page, { source, context: 'doc-a' });
  expect(
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageStorageContext(),
    ),
  ).toEqual({ referenceRoot: '', storageFolder: 'shared', sourceMode: false });
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  expect(
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageStorageContext(),
    ),
  ).toEqual({ referenceRoot: '', sourceMode: true });
  expect(await imageSource(page)).toBe(source);
});

for (const [path, destination] of [
  ['images/pixel.png', 'images/pixel.png'],
  ['images/a b.png', '<images/a b.png>'],
  ['images/a)b.png', '<images/a)b.png>'],
] as const) {
  test(`HTML image title survives Markdown conversion and original Undo/Redo: ${path}`, async ({
    page,
  }) => {
    const source = `\uFEFFBefore <img src="${path}" alt="A" title="Caption"> After\r\n\r\nTail  \n`;
    await createImageEditor(page, { source, context: 'doc-a' });
    await expectDecodedImage(page);
    await imageFrame(page).locator('#write img').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: '转换为 Markdown 图片', exact: true }).click();
    const expected = `\uFEFFBefore ![A](${destination} "Caption") After\r\n\r\nTail  \n`;
    await expect.poll(() => imageSource(page)).toBe(expected);
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(expected);
  });
}

for (const source of ['https://example.invalid/pixel.png', '//example.invalid/pixel.png'])
  test(`image browser action delegates the captured ${source.startsWith('https') ? 'HTTPS' : 'protocol-relative'} source`, async ({
    page,
  }) => {
    await page.evaluate(async (source) => {
      const fixture = (window as ImageTestWindow).imageHostFixture,
        Constructor = (window as ImageTestWindow).marklyraEditor
          .constructor as typeof import('@marklyra/editor-runtime').MarkLyraEditor;
      const host = window as unknown as { fixtureOpened: string[] };
      host.fixtureOpened = [];
      const container = document.createElement('div');
      container.dataset.imageEditor = '0';
      container.style.cssText = 'height:550px;width:100%';
      document.querySelector('#editor')?.append(container);
      const editor = new Constructor(container, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: `![A](${source})`,
        documentContext: 'doc-a',
        host: {
          images: {
            resolve: async () => ({ url: 'http://127.0.0.1:4174/__image_fixture__/doc-a.png' }),
          },
          openExternal: async (url) => {
            host.fixtureOpened.push(url);
          },
        },
        onError: (error) => fixture.errors.push(error.message),
      });
      fixture.editors[0] = editor;
      await editor.ready;
    }, source);
    await expectDecodedImage(page);
    await imageFrame(page).locator('#write img').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: '在浏览器中打开图片', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { fixtureOpened: string[] }).fixtureOpened),
      )
      .toEqual([source.startsWith('//') ? `http:${source}` : source]);
    expect(await imageSource(page)).toBe(`![A](${source})`);
  });

for (const [setting, folder] of [
  ['UPLOAD', 'upload'],
  ['ipic', 'upload'],
  ['./upload', './upload'],
  ['/textbundle', './textbundle'],
] as const)
  test(`YAML storage distinguishes special ${setting} from an ordinary folder`, async ({
    page,
  }) => {
    const source = `---\nmarklyra-copy-images-to: ${setting}\n---\n\nBody`;
    await createImageEditor(page, { source, context: 'doc-a' });
    expect(
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.getImageStorageContext(),
      ),
    ).toEqual({ referenceRoot: '', storageFolder: folder, sourceMode: false });
    expect(await imageSource(page)).toBe(source);
  });

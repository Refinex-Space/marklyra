import { expect, type Page, test } from '@playwright/test';
import { installRecoveryMock } from './recovery-test-util.js';

// Exercises the real React Shell/SDK with an in-memory IPC adapter, not native dialogs or filesystem IO.
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwaQz6DwAD+wIH+1FtgwAAAABJRU5ErkJggg==';
interface ImageCall {
  command: string;
  args: Record<string, unknown>;
}
interface ImageMock {
  calls: ImageCall[];
  source: string;
  menu(action: string): void;
  chooseImageAction(action: string): void;
  location?: { path: string; revision: number };
  saveLocation?: { path: string; revision: number };
  metadataFailure?: boolean;
  metadata(path: string, revision: number): void;
}
type ImageWindow = Window & typeof globalThis & { __imageMock: ImageMock };

function installImageMock({ png, imageUrl }: { png: string; imageUrl?: string }) {
  if (window !== window.top) return;
  let serial = 0;
  const callbacks = new Map<number, (event: unknown) => void>();
  const listeners = new Map<number, { name: string; handler: number }>();
  const mock: ImageMock = {
    calls: [],
    source: 'Before',
    metadata(path, revision) {
      if (!this.location || revision >= this.location.revision) this.location = { path, revision };
      for (const [id, listener] of listeners)
        if (listener.name === 'document-metadata-changed')
          callbacks.get(listener.handler)?.({
            event: listener.name,
            id,
            payload: [
              {
                id: 'doc-a',
                path,
                encoding: 'UTF-8',
                metadataRevision: revision,
                locationState: 'available',
              },
            ],
          });
    },
    chooseImageAction(actionId) {
      const request = this.calls
        .filter((call) => call.command === 'show_editor_context_menu')
        .at(-1)?.args.request as { requestId: string } | undefined;
      if (!request) throw new Error('No image menu');
      for (const [id, listener] of listeners)
        if (listener.name === 'editor-context-menu-action')
          callbacks.get(listener.handler)?.({
            event: listener.name,
            id,
            payload: { requestId: request.requestId, actionId },
          });
    },
    menu(action) {
      for (const [id, listener] of listeners)
        if (listener.name === 'menu-action')
          callbacks.get(listener.handler)?.({ event: 'menu-action', id, payload: action });
    },
  };
  Object.assign(window, {
    isTauri: true,
    __imageMock: mock,
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      async invoke(command: string, args: Record<string, unknown> = {}) {
        mock.calls.push({ command, args });
        if (command === 'editor_runtime_url') return 'http://127.0.0.1:4174/index.html';
        if (command === 'host_platform') return 'macos';
        if (command === 'get_application_preferences')
          return { schemaVersion: 1, revision: 0, values: {} };
        if (command === 'register_editor_command_context' || command === 'editor_command_fence')
          return { context: args.context, issued: 0 };
        if (command === 'get_markdown_preferences')
          return { schemaVersion: 1, revision: 0, indentSize: 2, prettyIndent: false };
        if (command === 'check_document_change') return { status: 'unchanged' };
        if (command === 'start_document_watch')
          return { status: 'watching', watchId: `image-watch-${++serial}` };
        if (command === 'stop_document_watch') return true;
        if (command === 'plugin:event|listen') {
          const id = ++serial;
          listeners.set(id, { name: String(args.event), handler: Number(args.handler) });
          return id;
        }
        if (command === 'plugin:event|unlisten') {
          listeners.delete(Number(args.eventId));
          return null;
        }
        if (command === 'create_image_draft') return 'image-draft';
        if (command === 'prepare_document_image_save')
          return { kind: 'prepared', operationId: 'save-image', mappings: [] };
        if (command === 'commit_document_image_save')
          return { id: 'doc-b', path: '/mock/B.md', text: args.text, encoding: 'UTF-8' };
        if (command === 'open_document')
          return {
            id: 'doc-a',
            path: mock.location?.path ?? '/mock/A.md',
            text: mock.source,
            encoding: 'UTF-8',
            ...(mock.location ? { metadataRevision: mock.location.revision } : {}),
          };
        if (command === 'get_document_metadata' && mock.metadataFailure)
          throw new Error('Controlled metadata read failure');
        if (command === 'get_document_metadata' && mock.location)
          return {
            id: args.id,
            path: mock.location.path,
            encoding: 'UTF-8',
            metadataRevision: mock.location.revision,
            locationState: 'available',
          };
        if (command === 'save_document' || command === 'save_document_as') {
          if (mock.saveLocation) {
            mock.location = mock.saveLocation;
            mock.metadataFailure = true;
          }
          return {
            id: command === 'save_document_as' ? 'doc-b' : String(args.id),
            path:
              mock.saveLocation?.path ??
              (command === 'save_document_as' ? '/mock/B.md' : '/mock/A.md'),
            text: args.text,
            encoding: 'UTF-8',
            ...(mock.saveLocation ? { metadataRevision: mock.saveLocation.revision } : {}),
          };
        }
        if (command === 'perform_document_image_action')
          return {
            source: 'assets/downloaded-image.png',
            url: imageUrl ?? `data:image/png;base64,${png}`,
          };
        if (command === 'resolve_document_image')
          return { source: args.reference, url: imageUrl ?? `data:image/png;base64,${png}` };
        if (command === 'get_export_preferences')
          return {
            schemaVersion: 1,
            revision: 0,
            general: {},
            html: {},
            pdf: {},
            image: {},
            formats: {},
            custom: [],
            pandocPath: '',
          };
        if (command === 'get_format_capabilities')
          return {
            pandoc: { status: 'available', path: '/mock/pandoc', version: '3.0', message: '' },
            formats: ['docx'],
            writers: ['docx'],
            importExtensions: [],
            image: true,
            pdf: 'direct',
            headerFooter: true,
          };
        if (command === 'save_export_format')
          return { path: '/mock/A.docx', bytes: 1, warnings: [] };
        if (command === 'import_document_image')
          return { source: 'assets/pixel%20sample.png', url: `data:image/png;base64,${png}` };
        return null;
      },
      transformCallback(callback: (event: unknown) => void) {
        const id = ++serial;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: {
      unregisterListener(_event: string, id: number) {
        listeners.delete(id);
      },
    },
  });
}
const child = (page: Page) => page.frameLocator('.marklyra-editor-frame');
async function calls(page: Page, command: string) {
  return page.evaluate(
    (command) =>
      (window as ImageWindow).__imageMock.calls.filter((call) => call.command === command),
    command,
  );
}
async function start(page: Page, source?: string, imagePng = png, imageUrl?: string) {
  await page.addInitScript(installImageMock, { png: imagePng, ...(imageUrl ? { imageUrl } : {}) });
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  if (source !== undefined) {
    await page.evaluate((source) => {
      (window as ImageWindow).__imageMock.source = source;
    }, source);
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await expect(page.locator('.document-title')).toHaveText('A.md');
  }
}
async function focusEnd(page: Page) {
  const paragraph = child(page).locator('#write > p').last();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const doc = element.ownerDocument;
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
    const range = doc.createRange();
    // A paragraph-boundary Range can become offset 0 in original bookmarks.
    // Use the visible text endpoint, as a real pointer placement does, before typing.
    if (last) range.setStart(last, last.textContent?.length ?? 0);
    else range.selectNodeContents(element);
    range.collapse(false);
    doc.getSelection()?.removeAllRanges();
    doc.getSelection()?.addRange(range);
  });
}
async function loadedImage(page: Page) {
  await expect(child(page).locator('#write img').first()).toHaveAttribute(
    'src',
    `data:image/png;base64,${png}`,
  );
  await expect(child(page).locator('#write .md-image').first()).toHaveAttribute(
    'data-marklyra-image-state',
    'ready',
  );
  await expect
    .poll(() =>
      child(page)
        .locator('#write img')
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
}

test('desktop resolves document-scoped relative images without changing saved source', async ({
  page,
}) => {
  const source = '\ufeff# Picture\r\n\r\n![pixel](images/pixel%20sample.png)\n\nAfter\r\n';
  await start(page, source);
  await loadedImage(page);
  await expect
    .poll(() => calls(page, 'resolve_document_image'))
    .toContainEqual({
      command: 'resolve_document_image',
      args: {
        id: 'doc-a',
        source: 'images/pixel%20sample.png',
        reference: 'images/pixel%20sample.png',
      },
    });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(source);
});

test('desktop metadata Move refreshes same-ID images with its new Native epoch and preserves undo', async ({
  page,
}) => {
  const source = '\ufeff![pixel](images/pixel.png)\r\n\r\nAfter';
  await start(page);
  await page.evaluate((source) => {
    const mock = (window as ImageWindow).__imageMock;
    mock.source = source;
    mock.metadata('/mock/left/A.md', 0);
  }, source);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await loadedImage(page);
  expect((await calls(page, 'resolve_document_image')).at(-1)?.args).toMatchObject({
    id: 'doc-a',
    expectedMetadataRevision: 0,
  });
  await focusEnd(page);
  await page.keyboard.type('X');
  await page.evaluate(() => (window as ImageWindow).__imageMock.metadata('/mock/right/A.md', 1));
  await expect
    .poll(
      async () =>
        (await calls(page, 'resolve_document_image')).at(-1)?.args.expectedMetadataRevision,
    )
    .toBe(1);
  await loadedImage(page);
  const count = (await calls(page, 'resolve_document_image')).length;
  await page.evaluate(async () => {
    (window as ImageWindow).__imageMock.metadata('/mock/stale/A.md', 0);
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
  expect((await calls(page, 'resolve_document_image')).length).toBe(count);
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('undo'));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(source);
});

test('a saved newer location epoch still cancels old image work when metadata reconciliation fails', async ({
  page,
}) => {
  const source = '![pixel](images/pixel.png)\n\nAfter';
  await start(page);
  await page.evaluate((source) => {
    const mock = (window as ImageWindow).__imageMock;
    mock.source = source;
    mock.metadata('/mock/left/A.md', 0);
  }, source);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await loadedImage(page);
  await page.evaluate(
    () =>
      ((window as ImageWindow).__imageMock.saveLocation = {
        path: '/mock/right/A.md',
        revision: 1,
      }),
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await calls(page, 'resolve_document_image')).at(-1)?.args.expectedMetadataRevision,
    )
    .toBe(1);
  await loadedImage(page);
  expect((await calls(page, 'save_document')).at(-1)?.args.text).toBe(source);
});

test('desktop local file input sends exact bytes and keeps relative Markdown through save, undo and redo', async ({
  page,
}) => {
  await start(page, 'Before');
  await focusEnd(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'pixel sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await loadedImage(page);
  expect((await calls(page, 'import_document_image')).at(-1)?.args).toEqual({
    id: 'doc-a',
    name: 'pixel sample.png',
    referenceRoot: '',
    storageFolder: 'assets',
    relativePath: true,
    relativePathWithDot: false,
    base64: png,
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toContain('assets/pixel%20sample.png');
  const saved = String((await calls(page, 'save_document')).at(-1)?.args.text);
  expect(saved).not.toMatch(/data:|marklyra:|blob:/);
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('undo'));
  await expect(child(page).locator('#write img')).toHaveCount(0);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe('Before');
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('redo'));
  await loadedImage(page);
});

test('unsaved local image imports through its draft owner without an early Save As', async ({
  page,
}) => {
  await start(page);
  await focusEnd(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'pixel sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await loadedImage(page);
  const commands = await page.evaluate(() => (window as ImageWindow).__imageMock.calls);
  const save = commands.findIndex((call) => call.command === 'save_document_as');
  const imported = commands.findIndex((call) => call.command === 'import_document_image');
  expect(save).toBe(-1);
  expect(imported).toBeGreaterThan(-1);
  expect(commands[imported]?.args.id).toBe('image-draft');
  await expect(page.locator('.document-title')).toContainText('未命名');
});

test('Save As rebinds image authorization to the new document without resetting editing history', async ({
  page,
}) => {
  await start(page, '![pixel](images/pixel.png)\n\nAfter');
  await loadedImage(page);
  await focusEnd(page);
  await page.keyboard.type('X');
  await expect(child(page).locator('#write > p').last()).toHaveText('AfterX');
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('save-as'));
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await expect
    .poll(async () =>
      (await calls(page, 'resolve_document_image')).some((call) => call.args.id === 'doc-b'),
    )
    .toBe(true);
  expect((await calls(page, 'close_document')).some((call) => call.args.id === 'doc-a')).toBe(true);
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('undo'));
  await expect(child(page).locator('#write > p').last()).toHaveText('After');
  await loadedImage(page);
});

test('React Shell preserves image action capabilities through Native menu execution and original Undo', async ({
  page,
}) => {
  // Give the original image wrapper a visible pointer target. The authorized
  // display URL uses the runtime origin, as Native image capabilities do.
  const menuPng =
    'iVBORw0KGgoAAAANSUhEUgAAAKAAAABgCAYAAACaJ3mZAAAAyUlEQVR42u3SMQ0AAAjAMLzgB1X4hgMRPD1qYFlk18CXEAEDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGxIBCYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIAYEAyIAcGAGBAMiAHBgBgQDIgBwYAYEAyIAcGAGBAMiAHBgBgQDIgBwYAYEAyIAcGAGBDOAlu0NtzjrW0yAAAAAElFTkSuQmCC';
  const source = '![pixel](http://127.0.0.1:4197/pixel.png)\n\nAfter';
  const imageUrl = 'http://127.0.0.1:4174/__image_fixture__/authorized-pixel.png';
  await page.route(imageUrl, (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(menuPng, 'base64') }),
  );
  await start(page, source, menuPng, imageUrl);
  const image = child(page).locator('#write img');
  await expect(image).toHaveAttribute('src', imageUrl);
  await expect(child(page).locator('#write .md-image')).toHaveAttribute(
    'data-marklyra-image-state',
    'ready',
  );
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(160);
  await image.click({ button: 'right' });
  await expect
    .poll(async () => {
      const menu = (await calls(page, 'show_editor_context_menu')).at(-1)?.args.request as
        | { items: { actionId?: string; enabled?: boolean }[] }
        | undefined;
      return {
        enabled: menu?.items.find((item) => item.actionId === 'image.downloadToStorage')?.enabled,
        ids: menu?.items.map((item) => item.actionId),
        count: (await calls(page, 'show_editor_context_menu')).length,
      };
    })
    .toEqual(expect.objectContaining({ enabled: true }));
  await page.evaluate(() =>
    (window as ImageWindow).__imageMock.chooseImageAction('image.downloadToStorage'),
  );
  await expect.poll(() => calls(page, 'perform_document_image_action')).toHaveLength(1);
  await expect(child(page).locator('#write .md-image').first()).toHaveAttribute(
    'data-src',
    'assets/downloaded-image.png',
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(source.replace('http://127.0.0.1:4197/pixel.png', 'assets/downloaded-image.png'));
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('undo'));
  await expect(child(page).locator('#write .md-image').first()).toHaveAttribute(
    'data-src',
    'http://127.0.0.1:4197/pixel.png',
  );
});

test('Word export hands the converter Markdown with the document images embedded', async ({
  page,
}) => {
  await start(page, '# Title\n\n![pic](assets/pic.png)\n');
  await expect(child(page).locator('#write img').first()).toHaveAttribute('src', /^data:image\/png/);
  await page.evaluate(() => (window as ImageWindow).__imageMock.menu('export-docx'));
  await expect
    .poll(async () => (await calls(page, 'save_export_format')).length, { timeout: 30_000 })
    .toBe(1);
  const call = (await calls(page, 'save_export_format'))[0];
  expect(String(call?.args.markdown)).toContain(`![pic](data:image/png;base64,${png})`);
  expect(call?.args.target).toBe('docx');
});

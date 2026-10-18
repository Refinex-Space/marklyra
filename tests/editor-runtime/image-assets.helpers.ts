import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type FrameLocator, type Page } from '@playwright/test';

type Behavior = 'immediate' | 'defer' | 'missing' | 'reject';
interface ResolveRequest {
  source: string;
  reference: string;
  documentContext: string | null;
  signal: AbortSignal;
}
interface ImportRequest {
  name: string;
  type: string;
  bytes: Uint8Array;
  documentContext: string | null;
  referenceRoot: string;
  signal: AbortSignal;
}
export interface ImageHostCall {
  editor: number;
  context: string | null;
  aborted: boolean;
  source?: string;
  reference?: string;
  name?: string;
  type?: string;
  bytes?: number[];
  uint8Array?: boolean;
  referenceRoot?: string;
}
export interface ImageEditorFixtureOptions {
  source: string;
  context: string | null;
  resolve?: Behavior;
  import?: 'immediate' | 'defer' | 'reject';
  width?: 1 | 2;
  nativeDrop?: boolean;
}
export interface ImageHostFixture {
  editors: MarkLyraEditor[];
  resolves: ImageHostCall[];
  imports: ImageHostCall[];
  errors: string[];
  changes: { editor: number; source: string }[];
  jobs: Record<string, { state: 'pending' | 'resolved' | 'rejected'; error?: string }>;
  png: string;
  create(options: ImageEditorFixtureOptions): Promise<number>;
  releaseResolves(context: string | null, source?: string): void;
  releaseImports(): void;
  beginImport(editor: number, name: string): string;
  setWidth(editor: number, width: 1 | 2): void;
}
export type ImageTestWindow = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    imageHostFixture: ImageHostFixture;
  };

export async function setupImageHost(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // The runtime runtime later uses window.File for its document singleton.
    if (window !== window.top) {
      Object.defineProperty(window, '__imageTestNativeFile', { value: File });
    }
  });
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as Partial<ImageTestWindow>).marklyraEditor));
  await page.evaluate(() => (window as ImageTestWindow).marklyraEditor.ready);
  const pngs = await page.evaluate(() =>
    [1, 2].map((width) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing canvas fixture context');
      context.fillStyle = width === 1 ? '#237845' : '#6846bb';
      context.fillRect(0, 0, width, 1);
      return canvas.toDataURL('image/png');
    }),
  );
  await page.route('http://127.0.0.1:4174/__image_fixture__/**', async (route) => {
    const width = new URL(route.request().url()).searchParams.get('width') === '2' ? 2 : 1;
    const png = pngs[width - 1];
    if (!png) throw new Error('Missing generated PNG fixture');
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(png.split(',')[1] ?? '', 'base64'),
    });
  });
  await page.evaluate((png) => {
    const page = window as ImageTestWindow;
    const Constructor = page.marklyraEditor.constructor as typeof MarkLyraEditor;
    page.marklyraEditor.destroy();
    document.querySelector('#editor')?.replaceChildren();
    const pendingResolves: { context: string | null; source: string; finish(): void }[] = [];
    const pendingImports: (() => void)[] = [];
    const imageOptions: ImageEditorFixtureOptions[] = [];
    let nextJob = 0;
    const fixture: ImageHostFixture = {
      editors: [],
      resolves: [],
      imports: [],
      errors: [],
      changes: [],
      jobs: {},
      png,
      setWidth(index, width) {
        const options = imageOptions[index];
        if (!options) throw new Error('Missing image editor options');
        options.width = width;
      },
      async create(options) {
        const index = this.editors.length;
        imageOptions[index] = options;
        const container = document.createElement('div');
        container.dataset.imageEditor = String(index);
        container.style.cssText = 'height:360px;min-height:360px;width:100%;background:white';
        (document.querySelector('#editor') ?? document.body).append(container);
        const url = (context: string | null, reference: string) => {
          const width =
            options.width ??
            (context === 'doc-b' ||
            reference.startsWith('other-root/') ||
            reference === 'images/other.png'
              ? 2
              : 1);
          return `http://127.0.0.1:4174/__image_fixture__/${encodeURIComponent(context ?? 'untitled')}.png?cap=display-only-${index}&width=${width}&reference=${encodeURIComponent(reference)}`;
        };
        const observe = (record: ImageHostCall, signal: AbortSignal) => {
          record.aborted = signal.aborted;
          signal.addEventListener(
            'abort',
            () => {
              record.aborted = true;
            },
            { once: true },
          );
        };
        const resolve = async (request: ResolveRequest): Promise<{ url: string } | null> => {
          const record: ImageHostCall = {
            editor: index,
            context: request.documentContext,
            source: request.source,
            reference: request.reference,
            aborted: false,
          };
          this.resolves.push(record);
          observe(record, request.signal);
          if (options.resolve === 'missing') return null;
          if (options.resolve === 'reject') throw new Error('Fixture image resolve failed');
          const value = { url: url(request.documentContext, request.reference) };
          if (options.resolve === 'defer')
            return new Promise((done) => {
              // Deliberately ignore cancellation; the SDK must still reject stale answers.
              pendingResolves.push({
                context: request.documentContext,
                source: request.source,
                finish: () => done(value),
              });
            });
          return value;
        };
        const importImage = async (
          request: ImportRequest,
        ): Promise<{ source: string; url: string }> => {
          const record: ImageHostCall = {
            editor: index,
            context: request.documentContext,
            name: request.name,
            type: request.type,
            bytes: Array.from(request.bytes),
            uint8Array: request.bytes instanceof Uint8Array,
            referenceRoot: request.referenceRoot,
            aborted: false,
          };
          this.imports.push(record);
          observe(record, request.signal);
          if (options.import === 'reject') throw new Error('Fixture image import failed');
          // Virtual directories only. The host owns root-relative insertion;
          // no real filesystem path or runtime display URL is serialized.
          const documentBase = 'https://image.test/fixture/docs/';
          const asset = new URL(`assets/${encodeURIComponent(request.name)}`, documentBase).pathname
            .split('/')
            .filter(Boolean);
          const root = new URL(
            request.referenceRoot ? `${request.referenceRoot.replace(/\/+$/, '')}/` : './',
            documentBase,
          ).pathname
            .split('/')
            .filter(Boolean);
          let common = 0;
          while (common < root.length && common < asset.length && root[common] === asset[common])
            common++;
          const source = [...root.slice(common).map(() => '..'), ...asset.slice(common)].join('/');
          const value = {
            source,
            url: url(request.documentContext, `assets/${encodeURIComponent(request.name)}`),
          };
          if (options.import === 'defer')
            return new Promise((done) => {
              pendingImports.push(() => done(value));
            });
          return value;
        };
        const editor = new Constructor(container, {
          runtimeUrl: 'http://127.0.0.1:4174/index.html',
          markdown: options.source,
          documentContext: options.context,
          host: {
            images: { resolve, import: importImage, nativeDrop: Boolean(options.nativeDrop) },
          },
          onChange: (source) => this.changes.push({ editor: index, source }),
          onError: (error) => this.errors.push(error.message),
        });
        this.editors.push(editor);
        await editor.ready;
        return index;
      },
      releaseResolves(context, source) {
        const matches = (pending: { context: string | null; source: string }) =>
          pending.context === context && (source === undefined || pending.source === source);
        for (const pending of pendingResolves.filter(matches)) pending.finish();
        for (let i = pendingResolves.length - 1; i >= 0; i--) {
          const pending = pendingResolves[i];
          if (pending && matches(pending)) pendingResolves.splice(i, 1);
        }
      },
      releaseImports() {
        for (const finish of pendingImports.splice(0)) finish();
      },
      beginImport(index, name) {
        const editor = this.editors[index];
        if (!editor) throw new Error('Missing test editor');
        const bytes = Uint8Array.from(atob(this.png.split(',')[1] ?? ''), (character) =>
          character.charCodeAt(0),
        );
        const job = String(nextJob++);
        this.jobs[job] = { state: 'pending' };
        void editor.insertImage(new Blob([bytes], { type: 'image/png' }), name).then(
          () => {
            this.jobs[job] = { state: 'resolved' };
          },
          (error: unknown) => {
            this.jobs[job] = { state: 'rejected', error: String(error) };
          },
        );
        return job;
      },
    };
    page.imageHostFixture = fixture;
  }, pngs[0] ?? '');
}

export function imageFrame(page: Page, editor = 0): FrameLocator {
  return page.locator(`[data-image-editor="${editor}"]`).frameLocator('.marklyra-editor-frame');
}
export async function createImageEditor(
  page: Page,
  options: ImageEditorFixtureOptions,
): Promise<number> {
  return page.evaluate(
    (options) => (window as ImageTestWindow).imageHostFixture.create(options),
    options,
  );
}
export async function imageSource(page: Page, editor = 0): Promise<string> {
  return page.evaluate(async (index) => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[index];
    if (!editor) throw new Error('Missing test editor');
    return editor.flush();
  }, editor);
}
export async function imageCommand(page: Page, type: 'undo' | 'redo', editor = 0): Promise<void> {
  await page.evaluate(
    async ({ index, type }) => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[index];
      if (!editor) throw new Error('Missing test editor');
      await editor.execute({ type });
    },
    { index: editor, type },
  );
}
export async function expectDecodedImage(page: Page, width = 1, editor = 0): Promise<void> {
  await expect
    .poll(() =>
      imageFrame(page, editor)
        .locator('#write img')
        .first()
        .evaluate((image) => ({
          width: (image as HTMLImageElement).naturalWidth,
          height: (image as HTMLImageElement).naturalHeight,
          mapped: (image as HTMLImageElement).src.includes('/__image_fixture__/'),
          state: image.closest('.md-image')?.getAttribute('data-marklyra-image-state'),
        })),
    )
    .toEqual({ width, height: 1, mapped: true, state: 'ready' });
}
export async function focusEnd(page: Page, editor = 0): Promise<void> {
  const block = imageFrame(page, editor).locator('#write > p').last();
  await block.click();
  await block.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) lastText = node;
    if (lastText) {
      range.setStart(lastText, lastText.textContent?.length ?? 0);
      range.collapse(true);
    } else {
      range.selectNodeContents(element);
      range.collapse(false);
    }
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}
export async function dispatchImageTransfer(
  page: Page,
  kind: 'paste' | 'drop',
  editor = 0,
): Promise<boolean> {
  const png = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.png);
  return imageFrame(page, editor)
    .locator('#write')
    .evaluate(
      (element, { png, kind }) => {
        const NativeFile = Reflect.get(window, '__imageTestNativeFile') as typeof File;
        const bytes = Uint8Array.from(atob(png.split(',')[1] ?? ''), (character) =>
          character.charCodeAt(0),
        );
        const transfer = new DataTransfer();
        transfer.items.add(new NativeFile([bytes], `${kind}.png`, { type: 'image/png' }));
        const event =
          kind === 'paste'
            ? new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: transfer,
              })
            : new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      },
      { png, kind },
    );
}

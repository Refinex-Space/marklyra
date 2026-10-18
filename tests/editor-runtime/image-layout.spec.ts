import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

const moduleUrl = `/@fs${new URL('../../packages/editor-runtime/src/runtime/image-layout.ts', import.meta.url).pathname}`;
const cases = [
  'batch-repeat',
  'new-image-immediate',
  'interaction',
  'delayed-reset',
  'generation',
  'detached-dispose',
  'bad-abi',
  'callback-error',
  'host-decoration',
  'decoration-interaction',
] as const;

for (const scenario of cases) {
  test(`initial image layout adapter contract: ${scenario}`, async ({ page }) => {
    await page.goto('/portable.html');
    const result = await page.evaluate(
      async ({ moduleUrl, scenario }) => {
        const { RuntimeImageLayout } = (await import(
          moduleUrl
        )) as typeof import('../../packages/editor-runtime/src/runtime/image-layout.js');
        const writingArea = document.createElement('div');
        document.body.append(writingArea);
        const nativeHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        if (!nativeHTML?.get || !nativeHTML.set) throw new Error('Missing DOM descriptor');
        const originalSetter = function (this: HTMLElement, value: string) {
          nativeHTML.set?.call(this, value);
        };
        Object.defineProperty(writingArea, 'innerHTML', {
          configurable: true,
          enumerable: true,
          get() {
            return nativeHTML.get?.call(this);
          },
          set: originalSetter,
        });
        const calls: string[] = [];
        const errors: string[] = [];
        const nativeJobs: (() => void)[] = [];
        let frameId = 0;
        const frames = new Map<number, FrameRequestCallback>();
        const editor = {
          writingArea,
          imgEdit: {
            afterUserInsertImage(image: HTMLImageElement) {
              if (this !== editor.imgEdit) throw new Error('Native receiver changed');
              calls.push(image.id);
              if (image.id === 'throw') throw new Error('Fixture native callback failed');
              return image.id;
            },
          },
          reset(html: string) {
            writingArea.innerHTML = '';
            if (scenario === 'delayed-reset') nativeJobs.push(() => (writingArea.innerHTML = html));
            else writingArea.innerHTML = html;
          },
        };
        const originalAfter = editor.imgEdit.afterUserInsertImage;
        const originalReset = editor.reset;
        let callsAtDocument: string[] = [];
        const earlyDocumentHandler = () => {
          callsAtDocument = [...calls];
        };
        document.addEventListener('keydown', earlyDocumentHandler, { capture: true });
        if (scenario === 'bad-abi') Reflect.set(editor, 'reset', undefined);
        const adapter = new RuntimeImageLayout(editor, {
          requestFrame(callback) {
            const id = ++frameId;
            frames.set(id, callback);
            return id;
          },
          cancelFrame(id) {
            frames.delete(id);
          },
          onError(error) {
            errors.push(String(error));
          },
        });
        const drain = () => {
          const pending = [...frames.values()];
          frames.clear();
          for (const callback of pending) callback(0);
        };
        const image = (id: string) => {
          const value = writingArea.querySelector<HTMLImageElement>(`#${id}`);
          if (!value) throw new Error(`Missing fixture image ${id}`);
          return value;
        };
        if (scenario === 'bad-abi') {
          const unchanged = editor.imgEdit.afterUserInsertImage === originalAfter;
          adapter.dispose();
          document.removeEventListener('keydown', earlyDocumentHandler, { capture: true });
          writingArea.remove();
          return { enabled: adapter.enabled, calls, errors, unchanged };
        }
        adapter.beginLoad();
        editor.reset('<p cid="n1"><img id="a"><img id="b"><img id="throw"></p>');
        adapter.endLoad();
        for (const job of nativeJobs) job();
        let before: string[] = [];
        if (scenario === 'batch-repeat' || scenario === 'delayed-reset') {
          editor.imgEdit.afterUserInsertImage(image('a'));
          editor.imgEdit.afterUserInsertImage(image('a'));
          editor.imgEdit.afterUserInsertImage(image('b'));
          before = [...calls];
          drain();
        } else if (scenario === 'new-image-immediate') {
          editor.imgEdit.afterUserInsertImage(image('a'));
          const added = document.createElement('img');
          added.id = 'new';
          writingArea.append(added);
          const returned = editor.imgEdit.afterUserInsertImage(added);
          if (returned !== 'new') throw new Error('New image callback was deferred');
          before = [...calls];
          drain();
        } else if (scenario === 'interaction') {
          editor.imgEdit.afterUserInsertImage(image('a'));
          writingArea.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
          );
          if (callsAtDocument.join(',') !== 'a')
            throw new Error('Window capture did not precede earlier document capture');
          before = [...calls];
          const returned = editor.imgEdit.afterUserInsertImage(image('b'));
          if (returned !== 'b') throw new Error('Post-interaction callback was deferred');
          drain();
        } else if (scenario === 'generation') {
          editor.imgEdit.afterUserInsertImage(image('a'));
          const stale = [...frames.values()];
          adapter.beginLoad();
          editor.reset('<img id="next">');
          adapter.endLoad();
          editor.imgEdit.afterUserInsertImage(image('next'));
          for (const callback of stale) callback(0);
          before = [...calls];
          drain();
        } else if (scenario === 'detached-dispose') {
          editor.imgEdit.afterUserInsertImage(image('a'));
          image('a').remove();
          drain();
          editor.imgEdit.afterUserInsertImage(image('b'));
          const stale = [...frames.values()];
          adapter.dispose();
          for (const callback of stale) callback(0);
        } else if (scenario === 'callback-error') {
          editor.imgEdit.afterUserInsertImage(image('throw'));
          editor.imgEdit.afterUserInsertImage(image('b'));
          drain();
        } else if (scenario === 'host-decoration' || scenario === 'decoration-interaction') {
          editor.imgEdit.afterUserInsertImage(image('a'));
          drain();
          adapter.decorate(() => {
            const block = writingArea.querySelector('[cid]');
            if (!block) throw new Error('Missing host block');
            block.innerHTML = '<img id="resolved">';
            if (scenario === 'decoration-interaction') adapter.interaction();
          });
          const returned = editor.imgEdit.afterUserInsertImage(image('resolved'));
          if (scenario === 'decoration-interaction' && returned !== 'resolved')
            throw new Error('Decoration regained eligibility after interaction');
          if (scenario === 'host-decoration' && returned !== undefined)
            throw new Error('Host replacement lost initial-image eligibility');
          before = [...calls];
          drain();
        }
        adapter.dispose();
        document.removeEventListener('keydown', earlyDocumentHandler, { capture: true });
        const restored =
          editor.imgEdit.afterUserInsertImage === originalAfter &&
          editor.reset === originalReset &&
          Object.getOwnPropertyDescriptor(writingArea, 'innerHTML')?.set === originalSetter;
        writingArea.remove();
        return { enabled: adapter.enabled, before, calls, errors, restored };
      },
      { moduleUrl, scenario },
    );
    if (scenario === 'bad-abi') {
      expect(result).toEqual({ enabled: false, calls: [], errors: [], unchanged: true });
      return;
    }
    expect(result.enabled).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.errors).toEqual(
      scenario === 'callback-error' ? ['Error: Fixture native callback failed'] : [],
    );
    const expected = {
      'batch-repeat': ['a', 'a', 'b'],
      'delayed-reset': ['a', 'a', 'b'],
      'new-image-immediate': ['a', 'new'],
      interaction: ['a', 'b'],
      generation: ['next'],
      'detached-dispose': [],
      'callback-error': ['throw', 'b'],
      'host-decoration': ['a', 'resolved'],
      'decoration-interaction': ['a', 'resolved'],
    };
    expect(result.calls).toEqual(expected[scenario]);
    expect(result.before).toEqual(
      scenario === 'interaction' || scenario === 'host-decoration'
        ? ['a']
        : scenario === 'decoration-interaction'
          ? ['a', 'resolved']
          : scenario === 'new-image-immediate'
            ? ['a', 'new']
            : [],
    );
  });
}

interface ImageNativeWindow extends Window {
  editor: {
    writingArea: HTMLElement;
    imgEdit: { afterUserInsertImage(image: HTMLImageElement): unknown };
  };
  __layoutAfterCalls: number;
  __layoutDeferredEvents: number;
  __layoutEvents: { source: string; deferred: boolean }[];
  __layoutNativeEvents: string[];
}

test('real initial image batch decodes without changing Markdown or losing native callbacks', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    const target = window as unknown as ImageNativeWindow;
    let current: ImageNativeWindow['editor'];
    target.__layoutAfterCalls = 0;
    target.__layoutDeferredEvents = 0;
    target.__layoutEvents = [];
    target.__layoutNativeEvents = [];
    Object.defineProperty(window, 'editor', {
      configurable: true,
      get: () => current,
      set(value: ImageNativeWindow['editor']) {
        current = value;
        const original = value?.imgEdit?.afterUserInsertImage;
        if (typeof original !== 'function') return;
        value.imgEdit.afterUserInsertImage = function (image) {
          target.__layoutAfterCalls++;
          target.__layoutNativeEvents.push(image.src);
          return original.call(this, image);
        };
        for (const name of ['onImageLoadedFunc', 'onLoadedFuncForQuickAction']) {
          const handler: unknown = Reflect.get(window, name);
          if (typeof handler !== 'function') continue;
          Reflect.set(window, name, (event: Event) => {
            const before = target.__layoutAfterCalls;
            const result: unknown = Reflect.apply(handler, window, [event]);
            if (
              event.target instanceof HTMLImageElement &&
              value.writingArea.contains(event.target)
            ) {
              const deferred = target.__layoutAfterCalls === before;
              target.__layoutEvents.push({ source: event.target.src, deferred });
              if (deferred) target.__layoutDeferredEvents++;
            }
            return result;
          });
        }
      },
    });
  });
  await setupImageHost(page);
  const source = `\uFEFF# Images\r\n\r\n${Array.from({ length: 8 }, (_, at) => `![pixel ${at}](images/pixel.png)`).join('\r\n\r\n')}\n\nAfter\r\n`;
  await createImageEditor(page, { source, context: 'layout-doc', resolve: 'defer' });
  const frame = imageFrame(page);
  await expect
    .poll(() =>
      frame
        .locator('#write')
        .evaluate(() => (window as unknown as ImageNativeWindow).__layoutAfterCalls),
    )
    .toBeGreaterThanOrEqual(8);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.releaseResolves('layout-doc'),
  );
  await expectDecodedImage(page);
  await expect
    .poll(() =>
      frame
        .locator('#write img')
        .evaluateAll(
          (images) => images.filter((image) => (image as HTMLImageElement).naturalWidth > 0).length,
        ),
    )
    .toBe(8);
  await expect
    .poll(() =>
      frame
        .locator('#write')
        .evaluate(() => (window as unknown as ImageNativeWindow).__layoutAfterCalls),
    )
    .toBeGreaterThanOrEqual(16);
  expect(
    await frame
      .locator('#write')
      .evaluate(() => (window as unknown as ImageNativeWindow).__layoutDeferredEvents),
  ).toBeGreaterThan(0);
  const resolvedEvents = await frame
    .locator('#write')
    .evaluate(() =>
      (window as unknown as ImageNativeWindow).__layoutEvents.filter((event) =>
        event.source.includes('__image_fixture__'),
      ),
    );
  expect(resolvedEvents.length).toBe(8);
  expect(resolvedEvents.every((event) => event.deferred)).toBe(true);
  await expect
    .poll(() =>
      frame
        .locator('#write')
        .evaluate(
          () =>
            (window as unknown as ImageNativeWindow).__layoutNativeEvents.filter((source) =>
              source.includes('__image_fixture__'),
            ).length,
        ),
    )
    .toBe(8);
  await testInfo.attach('image-layout-two-waves', {
    contentType: 'application/json',
    body: JSON.stringify(
      await frame.locator('#write').evaluate(() => {
        const target = window as unknown as ImageNativeWindow;
        return {
          calls: target.__layoutAfterCalls,
          events: target.__layoutEvents,
          nativeEvents: target.__layoutNativeEvents,
        };
      }),
    ),
  });
  expect(await imageSource(page)).toBe(source);
});

import type {
  ImageActionRequest,
  ImageAutomaticRequest,
  MarkLyraEditor,
} from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import {
  focusEnd,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

type AutoWindow = ImageTestWindow & {
  autoFixture: {
    requests: ImageAutomaticRequest[];
    actions: { source: string; action: string; aborted: boolean }[];
    release(): void;
    errors: string[];
  };
};
async function create(
  page: Page,
  options: {
    sourceMode?: boolean;
    policy?: 'yes' | 'no' | 'no-target';
    action?: 'immediate' | 'defer' | 'cancel' | 'fail';
    source?: string;
  } = {},
) {
  await setupImageHost(page);
  await page.evaluate(async (options) => {
    const page = window as AutoWindow,
      images = page.imageHostFixture,
      Constructor = page.marklyraEditor.constructor as typeof MarkLyraEditor;
    const pending: (() => void)[] = [];
    page.autoFixture = {
      requests: [],
      actions: [],
      errors: [],
      release() {
        for (const done of pending.splice(0)) done();
      },
    };
    const fixture = page.autoFixture;
    const container = document.createElement('div');
    container.dataset.imageEditor = '0';
    container.style.cssText = 'height:520px;width:100%';
    document.querySelector('#editor')?.append(container);
    const editor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: options.source ?? 'Before',
      documentContext: 'doc-a',
      host: {
        images: {
          resolve: async () => ({ url: 'http://127.0.0.1:4174/__image_fixture__/doc-a.png' }),
          import: async () => ({
            source: 'assets/managed.png',
            url: 'http://127.0.0.1:4174/__image_fixture__/doc-a.png',
          }),
          actions: ['copyToStorage', 'downloadToStorage'],
          automatic: async (request) => {
            fixture.requests.push(request);
            return options.policy !== 'no' && options.policy !== 'no-target';
          },
          action: async (request: ImageActionRequest) => {
            const record = {
              source: request.source,
              action: request.action,
              aborted: request.signal.aborted,
            };
            fixture.actions.push(record);
            request.signal.addEventListener(
              'abort',
              () => {
                record.aborted = true;
              },
              { once: true },
            );
            const result = {
              source: 'assets/managed.png',
              url: 'http://127.0.0.1:4174/__image_fixture__/doc-a.png',
            };
            if (options.action === 'fail') throw Error('Fixture image copy failed');
            if (options.action === 'cancel') return null;
            if (options.action === 'defer')
              return new Promise((done) => pending.push(() => done(result)));
            return result;
          },
        },
      },
      onError: (error) => fixture.errors.push(error.message),
    });
    images.editors[0] = editor;
    await editor.ready;
    if (options.sourceMode) await editor.execute({ type: 'toggleSource' });
  }, options);
  if (options.sourceMode)
    await imageFrame(page)
      .locator('#write')
      .evaluate(() => {
        const editor = Reflect.get(window, 'editor') as {
          sourceView: {
            cm: {
              focus(): void;
              setCursor(pos: { line: number; ch: number }): void;
              getValue(): string;
            };
          };
        };
        editor.sourceView.cm.focus();
        editor.sourceView.cm.setCursor({ line: 0, ch: editor.sourceView.cm.getValue().length });
      });
  else await focusEnd(page);
}
async function insert(page: Page, source: string) {
  await page.evaluate(async (source) => {
    const editor = (window as AutoWindow).imageHostFixture.editors[0];
    await editor?.execute({ type: 'insertText', text: `\n\n![A](${source})` });
  }, source);
}
for (const sourceMode of [false, true])
  for (const source of [
    'images/source.png',
    'file:///tmp/source.png',
    'https://example.invalid/source.png',
  ])
    for (const policy of ['yes', 'no', 'no-target'] as const) {
      test(`${sourceMode ? 'Source' : 'WYS'} automatic ${source.startsWith('http') ? 'web' : source.startsWith('file:') ? 'file' : 'local'} ${policy}`, async ({
        page,
      }) => {
        await create(page, { sourceMode, policy });
        await insert(page, source);
        await expect
          .poll(() => page.evaluate(() => (window as AutoWindow).autoFixture.requests.length))
          .toBe(1);
        if (policy === 'yes') {
          await expect.poll(() => imageSource(page)).toContain('assets/managed.png');
          const calls = await page.evaluate(() => (window as AutoWindow).autoFixture.actions);
          expect(calls).toEqual([
            expect.objectContaining({
              source,
              action: source.startsWith('http') ? 'downloadToStorage' : 'copyToStorage',
              aborted: false,
            }),
          ]);
          const before = await imageSource(page);
          await imageCommand(page, 'undo');
          expect(await imageSource(page)).toContain(source);
          await imageCommand(page, 'redo');
          expect(await imageSource(page)).toBe(before);
        } else {
          expect(await page.evaluate(() => (window as AutoWindow).autoFixture.actions)).toEqual([]);
          expect(await imageSource(page)).toContain(source);
        }
        expect(await page.evaluate(() => (window as AutoWindow).autoFixture.errors)).toEqual([]);
      });
    }
for (const sourceMode of [false, true])
  for (const late of ['typing', 'selection', 'document', 'cancel', 'failure'] as const)
    test(`${sourceMode ? 'Source' : 'WYS'} automatic import ${late} preserves source and discards late callbacks`, async ({
      page,
    }) => {
      await create(page, {
        sourceMode,
        action: late === 'cancel' ? 'cancel' : late === 'failure' ? 'fail' : 'defer',
      });
      await insert(page, 'images/source.png');
      await expect
        .poll(() => page.evaluate(() => (window as AutoWindow).autoFixture.actions.length))
        .toBe(1);
      if (late === 'typing') {
        await page.keyboard.type('X');
      }
      if (late === 'selection' && sourceMode)
        await imageFrame(page)
          .locator('#write')
          .evaluate(() => {
            const native = Reflect.get(window, 'editor') as {
              sourceView: { cm: { setCursor(pos: { line: number; ch: number }): void } };
            };
            native.sourceView.cm.setCursor({ line: 0, ch: 0 });
          });
      if (late === 'selection' && !sourceMode) {
        await imageFrame(page)
          .locator('#write > p')
          .first()
          .evaluate((p) => {
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            document.getSelection()?.removeAllRanges();
            document.getSelection()?.addRange(range);
          });
      }
      if (late === 'document')
        await page.evaluate(() =>
          (window as AutoWindow).imageHostFixture.editors[0]?.load('New document', {
            documentContext: 'doc-b',
          }),
        );
      const preserved = await imageSource(page);
      await page.evaluate(() => (window as AutoWindow).autoFixture.release());
      await expect
        .poll(async () => {
          await new Promise((done) => setTimeout(done, 50));
          return await imageSource(page);
        })
        .toBe(preserved);
      expect(await imageSource(page)).not.toContain('assets/managed.png');
      if (late === 'typing' || late === 'document')
        expect(
          (await page.evaluate(() => (window as AutoWindow).autoFixture.actions))[0]?.aborted,
        ).toBe(true);
    });

for (const sourceMode of [false, true])
  test(`${sourceMode ? 'Source' : 'WYS'} host-managed binary insert is not automatically copied twice`, async ({
    page,
  }) => {
    await create(page, { sourceMode });
    await page.evaluate(async () => {
      const fixture = (window as AutoWindow).imageHostFixture,
        editor = fixture.editors[0];
      const bytes = Uint8Array.from(atob(fixture.png.split(',')[1] ?? ''), (char) =>
        char.charCodeAt(0),
      );
      await editor?.insertImage(new Blob([bytes], { type: 'image/png' }), 'managed.png');
    });
    await expect.poll(() => imageSource(page)).toContain('assets/managed.png');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as AutoWindow).autoFixture.requests)).toEqual([]);
    expect(await page.evaluate(() => (window as AutoWindow).autoFixture.actions)).toEqual([]);
  });

test.afterEach(async ({ page }, testInfo) => {
  if (page.isClosed()) return;
  await testInfo.attach('automatic-image-capabilities', {
    contentType: 'application/json',
    body: JSON.stringify(
      await page.evaluate(() => {
        const host = (window as Partial<AutoWindow>).autoFixture;
        if (!host) return { setupIncomplete: true };
        return {
          requests: host.requests.map(
            ({ source, reference, referenceRoot, storageFolder, sourceMode, documentContext }) => ({
              source,
              reference,
              referenceRoot,
              storageFolder,
              sourceMode,
              documentContext,
            }),
          ),
          actions: host.actions,
          errors: host.errors,
          source: (window as AutoWindow).imageHostFixture.editors[0]?.getMarkdown(),
        };
      }),
      null,
      2,
    ),
  });
});

for (const sourceMode of [false, true])
  test(`${sourceMode ? 'Source' : 'WYS'} repeated newly inserted images share one authorized copy`, async ({
    page,
  }) => {
    await create(page, { sourceMode });
    await page.evaluate(() =>
      (window as AutoWindow).imageHostFixture.editors[0]?.execute({
        type: 'insertText',
        text: '\n\n![A](images/source.png) ![B](images/source.png)',
      }),
    );
    await expect
      .poll(async () => ((await imageSource(page)).match(/assets\/managed\.png/g) ?? []).length)
      .toBe(2);
    expect(await page.evaluate(() => (window as AutoWindow).autoFixture.actions.length)).toBe(1);
    await imageCommand(page, 'undo');
    expect(((await imageSource(page)).match(/images\/source\.png/g) ?? []).length).toBe(2);
  });

for (const source of ['file:///tmp/url-image.png', 'https://example.invalid/url-image.png'])
  for (const policy of ['yes', 'no'] as const)
    test(`original URL insertion ${source.startsWith('file') ? 'file' : 'web'} ${policy} uses captured source rather than the virtual directory`, async ({
      page,
    }) => {
      await create(page, { policy });
      await imageFrame(page)
        .locator('#write')
        .evaluate((_write, source) => {
          const editor = Reflect.get(window, 'editor') as {
            imgEdit: { insertImageFromURL(source: string): void };
          };
          editor.imgEdit.insertImageFromURL(source);
        }, source);
      await expect
        .poll(() => page.evaluate(() => (window as AutoWindow).autoFixture.requests.length))
        .toBe(1);
      if (policy === 'yes') {
        await expect.poll(() => imageSource(page)).toContain('assets/managed.png');
        expect(
          (await page.evaluate(() => (window as AutoWindow).autoFixture.actions))[0]?.source,
        ).toBe(source);
        await imageCommand(page, 'undo');
        expect(await imageSource(page)).toContain(source);
      } else expect(await imageSource(page)).toContain(source);
    });

test('a following insertion never inherits an earlier URL source hint', async ({ page }) => {
  await create(page);
  await imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        imgEdit: { insertImageFromURL(source: string): void };
        insertText(text: string): void;
      };
      editor.imgEdit.insertImageFromURL('https://example.invalid/first.png');
      editor.insertText('\n\n![Second](images/second.png)');
    });
  await expect
    .poll(() => page.evaluate(() => (window as AutoWindow).autoFixture.actions.length))
    .toBe(1);
  expect((await page.evaluate(() => (window as AutoWindow).autoFixture.actions))[0]?.source).toBe(
    'images/second.png',
  );
});

for (const change of ['resource-context', 'selection'] as const)
  test(`${change} after host IO but during actual reference proof cancels the final patch`, async ({
    page,
  }) => {
    await create(page);
    await page.evaluate(() => {
      const editor = (window as AutoWindow).imageHostFixture.editors[0];
      if (!editor) throw Error('Missing editor');
      const fixture = (window as AutoWindow).autoFixture as AutoWindow['autoFixture'] & {
        proofPending?: boolean;
        releaseProof?: () => void;
        refreshDone?: boolean;
      };
      const original = Reflect.get(editor, 'request') as (
        operation: string,
        payload?: unknown,
      ) => Promise<unknown>;
      Reflect.set(editor, 'request', async (operation: string, payload?: unknown) => {
        const result = await original.call(editor, operation, payload);
        if (
          operation === 'image-reference-facts' &&
          fixture.actions.length &&
          !fixture.proofPending
        ) {
          fixture.proofPending = true;
          return new Promise((done) => {
            fixture.releaseProof = () => done(result);
          });
        }
        return result;
      });
    });
    await insert(page, 'images/source.png');
    await page.waitForFunction(() =>
      Boolean(Reflect.get((window as AutoWindow).autoFixture, 'proofPending')),
    );
    if (change === 'resource-context')
      await page.evaluate(() => {
        const fixture = (window as AutoWindow).autoFixture as AutoWindow['autoFixture'] & {
          refreshDone?: boolean;
        };
        void (window as AutoWindow).imageHostFixture.editors[0]
          ?.setDocumentContext('doc-a', true)
          .then(() => {
            fixture.refreshDone = true;
          });
      });
    else
      await imageFrame(page)
        .locator('#write > p')
        .first()
        .evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(true);
          const selection = document.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        });
    await page.evaluate(() => {
      const release = Reflect.get((window as AutoWindow).autoFixture, 'releaseProof') as
        | (() => void)
        | undefined;
      release?.();
    });
    if (change === 'resource-context')
      await page.waitForFunction(() =>
        Boolean(Reflect.get((window as AutoWindow).autoFixture, 'refreshDone')),
      );
    await page.waitForFunction(() => {
      const editor = (window as AutoWindow).imageHostFixture.editors[0];
      return (
        editor && (Reflect.get(editor, 'imageAutomaticRequests') as Map<string, unknown>).size === 0
      );
    });
    await expect.poll(() => imageSource(page)).toContain('images/source.png');
    expect(await imageSource(page)).not.toContain('assets/managed.png');
  });

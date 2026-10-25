import { test as base, expect } from '@playwright/test';
import {
  createImageEditor,
  dispatchImageTransfer,
  expectDecodedImage,
  focusEnd,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await setupImageHost(page);
      await use(errors);
      expect(errors, 'Unexpected browser exceptions; expected host failures use onError').toEqual(
        [],
      );
    },
    { auto: true },
  ],
});
test.afterEach(async ({ page }, testInfo) => {
  if (page.isClosed()) return;
  await testInfo.attach('image-host-requests', {
    contentType: 'application/json',
    body: JSON.stringify(
      await page.evaluate(() => {
        const fixture = (window as Partial<ImageTestWindow>).imageHostFixture;
        if (!fixture) return { setupIncomplete: true };
        return {
          resolves: fixture.resolves,
          imports: fixture.imports,
          errors: fixture.errors,
          jobs: fixture.jobs,
        };
      }),
      null,
      2,
    ),
  });
});

for (const yaml of [false, true]) {
  test(`relative image decodes through host mapping and preserves source (${yaml ? 'YAML root' : 'document root'})`, async ({
    page,
  }) => {
    const source = `${yaml ? '---\r\nmarklyra-root-url: ./root\n---\r\n\r\n' : ''}![pixel](images/pixel.png)\r\n\r\nAfter\n`;
    await createImageEditor(page, { source, context: 'doc-a' });
    await expectDecodedImage(page);
    expect(await imageSource(page)).toBe(source);
    const requests = await page.evaluate(
      () => (window as ImageTestWindow).imageHostFixture.resolves,
    );
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'images/pixel.png',
          reference: yaml ? 'root/images/pixel.png' : 'images/pixel.png',
          context: 'doc-a',
        }),
      ]),
    );
    const image = await imageFrame(page)
      .locator('#write img')
      .first()
      .evaluate((element) => ({
        shown: (element as HTMLImageElement).src,
        source: element.closest('[data-src]')?.getAttribute('data-src'),
      }));
    expect(image.shown).toContain('/__image_fixture__/doc-a.png');
    expect(image.source).toBe('images/pixel.png');
    expect(await imageSource(page)).not.toContain('__image_fixture__');
  });
}

test('neighbor keyboard edit and original undo keep sourceHref and display mapping', async ({
  page,
}) => {
  const source = '\uFEFF![pixel](images/pixel.png)\r\n\r\nAfter\n';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  await focusEnd(page);
  await page.keyboard.type('X');
  await expect.poll(() => imageSource(page)).toBe(source.replace('After', 'AfterX'));
  await expectDecodedImage(page);
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  await expectDecodedImage(page);
  await imageCommand(page, 'redo');
  expect(await imageSource(page)).toBe(source.replace('After', 'AfterX'));
  expect(
    await imageFrame(page)
      .locator('#write img')
      .first()
      .evaluate((image) => image.closest('[data-src]')?.getAttribute('data-src')),
  ).toBe('images/pixel.png');
});

for (const reversed of [false, true]) {
  test(`late image refresh preserves the neighboring ${reversed ? 'reversed selection' : 'caret'} inside the same paragraph`, async ({
    page,
  }) => {
    const source = 'Before ![pixel](images/pixel.png) After';
    await createImageEditor(page, { source, context: 'doc-a', resolve: 'defer' });
    await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.focus());
    const before = await imageFrame(page)
      .locator('#write')
      .evaluate((element, reversed) => {
        const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let text: Node | null = walker.nextNode();
        while (text && !text.textContent?.includes('After')) text = walker.nextNode();
        if (!text) throw new Error('Missing neighboring text');
        const start = (text.textContent ?? '').indexOf('After');
        const selection = element.ownerDocument.getSelection();
        selection?.setBaseAndExtent(text, start + (reversed ? 5 : 1), text, start + 1);
        return {
          anchor: selection?.anchorOffset,
          head: selection?.focusOffset,
          text: selection?.toString(),
        };
      }, reversed);
    await expect
      .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
      .toBeGreaterThan(0);
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'),
    );
    await expectDecodedImage(page);
    const after = await imageFrame(page)
      .locator('#write')
      .evaluate((element) => {
        const selection = element.ownerDocument.getSelection();
        return {
          anchor: selection?.anchorOffset,
          head: selection?.focusOffset,
          text: selection?.toString(),
        };
      });
    expect(after).toEqual(before);
    await page.keyboard.type('X');
    await expect
      .poll(() => imageSource(page))
      .toBe(source.replace('After', reversed ? 'AX' : 'AXfter'));
  });
}

for (const reversed of [false, true]) {
  test(`late image refresh preserves a plain paragraph Element ${reversed ? 'reversed range' : 'end caret'}`, async ({
    page,
  }) => {
    const source = '\uFEFF![pixel](images/pixel.png)\r\n\r\nAfter';
    await createImageEditor(page, { source, context: 'doc-a', resolve: 'defer' });
    await expect
      .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
      .toBeGreaterThan(0);
    await focusEnd(page);
    const before = await imageFrame(page)
      .locator('#write > p')
      .last()
      .evaluate((paragraph, reversed) => {
        const selection = paragraph.ownerDocument.getSelection();
        const end = paragraph.childNodes.length;
        selection?.setBaseAndExtent(paragraph, end, paragraph, reversed ? 0 : end);
        return {
          anchorElement: selection?.anchorNode === paragraph,
          headElement: selection?.focusNode === paragraph,
          text: selection?.toString(),
          collapsed: selection?.isCollapsed,
        };
      }, reversed);
    expect(before).toEqual({
      anchorElement: true,
      headElement: true,
      text: reversed ? 'After' : '',
      collapsed: !reversed,
    });
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'),
    );
    await expectDecodedImage(page, 1);
    const after = await imageFrame(page)
      .locator('#write > p')
      .last()
      .evaluate((paragraph) => {
        const selection = paragraph.ownerDocument.getSelection();
        return {
          text: selection?.toString(),
          collapsed: selection?.isCollapsed,
          anchor: selection?.anchorOffset,
          head: selection?.focusOffset,
        };
      });
    expect(after).toEqual({
      text: reversed ? 'After' : '',
      collapsed: !reversed,
      anchor: 5,
      head: reversed ? 0 : 5,
    });
    expect(await imageSource(page)).toBe(source);
    await page.keyboard.type('X');
    const edited = source.replace('After', reversed ? 'X' : 'AfterX');
    await expect.poll(() => imageSource(page)).toBe(edited);
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(edited);
  });
}

test('synthetic composition retains its owned text node while an image resolver finishes; not system IME', async ({
  page,
}) => {
  const source = 'Before ![pixel](images/pixel.png) After';
  await createImageEditor(page, { source, context: 'doc-a', resolve: 'defer' });
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.focus());
  await imageFrame(page)
    .locator('#write')
    .evaluate((element) => {
      const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text: Node | null = walker.nextNode();
      while (text && !text.textContent?.includes('After')) text = walker.nextNode();
      if (!text) throw new Error('Missing composition text');
      const at = (text.textContent ?? '').indexOf('After') + 1;
      element.ownerDocument.getSelection()?.setBaseAndExtent(text, at, text, at);
      Object.assign(window, { __imageCompositionNode: text });
      const owned = text;
      const probe: { active: boolean; replacements: number; observer: MutationObserver } = {
        active: true,
        replacements: 0,
        observer: new MutationObserver((records) => {
          if (
            probe.active &&
            records.some((record) =>
              [...record.removedNodes].some(
                (removed) => removed === owned || removed.contains(owned),
              ),
            )
          )
            probe.replacements++;
        }),
      };
      probe.observer.observe(element, { childList: true, subtree: true });
      Object.assign(window, { __imageCompositionProbe: probe });
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    });
  await expect
    .poll(() =>
      page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.isComposing),
    )
    .toBe(true);
  const pendingCount = await page.evaluate(
    () => (window as ImageTestWindow).imageHostFixture.resolves.length,
  );
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.setDocumentContext('doc-a'),
  );
  expect(
    await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length),
  ).toBe(pendingCount);
  expect(
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.resolves.some((call) => call.aborted),
    ),
  ).toBe(false);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'));
  // Allow the resolved promise and rendering tasks to run. Either parent- or
  // child-side deferral is valid; do not require an internal message shape.
  await imageFrame(page)
    .locator('body')
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  expect(
    await imageFrame(page)
      .locator('#write')
      .evaluate((element) => {
        const owned = Reflect.get(window, '__imageCompositionNode') as Node;
        const probe = Reflect.get(window, '__imageCompositionProbe') as { replacements: number };
        const selection = element.ownerDocument.getSelection();
        return (
          probe.replacements === 0 &&
          owned.isConnected &&
          element.contains(owned) &&
          selection?.anchorNode === owned &&
          selection.focusNode === owned
        );
      }),
  ).toBe(true);
  await imageFrame(page)
    .locator('#write')
    .evaluate((element) => {
      const probe = Reflect.get(window, '__imageCompositionProbe') as {
        active: boolean;
        observer: MutationObserver;
      };
      probe.active = false;
      probe.observer.disconnect();
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    });
  await expect
    .poll(() =>
      page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.isComposing),
    )
    .toBe(false);
  await expectDecodedImage(page);
  expect(await imageSource(page)).toBe(source);
});

test('context-only change refreshes image authorization without clearing editing history', async ({
  page,
}) => {
  const source = '![pixel](images/pixel.png)\n\nAfter';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page, 1);
  await focusEnd(page);
  await page.keyboard.type('X');
  await expect.poll(() => imageSource(page)).toBe(`${source}X`);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.setDocumentContext('doc-b'),
  );
  await expectDecodedImage(page, 2);
  expect(await imageSource(page)).toBe(`${source}X`);
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  await expectDecodedImage(page, 2);
});

test('same-ID location refresh changes the image without changing raw source, caret or history', async ({
  page,
}) => {
  const source = '\uFEFF![pixel](images/pixel.png)\r\n\r\nAfter  \n';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page, 1);
  await focusEnd(page);
  await page.keyboard.type('X');
  const edited = await imageSource(page);
  const frame = imageFrame(page);
  const capture = () =>
    frame.locator('#write').evaluate(() => {
      const native = Reflect.get(window, 'editor') as {
        undo: { index: number; commandStack: unknown[] };
        selection: { buildUndo(): unknown };
      };
      const selection = window.getSelection();
      return {
        bookmark: JSON.stringify(native.selection.buildUndo()),
        anchor: selection?.anchorOffset,
        head: selection?.focusOffset,
        index: native.undo.index,
        history: native.undo.commandStack.length,
      };
    });
  const before = await capture();
  await page.evaluate(async () => {
    const fixture = (window as ImageTestWindow).imageHostFixture;
    fixture.setWidth(0, 2);
    await fixture.editors[0]?.setDocumentContext('doc-a', true);
  });
  await expectDecodedImage(page, 2);
  expect(await capture()).toEqual(before);
  expect(await imageSource(page)).toBe(edited);
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  await expectDecodedImage(page, 2);
});

test('editing the YAML root in original source mode refreshes the display reference without rewriting sourceHref', async ({
  page,
}) => {
  const source = '---\nmarklyra-root-url: ./root\n---\n\n![pixel](images/pixel.png)\n\nAfter';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page, 1);
  await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    await editor.execute({ type: 'toggleSource' });
    await editor.execute({
      type: 'sourcePosition',
      line: 2,
      column: 'marklyra-root-url: '.length + 1,
    });
  });
  await imageFrame(page).locator('.CodeMirror:visible textarea').last().focus();
  for (let index = 0; index < './root'.length; index++)
    await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('./other-root');
  const changed = source.replace('./root', './other-root');
  await expect.poll(() => imageSource(page)).toBe(changed);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  await expectDecodedImage(page, 2);
  const calls = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves);
  expect(calls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'images/pixel.png',
        reference: 'other-root/images/pixel.png',
      }),
    ]),
  );
  expect(await imageSource(page)).toBe(changed);
  expect(
    await imageFrame(page)
      .locator('#write img')
      .first()
      .evaluate((image) => image.closest('[data-src]')?.getAttribute('data-src')),
  ).toBe('images/pixel.png');
});

test('editing the image source in original source mode replaces its old display mapping', async ({
  page,
}) => {
  const source = 'Before ![pixel](images/pixel.png) After';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page, 1);
  await page.evaluate(async (position) => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    await editor.execute({ type: 'toggleSource' });
    await editor.execute({ type: 'sourcePosition', line: 1, column: position + 1 });
  }, source.indexOf('images/pixel.png'));
  await imageFrame(page).locator('.CodeMirror:visible textarea').last().focus();
  for (let index = 0; index < 'images/pixel.png'.length; index++)
    await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('images/other.png');
  const changed = source.replace('images/pixel.png', 'images/other.png');
  await expect.poll(() => imageSource(page)).toBe(changed);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  await expectDecodedImage(page, 2);
  const observed = await imageFrame(page)
    .locator('#write img')
    .first()
    .evaluate((image) => ({
      source: image.closest('[data-src]')?.getAttribute('data-src'),
      reference: new URL((image as HTMLImageElement).src).searchParams.get('reference'),
    }));
  expect(observed).toEqual({ source: 'images/other.png', reference: 'images/other.png' });
  expect(await imageSource(page)).toBe(changed);
});

test('one resolved image refreshes only its affected block instead of brushing another mapped image', async ({
  page,
}) => {
  const source = '![one](images/one.png)\n\nBetween\n\n![two](images/two.png)\n\nAfter';
  await createImageEditor(page, { source, context: 'doc-a', resolve: 'defer' });
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
    .toBe(2);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a', 'images/one.png'),
  );
  await expectDecodedImage(page);
  expect(await imageSource(page)).toBe(source);
  const beforeRefresh = await page.evaluate(() => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    return { revision: editor?.revision, pending: editor?.hasPendingChanges };
  });
  expect(beforeRefresh.pending).toBe(false);
  const target = await imageFrame(page)
    .locator('#write')
    .evaluate((element) => {
      const second = element.querySelectorAll('.md-image')[1];
      const cid = second?.closest('[cid]')?.getAttribute('cid');
      if (!cid) throw new Error('Missing second image block');
      const runtime = Reflect.get(window, 'editor') as {
        brush: { brushNode: (...args: unknown[]) => unknown };
      };
      const original = runtime.brush.brushNode;
      const calls: string[] = [];
      runtime.brush.brushNode = function (this: unknown, ...args: unknown[]) {
        calls.push(String(args[0]));
        return Reflect.apply(original, this, args);
      };
      Object.assign(window, {
        __imageBrushCalls: calls,
        __imageFirstNode: element.querySelector('.md-image img'),
      });
      return cid;
    });
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a', 'images/two.png'),
  );
  await expect
    .poll(() =>
      imageFrame(page)
        .locator('#write img')
        .nth(1)
        .evaluate((image) => ({
          decoded: (image as HTMLImageElement).naturalWidth,
          mapped: (image as HTMLImageElement).src.includes('/__image_fixture__/'),
          state: image.closest('.md-image')?.getAttribute('data-marklyra-image-state'),
        })),
    )
    .toEqual({ decoded: 1, mapped: true, state: 'ready' });
  const observed = await imageFrame(page)
    .locator('#write')
    .evaluate((element) => ({
      calls: Reflect.get(window, '__imageBrushCalls') as string[],
      firstUnchanged:
        element.querySelector('.md-image img') === Reflect.get(window, '__imageFirstNode'),
    }));
  expect(observed.calls.length).toBeGreaterThan(0);
  expect([...new Set(observed.calls)]).toEqual([target]);
  expect(observed.firstUnchanged).toBe(true);
  expect(await imageSource(page)).toBe(source);
  expect(
    await page.evaluate(() => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      return { revision: editor?.revision, pending: editor?.hasPendingChanges };
    }),
  ).toEqual(beforeRefresh);
});

test('an unavailable image remains a placeholder without rewriting the Markdown reference', async ({
  page,
}) => {
  const source = '![missing](images/not-authorized.png)\n';
  await createImageEditor(page, { source, context: 'doc-a', resolve: 'missing' });
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
    .toBeGreaterThan(0);
  expect(await imageSource(page)).toBe(source);
  await expect(imageFrame(page).locator('#write .md-image').first()).toHaveAttribute(
    'data-marklyra-image-state',
    'unavailable',
  );
  expect(await imageFrame(page).locator('#write img').first().getAttribute('src')).not.toContain(
    '/__image_fixture__/',
  );
});

test('late resolver answers from the previous document cannot replace a new document mapping', async ({
  page,
}) => {
  const oldSource = '![old](images/pixel.png)\n';
  const nextSource = '![new](images/pixel.png)\n';
  await createImageEditor(page, { source: oldSource, context: 'doc-a', resolve: 'defer' });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as ImageTestWindow).imageHostFixture.resolves.filter(
            (call) => call.context === 'doc-a',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(
    (source) =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.load(source, {
        documentContext: 'doc-b',
      }),
    nextSource,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as ImageTestWindow).imageHostFixture.resolves.filter(
            (call) => call.context === 'doc-b',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-b'));
  await expectDecodedImage(page, 2);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'));
  expect(await imageSource(page)).toBe(nextSource);
  await expectDecodedImage(page, 2);
  expect(await imageFrame(page).locator('#write img').first().getAttribute('src')).toContain(
    '/doc-b.png',
  );
  const oldCalls = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.resolves.filter(
      (call) => call.context === 'doc-a',
    ),
  );
  expect(oldCalls.every((call) => call.aborted)).toBe(true);
});

test('failed source-mirror load restores the previous context and mapped image', async ({
  page,
}) => {
  const source = '![pixel](images/pixel.png)\n\nAfter';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page, 1);
  const rejected = await page.evaluate(async () => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.load(
        'Unsupported \uE027 marker\n\n![pixel](images/pixel.png)\n',
        { documentContext: 'doc-b' },
      );
      return '';
    } catch (error) {
      return String(error);
    }
  });
  expect(rejected).toContain('Unverified serializer normalization');
  expect(await imageSource(page)).toBe(source);
  await expectDecodedImage(page, 1);
  expect(await imageFrame(page).locator('#write img').first().getAttribute('src')).toContain(
    '/doc-a.png',
  );
  await focusEnd(page);
  await page.keyboard.type('X');
  await expect.poll(() => imageSource(page)).toBe(`${source}X`);
});

test('public binary import inserts a portable reference and supports original undo/redo', async ({
  page,
}) => {
  await createImageEditor(page, { source: '', context: 'doc-a' });
  await focusEnd(page);
  const job = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.beginImport(0, 'inserted.png'),
  );
  await expect
    .poll(() =>
      page.evaluate((job) => (window as ImageTestWindow).imageHostFixture.jobs[job]?.state, job),
    )
    .toBe('resolved');
  await expectDecodedImage(page);
  const source = await imageSource(page);
  expect(source).toMatch(/\(<?assets\/inserted\.png>?\)/);
  expect(source).not.toMatch(/(?:__image_fixture__|cap=|data:image|blob:|file:)/);
  const record = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports[0]);
  expect(record).toEqual(
    expect.objectContaining({
      name: 'inserted.png',
      type: 'image/png',
      context: 'doc-a',
      uint8Array: true,
    }),
  );
  expect(record?.bytes?.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe('');
  await imageCommand(page, 'redo');
  expect(await imageSource(page)).toBe(source);
  await expectDecodedImage(page);
});

for (const root of ['./media', '../media']) {
  test(`import with YAML image root ${root} resolves the same asset after a full reload clears display cache`, async ({
    page,
  }) => {
    const initial = `---\nmarklyra-root-url: ${root}\n---\n\nAfter`;
    await createImageEditor(page, { source: initial, context: 'doc-a' });
    await focusEnd(page);
    const job = await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.beginImport(0, 'rooted.png'),
    );
    await expect
      .poll(() =>
        page.evaluate((job) => (window as ImageTestWindow).imageHostFixture.jobs[job]?.state, job),
      )
      .toBe('resolved');
    await expectDecodedImage(page);
    const source = await imageSource(page);
    const href = root === './media' ? '../assets/rooted.png' : '../docs/assets/rooted.png';
    expect(source).toContain(href);
    expect(source).not.toMatch(/(?:__image_fixture__|cap=|data:image|blob:|file:)/);
    const imported = await page.evaluate(
      () => (window as ImageTestWindow).imageHostFixture.imports[0],
    );
    expect(imported?.referenceRoot).toBe(root);
    const beforeResolves = await page.evaluate(
      () => (window as ImageTestWindow).imageHostFixture.resolves.length,
    );
    await page.evaluate(
      (source) =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.load(source, {
          documentContext: 'doc-a',
        }),
      source,
    );
    await expectDecodedImage(page);
    const requests = await page.evaluate(
      (from) => (window as ImageTestWindow).imageHostFixture.resolves.slice(from),
      beforeResolves,
    );
    expect(requests.length).toBeGreaterThan(0);
    expect(requests).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: href, context: 'doc-a' })]),
    );
    for (const request of requests.filter((request) => request.source === href)) {
      expect(new URL(request.reference ?? '', 'https://image.test/fixture/docs/').pathname).toBe(
        '/fixture/docs/assets/rooted.png',
      );
    }
    expect(await imageSource(page)).toBe(source);
  });
}

for (const kind of ['paste', 'drop'] as const) {
  test(`synthetic PNG File ${kind} uses binary host import and original undo; not OS ${kind}`, async ({
    page,
  }) => {
    await createImageEditor(page, { source: '', context: 'doc-a' });
    await focusEnd(page);
    expect(await dispatchImageTransfer(page, kind)).toBe(true);
    await expect
      .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports.length))
      .toBe(1);
    await expectDecodedImage(page);
    const source = await imageSource(page);
    expect(source).toMatch(new RegExp(`\\(<?assets/${kind}\\.png>?\\)`));
    expect(source).not.toMatch(/(?:__image_fixture__|cap=|data:image|blob:|file:)/);
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe('');
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(source);
    await expectDecodedImage(page);
  });
}

test('an import finishing after ordinary input cannot overwrite or relocate that input', async ({
  page,
}) => {
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a', import: 'defer' });
  await focusEnd(page);
  const job = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.beginImport(0, 'late.png'),
  );
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports.length))
    .toBe(1);
  await page.keyboard.type('X');
  await expect(imageFrame(page).locator('#write')).toHaveText('AlphaX');
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseImports());
  await expect
    .poll(() =>
      page.evaluate((job) => (window as ImageTestWindow).imageHostFixture.jobs[job]?.state, job),
    )
    .toBe('rejected');
  expect(await imageSource(page)).toBe('AlphaX');
  await expect(imageFrame(page).locator('#write img')).toHaveCount(0);
});

for (const change of ['load', 'context'] as const) {
  test(`an import finishing after document ${change} is canceled and cannot insert into the new context`, async ({
    page,
  }) => {
    await createImageEditor(page, { source: 'Alpha', context: 'doc-a', import: 'defer' });
    await focusEnd(page);
    const job = await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.beginImport(0, 'late.png'),
    );
    await expect
      .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports.length))
      .toBe(1);
    await page.evaluate(async (change) => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw new Error('Missing editor');
      if (change === 'load') await editor.load('Beta', { documentContext: 'doc-b' });
      else await editor.setDocumentContext('doc-b');
    }, change);
    expect(
      await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports[0]?.aborted),
    ).toBe(true);
    await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseImports());
    await expect
      .poll(() =>
        page.evaluate((job) => (window as ImageTestWindow).imageHostFixture.jobs[job]?.state, job),
      )
      .toBe('rejected');
    expect(await imageSource(page)).toBe(change === 'load' ? 'Beta' : 'Alpha');
    await expect(imageFrame(page).locator('#write img')).toHaveCount(0);
  });
}

test('host import failure leaves existing source and history unchanged', async ({ page }) => {
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a', import: 'reject' });
  await focusEnd(page);
  const job = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.beginImport(0, 'failure.png'),
  );
  await expect
    .poll(() =>
      page.evaluate((job) => (window as ImageTestWindow).imageHostFixture.jobs[job]?.state, job),
    )
    .toBe('rejected');
  expect(await imageSource(page)).toBe('Alpha');
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe('Alpha');
});

test('destroy aborts unresolved host calls and ignores uncooperative late answers', async ({
  page,
}) => {
  await createImageEditor(page, {
    source: '![pixel](images/pixel.png)\n\nAfter',
    context: 'doc-a',
    resolve: 'defer',
    import: 'defer',
  });
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
    .toBeGreaterThan(0);
  await focusEnd(page);
  const job = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.beginImport(0, 'late.png'),
  );
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.imports.length))
    .toBe(1);
  const changeCount = await page.evaluate(() => {
    const fixture = (window as ImageTestWindow).imageHostFixture;
    fixture.editors[0]?.destroy();
    return fixture.changes.length;
  });
  expect(
    await page.evaluate(() => {
      const fixture = (window as ImageTestWindow).imageHostFixture;
      return [...fixture.resolves, ...fixture.imports].every((call) => call.aborted);
    }),
  ).toBe(true);
  await page.evaluate(() => {
    const fixture = (window as ImageTestWindow).imageHostFixture;
    fixture.releaseResolves('doc-a');
    fixture.releaseImports();
  });
  await expect
    .poll(() =>
      page.evaluate((job) => (window as ImageTestWindow).imageHostFixture.jobs[job]?.state, job),
    )
    .toBe('rejected');
  await expect(page.locator('[data-image-editor="0"] iframe')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.changes.length),
  ).toBe(changeCount);
});

test('two instances with the same sourceHref keep independent display capabilities', async ({
  page,
}) => {
  const source = '![pixel](images/pixel.png)\n';
  await createImageEditor(page, { source, context: 'doc-a' });
  await createImageEditor(page, { source, context: 'doc-b' });
  await expectDecodedImage(page, 1, 0);
  await expectDecodedImage(page, 2, 1);
  expect(await imageSource(page, 0)).toBe(source);
  expect(await imageSource(page, 1)).toBe(source);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.destroy());
  await expectDecodedImage(page, 2, 1);
  expect(await imageSource(page, 1)).toBe(source);
});

test('synthetic cross-document image clipboard never serializes a display capability URL', async ({
  page,
}) => {
  // Both mock documents authorize the same portable reference. This checks
  // source/display separation, not real filesystem resource relocation.
  await createImageEditor(page, {
    source: '![pixel](images/pixel.png)\n',
    context: 'doc-a',
    width: 1,
  });
  await createImageEditor(page, { source: '', context: 'doc-b', width: 1 });
  await expectDecodedImage(page, 1, 0);
  const formats = await imageFrame(page, 0)
    .locator('#write')
    .evaluate((element) => {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      const selection = element.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const data = new DataTransfer();
      element.dispatchEvent(
        new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }),
      );
      return Object.fromEntries([...data.types].map((type) => [type, data.getData(type)]));
    });
  expect(Object.keys(formats).length).toBeGreaterThan(0);
  await focusEnd(page, 1);
  await imageFrame(page, 1)
    .locator('#write')
    .evaluate((element, formats) => {
      const data = new DataTransfer();
      for (const [type, value] of Object.entries(formats)) data.setData(type, value);
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, formats);
  await expect
    .poll(() => imageSource(page, 1))
    .toMatch(/!\[[^\]]*\]\(<?(?:images|assets)\/[^)>]+>?\)/);
  const source = await imageSource(page, 1);
  expect(source).not.toMatch(/(?:__image_fixture__|cap=|data:image|blob:|file:|https?:)/);
  await expectDecodedImage(page, 1, 1);
  await imageCommand(page, 'undo', 1);
  expect(await imageSource(page, 1)).toBe('');
});

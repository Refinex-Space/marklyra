import { expect, type Page, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  focusEnd,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

type ReloadWindow = ImageTestWindow & {
  reloadJob?: { state: 'pending' | 'resolved' | 'rejected'; error?: string };
};
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = [];
  errors.set(page, captured);
  page.on('pageerror', (error) => captured.push(error.message));
  await setupImageHost(page);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});
async function reload(page: Page, source: string) {
  await page.evaluate(async (source) => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    const expectedSource = await editor.flush(),
      expectedRevision = editor.revision;
    await editor.reloadFromDisk(source, { expectedSource, expectedRevision });
  }, source);
}
async function command(page: Page, type: 'undo' | 'redo' | 'toggleSource') {
  await page.evaluate(
    (type) => (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type }),
    type,
  );
}
async function bookmark(page: Page) {
  return imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        selection: { buildUndo(): unknown };
        sourceView: { inSourceMode: boolean };
      };
      return {
        selection: editor.selection.buildUndo(),
        sourceMode: editor.sourceView.inSourceMode,
      };
    });
}

const fixtures = [
  {
    name: 'BOM and mixed EOL',
    before: '\ufeff# Old\r\n\r\nAlpha\n\nEnd\r\n',
    after: '# New\n\nBeta\r\n\r\nEnd\n',
  },
  {
    name: 'same canonical, different raw EOL',
    before: 'Alpha\r\n\r\nEnd\n',
    after: 'Alpha\n\nEnd\r\n',
  },
  {
    name: 'CRLF to LF and missing final newline',
    before: 'Alpha\r\n\r\nEnd\r\n',
    after: 'Beta\n\nEnd',
  },
  {
    name: 'table source layout',
    before: '| A | B |\n| --- | --- |\n| x | y |\n',
    after: '|A|B|\n|---|---|\n|x|y|\n',
  },
];
for (const sourceMode of [false, true])
  for (const fixture of fixtures) {
    test(`${sourceMode ? 'source' : 'WYSIWYG'} reload ${fixture.name} preserves exact old/new raw Undo and Redo`, async ({
      page,
    }) => {
      await createImageEditor(page, { source: fixture.before, context: 'doc-a' });
      if (sourceMode) await command(page, 'toggleSource');
      else if (!fixture.name.startsWith('table')) await focusEnd(page);
      const before = await bookmark(page);
      await reload(page, fixture.after);
      expect(await imageSource(page)).toBe(fixture.after);
      expect((await bookmark(page)).sourceMode).toBe(sourceMode);
      await command(page, 'undo');
      expect(await imageSource(page)).toBe(fixture.before);
      if (!fixture.name.startsWith('table'))
        expect((await bookmark(page)).selection).toEqual(before.selection);
      await command(page, 'redo');
      expect(await imageSource(page)).toBe(fixture.after);
    });
  }
for (const sourceMode of [false, true]) {
  test(`${sourceMode ? 'source' : 'WYSIWYG'} reload retains earlier local edits and consecutive external version history`, async ({
    page,
  }) => {
    const original = 'Alpha\r\n';
    await createImageEditor(page, { source: original, context: 'doc-a' });
    if (sourceMode) {
      await command(page, 'toggleSource');
      await imageFrame(page).locator('.CodeMirror textarea').focus();
      await imageFrame(page)
        .locator('#write')
        .evaluate(() => {
          const editor = Reflect.get(window, 'editor') as {
            sourceView: {
              cm: { setCursor(pos: { line: number; ch: number }): void; focus(): void };
            };
          };
          editor.sourceView.cm.setCursor({ line: 0, ch: 5 });
          editor.sourceView.cm.focus();
        });
    } else await focusEnd(page);
    await page.keyboard.type('X');
    const edited = await imageSource(page);
    expect(edited).toContain('AlphaX');
    await reload(page, 'External one\n');
    await reload(page, 'External two\r\n');
    await command(page, 'undo');
    expect(await imageSource(page)).toBe('External one\n');
    await command(page, 'undo');
    expect(await imageSource(page)).toBe(edited);
    await command(page, 'undo');
    expect(await imageSource(page)).toBe(original);
    await command(page, 'redo');
    expect(await imageSource(page)).toBe(edited);
    await command(page, 'redo');
    expect(await imageSource(page)).toBe('External one\n');
    await command(page, 'redo');
    expect(await imageSource(page)).toBe('External two\r\n');
  });
  test(`${sourceMode ? 'source' : 'WYSIWYG'} rejected reload preserves the current view and all original history`, async ({
    page,
  }) => {
    await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
    if (sourceMode) {
      await command(page, 'toggleSource');
      await imageFrame(page).locator('.CodeMirror textarea').focus();
      await imageFrame(page)
        .locator('#write')
        .evaluate(() => {
          const editor = Reflect.get(window, 'editor') as {
            sourceView: {
              cm: { setCursor(pos: { line: number; ch: number }): void; focus(): void };
            };
          };
          editor.sourceView.cm.setCursor({ line: 0, ch: 5 });
          editor.sourceView.cm.focus();
        });
    } else await focusEnd(page);
    await page.keyboard.type('X');
    const edited = await imageSource(page);
    const failure = await page.evaluate(async (sourceMode) => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw new Error('Missing editor');
      const expectedSource = await editor.flush();
      try {
        await editor.reloadFromDisk(
          sourceMode ? 'Invalid \uD800 marker\n' : 'Unsupported \uE027 marker\n',
          {
            expectedSource,
            expectedRevision: editor.revision,
          },
        );
        return '';
      } catch (error) {
        return String(error);
      }
    }, sourceMode);
    expect(failure).toMatch(/normalization|Normalization|源文本|surrogate/);
    expect(await imageSource(page)).toBe(edited);
    await command(page, 'undo');
    expect(await imageSource(page)).toBe('Alpha');
    await command(page, 'redo');
    expect(await imageSource(page)).toBe(edited);
  });
}

test('image reload rotates resource generation in the same authorized document and Undo resolves the old source', async ({
  page,
}) => {
  const before = '![pixel](images/pixel.png)\n\nAfter',
    after = '![other](images/other.png)\n\nAfter';
  await createImageEditor(page, { source: before, context: 'doc-a' });
  await expectDecodedImage(page);
  await reload(page, after);
  await expectDecodedImage(page, 2);
  expect(await imageSource(page)).toBe(after);
  const records = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves);
  expect(records.every((record) => record.context === 'doc-a')).toBe(true);
  expect(records[0]?.aborted).toBe(true);
  await command(page, 'undo');
  expect(await imageSource(page)).toBe(before);
  await expectDecodedImage(page, 1);
  await command(page, 'redo');
  expect(await imageSource(page)).toBe(after);
  await expectDecodedImage(page, 2);
});

test('stale reload conditions cannot overwrite a newer edit', async ({ page }) => {
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
  const options = await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    return { expectedSource: await editor.flush(), expectedRevision: editor.revision };
  });
  await focusEnd(page);
  await page.keyboard.type('X');
  const error = await page.evaluate(async (options) => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.reloadFromDisk(
        'External',
        options,
      );
      return '';
    } catch (error) {
      return String(error);
    }
  }, options);
  expect(error).toContain('已保留当前稿件');
  expect(await imageSource(page)).toBe('AlphaX');
});

test('synthetic composition blocks reload without discarding the candidate-owned view', async ({
  page,
}) => {
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
  await focusEnd(page);
  const options = await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    return { expectedSource: await editor.flush(), expectedRevision: editor.revision };
  });
  await imageFrame(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }),
      ),
    );
  const error = await page.evaluate(async (options) => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.reloadFromDisk(
        'External',
        options,
      );
      return '';
    } catch (error) {
      return String(error);
    }
  }, options);
  expect(error).toMatch(/候选|编辑操作/);
  await imageFrame(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  await expect
    .poll(async () => {
      try {
        return await imageSource(page);
      } catch {
        return 'composing';
      }
    })
    .toBe('Alpha');
});

test('a reload message delayed after consent cannot overwrite real keyboard input', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    let intercept = true;
    window.addEventListener(
      'message',
      (event) => {
        if (
          intercept &&
          event.data?.kind === 'request' &&
          event.data.operation === 'reload-from-disk'
        ) {
          intercept = false;
          event.stopImmediatePropagation();
          Reflect.set(window, '__reloadHeld', event);
        }
      },
      true,
    );
  });
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
  await focusEnd(page);
  await page.evaluate(async () => {
    const target = window as ReloadWindow,
      editor = target.imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    const expectedSource = await editor.flush(),
      expectedRevision = editor.revision;
    target.reloadJob = { state: 'pending' };
    void editor.reloadFromDisk('External', { expectedSource, expectedRevision }).then(
      () => {
        target.reloadJob = { state: 'resolved' };
      },
      (error) => {
        target.reloadJob = { state: 'rejected', error: String(error) };
      },
    );
  });
  await expect
    .poll(() =>
      imageFrame(page)
        .locator('#write')
        .evaluate(() => Boolean(Reflect.get(window, '__reloadHeld'))),
    )
    .toBe(true);
  await page.keyboard.type('X');
  await expect(imageFrame(page).locator('#write')).toHaveText('AlphaX');
  await imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const event = Reflect.get(window, '__reloadHeld') as MessageEvent;
      window.dispatchEvent(
        new MessageEvent('message', {
          source: event.source,
          origin: event.origin,
          data: event.data,
        }),
      );
    });
  await expect
    .poll(() => page.evaluate(() => (window as ReloadWindow).reloadJob?.state))
    .toBe('rejected');
  expect(await imageSource(page)).toBe('AlphaX');
  expect(await page.evaluate(() => (window as ReloadWindow).reloadJob?.error)).toContain(
    '已保留当前稿件',
  );
});

for (const sourceMode of [false, true]) {
  test(`${sourceMode ? 'source' : 'WYSIWYG'} reload retains its original mode history after a mode switch`, async ({
    page,
  }) => {
    const before = 'Alpha\r\n\r\nEnd\n',
      after = 'Beta\n\nEnd\r\n';
    await createImageEditor(page, { source: before, context: 'doc-a' });
    if (sourceMode) await command(page, 'toggleSource');
    await reload(page, after);
    await command(page, 'toggleSource');
    if (!sourceMode) {
      // Source mode starts a separate empty CodeMirror history.
      await command(page, 'undo');
      expect(await imageSource(page)).toBe(after);
      await command(page, 'toggleSource');
    }
    await command(page, 'undo');
    expect(await imageSource(page)).toBe(before);
    await command(page, 'redo');
    expect(await imageSource(page)).toBe(after);
  });
  test(`${sourceMode ? 'source' : 'WYSIWYG'} background reload does not steal focus from the host`, async ({
    page,
  }) => {
    await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
    if (sourceMode) await command(page, 'toggleSource');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'host-focus-target';
      document.body.append(input);
      input.focus();
    });
    await reload(page, 'External');
    await expect(page.locator('#host-focus-target')).toBeFocused();
    expect(await imageSource(page)).toBe('External');
  });
}

test('late image completion from before reload cannot decorate the external version', async ({
  page,
}) => {
  await createImageEditor(page, {
    source: '![old](images/pixel.png)',
    context: 'doc-a',
    resolve: 'defer',
  });
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
    .toBe(1);
  await reload(page, '![new](images/other.png)');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.resolves.some(
          (call) => call.source === 'images/other.png',
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'));
  await expectDecodedImage(page, 2);
  expect(await imageSource(page)).toBe('![new](images/other.png)');
  expect(
    await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves[0]?.aborted),
  ).toBe(true);
});

test('the old document revision cannot authorize reload into a different document with identical text', async ({
  page,
}) => {
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
  const options = await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    return { expectedSource: await editor.flush(), expectedRevision: editor.revision };
  });
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.load('Alpha', {
      documentContext: 'doc-b',
    }),
  );
  const error = await page.evaluate(async (options) => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.reloadFromDisk(
        'External',
        options,
      );
      return '';
    } catch (error) {
      return String(error);
    }
  }, options);
  expect(error).toContain('已保留当前稿件');
  expect(await imageSource(page)).toBe('Alpha');
});

test('background reload with delayed images keeps host focus and emits no range errors', async ({
  page,
}) => {
  await createImageEditor(page, {
    source: '![old](images/pixel.png)',
    context: 'doc-a',
    resolve: 'defer',
  });
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'host-image-focus';
    document.body.append(input);
    input.focus();
  });
  await reload(page, '![new](images/other.png)');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.resolves.some(
          (call) => call.source === 'images/other.png',
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'));
  await expectDecodedImage(page, 2);
  await expect(page.locator('#host-image-focus')).toBeFocused();
  expect(await imageSource(page)).toBe('![new](images/other.png)');
});

test('focused image popup and zoom controls remain usable with the asynchronous range guard', async ({
  page,
}) => {
  const source = '![pixel](images/pixel.png)\n\nAfter';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  await imageFrame(page).locator('#write .md-image').click();
  await imageFrame(page)
    .locator('#write .md-image')
    .evaluate((element) => {
      const text = element.querySelector('.md-image-src-span')?.firstChild;
      if (!text) throw new Error('Missing image edit structure');
      const range = document.createRange();
      range.setStart(text, 1);
      range.collapse(true);
      const selected = getSelection();
      selected?.removeAllRanges();
      selected?.addRange(range);
    });
  await page.keyboard.press('ArrowRight');
  const restored = await imageFrame(page)
    .locator('#write .md-image')
    .evaluate((element) => {
      const image = element.querySelector('img');
      if (!image) throw new Error('Missing image');
      const editor = Reflect.get(window, 'editor') as {
        imgEdit: { afterUserInsertImage(image: HTMLImageElement): void };
      };
      const schedule = window.setTimeout;
      editor.imgEdit.afterUserInsertImage(image);
      return window.setTimeout === schedule;
    });
  expect(restored).toBe(true);
  const frame = imageFrame(page);
  await expect(frame.locator('#user-context-menu.show')).toBeVisible();
  await frame.locator('#user-context-menu [data-key="zoom-img"] a').hover();
  await expect(frame.locator('#zoom-img-menu.show')).toBeVisible();
  await frame.locator('#zoom-img-menu [data-factor="100%"] a').click();
  await expectDecodedImage(page);
  expect(await imageSource(page)).toContain('images/pixel.png');
});

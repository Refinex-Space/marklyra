import type { EditorView, Selection } from '@marklyra/editor-view';
import { test as base, expect, type Page } from '@playwright/test';

type PlaygroundWindow = Window & typeof globalThis & { playgroundEditor: EditorView };
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'Unexpected browser exceptions').toEqual([]);
    },
    { auto: true },
  ],
});

async function load(page: Page, source: string, selection?: Selection): Promise<void> {
  await page.evaluate(
    ({ source, selection }) => {
      const editor = (window as PlaygroundWindow).playgroundEditor;
      editor.load(source);
      editor.setSelection(selection ?? { anchor: 0, head: 0 });
      editor.focus();
    },
    { source, selection },
  );
}

async function state(page: Page) {
  return page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const selection = document.getSelection();
    return {
      markdown: editor.getMarkdown(),
      selection: editor.getSelection(),
      revision: editor.session.state.revision,
      domSelection: selection
        ? {
            anchorText: selection.anchorNode?.textContent,
            anchorOffset: selection.anchorOffset,
            focusText: selection.focusNode?.textContent,
            focusOffset: selection.focusOffset,
            text: selection.toString(),
          }
        : null,
      blocks: Array.from(editor.element.children).map((element) => ({
        text: element.textContent,
        active: (element as HTMLElement).dataset.active,
        markers: element.querySelectorAll('.tr-marker').length,
      })),
    };
  });
}

async function expectMarkdown(page: Page, expected: string): Promise<void> {
  await expect.poll(async () => (await state(page)).markdown).toBe(expected);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/portable.html');
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible();
  await page.waitForFunction(() => Boolean((window as Partial<PlaygroundWindow>).playgroundEditor));
});

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) {
    await testInfo.attach('portable-editor-state', {
      body: JSON.stringify(await state(page), null, 2),
      contentType: 'application/json',
    });
  }
});

test('no-edit source round-trip preserves BOM, mixed endings, YAML, whitespace, table and code', async ({
  page,
}) => {
  const source =
    '\uFEFF---\r\ntitle: "Exact"\n---\r\n\n# Heading  \r\n\n| a  | b |\n|:---|--:|\n| x  | y |\n\n3. three\r\n7. seven\r\n\n```js\n  const x = "😀";  \n```\n\n';
  await load(page, source);
  await expectMarkdown(page, source);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expectMarkdown(page, source);
});

test('keyboard local edit leaves all surrounding source bytes unchanged', async ({ page }) => {
  const source = '\uFEFF# Heading\r\n\r\nAlpha  \n\n| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n';
  const at = source.indexOf('Alpha') + 'Alpha'.length;
  await load(page, source, { anchor: at, head: at });
  await page.keyboard.type(' XYZ');
  await expectMarkdown(page, source.slice(0, at) + ' XYZ' + source.slice(at));
  expect((await state(page)).selection).toEqual({ anchor: at + 4, head: at + 4 });
});

test('hidden inline markers activate without shifting source caret mapping', async ({ page }) => {
  const source = '# Title\n\nA **bold** word.\n\nTail';
  const tail = source.indexOf('Tail');
  await load(page, source, { anchor: tail, head: tail });
  await expect(page.locator('.tr-editor strong')).toHaveText('bold');
  await expect(page.locator('.tr-editor strong').locator('..').locator('.tr-marker')).toHaveCount(
    0,
  );
  await page.locator('.tr-editor strong').click();
  await expect
    .poll(async () => {
      const head = (await state(page)).selection.head;
      return head >= source.indexOf('bold') && head <= source.indexOf('bold') + 4;
    })
    .toBe(true);
  const before = await state(page);
  expect(before.selection.head).toBeLessThanOrEqual(source.indexOf('bold') + 4);
  await expect(page.locator('.tr-block[data-active="true"] .tr-marker')).toHaveCount(2);
  const at = before.selection.head;
  await page.keyboard.type('X');
  await expectMarkdown(page, source.slice(0, at) + 'X' + source.slice(at));
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const at = editor.getMarkdown().indexOf('Tail');
    editor.setSelection({ anchor: at, head: at });
  });
  await expect(page.locator('.tr-editor strong').locator('..').locator('.tr-marker')).toHaveCount(
    0,
  );
});

test('keyboard heading conversion and paragraph split retain source and selection', async ({
  page,
}) => {
  await load(page, '');
  await page.keyboard.type('# Hello');
  await expect(page.locator('.tr-editor h1')).toContainText('Hello');
  await page.keyboard.press('Enter');
  await page.keyboard.type('World');
  await expectMarkdown(page, '# Hello\nWorld');
  expect((await state(page)).selection).toEqual({ anchor: 13, head: 13 });
});

test('Enter continues ordered lists and exits an empty bullet', async ({ page }) => {
  await load(page, '3. three', { anchor: 8, head: 8 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('four');
  await expectMarkdown(page, '3. three\n4. four');
  await load(page, '- item', { anchor: 6, head: 6 });
  await page.keyboard.press('Enter');
  await expectMarkdown(page, '- item\n- ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Outside');
  await expectMarkdown(page, '- item\nOutside');
});

test('Backspace deletes complete emoji graphemes and combining sequences', async ({ page }) => {
  const source = 'A👩‍💻e\u0301';
  await load(page, source, { anchor: source.length, head: source.length });
  await page.keyboard.press('Backspace');
  await expectMarkdown(page, 'A👩‍💻');
  await page.keyboard.press('Backspace');
  await expectMarkdown(page, 'A');
  expect((await state(page)).selection).toEqual({ anchor: 1, head: 1 });
});

test('real keyboard undo and redo restore typing content and caret', async ({ page }) => {
  await load(page, 'Alpha', { anchor: 5, head: 5 });
  await page.keyboard.type(' XYZ');
  await expectMarkdown(page, 'Alpha XYZ');
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, 'Alpha');
  expect((await state(page)).selection).toEqual({ anchor: 5, head: 5 });
  await page.keyboard.press('Control+Shift+z');
  await expectMarkdown(page, 'Alpha XYZ');
  expect((await state(page)).selection).toEqual({ anchor: 9, head: 9 });
});

test('reverse cross-block selection replaces exactly its source range and undoes', async ({
  page,
}) => {
  const source = 'Alpha\n\nBeta\n\nGamma';
  const from = 2;
  const to = source.indexOf('Beta') + 2;
  await load(page, source, { anchor: to, head: from });
  const selected = await state(page);
  expect(selected.selection).toEqual({ anchor: to, head: from });
  expect(selected.domSelection?.text).toContain('pha');
  expect(selected.domSelection?.text).toContain('Be');
  await page.keyboard.type('X');
  await expectMarkdown(page, source.slice(0, from) + 'X' + source.slice(to));
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, source);
  expect((await state(page)).selection).toEqual({ anchor: to, head: from });
});

test('synthetic plain-text paste uses clipboard text without evaluating HTML', async ({ page }) => {
  await load(page, 'Alpha', { anchor: 5, head: 5 });
  const paste = '\n# Pasted\n\n<img src=x onerror=alert(1)>\n中文 😀';
  await page.evaluate((text) => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const data = new DataTransfer();
    data.setData('text/plain', text);
    data.setData('text/html', '<script>throw new Error("HTML clipboard must stay inert")</script>');
    editor.element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, paste);
  await expectMarkdown(page, 'Alpha' + paste);
  await expect(page.locator('.tr-editor img, .tr-editor script')).toHaveCount(0);
});

test('synthetic composition gates rerender and commits one patch; NOT a system IME test', async ({
  page,
}) => {
  await load(page, 'Hello', { anchor: 5, head: 5 });
  const before = await state(page);
  const during = await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const block = editor.element.querySelector('[data-block]');
    if (!block) throw new Error('Missing composition block');
    editor.element.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
    );
    block.textContent = 'Hello中';
    const text = block.firstChild;
    if (!text) throw new Error('Missing composing text');
    document.getSelection()?.setBaseAndExtent(text, 6, text, 6);
    editor.element.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertCompositionText',
        data: '中',
        isComposing: true,
        bubbles: true,
      }),
    );
    let gated = false;
    try {
      editor.load('must not replace composition');
    } catch {
      gated = true;
    }
    return {
      source: editor.getMarkdown(),
      revision: editor.session.state.revision,
      gated,
      sameBlock: editor.element.contains(block),
      text: block.textContent,
    };
  });
  expect(during).toEqual({
    source: 'Hello',
    revision: before.revision,
    gated: true,
    sameBlock: true,
    text: 'Hello中',
  });
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    editor.element.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '中' }),
    );
    // Some WebViews deliver a final input in this same task, after compositionend.
    editor.element.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertText',
        data: '中',
        isComposing: false,
        bubbles: true,
      }),
    );
  });
  await expectMarkdown(page, 'Hello中');
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.selection).toEqual({ anchor: 6, head: 6 });
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, 'Hello');
});

test('inline markers follow only the nearby span within the same active paragraph', async ({
  page,
}) => {
  const source = 'A **first** middle **second** tail';
  const first = source.indexOf('first') + 2;
  const second = source.indexOf('second') + 3;
  const middle = source.indexOf('middle') + 3;
  const markerStates = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.tr-editor strong')).map((element) => ({
        text: element.textContent,
        before:
          element.previousSibling instanceof HTMLElement &&
          element.previousSibling.classList.contains('tr-marker'),
        after:
          element.nextSibling instanceof HTMLElement &&
          element.nextSibling.classList.contains('tr-marker'),
      })),
    );
  await load(page, source, { anchor: first, head: first });
  await expect.poll(markerStates).toEqual([
    { text: 'first', before: true, after: true },
    { text: 'second', before: false, after: false },
  ]);
  await page.evaluate((at) => {
    (window as PlaygroundWindow).playgroundEditor.setSelection({ anchor: at, head: at });
  }, middle);
  await expect(page.locator('.tr-block[data-active="true"]')).toHaveCount(1);
  await expect(page.locator('.tr-editor .tr-marker')).toHaveCount(0);
  await page.evaluate((at) => {
    (window as PlaygroundWindow).playgroundEditor.setSelection({ anchor: at, head: at });
  }, second);
  await expect.poll(markerStates).toEqual([
    { text: 'first', before: false, after: false },
    { text: 'second', before: true, after: true },
  ]);
  await expectMarkdown(page, source);
  await page.keyboard.type('X');
  await expectMarkdown(page, source.slice(0, second) + 'X' + source.slice(second));
});

test('synthetic composition after hidden strong and link syntax maps to the original source', async ({
  page,
}) => {
  const source = 'A **bold** [link](https://example.test) tail';
  await load(page, source, { anchor: source.length, head: source.length });
  await expect(page.locator('.tr-editor .tr-marker')).toHaveCount(0);
  const before = await state(page);
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const selection = document.getSelection();
    const node = selection?.focusNode;
    if (!(node instanceof Text)) throw new Error('Expected tail text selection');
    editor.element.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
    );
    node.appendData('中文');
    selection?.setBaseAndExtent(node, node.length, node, node.length);
    editor.element.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertCompositionText',
        data: '中文',
        isComposing: true,
        bubbles: true,
      }),
    );
    editor.element.dispatchEvent(
      new CompositionEvent('compositionend', { data: '中文', bubbles: true }),
    );
  });
  await expectMarkdown(page, source + '中文');
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.selection).toEqual({ anchor: source.length + 2, head: source.length + 2 });
  await expect(page.locator('.tr-editor strong')).toHaveText('bold');
  await expect(page.locator('.tr-editor a')).toHaveText('link');
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, source);
  expect((await state(page)).selection).toEqual({ anchor: source.length, head: source.length });
});

test('synthetic composition replaces emoji sharing a high surrogate without an invalid patch', async ({
  page,
}) => {
  const source = 'A😀Z';
  await load(page, source, { anchor: 1, head: 3 });
  const before = await state(page);
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const node = document.getSelection()?.focusNode;
    if (!(node instanceof Text)) throw new Error('Expected emoji text selection');
    editor.element.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
    );
    node.data = 'A😃Z';
    document.getSelection()?.setBaseAndExtent(node, 3, node, 3);
    editor.element.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertCompositionText',
        data: '😃',
        isComposing: true,
        bubbles: true,
      }),
    );
    editor.element.dispatchEvent(
      new CompositionEvent('compositionend', { data: '😃', bubbles: true }),
    );
  });
  await expectMarkdown(page, 'A😃Z');
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.selection).toEqual({ anchor: 3, head: 3 });
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, source);
  expect((await state(page)).selection).toEqual({ anchor: 1, head: 3 });
});

test('synthetic composition replaces a cross-block range while preserving later blocks', async ({
  page,
}) => {
  const source = 'Alpha\n\nBeta\n\nGamma';
  const selection = { anchor: 2, head: source.indexOf('Beta') + 2 };
  await load(page, source, selection);
  const before = await state(page);
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const blocks = Array.from(editor.element.children);
    const first = blocks.find((element) => element.textContent === 'Alpha');
    const last = blocks.find((element) => element.textContent === 'Beta');
    if (!first || !last) throw new Error('Missing cross-block composition endpoints');
    editor.element.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
    );
    // Model the browser merging the two touched blocks, leaving the Gamma block intact.
    first.textContent = 'Al中ta';
    let next = first.nextElementSibling;
    while (next) {
      const current = next;
      next = current.nextElementSibling;
      current.remove();
      if (current === last) break;
    }
    const text = first.firstChild;
    if (!text) throw new Error('Missing merged text node');
    document.getSelection()?.setBaseAndExtent(text, 3, text, 3);
    editor.element.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertCompositionText',
        data: '中',
        isComposing: true,
        bubbles: true,
      }),
    );
    editor.element.dispatchEvent(
      new CompositionEvent('compositionend', { data: '中', bubbles: true }),
    );
  });
  await expectMarkdown(page, 'Al中ta\n\nGamma');
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.selection).toEqual({ anchor: 3, head: 3 });
  await expect(page.locator('.tr-block').filter({ hasText: /^Gamma$/ })).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, source);
  expect((await state(page)).selection).toEqual(selection);
});

test('incremental projection retains untouched DOM blocks after inserting a paragraph', async ({
  page,
}) => {
  await load(page, 'Alpha\n\nBeta **bold**\n\nGamma', { anchor: 5, head: 5 });
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    Object.assign(window, {
      retainedBlock: editor.element.children[2],
      retainedText: editor.element.children[2]?.firstChild,
    });
  });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Inserted');
  await expectMarkdown(page, 'Alpha\n\nInserted\n\nBeta **bold**\n\nGamma');
  expect(
    await page.evaluate(() => {
      const editor = (window as PlaygroundWindow).playgroundEditor;
      const retained = window as typeof window & { retainedBlock: Element; retainedText: Node };
      const block = [...editor.element.children].find(
        (element) => element.textContent === 'Beta bold',
      );
      return block === retained.retainedBlock && block?.firstChild === retained.retainedText;
    }),
  ).toBe(true);
});

test('composition final commit after a microtask does not preserve preedit romanization', async ({
  page,
}) => {
  await load(page, '', { anchor: 0, head: 0 });
  await page.evaluate(async () => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const block = editor.element.querySelector<HTMLElement>('[data-block]');
    if (!block) throw new Error('Missing block');
    editor.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    block.textContent = 'zhong wen';
    editor.element.dispatchEvent(
      new InputEvent('input', {
        inputType: 'insertCompositionText',
        data: 'zhong wen',
        isComposing: true,
        bubbles: true,
      }),
    );
    editor.element.dispatchEvent(
      new CompositionEvent('compositionend', { data: '中文', bubbles: true }),
    );
    await Promise.resolve();
    block.textContent = '中文';
    editor.element.dispatchEvent(
      new InputEvent('input', { inputType: 'insertText', data: '中文', bubbles: true }),
    );
  });
  await expectMarkdown(page, '中文');
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveText('中文');
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, '');
});

for (const reverse of [false, true]) {
  test(`synthetic composition replaces selected source-only block separators (${reverse ? 'reverse' : 'forward'})`, async ({
    page,
  }) => {
    const source = 'A\n\nB';
    const selection = reverse ? { anchor: 3, head: 1 } : { anchor: 1, head: 3 };
    await load(page, source, selection);
    const before = await state(page);
    await page.evaluate(() => {
      const editor = (window as PlaygroundWindow).playgroundEditor;
      editor.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      // Selected newlines have zero textContent width, but are real source characters.
      editor.element.innerHTML = '<div>A中B</div>';
      const node = editor.element.firstElementChild?.firstChild;
      if (!node) throw new Error('Missing merged paragraph');
      document.getSelection()?.setBaseAndExtent(node, 2, node, 2);
      editor.element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          isComposing: true,
          inputType: 'insertCompositionText',
          data: '中',
        }),
      );
      editor.element.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: '中' }),
      );
    });
    await expectMarkdown(page, 'A中B');
    expect((await state(page)).revision).toBe(before.revision + 1);
    expect((await state(page)).selection).toEqual({ anchor: 2, head: 2 });
    await page.keyboard.press('Control+z');
    await expectMarkdown(page, source);
    expect((await state(page)).selection).toEqual(selection);
  });
}

test('native-style composition may replace its original block with a root Text node', async ({
  page,
}) => {
  await load(page, '', { anchor: 0, head: 0 });
  await page.evaluate(() => {
    const editor = (window as PlaygroundWindow).playgroundEditor;
    const block = editor.element.firstElementChild;
    if (!block) throw new Error('Missing block');
    editor.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    block.textContent = 'ni';
    editor.element.dispatchEvent(
      new InputEvent('input', {
        data: 'ni',
        inputType: 'insertCompositionText',
        isComposing: true,
        bubbles: true,
      }),
    );
    editor.element.replaceChildren(document.createTextNode('你'));
    editor.element.dispatchEvent(
      new InputEvent('input', { data: '你', inputType: 'insertFromComposition', bubbles: true }),
    );
    editor.element.dispatchEvent(
      new CompositionEvent('compositionend', { data: '你', bubbles: true }),
    );
  });
  await expectMarkdown(page, '你');
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveText('你');
  expect(
    await page.evaluate(() =>
      [...(window as PlaygroundWindow).playgroundEditor.element.childNodes].every(
        (node) => node.nodeType === Node.ELEMENT_NODE,
      ),
    ),
  ).toBe(true);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, '');
});

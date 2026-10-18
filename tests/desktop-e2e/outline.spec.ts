import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { waitForNativeUndo } from './native-menu.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

test('outline collapse, keyboard hierarchy and jump retain source bytes and editor instance', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const raw = '\uFEFF# Guide\r\n\r\n### Start\n\n## End\r\n\r\n# Appendix\n';
  await page.evaluate((text) => {
    (window as TestWindow).__desktopMock.nextDocument.text = text;
  }, raw);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await expect(page.locator('.format-toolbar')).toBeHidden();
  await page.getByRole('button', { name: '文档目录', exact: true }).click();
  const tree = page.getByRole('tree', { name: '文档标题' });
  await expect(page.locator('.outline-heading,.outline-heading-level')).toHaveCount(0);
  await expect(tree.getByRole('treeitem')).toHaveCount(4);
  const guide = tree.getByRole('treeitem', { name: 'Guide', exact: true });
  await guide.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(guide).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('treeitem', { name: 'Appendix', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(guide).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tree.getByRole('treeitem', { name: 'Start', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(guide).toBeFocused();
  await tree.getByRole('treeitem', { name: 'End', exact: true }).click();
  await expect(page.locator('.marklyra-editor-frame')).toBeFocused();
  // All four headings fit in this viewport. The original visible-heading
  // algorithm chooses the last visible heading, rather than the last click.
  await expect(tree.getByRole('treeitem', { name: 'Appendix', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe(raw);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await tree.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '全部折叠', exact: true }).click();
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await tree.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '全部展开', exact: true }).click();
  await expect(tree.getByRole('treeitem')).toHaveCount(4);
  // Outline navigation preserves caret. Explicitly edit this heading rather
  // than relying on the former sidebar bug to move the editing range here.
  await page
    .frameLocator('.marklyra-editor-frame')
    .getByRole('heading', { name: 'End', exact: true })
    .click();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('heading:0'));
  await expect(tree.getByRole('treeitem', { name: 'End', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(tree.getByRole('treeitem', { name: 'End', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe(raw);
  expect(errors).toEqual([]);
});

test('outline filter matches literal Unicode, navigates from its input and restores folds without replacing the editor', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  const raw =
    '\uFEFF# Parent\r\n\r\nBody e\u0301🙂  \n\n### 子级 [A].*🙂\r\n\r\nText\n\n## 子级 [B].*🙂\r\n\r\n# Tail\n';
  await page.evaluate((text) => {
    (window as TestWindow).__desktopMock.nextDocument.text = text;
  }, raw);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing original runtime');
  const body = frame.locator('#write > p').first();
  await expect(body).toHaveText('Body e\u0301🙂  ');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  const bodyText = await body.textContent();
  await body.click();
  await page.keyboard.type('X');
  await expect(body).not.toHaveText(bodyText ?? '');
  await waitForNativeUndo(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(body).toHaveText(bodyText ?? '');
  await frame.evaluate(() => {
    const editor = Reflect.get(window, 'editor') as {
      writingArea: HTMLElement;
      undo: { index: number; commandStack: unknown[] };
    };
    const body = editor.writingArea.querySelector('p');
    const text = body ? document.createTreeWalker(body, NodeFilter.SHOW_TEXT).nextNode() : null;
    if (!text || !text.textContent?.startsWith('Body')) throw Error('Missing body caret fixture');
    if (!editor.undo.commandStack.length)
      throw Error('Expected retained original Undo/Redo history');
    const selection = getSelection();
    selection?.setBaseAndExtent(text, 4, text, 0);
    Reflect.set(window, 'fixtureOutlineState', {
      root: editor.writingArea,
      nodes: [...editor.writingArea.children],
      anchor: selection?.anchorNode,
      head: selection?.focusNode,
      anchorOffset: selection?.anchorOffset,
      headOffset: selection?.focusOffset,
      index: editor.undo.index,
      history: JSON.stringify(editor.undo.commandStack),
    });
  });
  const invariant = () =>
    frame.evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        writingArea: HTMLElement;
        undo: { index: number; commandStack: unknown[] };
      };
      const before = Reflect.get(window, 'fixtureOutlineState') as {
        root: HTMLElement;
        nodes: Element[];
        anchor: Node;
        head: Node;
        anchorOffset: number;
        headOffset: number;
        index: number;
        history: string;
      };
      const selection = getSelection();
      return {
        root: editor.writingArea === before.root,
        nodes:
          before.nodes.length === editor.writingArea.children.length &&
          before.nodes.every((node, index) => editor.writingArea.children[index] === node),
        range:
          selection?.anchorNode === before.anchor &&
          selection.focusNode === before.head &&
          selection.anchorOffset === before.anchorOffset &&
          selection.focusOffset === before.headOffset,
        history:
          before.index === editor.undo.index &&
          before.history === JSON.stringify(editor.undo.commandStack),
      };
    });
  await page.getByRole('button', { name: '文档目录', exact: true }).click();
  const tree = page.getByRole('tree', { name: '文档标题' });
  await expect(tree.getByRole('treeitem')).toHaveCount(4);
  await page.getByRole('button', { name: '折叠 Parent', exact: true }).click();
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await tree.click({ button: 'right' });
  await page.getByRole('menuitemcheckbox', { name: '筛选', exact: true }).click();
  const input = page.getByRole('searchbox', { name: '筛选大纲' });
  await expect(input).toBeFocused();
  await input.fill('.*🙂');
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await expect(tree.locator('.outline-label strong')).toHaveText(['.*🙂', '.*🙂']);
  await expect(tree.locator('[aria-selected="true"]')).toHaveCount(0);
  expect(await invariant()).toEqual({ root: true, nodes: true, range: true, history: true });
  await input.press('ArrowDown');
  await expect(input).toBeFocused();
  const first = tree.getByRole('treeitem', { name: '子级 [A].*🙂', exact: true });
  const second = tree.getByRole('treeitem', { name: '子级 [B].*🙂', exact: true });
  await expect(first).toHaveAttribute('data-filter-selected', 'true');
  await input.press('ArrowDown');
  await expect(second).toHaveAttribute('data-filter-selected', 'true');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await second.getAttribute('id')) ?? '',
  );
  const composing = await input.evaluate((element) => {
    const events = [
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }),
    ];
    return events.map((event) => {
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(composing).toEqual([false, false]);
  await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(input).toBeFocused();
  expect(await invariant()).toEqual({ root: true, nodes: true, range: true, history: true });
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await input.fill('无结果😀');
  await expect(page.getByRole('status').filter({ hasText: '无匹配标题。' })).toBeVisible();
  await expect(tree.getByRole('treeitem')).toHaveCount(0);
  await input.press('ArrowDown');
  await expect(input).toBeFocused();
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await expect(tree.getByRole('treeitem', { name: 'Parent', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe(raw);
  expect(errors).toEqual([]);
});

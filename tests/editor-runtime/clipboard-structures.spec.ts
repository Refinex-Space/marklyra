import type { ClipboardContent, MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

import { settleMarkerClick } from './marker-selection.helpers.js';

type Host = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    structureClip: { content: ClipboardContent; writes: number; errors: string[] };
  };
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const source = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
const selection = (page: Page) =>
  frame(page)
    .locator('#write')
    .evaluate(() => {
      const selected = document.getSelection();
      const range = selected?.rangeCount ? selected.getRangeAt(0) : null;
      return {
        text: selected?.toString() ?? '',
        backward: Boolean(
          range &&
            !selected?.isCollapsed &&
            (selected?.anchorNode !== range.startContainer ||
              selected?.anchorOffset !== range.startOffset),
        ),
        anchor: selected?.anchorOffset,
        head: selected?.focusOffset,
      };
    });
async function mount(page: Page, markdown: string) {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing host');
    host.structureClip = { content: { text: '' }, writes: 0, errors: [] };
    host.marklyraEditor = new Constructor(root, {
      markdown,
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      onError: (error) => host.structureClip.errors.push(error.message),
      host: {
        clipboard: {
          async read() {
            return structuredClone(host.structureClip.content);
          },
          async write(content) {
            host.structureClip.content = structuredClone(content);
            host.structureClip.writes++;
          },
        },
      },
    });
    await host.marklyraEditor.ready;
  }, markdown);
}
async function openSelectionMenu(page: Page) {
  const point = await frame(page)
    .locator('#write')
    .evaluate((area) => {
      const range = document.getSelection()?.getRangeAt(0);
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      let rect: DOMRect | undefined;
      for (let text = walker.nextNode(); range && text; text = walker.nextNode()) {
        if (
          !text.textContent?.trim() ||
          text.parentElement?.closest('.md-meta,.md-content') ||
          !range.intersectsNode(text)
        )
          continue;
        const visible = document.createRange();
        visible.selectNodeContents(text);
        rect = [...visible.getClientRects()].find((rect) => rect.width > 2 && rect.height > 0);
        if (rect) break;
      }
      if (!rect) throw Error('Missing selected geometry');
      return { x: rect.x + Math.min(4, rect.width / 2), y: rect.y + rect.height / 2 };
    });
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing frame');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
}
const target = '\ufeffBefore\r\n\r\nTARGET\n\nTail  \r\n';
for (const kind of ['table', 'list', 'tasks'] as const)
  for (const reverse of [false, true]) {
    test(`structured ${kind} copy/paste retains metadata and history (${reverse ? 'reverse' : 'forward'})`, async ({
      page,
    }, info) => {
      const initial =
        kind === 'table'
          ? '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n'
          : kind === 'list'
            ? '9. alpha\n   - nested\n10. beta\n'
            : '- [x] done\n- [ ] todo\n';
      await mount(page, initial);
      if (kind === 'table') {
        await frame(page).locator('#write tbody td').first().click();
        await frame(page).locator('#write tbody td').first().click({ button: 'right' });
        await page.getByRole('menuitem', { name: /^表格/u }).hover();
        await page.getByRole('menuitem', { name: '复制表格', exact: true }).click();
      } else {
        await frame(page)
          .locator(kind === 'tasks' ? '#write ul' : '#write ol')
          .first()
          .evaluate((list, reverse) => {
            const parent = list.parentNode;
            if (!parent) throw Error('Missing list owner');
            const at = [...parent.childNodes].indexOf(list);
            (document.getElementById('write') as HTMLElement).focus();
            document
              .getSelection()
              ?.setBaseAndExtent(parent, reverse ? at + 1 : at, parent, reverse ? at : at + 1);
          }, reverse);
        if (kind === 'tasks') {
          // Synthetic DOM copy producer + explicit memory transport; no claim
          // about a trusted OS copy gesture or the task-list context menu.
          const content = await frame(page)
            .locator('#write')
            .evaluate((area) => {
              const data = new DataTransfer();
              area.dispatchEvent(
                new ClipboardEvent('copy', {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: data,
                }),
              );
              return {
                text: data.getData('text/plain'),
                html: data.getData('text/html'),
                markHtml: data.getData('text/markhtml'),
              };
            });
          expect(content.markHtml).toContain('md-task-list-item');
          await page.evaluate((content) => {
            (window as Host).structureClip.content = content;
            (window as Host).structureClip.writes++;
          }, content);
        } else {
          await openSelectionMenu(page);
          await expect(page.getByRole('menuitem', { name: '复制', exact: true })).toBeEnabled();
          await page.getByRole('menuitem', { name: '复制', exact: true }).click();
        }
      }
      await expect.poll(() => page.evaluate(() => (window as Host).structureClip.writes)).toBe(1);
      expect(await source(page)).toBe(initial);
      const clipboard = await page.evaluate(() => (window as Host).structureClip.content);
      await info.attach('structured-flavors', {
        body: JSON.stringify(clipboard),
        contentType: 'application/json',
      });
      await page.evaluate((target) => (window as Host).marklyraEditor.load(target), target);
      await settleMarkerClick(page);
      await frame(page)
        .locator('#write > p')
        .nth(1)
        .evaluate((element, reverse) => {
          const text = element.querySelector('[md-inline="plain"]')?.firstChild;
          if (text?.textContent !== 'TARGET') throw Error('Missing target');
          document.getSelection()?.setBaseAndExtent(text, reverse ? 6 : 0, text, reverse ? 0 : 6);
        }, reverse);
      const targetSelection = await selection(page);
      expect(targetSelection.text).toBe('TARGET');
      expect(targetSelection.backward).toBe(reverse);
      await openSelectionMenu(page);
      await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
      await expect.poll(() => source(page)).not.toBe(target);
      const pasted = await source(page);
      expect(pasted.startsWith('\ufeffBefore\r\n\r\n')).toBe(true);
      expect(pasted.endsWith('\n\nTail  \r\n')).toBe(true);
      if (kind === 'table') {
        await expect(frame(page).locator('#write table')).toHaveCount(1);
        await expect(frame(page).locator('#write th')).toHaveCount(3);
        const delimiter = pasted.split(/\r?\n/u).find((line) => /^\|\s*:?-+/u.test(line));
        expect(
          delimiter
            ?.split('|')
            .slice(1, -1)
            .map((cell) => ({
              left: cell.trim().startsWith(':'),
              right: cell.trim().endsWith(':'),
            })),
        ).toEqual([
          { left: true, right: false },
          { left: true, right: true },
          { left: false, right: true },
        ]);
      } else if (kind === 'list') {
        await expect(frame(page).locator('#write ol').first()).toHaveAttribute('start', '9');
        await expect(frame(page).locator('#write ol ul')).toHaveCount(1);
        expect(pasted).toMatch(/9\.\s+alpha/u);
        expect(pasted).toMatch(/10\.\s+beta/u);
      } else {
        expect(pasted).toContain('- [x] done');
        expect(pasted).toContain('- [ ] todo');
      }
      await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'undo' }));
      expect(await source(page)).toBe(target);
      const undoSelection = await selection(page);
      await page.evaluate(() => (window as Host).marklyraEditor.execute({ type: 'redo' }));
      expect(await source(page)).toBe(pasted);
      await info.attach('structured-source-and-selection', {
        body: JSON.stringify({
          kind,
          sourceSelection:
            kind === 'table'
              ? 'whole-table command'
              : reverse
                ? 'reverse whole-list input'
                : 'forward whole-list input',
          target,
          targetSelection,
          pasted,
          undoSelection,
          redoSelection: await selection(page),
          osClipboard: false,
        }),
        contentType: 'application/json',
      });
      expect(await page.evaluate(() => (window as Host).structureClip.errors)).toEqual([]);
    });
  }

import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import type {
  LegacyEditor,
  LegacyGlobals,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

test.beforeEach(async ({ page }) => {
  const baseline = process.env.ADVANCED_BASELINE_MAIN;
  if (baseline)
    await page.route('http://127.0.0.1:4174/appsrc/main.js', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: await readFile(baseline),
      }),
    );
});
for (const controlled of [false, true])
  for (const route of ['load', 'reload'] as const)
    if (controlled || route === 'load')
      test(`HTML Enter callback cannot edit replacement through ${route}, controlled=${controlled}`, async ({
        page,
      }, info) => {
        const old = '<div>Old <b>HTML</b></div>\n\nTail\n',
          next = '\ufeff---\r\ntitle: NEW\n---\r\n\r\nNewTail  \r\n';
        await mountAdvanced(page, old);
        const frame = advancedFrame(page);
        await frame.locator('#write [mdtype="html_block"]').click({ button: 'right' });
        await page.getByRole('menuitem', { name: '编辑块', exact: true }).click();
        await expect(frame.locator('#write [mdtype="html_block"] .CodeMirror')).toBeVisible();
        await frame.locator('#write [mdtype="html_block"] .CodeMirror').evaluate((wrapper) => {
          const cm = Reflect.get(wrapper, 'CodeMirror') as NonNullable<
            LegacyEditor['sourceView']['cm']
          >;
          const value = cm.getValue(),
            lines = value.split('\n');
          cm.focus();
          cm.setCursor({ line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 });
        });
        if (controlled)
          await frame.locator('#write').evaluate(() => {
            const schedule = window.setTimeout,
              runtime = window as unknown as LegacyGlobals,
              cm = runtime.editor?.htmlBlock?.currentCm,
              callbacks: (() => unknown)[] = [];
            Reflect.set(window, 'fixtureHeldHTML', {
              callbacks,
              restore: () => {
                window.setTimeout = schedule;
              },
            });
            window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
              if (
                timeout === 20 &&
                typeof handler === 'function' &&
                callbacks.length === 0 &&
                runtime.editor?.htmlBlock?.currentCm === cm
              ) {
                callbacks.push(() => Reflect.apply(handler, window, args));
                return schedule(() => {}, 0);
              }
              return schedule(handler, timeout, ...args);
            }) as typeof window.setTimeout;
          });
        await page.keyboard.press('Enter');
        if (controlled)
          expect(
            await frame.locator('#write').evaluate(() => {
              const held = Reflect.get(window, 'fixtureHeldHTML') as {
                callbacks: unknown[];
                restore(): void;
              };
              held.restore();
              return held.callbacks.length;
            }),
          ).toBe(1);
        await page.evaluate(
          async ({ route, next }) => {
            const editor = (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor;
            if (route === 'load') await editor.load(next);
            else {
              const expectedSource = await editor.flush();
              await editor.reloadFromDisk(next, {
                expectedSource,
                expectedRevision: editor.revision,
              });
            }
          },
          { route, next },
        );
        const immediate = await advancedSource(page);
        if (controlled)
          await frame.locator('#write').evaluate(() => {
            const held = Reflect.get(window, 'fixtureHeldHTML') as { callbacks: (() => unknown)[] };
            for (const callback of held.callbacks.splice(0)) callback();
          });
        await frame
          .locator('#write')
          .evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 180)));
        const later = await advancedSource(page);
        const identity = await frame.locator('#write').evaluate(() => {
          const editor = (window as unknown as LegacyGlobals).editor;
          return {
            selection: editor?.selection.buildUndo(),
            index: editor?.undo.index,
            history: editor?.undo.commandStack.length,
          };
        });
        await info.attach('html-load-boundary', {
          body: JSON.stringify({ old, next, immediate, later, identity }, null, 2),
          contentType: 'application/json',
        });
        expect(immediate).toBe(next);
        expect(later).toBe(next);
        expect(await advancedErrors(page)).toEqual([]);
      });

test('ordinary closed HTML Enter still inserts its next paragraph and retains input history', async ({
  page,
}, info) => {
  const html = '<div>Old <b>HTML</b></div>',
    source = html + '\n\nTail\n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page);
  await frame.locator('#write [mdtype="html_block"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '编辑块', exact: true }).click();
  await frame.locator('#write [mdtype="html_block"] .CodeMirror').evaluate((wrapper) => {
    const cm = Reflect.get(wrapper, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']>;
    cm.focus();
    cm.setCursor({ line: 0, ch: cm.getValue().length });
  });
  await page.keyboard.press('Enter');
  await expect.poll(() => advancedSource(page)).toBe(html + '\n\n\n\nTail\n');
  const focusSnapshot = () =>
    frame.locator('#write').evaluate(() => {
      const selection = getSelection(),
        editor = (window as unknown as LegacyGlobals).editor,
        active = document.activeElement,
        anchor = selection?.anchorNode,
        cm = editor?.htmlBlock?.currentCm,
        getValue = cm && Reflect.get(cm, 'getValue');
      return {
        active: { tag: active?.tagName, class: active?.className, connected: active?.isConnected },
        selection: {
          node: anchor?.nodeName,
          text: anchor?.textContent,
          offset: selection?.anchorOffset,
          cid: (anchor?.nodeType === 1 ? (anchor as Element) : anchor?.parentElement)
            ?.closest('[cid]')
            ?.getAttribute('cid'),
          parent: anchor?.parentElement?.outerHTML.slice(0, 600),
        },
        bookmark: editor?.selection.buildUndo(),
        cmValue: typeof getValue === 'function' ? Reflect.apply(getValue, cm, []) : null,
      };
    });
  const beforeTyping = await focusSnapshot();
  await page.keyboard.type('Z');
  await info.attach('html-next-input-focus', {
    body: JSON.stringify(
      {
        beforeTyping,
        afterTyping: await focusSnapshot(),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await expect.poll(() => advancedSource(page)).toBe(html + '\n\nZ\n\nTail\n');
  expect(await advancedErrors(page)).toEqual([]);
});

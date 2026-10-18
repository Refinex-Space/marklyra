import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { browserContextMenu } from '../../packages/editor-runtime/src/context-menu/browser.js';
import type { ContextAction } from '../../packages/editor-runtime/src/context-menu/contracts.js';

type Host = Window & { menuResult: (ContextAction | null)[]; menuAbort: AbortController };
async function open(page: import('@playwright/test').Page) {
  await page.goto('/portable.html');
  const module = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/context-menu/browser.ts', import.meta.url))}`;
  await page.evaluate(async (module) => {
    const { browserContextMenu: create } = (await import(module)) as {
      browserContextMenu: typeof browserContextMenu;
    };
    const button = document.createElement('button');
    button.id = 'menu-origin';
    button.textContent = 'Origin';
    document.body.append(button);
    button.focus();
    const host = window as unknown as Host;
    host.menuResult = [];
    host.menuAbort = new AbortController();
    create(document).show(
      {
        requestId: 'browser-menu',
        point: { x: innerWidth - 2, y: innerHeight - 2 },
        items: [
          { type: 'item', actionId: 'edit.cut', label: 'Disabled cut', enabled: false },
          { type: 'item', actionId: 'edit.copy', label: 'Copy selection', enabled: true },
          { type: 'separator' },
          {
            type: 'submenu',
            label: 'Table operations',
            items: [
              { type: 'item', actionId: 'table.delete', label: 'Disabled delete', enabled: false },
              { type: 'item', actionId: 'table.copy', label: 'Copy table', enabled: true },
            ],
          },
        ],
      },
      (action) => host.menuResult.push(action),
      host.menuAbort.signal,
    );
  }, module);
}
test('keyboard menu navigation skips disabled actions and executes nested selection once', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('menuitem', { name: 'Copy selection' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Table operations' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: 'Copy table' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Host).menuResult)).toEqual(['table.copy']);
});
test('Escape cancels and restores the previous focus without an action', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-origin')).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Host).menuResult)).toEqual([null]);
});
test('all menu panels are clamped to the viewport, with parent navigation', async ({ page }) => {
  await open(page);
  await page.getByRole('menuitem', { name: 'Table operations' }).hover();
  await expect(page.getByRole('menu')).toHaveCount(2);
  const rects = await page.getByRole('menu').evaluateAll((menus) =>
    menus.map((menu) => {
      const rect = menu.getBoundingClientRect();
      return {
        inView:
          rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      };
    }),
  );
  expect(rects.every((rect) => rect.inView)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menu')).toHaveCount(1);
  await expect(page.getByRole('menuitem', { name: 'Table operations' })).toBeFocused();
});
test('abort removes DOM and no late event invokes the action callback', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)');
    (window as unknown as Host).menuAbort.abort();
    button?.click();
  });
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Host).menuResult)).toEqual([]);
});
test('synchronous abort from focus transfer does not leave a clickable menu', async ({ page }) => {
  await page.goto('/portable.html');
  const module = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/context-menu/browser.ts', import.meta.url))}`;
  const result = await page.evaluate(async (module) => {
    const { browserContextMenu: create } = (await import(module)) as {
      browserContextMenu: typeof browserContextMenu;
    };
    const origin = document.createElement('button');
    origin.textContent = 'Origin';
    document.body.append(origin);
    origin.focus();
    const abort = new AbortController(),
      actions: (ContextAction | null)[] = [];
    origin.addEventListener('blur', () => abort.abort(), { once: true });
    create(document).show(
      {
        requestId: 'focus-abort',
        point: { x: 20, y: 20 },
        items: [{ type: 'item', actionId: 'edit.copy', label: 'Copy', enabled: true }],
      },
      (action) => actions.push(action),
      abort.signal,
    );
    document.querySelector<HTMLButtonElement>('[role=menuitem]')?.click();
    return {
      aborted: abort.signal.aborted,
      menus: document.querySelectorAll('[role=menu]').length,
      actions,
    };
  }, module);
  expect(result).toEqual({ aborted: true, menus: 0, actions: [] });
});

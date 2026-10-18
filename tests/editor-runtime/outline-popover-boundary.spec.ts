import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import type { RuntimeOutlinePopover } from '../../packages/editor-runtime/src/runtime/outline-popover.js';

type Host = Window & {
  outlineBoundary: {
    popover: RuntimeOutlinePopover;
    composing: boolean;
    events: boolean[];
    errors: string[];
    pins: number;
    legacyPins: number;
  };
};

test.beforeEach(async ({ page }) => {
  // This is a UI-only boundary double. The Playground's asynchronous editor
  // autofocus must not compete with the owned candidate used by this fixture.
  await page.route('**/outline-boundary-fixture.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/outline-boundary-fixture.html');
  const module = `/@fs${fileURLToPath(
    new URL('../../packages/editor-runtime/src/runtime/outline-popover.ts', import.meta.url),
  )}`;
  await page.evaluate(async (url) => {
    const { RuntimeOutlinePopover: Constructor } = (await import(url)) as {
      RuntimeOutlinePopover: typeof RuntimeOutlinePopover;
    };
    const candidate = document.createElement('div');
    candidate.id = 'outline-boundary-candidate';
    candidate.contentEditable = 'true';
    candidate.textContent = '候选 zhong';
    candidate.style.cssText = 'position:fixed;top:120px;left:10px;z-index:99999';
    const popup = document.createElement('div');
    popup.id = 'toc-dropmenu';
    popup.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999';
    const pin = document.createElement('button');
    pin.id = 'pin-outline-btn';
    pin.textContent = 'Pin';
    popup.append(pin);
    document.body.append(candidate, popup);
    const original = {
      toggleOutline: () => popup.classList.toggle('open'),
      hideOutline: () => popup.classList.remove('open'),
    };
    const state = {
      composing: true,
      events: [] as boolean[],
      errors: [] as string[],
      pins: 0,
      legacyPins: 0,
    };
    const popover = new Constructor({
      runtime: { editor: { library: { outline: original } } } as unknown as LegacyGlobals,
      composing: () => state.composing,
      onChange: (open) => state.events.push(open),
      onPin: () => state.pins++,
      onError: (error) => state.errors.push(error.message),
    });
    (window as unknown as Host).outlineBoundary = Object.assign(state, { popover });
    document.addEventListener('click', (event) => {
      if (event.target === pin) state.legacyPins++;
    });
    candidate.focus();
    const text = candidate.firstChild;
    if (!text) throw Error('Missing candidate');
    getSelection()?.setBaseAndExtent(text, 3, text, 8);
    popover.install();
    popover.toggle();
  }, module);
});

test('UI-only toggling preserves candidate focus and observes original external close', async ({
  page,
}) => {
  expect(
    await page.evaluate(() => ({
      active: document.activeElement?.id,
      selection: getSelection()?.toString(),
      events: (window as unknown as Host).outlineBoundary.events,
    })),
  ).toEqual({ active: 'outline-boundary-candidate', selection: 'zhong', events: [true] });
  await page.evaluate(() => document.getElementById('toc-dropmenu')?.classList.remove('open'));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).outlineBoundary.events))
    .toEqual([true, false]);
  await expect(page.locator('#toc-dropmenu')).toHaveAttribute('aria-hidden', 'true');
});

test('pin protects composition, blocks the hidden sidebar, and cleanup removes capture handlers', async ({
  page,
}) => {
  await page.locator('#pin-outline-btn').click();
  expect(
    await page.evaluate(() => {
      const state = (window as unknown as Host).outlineBoundary;
      return {
        pins: state.pins,
        legacyPins: state.legacyPins,
        errors: state.errors,
        open: document.getElementById('toc-dropmenu')?.classList.contains('open'),
        active: document.activeElement?.id,
        selection: getSelection()?.toString(),
      };
    }),
  ).toEqual({
    pins: 0,
    legacyPins: 0,
    errors: ['请先完成输入法候选'],
    open: true,
    active: 'outline-boundary-candidate',
    selection: 'zhong',
  });
  await page.evaluate(() => {
    (window as unknown as Host).outlineBoundary.composing = false;
  });
  await page.locator('#pin-outline-btn').click();
  expect(
    await page.evaluate(() => {
      const state = (window as unknown as Host).outlineBoundary;
      return { pins: state.pins, legacyPins: state.legacyPins, events: state.events };
    }),
  ).toEqual({ pins: 1, legacyPins: 0, events: [true, false] });
  await page.evaluate(() => {
    const state = (window as unknown as Host).outlineBoundary;
    state.popover.destroy();
    state.popover.destroy();
    document.getElementById('toc-dropmenu')?.classList.add('open');
  });
  await page.locator('#pin-outline-btn').click();
  expect(
    await page.evaluate(() => {
      const state = (window as unknown as Host).outlineBoundary;
      return { pins: state.pins, legacyPins: state.legacyPins, events: state.events };
    }),
  ).toEqual({ pins: 1, legacyPins: 1, events: [true, false] });
});

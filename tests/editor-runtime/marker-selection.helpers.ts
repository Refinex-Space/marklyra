import { expect, type Page } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type MarkerWindow = Window & {
  editor: LegacyEditor & { brush: { willExpandSoon?: number | null } };
  markerClickTasks: { scheduled: number; completed: number; cancelled: number };
};

/** Activate the paragraph before choosing a range and measuring a right-click.
 * Its initial marker expansion moves the text. Observe the real click callback. */
export async function settleMarkerClick(page: Page): Promise<void> {
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('body').evaluate(() => {
    const runtime = window as unknown as MarkerWindow;
    const tasks = { scheduled: 0, completed: 0, cancelled: 0 };
    runtime.markerClickTasks = tasks;
    const original = window.setTimeout.bind(window);
    const clear = window.clearTimeout.bind(window);
    const pending = new Set<number>();
    window.clearTimeout = (handle?: Parameters<typeof window.clearTimeout>[0]) => {
      if (typeof handle === 'number' && pending.delete(handle)) tasks.cancelled++;
      clear(handle);
    };
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay !== 180 || typeof handler !== 'function') return original(handler, delay, ...args);
      tasks.scheduled++;
      const handle = original(() => {
        pending.delete(handle);
        try {
          Reflect.apply(handler, window, args);
        } finally {
          tasks.completed++;
        }
      }, delay);
      pending.add(handle);
      return handle;
    }) as typeof window.setTimeout;
  });
  // Clicking the link itself opens the original link editor. Use plain Alpha.
  await frame.locator('#write > p > [md-inline="plain"]').first().click();
  await settleMarkerClickTasks(page);
}

/** Observe callbacks from later trusted clicks after the initial activation. */
export async function settleMarkerClickTasks(page: Page): Promise<void> {
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect
    .poll(() =>
      frame.locator('body').evaluate(() => {
        const runtime = window as unknown as MarkerWindow;
        return (
          runtime.markerClickTasks.scheduled > 0 &&
          runtime.markerClickTasks.completed + runtime.markerClickTasks.cancelled ===
            runtime.markerClickTasks.scheduled &&
          !runtime.editor.brush.willExpandSoon
        );
      }),
    )
    .toBe(true);
}

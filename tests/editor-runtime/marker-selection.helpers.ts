import { expect, type Page } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type MarkerWindow = Window & {
  editor: LegacyEditor & { brush: { willExpandSoon?: number | null } };
  markerClickTasks: { scheduled: number; completed: number };
};

/** Activate the paragraph before choosing a range and measuring a right-click.
 * Its initial marker expansion moves the text. Observe the real click callback. */
export async function settleMarkerClick(page: Page): Promise<void> {
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('body').evaluate(() => {
    const runtime = window as unknown as MarkerWindow;
    const tasks = { scheduled: 0, completed: 0 };
    runtime.markerClickTasks = tasks;
    const original = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay !== 180 || typeof handler !== 'function') return original(handler, delay, ...args);
      tasks.scheduled++;
      return original(() => {
        try {
          Reflect.apply(handler, window, args);
        } finally {
          tasks.completed++;
        }
      }, delay);
    }) as typeof window.setTimeout;
  });
  // Clicking the link itself opens the original link editor. Use plain Alpha.
  await frame.locator('#write > p > [md-inline="plain"]').first().click();
  await expect
    .poll(() =>
      frame.locator('body').evaluate(() => {
        const runtime = window as unknown as MarkerWindow;
        return (
          runtime.markerClickTasks.scheduled > 0 &&
          runtime.markerClickTasks.completed === runtime.markerClickTasks.scheduled &&
          !runtime.editor.brush.willExpandSoon
        );
      }),
    )
    .toBe(true);
}

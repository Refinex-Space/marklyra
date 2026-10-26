import { expect, test } from '@playwright/test';
import { installMock } from './desktop.helpers.js';

// The native-chrome editor frame is a viewport wide and moves over the side panels only once the
// runtime is ready; the window must not show a horizontal scrollbar while that happens.
for (const titlebar of ['web', 'appkit'] as const) {
  test(`${titlebar} startup never overflows the window horizontally`, async ({ page }) => {
    await page.addInitScript(installMock, { label: 'main', nativeChrome: true, titlebar });
    await page.addInitScript(() => {
      const overflowing: string[] = [];
      (window as unknown as { __overflowing: string[] }).__overflowing = overflowing;
      let frames = 0;
      const tick = () => {
        frames += 1;
        const root = document.documentElement;
        if (root.scrollWidth > root.clientWidth || document.body.scrollWidth > root.clientWidth)
          overflowing.push(`frame ${frames}: ${root.scrollWidth} > ${root.clientWidth}`);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.setViewportSize({ width: 1180, height: 800 });
    await page.goto('/');
    await expect(page.locator('.marklyra-editor-frame')).toBeVisible();
    await expect
      .poll(() => page.locator('.marklyra-editor-frame').evaluate((e) => e.style.marginLeft))
      .not.toBe('');
    await page.waitForTimeout(1500);
    expect(
      await page.evaluate(() => (window as unknown as { __overflowing: string[] }).__overflowing),
    ).toEqual([]);
  });
}

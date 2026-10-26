import { expect, type Locator, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const rootMenu = (page: Page) => page.getByRole('menu', { name: '目录操作', exact: true });
const submenu = (page: Page) => page.getByRole('menu', { name: '视图与排序', exact: true });
const trigger = (page: Page) => page.getByRole('button', { name: '目录菜单', exact: true });
const viewItem = (page: Page) => rootMenu(page).getByRole('menuitem', { name: /视图与排序/ });
async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw Error('Missing menu geometry');
  return rect;
}
async function boot(page: Page, platform: 'macos' | 'windows', theme: string, empty = false) {
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: platform === 'windows' ? ('web' as const) : ('appkit' as const),
  });
  await page.addInitScript(installRecoveryMock);
  if (!empty)
    await page.addInitScript(installCreationMock, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
    });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(
    (theme) => (window as TestWindow).__desktopMock.emitMenu(`theme:${theme}`),
    theme,
  );
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', theme);
  await trigger(page).click();
}
for (const platform of ['macos', 'windows'] as const)
  for (const theme of ['marklyra-light', 'marklyra-dark']) {
    test(`${platform}/${theme}: creation has one entry and the aligned menu owns one keyboard submenu`, async ({
      page,
    }, info) => {
      await boot(page, platform, theme);
      await expect(rootMenu(page).getByRole('menuitem', { name: /新建/ })).toHaveCount(0);
      const parent = await rootMenu(page).elementHandle();
      const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
      const alignment = await rootMenu(page).evaluate((element) => {
        const item = element.querySelector('[aria-haspopup="menu"]');
        const recent = element.querySelector('.directory-location-open');
        if (!item || !recent) throw Error('Missing menu rows');
        const icon = item.querySelector('.ui-icon')?.getBoundingClientRect();
        const recentIcon = recent.querySelector('.workspace-glyph')?.getBoundingClientRect();
        const label = recent.querySelector('.directory-location-name')?.getBoundingClientRect();
        const text = [...item.childNodes].find(
          (node) => node.nodeType === 3 && node.textContent?.trim(),
        );
        if (!icon || !recentIcon || !label || !text) throw Error('Missing alignment anchors');
        const range = document.createRange();
        range.selectNodeContents(text);
        return {
          icons: Math.abs(icon.left - recentIcon.left),
          labels: Math.abs(range.getBoundingClientRect().left - label.left),
        };
      });
      expect(alignment.icons).toBeLessThan(1);
      expect(alignment.labels).toBeLessThan(1);
      await viewItem(page).focus();
      await page.keyboard.press('ArrowRight');
      await expect(submenu(page)).toBeVisible();
      await expect(
        submenu(page).getByRole('menuitemradio', { name: '文件树', exact: true }),
      ).toBeFocused();
      await expect(rootMenu(page)).toBeVisible();
      expect(await parent?.evaluate((el) => el.isConnected)).toBe(true);
      const main = await box(rootMenu(page)),
        child = await box(submenu(page));
      expect(child.x).toBeGreaterThanOrEqual(main.x + main.width);
      await page.keyboard.press('End');
      await expect(submenu(page).getByRole('menuitemcheckbox')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(submenu(page)).toHaveCount(0);
      await expect(viewItem(page)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(submenu(page)).toBeVisible();
      await submenu(page).getByRole('menuitemradio', { name: '名称', exact: true }).click();
      await submenu(page).getByRole('menuitemradio', { name: '降序', exact: true }).click();
      await expect(
        submenu(page).getByRole('menuitemradio', { name: '降序', exact: true }),
      ).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: info.outputPath('side-submenu.png') });
      await page.keyboard.press('Escape');
      await expect(submenu(page)).toHaveCount(0);
      await expect(viewItem(page)).toBeFocused();
      await expect(rootMenu(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(rootMenu(page)).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
      await page.getByRole('button', { name: '新建', exact: true }).press('ArrowUp');
      await expect(page.getByRole('menuitem', { name: '新建文件夹', exact: true })).toBeFocused();
      await expect(
        page.getByRole('menu', { name: '新建', exact: true }).getByRole('menuitem'),
      ).toHaveText(['新建文档', '新建文件夹']);
      await page.keyboard.press('Escape');
      await trigger(page).press('ArrowUp');
      await expect(
        rootMenu(page).getByRole('menuitem', { name: '关闭文件夹', exact: true }),
      ).toBeFocused();
      expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
    });
    test(`${platform}/${theme}: pointer crossing, delayed dismissal and left-edge fallback keep menus usable`, async ({
      page,
    }) => {
      await boot(page, platform, theme);
      await viewItem(page).hover();
      await expect(submenu(page)).toBeVisible();
      const item = await box(viewItem(page)),
        child = await box(submenu(page));
      await page.mouse.move(item.x + item.width - 2, item.y + item.height / 2);
      await page.mouse.move(child.x + 12, child.y + 18, { steps: 10 });
      await page.waitForTimeout(350); // Longer than pointer-leave grace; entering the child cancels it.
      await expect(submenu(page)).toBeVisible();
      await rootMenu(page).getByRole('menuitem', { name: '打开文件夹…', exact: true }).hover();
      await expect(submenu(page)).toHaveCount(0);
      await viewItem(page).hover();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250); // An expired hover-open timer must not reopen a closed root.
      await expect(rootMenu(page)).toHaveCount(0);
      await expect(submenu(page)).toHaveCount(0);
      await page.getByRole('separator', { name: '调整侧栏宽度' }).press('End');
      const button = await box(trigger(page));
      await trigger(page).click({
        button: 'right',
        position: { x: button.width - 3, y: button.height / 2 },
      });
      await viewItem(page).click();
      await expect(submenu(page)).toBeVisible();
      const right = await box(rootMenu(page)),
        left = await box(submenu(page));
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      await page.setViewportSize({ width: 650, height: 400 });
      await expect
        .poll(() =>
          submenu(page).evaluate((el) => {
            const b = el.getBoundingClientRect();
            return b.x >= 8 && b.y >= 8 && b.right <= innerWidth - 8 && b.bottom <= innerHeight - 8;
          }),
        )
        .toBe(true);
      await submenu(page).getByRole('menuitemcheckbox').click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(trigger(page)).toBeFocused();
    });
  }

for (const platform of ['macos', 'windows'] as const)
  for (const empty of [true, false])
    test(`${platform}/empty=${empty}: pointer opening has no preselected row or blue ring; keyboard navigation retains a visible cue`, async ({
      page,
    }, info) => {
      await boot(page, platform, 'marklyra-light', empty);
      await expect(rootMenu(page)).toBeFocused();
      await expect(rootMenu(page)).toHaveCSS('outline-style', 'none');
      await page.screenshot({ path: info.outputPath('pointer-open-no-ring.png') });
      expect(
        await rootMenu(page).evaluate(
          (menu) =>
            ![...menu.querySelectorAll('button')].some(
              (button) => button === document.activeElement,
            ),
        ),
      ).toBe(true);
      await page.keyboard.press('ArrowDown');
      const first = rootMenu(page).locator('button:not(:disabled)').first();
      await expect(first).toBeFocused();
      await expect(first).toHaveCSS('outline-style', 'none');
      expect(await first.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      if (!empty) {
        await viewItem(page).click();
        await expect(submenu(page)).toBeFocused();
        await expect(submenu(page)).toHaveCSS('outline-style', 'none');
        await page.keyboard.press('ArrowUp');
        await expect(submenu(page).getByRole('menuitemcheckbox')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(viewItem(page)).toBeFocused();
      }
      await page.keyboard.press('Escape');
      await expect(trigger(page)).toBeFocused();
    });

test('scrolling the parent past its submenu anchor closes the child and keeps keyboard focus in the visible menu', async ({
  page,
}) => {
  await boot(page, 'macos', 'marklyra-light');
  await viewItem(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(submenu(page)).toBeVisible();
  await page.setViewportSize({ width: 650, height: 240 });
  // Viewport resizing can finish before the menu's resize handler updates max-height.
  // Prove the real scroll range can move the anchor out before issuing the scroll.
  await expect
    .poll(() =>
      rootMenu(page).evaluate((element) => {
        const anchor = element.querySelector('.workspace-submenu-trigger');
        if (!anchor) throw Error('Missing submenu anchor');
        const bounds = element.getBoundingClientRect();
        const row = anchor.getBoundingClientRect();
        const remainingScroll = element.scrollHeight - element.clientHeight - element.scrollTop;
        return {
          withinViewport: bounds.top >= 8 && bounds.bottom <= innerHeight - 8,
          canScrollPastAnchor: remainingScroll > row.bottom - bounds.top,
        };
      }),
    )
    .toEqual({ withinViewport: true, canScrollPastAnchor: true });
  const scrolled = await rootMenu(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    const anchor = element.querySelector('.workspace-submenu-trigger');
    if (!anchor) throw Error('Missing submenu anchor');
    return {
      moved: element.scrollTop > 0,
      anchorOutside: anchor.getBoundingClientRect().bottom <= element.getBoundingClientRect().top,
    };
  });
  expect(scrolled).toEqual({ moved: true, anchorOutside: true });
  await expect(submenu(page)).toHaveCount(0);
  expect(
    await rootMenu(page).evaluate((element) => {
      const active = document.activeElement,
        bounds = element.getBoundingClientRect();
      if (!active || !element.contains(active)) return false;
      const focus = active.getBoundingClientRect();
      return focus.top >= bounds.top && focus.bottom <= bounds.bottom;
    }),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
});

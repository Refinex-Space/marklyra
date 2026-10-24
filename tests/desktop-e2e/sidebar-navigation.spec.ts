import { expect, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: an empty sidebar keeps its guidance and folder entry visible without hover and shows search only after opening a folder`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    const sidebar = page.locator('aside.sidebar');
    const empty = sidebar.locator('.workspace-compact-empty');
    const footer = sidebar.getByRole('navigation', { name: '侧栏导航', exact: true });
    const trigger = sidebar.getByRole('button', { name: '目录菜单', exact: true });
    const frame = page.frameLocator('.runtime-area iframe').locator('#write');
    const iframe = await page.locator('.runtime-area iframe').elementHandle();
    for (const view of ['view:files', 'view:articles']) {
      await emitLayoutMenu(page, view);
      await frame.click();
      await page.mouse.move(1100, 400);
      expect(await sidebar.evaluate((element) => element.matches(':hover, :focus-within'))).toBe(
        false,
      );
      await expect(empty).toHaveText('没有打开的文件夹');
      await expect(empty).toHaveCSS('opacity', '1');
      await expect(footer).toBeVisible();
      await expect(footer).toHaveCSS('opacity', '1');
      await expect(footer).toHaveCSS('animation-name', 'none');
      await expect(trigger).toBeEnabled();
      await expect(trigger).toContainText('打开文件夹…');
      await expect(sidebar.getByRole('button', { name: '全文搜索', exact: true })).toHaveCount(0);
      const resting = await footer.boundingBox();
      await sidebar.hover();
      await expect(empty).toHaveCSS('opacity', '1');
      await expect(footer).toHaveCSS('animation-name', 'none');
      await frame.click();
      await page.mouse.move(1100, 400);
      await expect(footer).toHaveCSS('opacity', '1');
      expect(await footer.boundingBox()).toEqual(resting);
      await sidebar.screenshot({ path: info.outputPath(`${view.slice(5)}-empty-sidebar.png`) });
    }
    await trigger.click();
    await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
    await expect(empty).toHaveCount(0);
    const search = sidebar.getByRole('button', { name: '全文搜索', exact: true });
    await expect(search).toBeVisible();
    await search.click();
    await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  });

  test(`${theme}: workspace name and search share one persistent row with a rounded hover fill`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    const source = '\uFEFF# Navigation\r\n\r\nKeep this document.\r\n';
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:files');
    const iframe = await page.locator('.runtime-area iframe').elementHandle();
    const history = await layoutHistory(page);
    const header = page.locator('.workspace-navigation-header');
    const root = header.locator('.workspace-root-row');
    const search = page.getByRole('button', { name: '全文搜索', exact: true });
    await expect(page.locator('.sidebar-current-title')).toHaveCount(0);
    await expect(page.locator('.marklyra-sidebar-header')).toBeHidden();
    await expect(root).toHaveText('Layout Fixtures');
    await expect(page.locator('.workspace-root-row')).toHaveCount(1);
    await page.mouse.move(1200, 400);
    await expect(search).toBeVisible();
    await expect(search).toHaveCSS('opacity', '1');
    const idle = await search.evaluate((element) => getComputedStyle(element).backgroundColor);
    for (const width of ['Home', 'End']) {
      await page.getByRole('separator', { name: '调整侧栏宽度' }).press(width);
      const row = await root.boundingBox();
      const button = await search.boundingBox();
      const label = await root.locator('span:not(.workspace-glyph)').boundingBox();
      const sidebar = await page.locator('aside.sidebar').boundingBox();
      if (!row || !button || !label || !sidebar) throw Error('Missing workspace navigation');
      expect(Math.abs(row.y + row.height / 2 - button.y - button.height / 2)).toBeLessThanOrEqual(
        0.5,
      );
      expect(label.x + label.width).toBeLessThanOrEqual(button.x);
      expect(button.x + button.width).toBeLessThanOrEqual(sidebar.x + sidebar.width);
    }
    const divider = page.getByRole('separator', { name: '调整侧栏宽度' });
    await divider.press('Home');
    for (let step = 0; step < 3; step++) await divider.press('Shift+ArrowRight');
    await divider.press('ArrowLeft');
    await root.click();
    await search.hover();
    await expect(search).toHaveCSS('border-radius', '4px');
    await expect
      .poll(() => search.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(idle);
    await expect(search).toHaveCSS('border-top-width', '0px');
    await header.screenshot({ path: info.outputPath('workspace-search-hover.png') });
    await search.click({ button: 'right' });
    await expect(page.getByRole('menu', { name: '目录操作', exact: true })).toHaveCount(0);
    await search.click();
    const input = page.getByRole('searchbox', { name: '搜索文件', exact: true });
    await expect(input).toBeFocused();
    await input.fill('Alpha');
    const inputNode = await input.elementHandle();
    await input.press('Escape');
    await expect(search).toBeFocused();
    await search.click();
    await expect(input).toHaveValue('Alpha');
    expect(await inputNode?.evaluate((element) => element.isConnected)).toBe(true);
    await page.getByRole('button', { name: '返回文件', exact: true }).click();
    await emitLayoutMenu(page, 'view:articles');
    await expect(root).toHaveText('Layout Fixtures');
    await expect(page.locator('.workspace-root-row')).toHaveCount(1);
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    expect(await layoutHistory(page)).toBe(history);
    await saveLayoutSource(page, info, 'sidebar-header-preserves-source', source);
  });

  test(`${theme}: long workspace names truncate before the reserved search hit area and align to the macOS leading inset`, async ({
    page,
  }, info) => {
    const name = '重要资料库_团队协作_长期维护的文档工作区_'.repeat(8);
    await installLayout(page, name);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:files');
    const header = page.locator('.workspace-navigation-header');
    const label = header.locator('.workspace-root-name');
    const search = page.getByRole('button', { name: '全文搜索', exact: true });
    await expect(label).toHaveText(name);
    await expect(label).toHaveAttribute('title', name);
    await expect(label).toHaveCSS('text-overflow', 'ellipsis');
    for (const key of ['Home', 'End']) {
      await page.getByRole('separator', { name: '调整侧栏宽度' }).press(key);
      // Theme view-transition snapshots can temporarily own native hit testing.
      await expect
        .poll(() =>
          search.evaluate((button) => {
            const box = button.getBoundingClientRect();
            return (
              document
                .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
                ?.closest('button') === button
            );
          }),
        )
        .toBe(true);
      const geometry = await header.evaluate((element) => {
        const label = element.querySelector<HTMLElement>('.workspace-root-name');
        const root = element.querySelector('.workspace-root-row');
        const folder = root?.querySelector('.workspace-glyph');
        const button = element.querySelector('button[aria-label="全文搜索"]');
        const sidebar = element.closest('.sidebar');
        if (!label || !root || !folder || !button || !sidebar)
          throw Error('Missing workspace controls');
        const text = label.getBoundingClientRect();
        const action = button.getBoundingClientRect();
        return {
          // Measured from the pane's inner edge: the sidebar is a bordered card.
          inset:
            folder.getBoundingClientRect().left -
            sidebar.getBoundingClientRect().left -
            sidebar.clientLeft,
          gap: action.left - text.right,
          width: action.width,
          clipped: label.scrollWidth > label.clientWidth,
          outside: root.getBoundingClientRect().right > action.left - 12 + 0.5,
          // Keep corner samples inside the button's 4px rounded hit shape.
          hits: [2, 14, 26].flatMap((x) =>
            [2, 14, 26].map((y) => ({
              x,
              y,
              hit:
                document.elementFromPoint(action.left + x, action.top + y)?.closest('button') ===
                button,
            })),
          ),
        };
      });
      expect(geometry.inset).toBe(8);
      expect(geometry.gap).toBeGreaterThanOrEqual(11.5);
      expect(geometry.width).toBe(28);
      expect(geometry.clipped).toBe(true);
      expect(geometry.outside).toBe(false);
      expect(geometry.hits.filter((point) => !point.hit)).toEqual([]);
      await search.click({ position: { x: 1, y: 14 } });
      const input = page.getByRole('searchbox', { name: '搜索文件', exact: true });
      await expect(input).toBeFocused();
      await input.press('Escape');
      await expect(search).toBeFocused();
    }
    await page.getByRole('separator', { name: '调整侧栏宽度' }).press('Home');
    await header.screenshot({ path: info.outputPath('long-name-safe-search.png') });
    await emitLayoutMenu(page, 'view:articles');
    await expect(label).toHaveText(name);
    await search.click();
    await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
  });
}

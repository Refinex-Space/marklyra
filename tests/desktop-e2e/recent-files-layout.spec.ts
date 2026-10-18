import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';
import { installRecentMock, type RecentMockWindow } from './recent.helpers.js';

for (const theme of ['github', 'night']) {
  test(`${theme}: recent cards are compact and only the history body scrolls`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(installRecentMock);
    await readyLayout(page, theme);
    await page.evaluate(() => {
      const mock = (window as RecentMockWindow).__recentMock;
      mock.seed('/mock/README.md', 'Original');
      mock.seed(`/mock/${'很长的文件夹/'.repeat(12)}项目说明.md`, 'Long path');
    });
    const panel = page.getByRole('dialog', { name: '最近文件', exact: true });
    const body = panel.locator('.recent-files-body');
    const footer = panel.locator('.recent-files-actions');
    const heading = panel.locator('.recent-files-heading');
    await emitLayoutMenu(page, 'recent-files');
    await expect(panel.locator('.recent-files-list li')).toHaveCount(2);
    const cardHeights = await panel
      .locator('.recent-file-open')
      .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
    for (const height of cardHeights) {
      expect(height).toBeGreaterThanOrEqual(48);
      expect(height).toBeLessThanOrEqual(62);
    }
    expect((await panel.boundingBox())?.height).toBeLessThan(320);
    const longPath = panel.locator('.recent-file-open span').first();
    await expect(longPath).toHaveAttribute('title', /很长的文件夹/);
    expect(await longPath.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('recent-few.png') });
    await footer.getByRole('button', { name: '关闭', exact: true }).click();
    await page.evaluate(() => {
      const mock = (window as RecentMockWindow).__recentMock;
      for (let index = 0; index < 30; index++)
        mock.seed(`/mock/笔记/${index}/很长的最近文件名称-${index}.md`, `Note ${index}`);
    });
    await emitLayoutMenu(page, 'recent-files');
    await expect(panel.locator('.recent-files-list li')).toHaveCount(32);
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 700, height: 500 },
    ]) {
      await page.setViewportSize(viewport);
      await body.evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect
        .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
        .toBe(true);
      const before = await footer.boundingBox();
      const headingBefore = await heading.boundingBox();
      if (!before || !headingBefore) throw new Error('Missing recent-file dialog regions');
      await page.screenshot({ path: info.outputPath(`recent-top-${viewport.width}.png`) });
      await body.hover();
      await page.mouse.wheel(0, 10000);
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await footer.boundingBox()).toEqual(before);
      expect(await heading.boundingBox()).toEqual(headingBefore);
      expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
      expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      );
      expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      for (const name of ['清空最近文件', '刷新', '关闭']) {
        const button = footer.getByRole('button', { name, exact: true });
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        if (!box) throw new Error('Missing recent-file action');
        expect(box.y + box.height).toBeLessThan(viewport.height);
      }
      await page.screenshot({ path: info.outputPath(`recent-scrolled-${viewport.width}.png`) });
    }
    await panel.getByRole('button', { name: '移除最近记录 /mock/README.md', exact: true }).click();
    await expect(panel.locator('.recent-files-list li')).toHaveCount(31);
    await footer.getByRole('button', { name: '清空最近文件', exact: true }).click();
    await expect(panel).toContainText('暂无最近打开的文件');
    await expect(footer.getByRole('button', { name: '清空最近文件', exact: true })).toBeDisabled();
    await expect(footer.getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
    await footer.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(panel).toHaveCount(0);
  });
}

import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';
import { installRecentMock, type RecentMockWindow } from './recent.helpers.js';

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  for (const titlebar of ['appkit', 'web'] as const) {
    test(`${theme}/${titlebar}: recent rows are integrated and only the history list scrolls`, async ({
      page,
    }, info) => {
      await installLayout(page, undefined, titlebar);
      await page.addInitScript(installRecentMock);
      await readyLayout(page, theme);
      await page.evaluate(() => {
        const mock = (window as RecentMockWindow).__recentMock;
        mock.seed('/mock/README.md', 'Original');
        mock.seed(`/mock/${'很长的文件夹'.repeat(12)}/${'项目说明'.repeat(16)}.md`, 'Long path');
      });
      const panel = page.getByRole('dialog', { name: '最近文件', exact: true });
      const body = panel.locator('.recent-files-body');
      const list = panel.locator('.recent-files-list');
      const footer = panel.locator('.recent-files-actions');
      const heading = panel.locator('.recent-files-heading');
      await emitLayoutMenu(page, 'recent-files');
      await expect(panel.locator('.recent-files-list li')).toHaveCount(2);
      const cardHeights = await panel
        .locator('.recent-file-open')
        .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
      for (const height of cardHeights) {
        expect(height).toBe(44);
      }
      expect((await panel.boundingBox())?.height).toBeLessThan(240);
      expect((await heading.boundingBox())?.height).toBeLessThanOrEqual(52);
      const longPath = panel.locator('.recent-file-where').first();
      await expect(longPath).toHaveAttribute('title', /很长的文件夹/);
      expect(await longPath.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      );
      const row = panel.locator('.recent-files-list li').first();
      const open = row.locator('.recent-file-open');
      const remove = row.getByRole('button', { name: /^移除最近记录/ });
      const rowBox = await row.boundingBox();
      const removeBox = await remove.boundingBox();
      if (!rowBox || !removeBox) throw new Error('Missing recent-file row');
      expect(removeBox.y + removeBox.height / 2).toBe(rowBox.y + rowBox.height / 2);
      expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
      expect(await open.evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
      await remove.hover();
      expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(
        await footer.evaluate((element) => {
          const style = getComputedStyle(element);
          return style.paddingTop === style.paddingBottom;
        }),
      ).toBe(true);
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
        { width: 420, height: 360 },
      ]) {
        await page.setViewportSize(viewport);
        await list.evaluate((element) => {
          element.scrollTop = 0;
        });
        await expect
          .poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight))
          .toBe(true);
        const before = await footer.boundingBox();
        const headingBefore = await heading.boundingBox();
        if (!before || !headingBefore) throw new Error('Missing recent-file dialog regions');
        await page.screenshot({ path: info.outputPath(`recent-top-${viewport.width}.png`) });
        if (viewport.width === 1280)
          await panel.screenshot({ path: info.outputPath('recent-panel.png') });
        await list.hover();
        await page.mouse.wheel(0, 10000);
        await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        expect(await footer.boundingBox()).toEqual(before);
        expect(await heading.boundingBox()).toEqual(headingBefore);
        expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
        expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
        const listBox = await list.boundingBox();
        if (!listBox) throw new Error('Missing recent-file list');
        expect(before.y - listBox.y - listBox.height).toBeGreaterThanOrEqual(12);
        expect(
          await panel.evaluate((element) => element.scrollHeight <= element.clientHeight),
        ).toBe(true);
        expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        for (const name of ['清空记录', '刷新', '关闭']) {
          const button = footer.getByRole('button', { name, exact: true });
          await expect(button).toBeVisible();
          const box = await button.boundingBox();
          if (!box) throw new Error('Missing recent-file action');
          expect(box.y + box.height).toBeLessThan(viewport.height);
        }
        await page.screenshot({ path: info.outputPath(`recent-scrolled-${viewport.width}.png`) });
      }
      await panel
        .getByRole('button', { name: '移除最近记录 /mock/README.md', exact: true })
        .click();
      await expect(panel.locator('.recent-files-list li')).toHaveCount(31);
      await footer.getByRole('button', { name: '清空记录', exact: true }).click();
      await expect(panel).toContainText('暂无最近打开的文件');
      await expect(footer.getByRole('button', { name: '清空记录', exact: true })).toBeDisabled();
      await expect(footer.getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
      await footer.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(panel).toHaveCount(0);
    });
  }
}

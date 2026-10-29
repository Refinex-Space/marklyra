import { expect, test } from '@playwright/test';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

for (const titlebar of ['appkit', 'web'] as const) {
  for (const theme of ['marklyra-light', 'marklyra-dark']) {
    test(`${titlebar}/${theme}: sponsorship is the final settings entry, keeps the QR readable and preserves the editor`, async ({
      page,
    }, info) => {
      await installLayout(page, undefined, titlebar);
      await readyLayout(page, theme);
      const editor = await page.locator('.marklyra-editor-frame').elementHandle();
      await emitLayoutMenu(page, 'preferences');
      const ui = page.frameLocator('.runtime-preferences-frame');
      const entry = ui.getByRole('button', { name: '赞助', exact: true });
      await expect(ui.locator('.nav-group-item').last()).toHaveText('赞助');
      const iconBox = (name: string) =>
        ui
          .getByRole('button', { name, exact: true })
          .locator('.icon svg')
          .evaluate((svg) => {
            const { left, width } = svg.getBoundingClientRect();
            return [left, width];
          });
      expect(await iconBox('赞助')).toEqual(await iconBox('智能体'));
      await entry.click();
      const sponsor = page.getByRole('region', { name: '赞助', exact: true });
      await expect(sponsor).toBeVisible();
      await expect(sponsor).toContainText('自愿赞助，不影响任何功能的使用');
      await expect(entry).toHaveAttribute('aria-current', 'page');
      await expect(ui.locator('.nav-group-item[aria-current="page"]')).toHaveCount(1);
      const qr = sponsor.getByRole('img', { name: '微信赞助二维码' });
      await expect
        .poll(() =>
          qr.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]),
        )
        .toEqual([386, 379]);
      await qr.evaluate((image: HTMLImageElement) => image.decode());
      await expect(sponsor.locator('.sponsorship-qr-surface')).toHaveCSS(
        'background-color',
        'rgb(255, 255, 255)',
      );
      for (const width of [1280, 700]) {
        await page.setViewportSize({ width, height: 900 });
        await qr.scrollIntoViewIfNeeded();
        await expect(qr).toBeVisible();
        expect(
          await sponsor.evaluate((element) => element.scrollWidth - element.clientWidth),
        ).toBeLessThanOrEqual(0);
        await page.screenshot({ path: info.outputPath(`sponsorship-${width}.png`) });
        const note = sponsor.getByText('自愿赞助，不影响任何功能的使用。', { exact: true });
        await note.scrollIntoViewIfNeeded();
        await expect(note).toBeVisible();
      }
      await ui.getByRole('button', { name: '导出', exact: true }).click();
      await expect(sponsor).toHaveCount(0);
      await expect(page.locator('.es')).toBeVisible();
      await ui.getByRole('button', { name: '智能体', exact: true }).click();
      await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
      await entry.click();
      await expect(sponsor).toBeVisible();
      await ui.getByRole('button', { name: '通用', exact: true }).click();
      await expect(sponsor).toHaveCount(0);
      await expect(ui.locator('.settings-general-about')).toBeVisible();
      await entry.focus();
      await page.keyboard.press('Enter');
      await expect(sponsor).toBeVisible();
      await expect(entry).toHaveCount(1);
      await ui.getByRole('button', { name: '返回应用', exact: true }).click();
      await expect(page.locator('.runtime-preferences-frame')).toHaveCount(0);
      expect(await editor?.evaluate((element) => element.isConnected)).toBe(true);
    });
  }
}

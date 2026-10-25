import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, layoutThemes, readyLayout } from './layout.helpers.js';

for (const theme of layoutThemes) {
  test(`${theme}: General groups preferences and app information without obsolete controls`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    const editor = await page.locator('.marklyra-editor-frame').elementHandle();
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '通用', exact: true }).click();
    const behavior = ui.locator('.settings-general-preferences');
    const about = ui.locator('.settings-general-about');
    await expect(behavior).toBeVisible();
    await expect(about).toContainText('永久免费 · 开放源代码');
    await expect(about).toContainText('Apache 2.0');
    await expect(about).toContainText('第三方组件遵循各自许可');
    const repository = about.getByRole('button', { name: '打开 MarkLyra GitHub 仓库' });
    await expect(repository).toBeEnabled();
    await expect(repository.locator('.icon-github-circled')).toBeVisible();
    const settingsSource = await page.locator('.runtime-preferences-frame').getAttribute('src');
    await repository.click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls.filter(
              (call) => call.command === 'open_project_repository',
            ).length,
        ),
      )
      .toBe(1);
    await expect(page.locator('.runtime-preferences-frame')).toHaveAttribute(
      'src',
      settingsSource ?? '',
    );
    await expect(
      ui.locator(
        '[data-marklyra-preference="autoUpdateToDev"], [data-marklyra-preference="send_usage_info"], [data-marklyra-preference="useMirrorInCN"]',
      ),
    ).toHaveCount(0);
    await expect(
      ui.getByRole('button', { name: '重置全部警告提示对话框', exact: true }),
    ).toHaveCount(0);
    const version = about.locator('.settings-about-version');
    const check = version.getByRole('button', { name: '检查更新', exact: true });
    await expect(check).toBeEnabled();
    await expect(about.locator('[data-marklyra-preference="enableAutoUpdate"]')).toBeVisible();
    const disclosure = about.locator('.settings-third-party-license');
    await expect(disclosure).toHaveCount(0);
    const debug = behavior.locator('[data-marklyra-preference="debugMode"]');
    const debugHint = behavior.locator(
      '.checkbox:has([data-marklyra-preference="debugMode"]) .label-hint',
    );
    await expect(debug).toBeEnabled();
    await expect(debug).not.toBeChecked();
    await debugHint.hover();
    const tooltip = ui.locator('#marklyra-tooltip');
    await expect(tooltip).toContainText('Command + Option + I');
    await expect(tooltip).toContainText('Ctrl + Shift + I');
    await expect(tooltip).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('debug-help.png') });
    await debug.check();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as TestWindow).__desktopMock.applicationPreferences.values.debugMode,
        ),
      )
      .toBe(true);
    for (const width of [1280, 700]) {
      await page.setViewportSize({ width, height: 900 });
      const button = await check.boundingBox();
      const text = await version.locator('span').first().boundingBox();
      if (!button || !text) throw new Error('Missing version information');
      expect(Math.abs(button.y + button.height / 2 - text.y - text.height / 2)).toBeLessThan(3);
      expect(button.x).toBeGreaterThan(text.x + text.width);
      expect(
        await ui.locator('.pane').evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`general-${width}.png`) });
    }
    await debug.uncheck();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as TestWindow).__desktopMock.applicationPreferences.values.debugMode,
        ),
      )
      .toBe(false);
    expect(await editor?.evaluate((element) => element.isConnected)).toBe(true);
    const quit = behavior.locator('[data-marklyra-preference="quitAfterWindowClose"]');
    await quit.check();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.applicationPreferences.values.quitAfterWindowClose,
        ),
      )
      .toBe(true);
    const search = ui.getByRole('searchbox', { name: '搜索设置', exact: true });
    for (const term of [
      '更新至开发版',
      '发送匿名使用数据',
      'MarkLyra 服务器',
      '重置全部警告提示对话框',
    ]) {
      await search.fill(term);
      await expect(ui.locator('.settings-page-heading p')).toHaveText(
        '没有找到匹配的设置，请尝试其他关键词。',
      );
    }
    await search.fill('');
    await ui.getByRole('button', { name: '通用', exact: true }).click();
    await expect(about.locator('.settings-about-brand')).toHaveCount(1);
    await expect(quit).toBeChecked();
    await ui.getByRole('button', { name: '文件', exact: true }).click();
    const clear = ui.getByRole('button', { name: '清除历史文件记录', exact: true });
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls.filter(
              (call) => call.command === 'ask_clear_recent_history',
            ).length,
        ),
      )
      .toBe(1);
    expect(
      await page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (call) => call.command === 'reset_dialog_warnings',
          ).length,
      ),
    ).toBe(0);
  });
}

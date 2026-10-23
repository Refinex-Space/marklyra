import { expect, test } from '@playwright/test';
import { installMock } from './desktop.helpers.js';
import { installRecoveryMock, type RecoveryMockWindow } from './recovery.helpers.js';

for (const saved of [true, false])
  test(`restart offers only dirty local fallback copies (saved=${saved})`, async ({ page }) => {
    // The real App, fallback writer and runtime run in the browser. Native store
    // persistence is mocked; this does not simulate a real process crash or disk.
    await page.addInitScript(installMock);
    await page.addInitScript(installRecoveryMock);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
    await page.evaluate(async (saved) => {
      const path = '/src/services/recovery-fallback.ts';
      const { RecoveryFallback } = await import(path);
      const writer = new RecoveryFallback(localStorage, '00000000-0000-4000-8000-000000000001');
      const draft = {
        text: 'Alpha saved 中文😀\r\n',
        savedText: 'Alpha\r\n',
        document: { path: '/mock/AlreadySaved.md', encoding: 'UTF-8' },
        selection: null,
      };
      writer.update(draft);
      if (saved) writer.update({ ...draft, savedText: draft.text });
    }, saved);
    await page.reload();
    await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as RecoveryMockWindow).__recoveryMock.calls.some(
            (call) => call.command === 'list_recovery_drafts',
          ),
        ),
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const panel = page.getByRole('dialog', { name: '恢复未保存的文档' });
    if (saved) {
      await expect(panel).toHaveCount(0);
      await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
    }
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('/mock/AlreadySaved.md');
    await expect(panel).toContainText('Alpha saved 中文😀');
    await expect(panel.getByRole('button', { name: '保护此本地副本' })).toBeEnabled();
  });

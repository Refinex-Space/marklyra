import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
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

test('autosave followed by interrupted fallback cleanup does not offer saved work after restart', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      if (key.startsWith('marklyra-fallback:v2:')) throw Error('Simulated cleanup interruption');
      return remove.call(this, key);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.checkpoint_recovery = true;
    (window as TestWindow).__desktopMock.nextDocument = {
      id: 'doc-a',
      path: '/mock/A.md',
      encoding: 'UTF-8',
      text: 'Alpha',
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p');
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  await page.keyboard.type('X');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'save_document')
          .map((call) => call.args.text),
      ),
    )
    .toEqual(['AlphaX']);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  const fallback = () =>
    page.evaluate(async () => {
      const path = '/src/services/recovery-fallback.ts';
      const { listFallbacks } = await import(path);
      const listing = await listFallbacks(localStorage, {
        owner: '',
        activeOwners: [],
        activeLabels: [],
      });
      return listing.drafts.map(
        (draft: { content: { text: string; savedText: string } }) => draft.content,
      );
    });
  await expect
    .poll(fallback)
    .toEqual([expect.objectContaining({ text: 'AlphaX', savedText: 'AlphaX' })]);
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
  await expect(page.getByRole('dialog', { name: '恢复未保存的文档' })).toHaveCount(0);
  expect(await fallback()).toEqual([
    expect.objectContaining({ text: 'AlphaX', savedText: 'AlphaX' }),
  ]);
});

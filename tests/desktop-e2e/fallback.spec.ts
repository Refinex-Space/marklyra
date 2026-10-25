import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock, type RecoveryMockWindow } from './recovery.helpers.js';

const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const panel = (page: Page) => page.getByRole('dialog', { name: '恢复未保存的文档' });
async function setup(page: Page) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
}
async function heads(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('marklyra-fallback:v2:')),
  );
}

test('real editor input survives renderer restart before deferred native checkpoint completes', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.checkpoint_recovery = true;
  });
  await write(page).click();
  await page.keyboard.type('Before checkpoint');
  await expect.poll(() => heads(page)).toHaveLength(1);
  expect(
    await page.evaluate(() => Object.keys((window as RecoveryMockWindow).__recoveryMock.records)),
  ).toEqual([]);
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(write(page)).toHaveText('');
  await panel(page).getByRole('button', { name: '保护此本地副本', exact: true }).click();
  await expect.poll(() => heads(page)).toHaveLength(0);
  await panel(page).getByRole('button', { name: '恢复为新文档', exact: true }).click();
  await expect(write(page)).toHaveText('Before checkpoint');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.find(
            (call) => call.command === 'save_document_as',
          )?.args.text,
      ),
    )
    .toBe('Before checkpoint');
});

test('fallback import failure retains local bytes and a successful retry protects exact legacy BOM and mixed EOL', async ({
  page,
}) => {
  const source = '\ufeff# Existing\r\n\r\nSaved draft\n';
  await setup(page);
  await page.evaluate((source) => localStorage.setItem('marklyra-draft', source), source);
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(write(page)).toHaveText('');
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.fail.import_fallback_recovery = 'store busy';
  });
  await panel(page).getByRole('button', { name: '保护此本地副本', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('store busy');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(source);
  await page.evaluate(() => {
    delete (window as RecoveryMockWindow).__recoveryMock.fail.import_fallback_recovery;
  });
  await panel(page).getByRole('button', { name: '保护此本地副本', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBeNull();
  await panel(page).getByRole('button', { name: '恢复为新文档', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.find(
            (call) => call.command === 'save_document_as',
          )?.args.text,
      ),
    )
    .toBe(source);
});

test('active local owner cannot be imported from the recovery panel', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.checkpoint_recovery = true;
  });
  await write(page).click();
  await page.keyboard.type('Live draft');
  await expect.poll(() => heads(page)).toHaveLength(1);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel(page).getByText('该副本仍由运行中的编辑窗口使用。')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: '保护此本地副本' })).toHaveCount(0);
});

test('sync fallback records preserve file encoding and saved baseline before native checkpoint', async ({
  page,
}) => {
  await setup(page);
  const source = '\ufeffAlpha\r\n\rTail';
  await page.evaluate((source) => {
    const target = window as RecoveryMockWindow;
    target.__desktopMock.nextDocument = {
      id: 'doc-a',
      path: '/notes/utf16.md',
      text: source,
      encoding: 'UTF-16LE BOM',
    };
    target.__recoveryMock.defer.checkpoint_recovery = true;
  }, source);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('utf16.md');
  await write(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => heads(page)).toHaveLength(1);
  const saved = await page.evaluate(async () => {
    const url = '/src/services/recovery-fallback.ts';
    const module = (await import(
      url
    )) as typeof import('../../apps/desktop/src/services/recovery-fallback.js');
    const local = await module.listFallbacks(localStorage, {
      owner: '',
      activeOwners: [],
      activeLabels: [],
    });
    return local.drafts[0]?.content;
  });
  expect(saved?.document).toEqual({ path: '/notes/utf16.md', encoding: 'UTF-16LE BOM' });
  expect(saved?.savedText).toBe(source);
  expect(saved?.text).toContain('X');
  expect(saved?.text.startsWith('\ufeffAlpha\r\n\r')).toBe(true);
});

test('another instance owning the native store blocks bootstrap without deleting local fallback', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('marklyra-draft', 'Keep while busy');
    (window as RecoveryMockWindow).__recoveryMock.fail.fallback_recovery_context =
      '恢复存储正在被其他程序实例使用';
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '重新连接草稿保护' })).toBeVisible();
  await expect(page.locator('.editor-loading')).toContainText('恢复存储正在被其他程序实例使用');
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe('Keep while busy');
  await page.evaluate(() => {
    delete (window as RecoveryMockWindow).__recoveryMock.fail.fallback_recovery_context;
  });
  await page.getByRole('button', { name: '重新连接草稿保护' }).click();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect(panel(page)).toBeVisible();
});

test('stale native import response cannot delete a later local generation', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => localStorage.setItem('marklyra-draft', 'First version'));
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.import_fallback_recovery = true;
  });
  await panel(page).getByRole('button', { name: '保护此本地副本', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as RecoveryMockWindow).__recoveryMock.pending.length))
    .toBe(1);
  await page.evaluate(() => {
    localStorage.setItem('marklyra-draft', 'Newer version');
    (window as RecoveryMockWindow).__recoveryMock.release('import_fallback_recovery');
  });
  await expect(panel(page).getByText('Newer version', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe('Newer version');
  expect(
    await page.evaluate(() =>
      Object.values((window as RecoveryMockWindow).__recoveryMock.records).map(
        (record) => record.text,
      ),
    ),
  ).toContain('First version');
});

test('measure bounded sync fallback writes for one MiB without claiming native fsync durability', async ({
  page,
  browserName,
}, testInfo) => {
  await setup(page);
  const sample = await page.evaluate(async () => {
    const url = '/src/services/recovery-fallback.ts';
    const { RecoveryFallback, listFallbacks } = (await import(
      url
    )) as typeof import('../../apps/desktop/src/services/recovery-fallback.js');
    const owner = crypto.randomUUID();
    const writer = new RecoveryFallback(localStorage, owner);
    const baseline = 'abcdefghij'.repeat(104857).padEnd(1048576, 'x');
    const value = (text: string) => ({
      text,
      savedText: baseline,
      document: null,
      selection: null,
    });
    let start = performance.now();
    writer.update(value(`${baseline}X`));
    const initialMs = performance.now() - start;
    const samples: number[] = [];
    for (let i = 1; i <= 20; i++) {
      start = performance.now();
      writer.update(value(`${baseline}X${'中'.repeat(i)}`));
      samples.push(performance.now() - start);
    }
    const local = await listFallbacks(localStorage, {
      owner: '',
      activeOwners: [],
      activeLabels: [],
    });
    const item = local.drafts.find((draft) => draft.owner === owner);
    const exact = item?.content.text === `${baseline}X${'中'.repeat(20)}`;
    const headCharacters = item?.expected.length;
    writer.discard();
    return { initialMs, samples, exact, headCharacters, userAgent: navigator.userAgent };
  });
  expect(sample.exact).toBe(true);
  expect(sample.headCharacters).toBeLessThan(4096);
  await testInfo.attach(`fallback-${browserName}-one-MiB.json`, {
    body: JSON.stringify(sample, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ browserName, ...sample }));
});

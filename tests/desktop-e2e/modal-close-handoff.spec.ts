import { expect, test } from '@playwright/test';
import type { ModalCloseHandoffWindow } from '../../apps/desktop/src/components/test/modal-close-handoff.fixture.js';

test('unmount synchronously revokes the old handoff before a layout-phase reply and preserves a new modal control', async ({
  page,
}) => {
  await page.route('**/modal-close-handoff-fixture.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="root"></div><script type="module" src="/src/components/test/modal-close-handoff.fixture.tsx"></script>',
    }),
  );
  await page.goto('/modal-close-handoff-fixture.html');
  await page
    .getByRole('dialog', { name: '旧面板', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as ModalCloseHandoffWindow).__modalCloseHandoffFixture.pending),
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as ModalCloseHandoffWindow).__modalCloseHandoffFixture.replace(),
  );
  await expect(page.getByRole('dialog', { name: '旧面板', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '新面板', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as ModalCloseHandoffWindow).__modalCloseHandoffFixture.requestSettled,
      ),
    )
    .toBe(true);
  const snapshot = await page.evaluate(() => {
    const fixture = (window as ModalCloseHandoffWindow).__modalCloseHandoffFixture;
    return { abortedAtLayout: fixture.abortedAtLayout, closeCalls: fixture.closeCalls };
  });
  expect(snapshot.abortedAtLayout).toBe(true);
  expect(snapshot.closeCalls).toEqual([]);
  await expect(page.getByRole('textbox', { name: '新的输入位置', exact: true })).toBeFocused();
  await page.keyboard.type('New owner');
  await expect(page.getByRole('textbox', { name: '新的输入位置', exact: true })).toHaveValue(
    'New owner',
  );
});

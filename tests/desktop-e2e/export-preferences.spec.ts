import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';

test('original export controls persist only implemented format settings and restore them', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.goto('/?view=preferences');
  const original = page.frameLocator('.runtime-preferences-frame');
  await expect(original.locator('.nav-group-item')).toHaveCount(7);
  await original.locator('.nav-group-item').nth(4).click();
  await original.locator('.export-item').filter({ hasText: /^PDF$/ }).click();
  const field = (name: string) =>
    original.locator(`[data-marklyra-preference="export.pdf:${name}"]`);
  await expect(field('paper')).toBeEnabled();
  await field('paper').selectOption('custom');
  const size = field('paper.custom');
  await expect(size).toHaveCount(2);
  await size.nth(0).fill('148');
  await size.nth(1).fill('210');
  await field('paper.margin').selectOption('custom');
  for (const [name, value] of [
    ['Top', '11'],
    ['Bottom', '12'],
    ['Left', '13'],
    ['Right', '14'],
  ] as const)
    await field(`paper.margin${name}`).fill(value);
  await field('exportTheme').selectOption('marklyra-dark');
  await field('splitPages').check();
  await expect(field('header').first()).toBeDisabled();
  await expect(field('footer').first()).toBeDisabled();
  await expect(field('appendBody')).toBeDisabled();
  await expect(field('allowPerFileSetting')).toBeDisabled();
  await expect(original.locator('#marklyra-preferences-status')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.exportPreferences.pdf))
    .toEqual({
      paper: 'custom',
      'paper.custom': [148, 210],
      'paper.margin': 'custom',
      'paper.marginTop': 11,
      'paper.marginBottom': 12,
      'paper.marginLeft': 13,
      'paper.marginRight': 14,
      exportTheme: 'marklyra-dark',
      splitPages: true,
    });
  await original
    .locator('.export-item')
    .filter({ hasText: /^HTML$/ })
    .click();
  await original
    .locator('[data-marklyra-preference="export.html:exportTheme"]')
    .selectOption('marklyra-light');
  await expect(original.locator('[data-marklyra-preference="export.html:sidebar"]')).toBeDisabled();
  await expect(
    original.locator('[data-marklyra-preference="export.html:appendHead"]'),
  ).toBeDisabled();
  await expect(original.locator('#marklyra-preferences-status')).toBeHidden();
  await page.reload();
  await expect(original.locator('.nav-group-item')).toHaveCount(7);
  await original.locator('.nav-group-item').nth(4).click();
  await original
    .locator('.export-item')
    .filter({ hasText: /^HTML$/ })
    .click();
  await expect(
    original.locator('[data-marklyra-preference="export.html:exportTheme"]'),
  ).toHaveValue('marklyra-light');
  await original.locator('.export-item').filter({ hasText: /^PDF$/ }).click();
  await expect(field('paper')).toHaveValue('custom');
  await expect(field('paper.custom').nth(0)).toHaveValue('148');
  await expect(field('splitPages')).toBeChecked();
});

test('export preference CAS failure rolls the original page back without replay', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.goto('/?view=preferences');
  const original = page.frameLocator('.runtime-preferences-frame');
  await expect(original.locator('.nav-group-item')).toHaveCount(7);
  await original.locator('.nav-group-item').nth(4).click();
  await original.locator('.export-item').filter({ hasText: /^PDF$/ }).click();
  const paper = original.locator('[data-marklyra-preference="export.pdf:paper"]');
  await paper.selectOption('A5');
  await expect(original.locator('#marklyra-preferences-status')).toBeHidden();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    localStorage.setItem(
      'mock-export-preferences',
      JSON.stringify({ ...mock.exportPreferences, revision: mock.exportPreferences.revision + 1 }),
    );
  });
  await paper.selectOption('A3');
  await expect(original.locator('#marklyra-preferences-status')).toContainText('版本冲突');
  await original.locator('.export-item').filter({ hasText: /^PDF$/ }).click();
  await expect(paper).toHaveValue('A5');
  await expect(paper).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (call) => call.command === 'put_export_preferences',
        ).length,
    ),
  ).toBe(2);
});

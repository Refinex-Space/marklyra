import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import {
  installRecoveryFocusGate,
  type RecoveryFocusWindow,
} from './recovery-focus-handoff.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const draft = '\uFEFF# Preserved\r\n\r\nOriginal draft\n';
async function start(page: Page, automatic = true) {
  await page.addInitScript(installRecoveryFocusGate);
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  if (automatic)
    await page.addInitScript((value) => {
      if (window === top) localStorage.setItem('marklyra-draft', value);
    }, draft);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
}
const dialog = (page: Page) => page.getByRole('dialog', { name: '恢复未保存的文档' });
async function arm(page: Page) {
  await page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.arm());
}
async function release(page: Page, error?: string) {
  await page.evaluate(
    (error) => (window as RecoveryFocusWindow).__recoveryFocusGate.release(error),
    error,
  );
}
async function held(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.held))
    .toBeGreaterThan(0);
}
async function preserved(page: Page) {
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(draft);
}

test('automatic recovery stays present until the real inner focus acknowledgement then accepts the first key', async ({
  page,
}) => {
  await start(page);
  await expect(dialog(page)).toBeVisible();
  await arm(page);
  try {
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await held(page);
    await expect(dialog(page)).toBeVisible();
    await preserved(page);
    await release(page);
    await expect(dialog(page)).toHaveCount(0);
    await page.keyboard.type('After recovery');
    await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText(
      'After recovery',
    );
    await preserved(page);
  } finally {
    await release(page);
  }
});

test('closing recovery opened from a real Shell control restores that control without editor focus', async ({
  page,
}) => {
  await start(page, false);
  const control = page.getByRole('button', { name: '搜索', exact: true });
  await control.focus();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('marklyra-drafts'));
  await expect(dialog(page)).toBeVisible();
  await arm(page);
  try {
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(control).toBeFocused();
    expect(
      await page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.requests),
    ).toBe(0);
    await page.keyboard.press('Space');
    await expect(control).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await release(page);
  }
});

test('failed focus reply stays visible, restores the modal control and permits explicit close without consuming draft', async ({
  page,
}) => {
  await start(page);
  await expect(dialog(page)).toBeVisible();
  await arm(page);
  try {
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await held(page);
    await release(page, '模拟焦点交接失败');
    await expect(dialog(page).getByRole('alert')).toContainText('模拟焦点交接失败');
    await expect(dialog(page).getByRole('button', { name: '关闭', exact: true })).toBeFocused();
    await expect(dialog(page)).toHaveAttribute('aria-busy', 'false');
    await preserved(page);
    await dialog(page).getByRole('button', { name: '仅关闭面板', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await preserved(page);
  } finally {
    await release(page);
  }
});

test('canceling a pending focus handoff restores the modal and a late reply cannot close it', async ({
  page,
}) => {
  await start(page);
  await expect(dialog(page)).toBeVisible();
  await arm(page);
  try {
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await held(page);
    await dialog(page).getByRole('button', { name: '取消关闭', exact: true }).click();
    await expect(dialog(page).getByRole('button', { name: '关闭', exact: true })).toBeFocused();
    await expect(dialog(page).getByRole('alert')).toContainText('已取消关闭');
    await release(page);
    // A real subsequent Shell action runs after the delivered old reply. It
    // must still belong to the connected modal, not a removed old component.
    await dialog(page).getByRole('button', { name: '刷新', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await preserved(page);
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.keyboard.type('After recovery');
    await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText(
      'After recovery',
    );
    await preserved(page);
  } finally {
    await release(page);
  }
});

test('closing a no-longer-foreground recovery window does not send editor focus', async ({
  page,
}) => {
  await start(page);
  await expect(dialog(page)).toBeVisible();
  await page.evaluate(() => {
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internals.invoke;
    internals.invoke = (command, args) =>
      command === 'editor_window_focused' ? Promise.resolve(false) : previous(command, args);
  });
  await arm(page);
  try {
    await dialog(page).getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.requests),
    ).toBe(0);
    await preserved(page);
  } finally {
    await release(page);
  }
});

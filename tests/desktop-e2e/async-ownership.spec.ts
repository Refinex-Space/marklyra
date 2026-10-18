import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import {
  installNativeCommandFenceMock,
  type NativeCommandFenceWindow,
} from './native-command-fence.helpers.js';
import {
  installRecoveryFocusGate,
  type RecoveryFocusWindow,
} from './recovery-focus-handoff.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const runtimeSnapshot = (page: Page) =>
  frame(page)
    .locator('#write')
    .evaluate((write) => {
      const editor = Reflect.get(window, 'editor') as LegacyEditor;
      const selection = getSelection();
      return {
        canonical: editor.getMarkdown(),
        html: write.innerHTML,
        bookmark: editor.selection.buildUndo(),
        sourceRanges: editor.sourceView.cm?.listSelections(),
        sourceMode: editor.sourceView.inSourceMode,
        anchor: { text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset },
        head: { text: selection?.focusNode?.textContent, offset: selection?.focusOffset },
        history: { index: editor.undo.index, size: editor.undo.commandStack.length },
      };
    });
const writes = (page: Page) =>
  page.evaluate(() => (window as NativeCommandFenceWindow).__nativeCommandFence.writes);
async function settle(page: Page) {
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
for (const mode of ['wysiwyg', 'source'] as const)
  test(`${mode}: held native Undo/Redo saves preserve their owner and the next first key`, async ({
    page,
  }, info) => {
    await page.addInitScript(installMock, { nativeChrome: true });
    await page.addInitScript(installRecoveryMock);
    await page.addInitScript(installNativeCommandFenceMock, 'http://127.0.0.1:4174/index.html');
    await page.goto('/');
    await expect(frame(page).locator('#write')).toHaveText('Alpha');
    await settle(page);
    await expect
      .poll(() =>
        page.evaluate(() => (window as NativeCommandFenceWindow).__nativeCommandFence.context),
      )
      .not.toBeNull();
    if (mode === 'source') {
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
      await frame(page).locator('#typora-source .CodeMirror textarea').focus();
    } else await frame(page).locator('#write > p').click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    const value = () =>
      mode === 'source'
        ? frame(page)
            .locator('#typora-source .CodeMirror')
            .evaluate((element) =>
              (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
            )
        : frame(page).locator('#write').textContent();
    await expect.poll(value).toBe('AlphaX');
    const stages: unknown[] = [];
    for (const action of ['undo', 'redo'] as const) {
      const sequence = await page.evaluate(
        (action) => (window as NativeCommandFenceWindow).__nativeCommandFence.issue(action),
        action,
      );
      await page.keyboard.press('Meta+s');
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as NativeCommandFenceWindow).__nativeCommandFence.reads.at(-1)?.issued,
          ),
        )
        .toBe(sequence);
      const before = { runtime: await runtimeSnapshot(page), writes: await writes(page) };
      expect(before.writes).toHaveLength(action === 'undo' ? 0 : 1);
      await page.evaluate(
        (sequence) => (window as NativeCommandFenceWindow).__nativeCommandFence.deliver(sequence),
        sequence,
      );
      await expect.poll(value).toBe(action === 'undo' ? 'Alpha' : 'AlphaX');
      await expect
        .poll(() => writes(page))
        .toEqual(action === 'undo' ? ['Alpha'] : ['Alpha', 'AlphaX']);
      await settle(page);
      stages.push({
        action,
        sequence,
        before,
        after: await runtimeSnapshot(page),
        writes: await writes(page),
      });
    }
    // Do not click, restore a Range, delay, or resend this first key after Save.
    await page.keyboard.type('Q');
    await expect.poll(value).toBe('AlphaXQ');
    await page.keyboard.press('Meta+s');
    await expect.poll(() => writes(page)).toEqual(['Alpha', 'AlphaX', 'AlphaXQ']);
    const final = await runtimeSnapshot(page);
    expect(
      await page.evaluate(
        () => (window as NativeCommandFenceWindow).__nativeCommandFence.earlyWrites,
      ),
    ).toEqual([]);
    await info.attach('held-command-first-key', {
      body: JSON.stringify({ mode, stages, final }, null, 2),
      contentType: 'application/json',
    });
  });

test('canceling a real modal handoff keeps the new button owner through the late ACK and subsequent first key', async ({
  page,
}, info) => {
  await page.addInitScript(installRecoveryFocusGate);
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window === top) localStorage.setItem('marklyra-draft', '\uFEFFOriginal draft\r\n');
  });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: '恢复未保存的文档' });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.arm());
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.held))
    .toBe(1);
  await dialog.getByRole('button', { name: '取消关闭', exact: true }).click();
  const close = dialog.getByRole('button', { name: '关闭', exact: true });
  await expect(close).toBeFocused();
  const refresh = dialog.getByRole('button', { name: '刷新', exact: true });
  await refresh.focus();
  const before = await runtimeSnapshot(page);
  await page.evaluate(() => (window as RecoveryFocusWindow).__recoveryFocusGate.release());
  await expect(refresh).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(refresh).toBeFocused();
  expect(await runtimeSnapshot(page)).toEqual(before);
  await close.click();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.type('Q');
  await expect(frame(page).locator('#write')).toHaveText('Q');
  expect(await page.evaluate(() => localStorage.getItem('marklyra-draft'))).toBe(
    '\uFEFFOriginal draft\r\n',
  );
  await info.attach('modal-handoff-first-key', {
    body: JSON.stringify(
      { before, after: await runtimeSnapshot(page), scope: 'real React/SDK; Tauri IPC double' },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

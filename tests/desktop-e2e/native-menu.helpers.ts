import { expect, type Page } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';

/** Native cannot issue a disabled menu item. Wait for its actual published state. */
export async function waitForNativeUndo(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const snapshot = (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'sync_editor_menu_state')
          .at(-1)?.args.snapshot as
          | {
              ready: boolean;
              blocked: boolean;
              textInputFocused?: boolean;
              editor?: { locked: boolean; canUndo: boolean };
            }
          | undefined;
        return Boolean(
          snapshot?.ready &&
            !snapshot.blocked &&
            !snapshot.textInputFocused &&
            snapshot.editor?.canUndo &&
            !snapshot.editor.locked,
        );
      }),
    )
    .toBe(true);
}

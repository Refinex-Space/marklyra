import { expect, type Page } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';

/** Native cannot issue a disabled menu item. Wait for its actual published state. */
async function waitForNativeHistory(page: Page, availability: 'canUndo' | 'canRedo') {
  await expect
    .poll(() =>
      page.evaluate((availability) => {
        const snapshot = (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'sync_editor_menu_state')
          .at(-1)?.args.snapshot as
          | {
              ready: boolean;
              blocked: boolean;
              textInputFocused?: boolean;
              editor?: { locked: boolean; canUndo: boolean; canRedo: boolean };
            }
          | undefined;
        return Boolean(
          snapshot?.ready &&
            !snapshot.blocked &&
            !snapshot.textInputFocused &&
            snapshot.editor?.[availability] &&
            !snapshot.editor.locked,
        );
      }, availability),
    )
    .toBe(true);
}

export const waitForNativeUndo = (page: Page) => waitForNativeHistory(page, 'canUndo');
export const waitForNativeRedo = (page: Page) => waitForNativeHistory(page, 'canRedo');

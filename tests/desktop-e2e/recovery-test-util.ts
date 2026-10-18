import type { Page } from '@playwright/test';
import type { RecoveryMockWindow } from './recovery.helpers.js';

export { installRecoveryMock } from './recovery.helpers.js';

/** Assert the current document's durable draft, not the removed single WebView
 * localStorage fallback. Native disk durability is tested separately in Rust. */
export async function draftSource(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const name = document
      .querySelector('.document-title')
      ?.textContent?.replace(/\s*•\s*$/, '')
      .trim();
    const drafts = Object.values((window as RecoveryMockWindow).__recoveryMock.records)
      .filter(
        (draft) =>
          draft.active && (draft.document?.path.split(/[\\/]/).at(-1) ?? '未命名') === name,
      )
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const latest = drafts.at(-1);
    return latest && latest.text !== latest.savedText ? latest.text : null;
  });
}

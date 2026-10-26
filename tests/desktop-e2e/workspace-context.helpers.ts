import { expect, type Page } from '@playwright/test';

/** The folder button opens navigation/history. Root file actions belong to the
 * file view's background, whose context target deliberately has no entry path. */
export async function requestWorkspaceRootMenu(page: Page): Promise<void> {
  const panel = page.locator('.workspace-panel[aria-label="文件"]:visible');
  const target: { position: { x: number; y: number } | null } = { position: null };
  await expect
    .poll(
      async () => {
        target.position = await panel.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const x = Math.min(12, bounds.width / 2);
          for (let y = bounds.height - 12; y >= 12; y -= 12) {
            const target = element.ownerDocument.elementFromPoint(bounds.left + x, bounds.top + y);
            if (
              target &&
              element.contains(target) &&
              !target.closest('[data-entry-path],button,input,textarea,select,.workspace-footer')
            )
              return { x, y };
          }
          return null;
        });
        return target.position !== null;
      },
      { message: 'The workspace background must be visible and unobstructed before right-click' },
    )
    .toBe(true);
  if (!target.position) throw new Error('Missing workspace background position');
  await panel.click({ button: 'right', position: target.position });
}

export async function openWorkspaceRootMenu(page: Page): Promise<void> {
  await requestWorkspaceRootMenu(page);
  await expect(page.getByRole('menu', { name: '文件操作', exact: true })).toBeVisible();
}

/** Revoking a mount removes its directory views while keeping the permanent
 * folder picker available, with no stale workspace name or path on the trigger. */
export async function expectWorkspaceUnmounted(page: Page, name = 'Creation'): Promise<void> {
  const sidebar = page.locator('.workspace-sidebar');
  await expect(sidebar).toHaveAttribute('data-empty', 'true');
  await expect(page.getByRole('navigation', { name: `${name} 文件目录`, exact: true })).toHaveCount(
    0,
  );
  await expect(sidebar.locator('.workspace-panel')).toHaveCount(0);
  const trigger = sidebar.getByRole('button', { name: '目录菜单', exact: true });
  await expect(trigger).toHaveText('打开文件夹…');
  await expect(trigger).toHaveAttribute('title', '打开文件夹…');
  await expect(trigger.locator('.workspace-root-name')).not.toHaveAttribute('title', /.+/);
}

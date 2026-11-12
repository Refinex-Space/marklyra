import { expect, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// WebKit keeps the computed styles of the hidden runtime sidebar after a theme swap, so the
// projected selected-file colours stayed those of the light theme the page started with.
test('after a switch to dark, the selected file uses the dark theme colours', async ({ page }) => {
  await installLayout(page, 'Notes');
  await readyLayout(page, 'marklyra-dark');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  const selected = page.locator('.workspace-article[aria-current="page"]');
  await expect(selected).toBeVisible();
  // marklyra-dark: --active-file-bg-color #21262d, --active-file-text-color #f0f6fc.
  await expect(selected).toHaveCSS('background-color', 'rgb(33, 38, 45)');
  await expect(selected).toHaveCSS('color', 'rgb(240, 246, 252)');
});

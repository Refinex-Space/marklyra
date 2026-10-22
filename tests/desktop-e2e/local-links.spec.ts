import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const source = [
  '# Links',
  '',
  '[其他文档](Notes/Other.md)',
  '',
  '[编码路径](Notes/%E4%B8%AD%E6%96%87%20%E7%AC%94%E8%AE%B0%EF%BC%9AAdvisor.md)',
  '',
  '[绝对路径](/mock/layout/Notes/绝对 路径：记忆.md)',
  '',
  '[越界](../../etc/passwd.md)',
  '',
].join('\n');
const frame = (page: Page) => page.frameLocator('.runtime-area .marklyra-editor-frame');
const nextPath = (page: Page) =>
  page.evaluate(() => (window as TestWindow).__desktopMock.nextDocument?.path);
async function open(page: Page, name: string) {
  await frame(page).locator('#write > h1').click();
  await frame(page)
    .getByRole('link', { name, exact: true })
    .click({ modifiers: ['Meta'] });
}

test('Cmd-click opens local document links inside the open folder', async ({ page }) => {
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible();
  await open(page, '其他文档');
  await expect(frame(page).locator('#write > h1')).toHaveText('Other');
  await expect(frame(page).locator('#md-notification')).not.toContainText('Cannot open location');
});

for (const [name, path] of [
  ['编码路径', '/mock/layout/Notes/中文 笔记：Advisor.md'],
  ['绝对路径', '/mock/layout/Notes/绝对 路径：记忆.md'],
] as const)
  test(`${name}: CJK and spaces reach the folder document unchanged`, async ({ page }) => {
    await installLayout(page);
    await readyLayout(page, 'marklyra-light');
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'open-folder');
    await open(page, name);
    await expect.poll(() => nextPath(page)).toBe(path);
    await expect(frame(page).locator('#md-notification')).not.toContainText('Cannot open location');
  });

test('a link outside the folder is refused with a message, not offered as a new file', async ({
  page,
}) => {
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await open(page, '越界');
  await expect(
    page.getByText('超出可访问范围').or(page.getByText('不在当前打开的文件夹内')),
  ).toBeVisible();
  await expect(frame(page).locator('#md-notification')).not.toContainText('Cannot open location');
  await expect(frame(page).locator('#write > h1')).toHaveText('Links');
});

import { expect, test } from '@playwright/test';
import type { WorkspaceEntry } from '../../apps/desktop/src/services/workspaces.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const folder = '01 开始使用';
const nested = `${folder}/团队协作与长期维护的项目资料`;
const entries: WorkspaceEntry[] = [
  { name: folder, relativePath: folder, kind: 'directory', size: null },
  { name: nested.split('/').at(-1) ?? '', relativePath: nested, kind: 'directory', size: null },
  ...[
    'Layout.md',
    `${folder}/建立第一个工作区与中文文档的组织方式.md`,
    `${folder}/01_组织文档与快速检索_专业 Markdown 写作指南.md`,
    `${nested}/跨目录项目协作与详细的会议记录和待办事项.md`,
    `${nested}/Long English filename with spaces and 中文 mixed together.md`,
  ].map(
    (relativePath): WorkspaceEntry => ({
      name: relativePath.split('/').at(-1) ?? '',
      relativePath,
      kind: 'file',
      size: 10,
    }),
  ),
];

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: sidebar tree icons and names remain on one line while resizing with ellipsis`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript((entries) => {
      if (window !== window.top) return;
      const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      const original = internal.invoke;
      internal.invoke = async (command, args = {}) => {
        if (command === 'list_directory')
          return {
            entries: entries.filter((entry) => {
              const slash = entry.relativePath.lastIndexOf('/');
              return (
                (slash < 0 ? '' : entry.relativePath.slice(0, slash)) === (args.relativePath ?? '')
              );
            }),
            truncated: false,
            skipped: 0,
          };
        return original(command, args);
      };
    }, entries);
    await readyLayout(page, theme);
    await openLayoutDocument(page);
    const iframe = await page.locator('.runtime-area iframe').elementHandle();
    const history = await layoutHistory(page);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:files');
    for (const path of [folder, nested])
      await page.locator(`button.workspace-tree-row[data-entry-path="${path}"]`).click();
    const rows = page.locator('button.workspace-tree-row');
    await expect(rows).toHaveCount(entries.length);
    const sidebar = page.locator('aside.sidebar');
    const divider = page.getByRole('separator', { name: '调整侧栏宽度' });
    for (const position of ['narrow', 'middle', 'wide', 'narrow-again']) {
      await divider.press(position === 'wide' ? 'End' : 'Home');
      if (position === 'middle') {
        for (let index = 0; index < 3; index++) await divider.press('Shift+ArrowRight');
      }
      const geometry = await rows.evaluateAll((elements) =>
        elements.map((element) => {
          const name = element.querySelector('.workspace-tree-name');
          const icon = element.querySelector(':scope > .workspace-glyph');
          if (!name || !icon) throw Error('Missing tree name or icon');
          const bounds = element.getBoundingClientRect();
          const text = name.getBoundingClientRect();
          const glyph = icon.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(name);
          return {
            height: bounds.height,
            lines: new Set([...range.getClientRects()].map((box) => box.top.toFixed(1))).size,
            center: Math.abs(text.y + text.height / 2 - glyph.y - glyph.height / 2),
            gap: text.left - glyph.right,
            fits: text.right <= bounds.right && glyph.width > 0,
            ellipsis: getComputedStyle(name).textOverflow,
            clipped: name.scrollWidth > name.clientWidth,
            title: element.getAttribute('title'),
            path: element.getAttribute('data-entry-path'),
          };
        }),
      );
      for (const row of geometry) {
        expect(row.lines).toBe(1);
        expect(row.height).toBe(geometry[0]?.height);
        expect(row.center).toBeLessThanOrEqual(1);
        expect(row.gap).toBeGreaterThanOrEqual(0);
        expect(row.fits).toBe(true);
        expect(row.ellipsis).toBe('ellipsis');
        expect(row.title).toBe(row.path);
      }
      if (position.startsWith('narrow')) expect(geometry.some((row) => row.clipped)).toBe(true);
      expect(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await sidebar.screenshot({ path: info.outputPath(`tree-${position}.png`) });
    }
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    expect(await layoutHistory(page)).toBe(history);
  });
}

import { expect, type Page, test } from '@playwright/test';
import type {
  DirectoryHistoryCatalog,
  DirectoryHistoryEntry,
} from '../../apps/desktop/src/services/directory-history.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type Configuration = {
  mounted?: boolean;
  named?: boolean;
  historyOff?: boolean;
  empty?: boolean;
  runtime?: string;
};
interface DirectoryProbe {
  calls: { command: string; args: Record<string, unknown> }[];
  entries: DirectoryHistoryEntry[];
  revision: number;
  failure: string | null;
  holdList: boolean;
  heldLists: (() => void)[];
  releaseLists(): void;
}
type Host = TestWindow & {
  directoryProbe: DirectoryProbe;
  __TAURI_INTERNALS__: {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
};
function installDirectoryHistoryMock(configuration: Configuration) {
  if (window !== window.top) return;
  const host = window as Host;
  const mounted = configuration.mounted !== false;
  const source = '\uFEFFKeep **Bravo**\r\n\r\nTail  \r\n';
  host.__desktopMock.startupBoot = {
    document:
      configuration.named === false
        ? null
        : { id: 'kept-document', path: '/mock/Keep.md', text: source, encoding: 'UTF-8' },
    workspace: mounted ? { id: 'workspace-current', name: 'Current', path: '/mock/Current' } : null,
    warnings: [],
  };
  const make = (name: string, pinned = false, reopenable = true): DirectoryHistoryEntry => ({
    target: { kind: 'history', id: `history-${name}` },
    name,
    path: `/mock/${name}`,
    pinned,
    current: false,
    reopenable,
  });
  const probe: DirectoryProbe = {
    calls: [],
    entries: [
      make('Recent1'),
      make('Pinned1', true),
      make('Recent2'),
      make('Pinned2', true),
      make('Tail1'),
      make('Tail2'),
      make('Tail3'),
      make('Legacy', false, false),
    ],
    revision: 7,
    failure: null,
    holdList: false,
    heldLists: [],
    releaseLists() {
      for (const release of this.heldLists.splice(0)) release();
    },
  };
  host.directoryProbe = probe;
  const previous = host.__TAURI_INTERNALS__.invoke;
  const catalog = (workspaceId: unknown): DirectoryHistoryCatalog => ({
    revision: probe.revision,
    noRecentFiles: configuration.historyOff === true,
    entries: [
      ...probe.entries.map((e) => ({ ...e, target: { ...e.target } })),
      ...(typeof workspaceId === 'string'
        ? [
            {
              target: { kind: 'workspace' as const, workspaceId },
              name:
                workspaceId === 'workspace-current'
                  ? 'Current'
                  : workspaceId === 'workspace-picker'
                    ? 'Picked'
                    : workspaceId.replace('workspace-', ''),
              path: `/mock/${workspaceId}`,
              pinned: false,
              current: true,
              reopenable: true,
            },
          ]
        : []),
    ],
  });
  const find = (value: unknown) =>
    probe.entries.find((entry) => JSON.stringify(entry.target) === JSON.stringify(value));
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'editor_runtime_url' && configuration.runtime) return configuration.runtime;
    if (
      ![
        'list_directory_history',
        'pin_directory_history',
        'remove_directory_history',
        'open_directory_history',
        'open_directory_history_window',
        'select_workspace',
        'close_workspace',
        'reveal_workspace_directory',
        'list_directory',
        'list_workspace_documents',
      ].includes(command)
    )
      return previous(command, args);
    probe.calls.push({ command, args });
    if (command === 'list_directory_history') {
      const value = catalog(args.currentWorkspaceId);
      if (probe.holdList) {
        probe.holdList = false;
        return new Promise((resolve) => probe.heldLists.push(() => resolve(value)));
      }
      return value;
    }
    if (command === 'select_workspace')
      return { id: 'workspace-picker', name: 'Picked', path: '/mock/Picked' };
    if (command === 'close_workspace' || command === 'reveal_workspace_directory') return null;
    if (command === 'list_directory') return { entries: [], truncated: false, skipped: 0 };
    if (command === 'list_workspace_documents')
      return {
        entries: [],
        truncated: false,
        scannedFiles: 0,
        scannedEntries: 0,
        readBytes: 0,
        skipped: {
          symlinks: 0,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 0,
        },
        truncationReasons: [],
      };
    if (args.expectedRevision !== probe.revision) throw Error('目录历史版本冲突');
    if (probe.failure) throw Error(probe.failure);
    if (command === 'open_directory_history_window') return 'editor-history-window';
    if (command === 'open_directory_history') {
      const record = find(args.target);
      if (!record) throw Error('Unknown history target');
      return { id: `workspace-${record.name}`, name: record.name, path: record.path };
    }
    const record = find(args.target);
    if (!record) throw Error('Unknown history target');
    if (command === 'pin_directory_history') {
      probe.entries = probe.entries.filter((e) => e !== record);
      const changed = { ...record, pinned: args.pinned === true };
      if (changed.pinned) probe.entries.unshift(changed);
      else probe.entries.push(changed);
    } else probe.entries = probe.entries.filter((e) => e !== record);
    return { revision: ++probe.revision };
  };
}
const menu = (page: Page) => page.getByRole('menu', { name: '目录操作', exact: true });
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
async function start(page: Page, configuration: Configuration = {}) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installDirectoryHistoryMock, {
    ...configuration,
    runtime: process.env.DIRECTORY_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  if (configuration.named !== false) await expect(write(page)).toHaveText('Keep **Bravo**Tail');
  await expect(page.locator('.workspace-sidebar')).toBeVisible();
}
async function open(page: Page) {
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
}
async function calls(page: Page, command: string) {
  return page.evaluate(
    (command) => (window as Host).directoryProbe.calls.filter((call) => call.command === command),
    command,
  );
}
async function names(page: Page) {
  return menu(page)
    .locator('.directory-location-open > span:not([aria-hidden="true"])')
    .allTextContents();
}
async function save(page: Page) {
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('\uFEFFKeep **Bravo**\r\n\r\nTail  \r\n');
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: directory popup and footer avoid focus rings while retaining keyboard navigation`, async ({
    page,
  }, info) => {
    await start(page, { mounted: false });
    await page.evaluate(
      (theme) => (window as TestWindow).__desktopMock.emitMenu(`theme:${theme}`),
      theme,
    );
    await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', theme);
    await open(page);
    const trigger = page.getByRole('button', { name: '目录菜单', exact: true });
    await expect(menu(page)).toBeFocused();
    await expect(menu(page)).toHaveCSS('outline-style', 'none');
    await expect(menu(page)).not.toHaveCSS('box-shadow', 'none');
    const footerBounds = await page.locator('.workspace-footer').boundingBox();
    const popupBounds = await menu(page).boundingBox();
    if (!footerBounds || !popupBounds) throw Error('Missing directory menu geometry');
    await page.screenshot({
      path: info.outputPath('directory-focus-and-dots.png'),
      clip: {
        x: footerBounds.x,
        y: popupBounds.y - 2,
        width: footerBounds.width,
        height: footerBounds.y + footerBounds.height - popupBounds.y + 2,
      },
    });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveCSS('outline-style', 'none');
    await trigger.press('ArrowDown');
    await expect(menu(page)).toBeFocused();
    await expect(menu(page)).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('ArrowDown');
    await expect(
      menu(page).locator('button:not(:disabled):not([data-menu-skip-roving])').first(),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('original one Recent Locations group, pinned order, six plus current, geometry and real dismiss', async ({
  page,
}, info) => {
  await start(page);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await open(page);
  await expect
    .poll(() => names(page))
    .toEqual(['Pinned1', 'Pinned2', 'Recent1', 'Recent2', 'Tail1', 'Tail2', 'Current']);
  await expect(menu(page).getByText('最近使用的目录', { exact: true })).toHaveCount(1);
  await expect(menu(page).getByText('固定的目录', { exact: true })).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', { name: '关闭目录', exact: true })).toHaveCount(0);
  await expect(menu(page).locator('[data-current] .directory-current-dot')).toHaveCount(1);
  const rect = await menu(page).evaluate((element) => {
    const sidebarElement = element.closest('.sidebar');
    const footerElement = element.closest('.workspace-footer');
    if (!sidebarElement || !footerElement) throw Error('Missing sidebar layout');
    const sidebar = sidebarElement.getBoundingClientRect(),
      r = element.getBoundingClientRect();
    return {
      left: r.left - sidebar.left,
      right: sidebar.right - r.right,
      borderRight: Number.parseFloat(getComputedStyle(sidebarElement).borderRightWidth),
      width: r.width,
      footer: footerElement.getBoundingClientRect().height,
      rows: [...element.querySelectorAll('.directory-location-row')].map(
        (row) => row.getBoundingClientRect().height,
      ),
    };
  });
  expect(rect.left).toBeCloseTo(4, 0);
  expect(rect.right - rect.borderRight).toBeCloseTo(4, 0);
  expect(rect.footer).toBe(34);
  expect(rect.rows.every((height) => height > 23 && height < 25)).toBe(true);
  await info.attach('geometry', { body: JSON.stringify(rect), contentType: 'application/json' });
  await expect
    .poll(() =>
      page.locator('.workspace-footer').evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe('1');
  await page.screenshot({ path: info.outputPath('directory-menu.png') });
  await menu(page).getByRole('menuitem', { name: 'Current', exact: true }).click();
  expect(await calls(page, 'open_directory_history')).toEqual([]);
  expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
  await open(page);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '目录菜单', exact: true })).toBeFocused();
  await open(page);
  await write(page).click();
  await expect(menu(page)).toHaveCount(0);
});

test('pin and remove await catalog ACK without changing mounted folder, document or iframe', async ({
  page,
}) => {
  await start(page);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await open(page);
  await menu(page).getByRole('menuitemcheckbox', { name: '固定 Recent1', exact: true }).click();
  await expect(
    menu(page).getByRole('menuitemcheckbox', { name: '取消固定 Recent1', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(menu(page).locator('[data-pinned] .directory-location-remove')).toHaveCount(0);
  await menu(page).getByRole('menuitem', { name: '从列表中删除 Recent2', exact: true }).click();
  await expect(menu(page).getByRole('menuitem', { name: 'Recent2', exact: true })).toHaveCount(0);
  expect(await calls(page, 'open_directory_history')).toEqual([]);
  expect(await calls(page, 'close_workspace')).toEqual([]);
  expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
  await page.keyboard.press('Escape');
  await save(page);
});

test('ordinary history changes only mount, releases old authority and preserves exact saved source', async ({
  page,
}) => {
  await start(page);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await open(page);
  await menu(page).getByRole('menuitem', { name: 'Pinned1', exact: true }).click();
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Pinned1');
  expect((await calls(page, 'open_directory_history'))[0]?.args).toEqual({
    expectedRevision: 7,
    target: { kind: 'history', id: 'history-Pinned1' },
  });
  await expect
    .poll(() => calls(page, 'close_workspace'))
    .toContainEqual({ command: 'close_workspace', args: { workspaceId: 'workspace-current' } });
  expect(await calls(page, 'open_directory_history_window')).toEqual([]);
  expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
  await save(page);
});

test('Meta history honors authoritative named-document new-window route and leaves old mount', async ({
  page,
}) => {
  await start(page);
  await open(page);
  await menu(page)
    .getByRole('menuitem', { name: 'Pinned1', exact: true })
    .click({ modifiers: ['Meta'] });
  await expect.poll(() => calls(page, 'open_directory_history_window')).toHaveLength(1);
  expect(await calls(page, 'open_directory_history')).toEqual([]);
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Current');
  expect(await calls(page, 'close_workspace')).toEqual([]);
  await save(page);
});

test('Meta history in clean untitled document switches same window and shows files', async ({
  page,
}) => {
  await start(page, { named: false });
  await open(page);
  await menu(page)
    .getByRole('menuitem', { name: 'Pinned1', exact: true })
    .click({ modifiers: ['Meta'] });
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Pinned1');
  expect(await calls(page, 'open_directory_history_window')).toEqual([]);
  expect(await calls(page, 'open_directory_history')).toHaveLength(1);
  await expect(write(page)).toHaveText('');
});

test('Meta history flushes a real dirty untitled editor before choosing a new window', async ({
  page,
}) => {
  await start(page, { named: false });
  await write(page).locator('p').first().click();
  await page.keyboard.type('Unsaved 中文');
  await expect(write(page)).toHaveText('Unsaved 中文');
  await open(page);
  await menu(page)
    .getByRole('menuitem', { name: 'Pinned1', exact: true })
    .click({ modifiers: ['Meta'] });
  await expect.poll(() => calls(page, 'open_directory_history_window')).toHaveLength(1);
  expect(await calls(page, 'open_directory_history')).toEqual([]);
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Current');
  await expect(write(page)).toHaveText('Unsaved 中文');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('rejected history target leaves old mount, authority and exact document intact', async ({
  page,
}) => {
  await start(page);
  await open(page);
  await page.evaluate(() => ((window as Host).directoryProbe.failure = '目录身份已经改变'));
  await menu(page).getByRole('menuitem', { name: 'Pinned1', exact: true }).click();
  await expect(page.locator('.workspace-error[role="alert"]')).toContainText('目录身份已经改变');
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Current');
  expect(await calls(page, 'close_workspace')).toEqual([]);
  await save(page);
});

test('mounted picker uses fresh temporary grant for new window then closes only that grant', async ({
  page,
}) => {
  await start(page);
  await open(page);
  await menu(page).getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
  await expect
    .poll(() => calls(page, 'open_directory_history_window'))
    .toContainEqual({
      command: 'open_directory_history_window',
      args: { expectedRevision: 7, target: { kind: 'workspace', workspaceId: 'workspace-picker' } },
    });
  await expect
    .poll(() => calls(page, 'close_workspace'))
    .toEqual([{ command: 'close_workspace', args: { workspaceId: 'workspace-picker' } }]);
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Current');
  await save(page);
});

test('no mount original empty state and picker mounts current window without new document', async ({
  page,
}) => {
  await start(page, { mounted: false });
  await page.locator('.sidebar').hover();
  await expect(page.getByText('没有打开的文件夹', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开文件夹…', exact: true })).toHaveCount(0);
  await open(page);
  await expect(menu(page).getByText('目录', { exact: true })).toHaveCount(1);
  await expect(menu(page).getByText('操作', { exact: true })).toHaveCount(0);
  await menu(page).getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Picked');
  expect(await calls(page, 'open_directory_history_window')).toEqual([]);
  await expect(page.getByText('没有支持的文档', { exact: true })).toHaveCount(0);
  await save(page);
});

test('metadata CAS failure stays visible, refetches and preserves document and directory', async ({
  page,
}) => {
  await start(page);
  await open(page);
  await page.evaluate(() => ((window as Host).directoryProbe.failure = '目录历史版本冲突'));
  await menu(page).getByRole('menuitemcheckbox', { name: '固定 Recent1', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('目录历史版本冲突');
  await expect(
    menu(page).getByRole('menuitemcheckbox', { name: '固定 Recent1', exact: true }),
  ).toBeEnabled();
  expect((await calls(page, 'list_directory_history')).length).toBeGreaterThan(1);
  expect(await calls(page, 'open_directory_history')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace-location-menu > span').first()).toHaveText('Current');
  await save(page);
});

test('closed-menu late catalog cannot overwrite reopened catalog, and legacy path never gains open authority', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const probe = (window as Host).directoryProbe;
    probe.holdList = true;
    probe.entries = probe.entries.filter((e) => e.name === 'Recent1');
  });
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Host).directoryProbe.heldLists.length))
    .toBe(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const probe = (window as Host).directoryProbe;
    probe.entries = [
      {
        target: { kind: 'history', id: 'legacy' },
        name: 'Legacy',
        path: '/display-only',
        current: false,
        pinned: false,
        reopenable: false,
      },
    ];
  });
  await open(page);
  await expect(menu(page).getByRole('menuitem', { name: 'Legacy', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as Host).directoryProbe.releaseLists());
  await expect.poll(() => names(page)).toEqual(['Legacy', 'Current']);
  expect(await calls(page, 'open_directory_history')).toEqual([]);
});

test('history-off retains only pinned and current and changes refresh while popup stays open', async ({
  page,
}) => {
  await start(page, { historyOff: true });
  await open(page);
  await expect.poll(() => names(page)).toEqual(['Pinned1', 'Pinned2', 'Current']);
  await page.evaluate(() => {
    const host = window as Host;
    host.directoryProbe.entries = host.directoryProbe.entries.filter(
      (entry) => entry.name !== 'Pinned1',
    );
    host.__desktopMock.emitEvent('directory-history-changed', null);
  });
  await expect.poll(() => names(page)).toEqual(['Pinned2', 'Current']);
});

test('Reveal passes only mounted authority, Search uses existing header and original sort actions remain live', async ({
  page,
}) => {
  await start(page);
  await open(page);
  await menu(page).getByRole('menuitem', { name: '在 Finder 中显示', exact: true }).click();
  await expect
    .poll(() => calls(page, 'reveal_workspace_directory'))
    .toEqual([
      { command: 'reveal_workspace_directory', args: { workspaceId: 'workspace-current' } },
    ]);
  await open(page);
  await menu(page).getByRole('menuitemradio', { name: '名称', exact: true }).click();
  await expect(
    menu(page).getByRole('menuitemradio', { name: '名称', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await menu(page).getByRole('menuitem', { name: '搜索', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
  await expect(menu(page)).toHaveCount(0);
  await save(page);
});

import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';
import { installRecentMock } from './recent.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type DailyWindow = TestWindow & {
  __daily: { notes: Record<string, string>; calls: { command: string; args: unknown }[] };
};

/** The host's daily commands over an in-memory folder; nested layout under Daily/. */
function installDailyHost({ notes, root }: { notes: Record<string, string>; root: string }) {
  if (window !== window.top) return;
  const host = window as DailyWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  };
  const state = { notes: { ...notes }, calls: [] as { command: string; args: unknown }[] };
  Reflect.set(window, '__daily', state);
  const relative = (key: string) =>
    key.includes('W')
      ? `Daily/${key.slice(0, 4)}/${key}.md`
      : `Daily/${key.slice(0, 4)}/${key.slice(5, 7)}/${key}.md`;
  const document = (key: string) => ({
    id: `daily-${key}`,
    path: `${root}/${relative(key)}`,
    text: state.notes[key] ?? '',
    encoding: 'UTF-8',
  });
  const previous = host.__TAURI_INTERNALS__.invoke;
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'read_daily_notes') {
      state.calls.push({ command, args });
      return (args.keys as string[])
        .filter((key) => state.notes[key] !== undefined)
        .map((key) => ({
          key,
          relativePath: relative(key),
          size: state.notes[key]?.length ?? 0,
          modifiedAt: 0,
          text: state.notes[key],
        }));
    }
    if (command === 'create_daily_note') {
      state.calls.push({ command, args });
      const key = String(args.key);
      if (state.notes[key] !== undefined) throw '该日期的日程文件已存在';
      state.notes[key] = String(args.text);
      setTimeout(() => host.__desktopMock.emitEvent('workspace-files-changed', null));
      return document(key);
    }
    if (command === 'open_workspace_document' && String(args.relativePath).startsWith('Daily/')) {
      const key = String(args.relativePath).split('/').at(-1)?.replace(/\.md$/, '') ?? '';
      state.calls.push({ command, args });
      return document(key);
    }
    if (command === 'save_document' && String(args.id).startsWith('daily-')) {
      const key = String(args.id).slice('daily-'.length);
      state.calls.push({ command, args });
      state.notes[key] = String(args.text);
      return document(key);
    }
    return previous(command, args);
  };
}

const calendar = (page: Page) => page.locator('.daily-calendar');
const day = (page: Page, key: string) => page.locator(`.daily-calendar [data-key="${key}"]`);
const calls = (page: Page, command: string) =>
  page.evaluate(
    (name) => (window as DailyWindow).__daily.calls.filter((call) => call.command === name),
    command,
  );
const editorText = (page: Page) =>
  page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write');

async function openDailyWorkspace(page: Page, titlebar: 'appkit' | 'web' = 'web') {
  // Wednesday 21 October 2026, local time.
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0, 0));
  await installLayout(page, undefined, titlebar);
  await page.addInitScript(installDailyHost, {
    root: '/mock/layout',
    notes: {
      '2026-10-20': '## 知识库\n\n- [ ] 09:30 站会\n- [x] 已完成\n',
      '2026-10-23': '只是记录\n',
    },
  });
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
  await expect(calendar(page)).toBeVisible();
}

for (const titlebar of ['web', 'appkit'] as const) {
  test(`${titlebar}: a day without a file opens as a draft and is created only when saved`, async ({
    page,
  }) => {
    await openDailyWorkspace(page, titlebar);
    await expect(calendar(page)).toHaveAttribute('data-view', 'week');
    await expect(day(page, '2026-10-21')).toHaveAttribute('aria-current', 'date');
    await expect(day(page, '2026-10-20').locator('.daily-day-mark')).toHaveAttribute(
      'data-mark',
      'open',
    );
    await expect(day(page, '2026-10-23').locator('.daily-day-mark')).toHaveAttribute(
      'data-mark',
      'note',
    );
    await expect(day(page, '2026-10-20')).toHaveAttribute(
      'title',
      /1 项待办，已完成 1\n09:30 站会/,
    );

    await day(page, '2026-10-22').click();
    const header = page.locator('.daily-header');
    await expect(header).toContainText('10月22日 周四');
    await expect(header).toContainText('明天');
    await expect(page.locator('.daily-header-draft')).toContainText('Daily/2026/10/2026-10-22.md');
    await expect(page.locator('.home-screen')).toHaveCount(0);
    await expect(day(page, '2026-10-22')).toHaveAttribute('aria-pressed', 'true');
    if (titlebar === 'web')
      await expect(page.locator('.titlebar-name')).toHaveText('2026-10-22.md');
    else
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                (window as TestWindow).__desktopMock.calls
                  .filter((call) => call.command === 'update_editor_chrome')
                  .at(-1)?.args as { payload?: { untitledName?: string } } | undefined
              )?.payload?.untitledName,
          ),
        )
        .toBe('2026-10-22.md');
    expect(await calls(page, 'create_daily_note')).toHaveLength(0);

    await editorText(page).click();
    await page.keyboard.type('写下第一件事');
    await emitLayoutMenu(page, 'save');
    await expect.poll(async () => (await calls(page, 'create_daily_note')).length).toBe(1);
    const [created] = await calls(page, 'create_daily_note');
    expect(created?.args).toMatchObject({
      workspaceId: 'layout-workspace',
      folder: 'Daily',
      layout: 'nested',
      key: '2026-10-22',
    });
    expect((created?.args as { text?: string } | undefined)?.text).toContain('写下第一件事');
    await expect(page.locator('.daily-header-draft')).toHaveCount(0);
    await expect(header).toContainText('10月22日 周四');
    await expect(day(page, '2026-10-22').locator('.daily-day-mark')).toHaveAttribute(
      'data-mark',
      'note',
    );

    // Saving again writes the same file; the day never becomes a Save As.
    await page.keyboard.type('，再补一句');
    await emitLayoutMenu(page, 'save');
    await expect.poll(async () => (await calls(page, 'save_document')).length).toBe(1);
    expect(await calls(page, 'create_daily_note')).toHaveLength(1);

    await day(page, '2026-10-20').click();
    await expect(editorText(page)).toContainText('站会');
    await expect(header).toContainText('昨天');
    const opened = await calls(page, 'open_workspace_document');
    expect(opened.at(-1)?.args).toMatchObject({ relativePath: 'Daily/2026/10/2026-10-20.md' });

    await header.getByRole('button', { name: '前一天' }).click();
    await expect(header).toContainText('10月19日 周一');
    await expect(page.locator('.daily-header-draft')).toContainText('2026-10-19.md');
    await header.getByRole('button', { name: '今天' }).click();
    await expect(header).toContainText('10月21日 周三');
  });
}

test('the month view navigates by mouse, keyboard and the month picker', async ({ page }) => {
  await openDailyWorkspace(page);
  await calendar(page).getByRole('button', { name: '切换为月视图' }).click();
  await expect(calendar(page)).toHaveAttribute('data-view', 'month');
  const title = calendar(page).locator('.daily-calendar-title');
  await expect(title).toContainText('2026年10月');
  await expect(calendar(page).locator('tbody tr')).toHaveCount(6);
  await expect(calendar(page).locator('tbody th').first()).toHaveText('40');

  await day(page, '2026-10-21').focus();
  await page.keyboard.press('ArrowRight');
  await expect(day(page, '2026-10-22')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(day(page, '2026-10-29')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(title).toContainText('2026年11月');
  await expect(day(page, '2026-11-29')).toBeFocused();

  await calendar(page).getByRole('button', { name: '今天' }).click();
  await expect(title).toContainText('2026年10月');
  await title.click();
  await calendar(page).getByRole('button', { name: '下一年' }).click();
  await calendar(page).getByRole('button', { name: '3月' }).click();
  await expect(title).toContainText('2027年3月');

  // The form is remembered with the other preferences.
  await calendar(page).getByRole('button', { name: '收起日历' }).click();
  await expect(calendar(page)).toHaveAttribute('data-view', 'collapsed');
  await expect(calendar(page).locator('.daily-calendar-summary')).toContainText(
    '今天 · 10月21日 周三',
  );
  await calendar(page).getByRole('button', { name: '展开日历' }).click();
  await expect(calendar(page)).toHaveAttribute('data-view', 'month');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').daily?.calendarView,
    ),
  ).toBe('month');
});

test('quick open and the menu reach days by name', async ({ page }) => {
  await openDailyWorkspace(page);
  await emitLayoutMenu(page, 'quick-open');
  await page.getByRole('combobox', { name: '输入命令或搜索' }).fill('下周一');
  const option = page.getByRole('option').first();
  await expect(option).toContainText('10月26日 周一');
  await page.keyboard.press('Enter');
  await expect(page.locator('.daily-header')).toContainText('10月26日 周一');

  await emitLayoutMenu(page, 'daily:today');
  await expect(page.locator('.daily-header')).toContainText('10月21日 周三');
  await emitLayoutMenu(page, 'daily:next');
  await expect(page.locator('.daily-header')).toContainText('10月22日 周四');

  await emitLayoutMenu(page, 'view:calendar');
  await expect(calendar(page)).toHaveAttribute('data-view', 'collapsed');
  await emitLayoutMenu(page, 'view:calendar');
  await expect(calendar(page)).toHaveAttribute('data-view', 'week');
});

test('a day created elsewhere meanwhile is never overwritten', async ({ page }) => {
  await openDailyWorkspace(page);
  await day(page, '2026-10-24').click();
  await editorText(page).click();
  await page.keyboard.type('本机草稿');
  // Another device syncs the same day before this draft is saved.
  await page.evaluate(() => {
    (window as DailyWindow).__daily.notes['2026-10-24'] = '来自同步的内容\n';
  });
  await emitLayoutMenu(page, 'save');
  await expect(page.getByText(/未覆盖/).first()).toBeVisible();
  expect(await page.evaluate(() => (window as DailyWindow).__daily.notes['2026-10-24'])).toBe(
    '来自同步的内容\n',
  );
  await expect(editorText(page)).toContainText('本机草稿');
  // The draft is now an ordinary untitled document; it no longer claims that day.
  await expect(page.locator('.daily-header')).toHaveCount(0);
});

test('the 日程 settings page changes where days are stored', async ({ page }) => {
  await openDailyWorkspace(page);
  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await ui.getByRole('button', { name: '日程', exact: true }).click();
  const settings = page.getByRole('region', { name: '日程设置' });
  await expect(settings).toBeVisible();
  await expect(ui.locator('.nav-group-item').last()).toHaveText('赞助');
  await expect(settings).toContainText('Daily/2026/10/2026-10-21.md');
  await settings.getByRole('radio', { name: '平铺' }).check();
  await expect(settings).toContainText('今天的日程：Daily/2026-10-21.md');
  const folder = settings.getByRole('textbox', { name: '日程目录' });
  await folder.fill('../outside');
  await folder.press('Enter');
  await expect(settings).toContainText('不能包含 . 或 ..');
  await folder.fill('笔记/日程');
  await folder.press('Enter');
  await expect(settings).toContainText('今天的日程：笔记/日程/2026-10-21.md');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').daily,
    ),
  ).toMatchObject({ folder: '笔记/日程', layout: 'flat' });
});

test('the home view lists today’s open items and opens the day at the chosen line', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 8, 0, 0));
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: 'web' as const,
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, {
    runtimeUrl: process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  });
  await page.addInitScript(installRecentMock);
  await page.addInitScript(installDailyHost, {
    root: '/mock/Creation',
    notes: { '2026-10-21': '## 今天\n\n- [x] 已完成\n- [ ] 修复知识库问题\n- [ ] 09:00 晨会\n' },
  });
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  const home = page.getByRole('region', { name: '开始' });
  await expect(home).toBeVisible();
  const today = home.locator('.home-today');
  await expect(today).toContainText('今日日程');
  await expect(today).toContainText('10月21日 周三');
  // Timed items first, done items left out.
  await expect(today.locator('li')).toHaveText([/09:00\s*晨会/, /修复知识库问题/]);
  await today.getByRole('button', { name: /修复知识库问题/ }).click();
  await expect(page.locator('.daily-header')).toContainText('10月21日 周三');
  const opened = await calls(page, 'open_workspace_document');
  expect(opened.at(-1)?.args).toMatchObject({
    workspaceId: 'creation-workspace',
    relativePath: 'Daily/2026/10/2026-10-21.md',
  });
  await expect(editorText(page)).toContainText('修复知识库问题');
});

test('the home view offers to start today when it has no note yet', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 0, 0));
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: 'appkit' as const,
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, {
    runtimeUrl: process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  });
  await page.addInitScript(installRecentMock);
  await page.addInitScript(installDailyHost, { root: '/mock/Creation', notes: {} });
  await page.goto('/');
  const today = page.getByRole('region', { name: '开始' }).locator('.home-today');
  await expect(today).toContainText('今天还没有日程');
  await today.getByRole('button', { name: /开始记录/ }).click();
  await expect(page.locator('.daily-header-draft')).toContainText('Daily/2026/10/2026-10-22.md');
  await expect(page.getByRole('region', { name: '开始' })).toHaveCount(0);
});

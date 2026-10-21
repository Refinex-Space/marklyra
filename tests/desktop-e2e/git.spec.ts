import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// Browser double of the native Git commands. It validates the shell's requests and replies with
// repository data; real git behaviour is covered by the Rust tests of the host module.
type GitWindow = TestWindow & {
  __git: {
    calls: { command: string; args: Record<string, unknown> }[];
    repository: boolean;
    conflicted: boolean;
  };
};
interface GitHostOptions {
  repository: boolean;
  conflicted: boolean;
}

function installGitHost(options: GitHostOptions) {
  if (window !== window.top) return;
  const host = window as GitWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  };
  const state = { calls: [] as GitWindow['__git']['calls'], ...options };
  Reflect.set(window, '__git', state);
  const head = { branch: 'main', oid: 'a'.repeat(40), detached: false, unborn: false };
  const repository = () => ({
    root: '/mock/layout',
    workspacePrefix: '',
    head,
    upstream: 'origin/main',
    ahead: 1,
    behind: 2,
    operation: state.conflicted ? 'merging' : 'none',
    remotes: [
      {
        name: 'origin',
        fetchUrl: 'git@github.com:owner/notes.git',
        pushUrl: 'git@github.com:owner/notes.git',
        protocol: 'ssh',
        host: 'github.com',
        hasEmbeddedCredentials: false,
      },
    ],
    identity: { name: 'Li Yao', email: 'liyao@example.com', scope: 'global' },
  });
  const changes = () =>
    state.conflicted
      ? [
          {
            path: 'Notes/Other.md',
            origPath: null,
            kind: 'conflicted',
            index: 'U',
            worktree: 'U',
            conflict: 'both-modified',
          },
        ]
      : [
          {
            path: 'Layout.md',
            origPath: null,
            kind: 'modified',
            index: '.',
            worktree: 'M',
            conflict: null,
          },
          {
            path: 'Notes/新笔记.md',
            origPath: null,
            kind: 'untracked',
            index: '?',
            worktree: '?',
            conflict: null,
          },
        ];
  const texts: Record<string, string> = {
    'HEAD:Layout.md': '# Layout Reference\n\nAlpha Bravo\n\n## Second\n',
    'WORKTREE:Layout.md': '# Layout Reference\n\nAlpha **Bravo** 中文\n\n## Second\n\nTail\n',
    ':1:Notes/Other.md': '# Other\n\n共同的段落\n\n结尾\n',
    ':2:Notes/Other.md': '# Other\n\n本地改写的段落\n\n结尾\n',
    ':3:Notes/Other.md': '# Other\n\n远程改写的段落\n\n结尾\n',
  };
  const commit = (index: number, parents: string[], subject: string, refs: unknown[] = []) => ({
    oid: String(index).repeat(40).slice(0, 40),
    parents,
    subject,
    body: '',
    authorName: 'Li Yao',
    authorEmail: 'liyao@example.com',
    authorTime: 1_790_000_000 - index * 3600,
    committerName: 'Li Yao',
    commitTime: 1_790_000_000 - index * 3600,
    refs,
  });
  const oid = (index: number) => String(index).repeat(40).slice(0, 40);
  const commits = [
    commit(1, [oid(2), oid(3)], 'Merge branch feature', [
      { kind: 'head', name: 'HEAD' },
      { kind: 'local', name: 'main' },
    ]),
    commit(2, [oid(4)], '整理目录'),
    commit(3, [oid(4)], '新增章节', [{ kind: 'remote', name: 'origin/feature/ui' }]),
    commit(4, [], '初始提交', [{ kind: 'tag', name: 'v1.0' }]),
  ];
  const previous = host.__TAURI_INTERNALS__.invoke;
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (!command.startsWith('git_')) return previous(command, args);
    state.calls.push({ command, args });
    switch (command) {
      case 'git_probe':
        return {
          git: { path: '/usr/bin/git', version: '2.53.0' },
          problem: null,
          repository: state.repository ? repository() : null,
        };
      case 'git_init':
        state.repository = true;
        return {
          git: { path: '/usr/bin/git', version: '2.53.0' },
          problem: null,
          repository: repository(),
        };
      case 'git_status':
        return {
          head,
          upstream: 'origin/main',
          ahead: 1,
          behind: 2,
          operation: state.conflicted ? 'merging' : 'none',
          changes: changes(),
          truncated: false,
        };
      case 'git_branches':
        return {
          current: 'main',
          local: [
            {
              name: 'main',
              oid: oid(1),
              upstream: 'origin/main',
              ahead: 1,
              behind: 2,
              gone: false,
              current: true,
              subject: 'Merge',
              time: 1,
            },
            {
              name: 'feature/ui',
              oid: oid(3),
              upstream: null,
              ahead: 0,
              behind: 0,
              gone: false,
              current: false,
              subject: '新增章节',
              time: 1,
            },
            {
              name: 'draft',
              oid: oid(2),
              upstream: null,
              ahead: 0,
              behind: 0,
              gone: false,
              current: false,
              subject: '整理目录',
              time: 1,
            },
          ],
          remote: [
            {
              remote: 'origin',
              name: 'main',
              fullName: 'origin/main',
              oid: oid(1),
              subject: 'Merge',
              time: 1,
            },
            {
              remote: 'origin',
              name: 'feature/ui',
              fullName: 'origin/feature/ui',
              oid: oid(3),
              subject: '新增章节',
              time: 1,
            },
          ],
          tags: [{ name: 'v1.0', oid: oid(4), time: 1 }],
        };
      case 'git_log':
        return { commits, hasMore: false };
      case 'git_commit_details':
        return {
          commit: {
            ...(commits.find((item) => item.oid === args.oid) ?? commits[0]),
            body: '详细说明',
          },
          files: [
            {
              path: 'Layout.md',
              origPath: null,
              status: 'M',
              additions: 3,
              deletions: 1,
              binary: false,
            },
          ],
        };
      case 'git_file_text': {
        const spec = args.spec as { rev: string; path: string };
        const key = spec.rev.startsWith(':')
          ? `${spec.rev}:${spec.path}`
          : `${spec.rev}:${spec.path}`;
        const text = texts[key] ?? (spec.rev === 'WORKTREE' ? '新内容\n' : null);
        return { text, binary: false, tooLarge: false, bom: false, crlf: false };
      }
      case 'git_conflicts':
        return {
          operation: state.conflicted ? 'merging' : 'none',
          yoursStage: 2,
          yoursLabel: 'main',
          theirsLabel: 'origin/main',
          files: state.conflicted ? [{ path: 'Notes/Other.md', kind: 'both-modified' }] : [],
        };
      case 'git_resolve':
        state.conflicted = false;
        return null;
      case 'git_commit':
        return { oid: 'f'.repeat(40) };
      case 'git_checkout':
      case 'git_cancel':
        return null;
      case 'git_detect_proxy':
        return {
          environment: null,
          system: 'http://127.0.0.1:7890',
          gitConfig: null,
          effective: 'http://127.0.0.1:7890',
        };
      case 'git_credentials_list':
        return [];
      default:
        throw `unexpected ${command}`;
    }
  };
}

async function openRepository(page: Page, options: Partial<GitHostOptions> = {}) {
  await installLayout(page, undefined, 'web');
  await page.addInitScript(installGitHost, { repository: true, conflicted: false, ...options });
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
}
const gitCalls = (page: Page, command: string) =>
  page.evaluate(
    (name) => (window as GitWindow).__git.calls.filter((call) => call.command === name),
    command,
  );

test('the sidebar branch button opens IDEA-style branch management', async ({ page }) => {
  await openRepository(page);
  const widget = page.locator('.workspace-navigation-header .git-branch-widget');
  await expect(widget).toBeVisible();
  await expect(widget).toContainText('main');
  await expect(widget).toContainText('↓2');
  await expect(widget).toContainText('↑1');
  await expect(widget).toHaveAttribute('data-state', 'dirty');

  await widget.click();
  const popup = page.getByRole('dialog', { name: 'Git 分支' });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('searchbox', { name: '搜索分支和操作' })).toBeFocused();
  await expect(popup.locator('.git-popup-heading')).toContainText(['本地', '远程']);
  // Branches with a slash group into folders, as in IDEA.
  await expect(popup.locator('.git-popup-folder', { hasText: 'feature' }).first()).toBeVisible();

  await page.keyboard.type('draft');
  await expect(popup.locator('.git-popup-branch')).toHaveCount(1);
  await popup.locator('.git-popup-branch', { hasText: 'draft' }).click();
  const menu = page.getByRole('menu', { name: '分支操作' });
  await expect(menu.getByRole('menuitem', { name: /签出并变基到/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /将 “draft” 合并到 “main”/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: '签出', exact: true }).click();
  await expect.poll(async () => (await gitCalls(page, 'git_checkout')).length).toBe(1);
  expect((await gitCalls(page, 'git_checkout'))[0]?.args).toMatchObject({
    target: 'draft',
    kind: 'local',
  });
  await expect(popup).toHaveCount(0);
});

test('the Git view commits the checked changes and covers the editor', async ({ page }) => {
  await openRepository(page);
  await emitLayoutMenu(page, 'git:panel');
  const view = page.getByRole('region', { name: 'Git' });
  await expect(view).toBeVisible();
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  await expect(view.getByRole('tab', { name: /提交/ })).toHaveAttribute('aria-selected', 'true');

  const list = view.getByRole('listbox', { name: '更改的文件' });
  await expect(list.locator('.git-file-row')).toHaveCount(2);
  // The diff preview shows the selected file with intra-line highlighting.
  await expect(view.locator('.git-diff-text[data-state="inserted"] mark').first()).toBeVisible();

  await list.getByRole('checkbox', { name: '提交 Notes/新笔记.md' }).uncheck();
  await view.getByRole('textbox', { name: '提交信息' }).fill('docs: 更新布局说明');
  await page.keyboard.press('Control+Enter');
  await expect.poll(async () => (await gitCalls(page, 'git_commit')).length).toBe(1);
  expect((await gitCalls(page, 'git_commit'))[0]?.args).toMatchObject({
    message: 'docs: 更新布局说明',
    paths: ['Layout.md'],
    amend: false,
  });

  await view.getByRole('tab', { name: '日志' }).click();
  await expect(view.locator('.git-log-row')).toHaveCount(4);
  await expect(
    view.locator('.git-log-row').first().locator('.git-ref[data-kind="head"]'),
  ).toBeVisible();
  await expect(view.locator('.git-graph circle[data-merge="true"]')).toHaveCount(1);
  await expect(view.locator('.git-commit-info')).toContainText('详细说明');

  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(page.locator('.runtime-editor-mount')).not.toHaveAttribute('inert', '');
});

test('conflicts resolve in the three-way merge tool', async ({ page }) => {
  await openRepository(page, { conflicted: true });
  await emitLayoutMenu(page, 'git:conflicts');
  const conflicts = page.getByRole('dialog', { name: '冲突' });
  await expect(conflicts).toBeVisible();
  await expect(conflicts.locator('tbody tr')).toHaveCount(1);
  await expect(conflicts.getByRole('columnheader', { name: /你的 · main/ })).toBeVisible();
  await conflicts.getByRole('button', { name: '合并…' }).click();

  const merge = page.getByRole('dialog', { name: '合并修订' });
  await expect(merge).toBeVisible();
  await expect(conflicts).toBeHidden();
  await expect(merge.locator('.git-merge-counter')).toContainText('1 处冲突未解决');
  await merge.getByRole('button', { name: '采用你的更改' }).click();
  await merge.getByRole('button', { name: '采用他们的更改' }).click();
  await expect(merge.locator('.git-merge-counter')).toContainText('全部冲突已解决');
  await expect(merge.locator('.git-merge-result')).toContainText('你的 + 他们的');
  await merge.getByRole('button', { name: '应用', exact: true }).click();

  await expect.poll(async () => (await gitCalls(page, 'git_resolve')).length).toBe(1);
  expect((await gitCalls(page, 'git_resolve'))[0]?.args).toEqual({
    workspaceId: 'layout-workspace',
    path: 'Notes/Other.md',
    resolution: {
      kind: 'content',
      text: '# Other\n\n本地改写的段落\n远程改写的段落\n\n结尾\n',
      bom: false,
      crlf: false,
    },
  });
  await expect(merge).toHaveCount(0);
});

test('a folder that is not a repository can be initialized from the branch button', async ({
  page,
}) => {
  await openRepository(page, { repository: false });
  const widget = page.locator('.workspace-navigation-header .git-branch-widget');
  await expect(widget).toHaveAttribute('data-state', 'none');
  await widget.click();
  await page.getByRole('button', { name: '初始化仓库…' }).click();
  const dialog = page.getByRole('dialog', { name: '初始化 Git 仓库' });
  await expect(dialog.getByRole('textbox', { name: '默认分支名称' })).toHaveValue('main');
  await dialog.getByRole('button', { name: '初始化' }).click();
  await expect.poll(async () => (await gitCalls(page, 'git_init')).length).toBe(1);
  expect((await gitCalls(page, 'git_init'))[0]?.args).toMatchObject({
    defaultBranch: 'main',
    gitignore: true,
  });
  await expect(widget).toContainText('main');
});

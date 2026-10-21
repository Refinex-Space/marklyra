import {
  type GitBranches,
  type GitLocalBranch,
  type GitRemoteBranch,
  git,
  gitError,
} from '../../services/git.js';
import { notify } from '../notices/notices.js';
import { branchStore } from './branch-store.js';
import type { GitMenuEntry } from './GitMenu.js';
import type { GitContextValue } from './GitProvider.js';
import { gitNetwork } from './git-preferences.js';

export type BranchTarget =
  | { kind: 'local'; branch: GitLocalBranch }
  | { kind: 'remote'; branch: GitRemoteBranch };

const quote = (name: string) => `“${name}”`;

/** Checks out a branch and remembers it among the recent ones. */
export async function checkoutBranch(
  context: GitContextValue,
  target: string,
  kind: 'local' | 'remote' | 'revision',
) {
  const root = context.probe?.repository?.root;
  let done = false;
  await context.run(
    '签出',
    async (id) => {
      await git.checkout(id, target, kind);
      done = true;
    },
    {
      touchesWorkTree: true,
      success: () =>
        kind === 'revision' ? `已签出修订 ${target}（分离 HEAD）` : `已签出 ${target}`,
    },
  );
  if (done && root && kind !== 'revision')
    branchStore.visit(root, kind === 'remote' ? target.slice(target.indexOf('/') + 1) : target);
  return done;
}

export function deleteBranch(context: GitContextValue, name: string) {
  context.openDialog({
    kind: 'confirm',
    title: '删除分支',
    message: `确定删除本地分支 ${quote(name)}？远程分支不受影响。`,
    confirm: '删除',
    danger: true,
    run: async () => {
      const id = context.workspace?.id;
      if (!id) return;
      try {
        await context.run('删除分支', (workspace) => git.deleteBranch(workspace, name, false), {
          quiet: true,
          success: () => `已删除分支 ${name}`,
        });
      } catch (error) {
        const failure = gitError(error);
        if (failure.code !== 'not-merged') {
          notify(`删除分支失败：${failure.message}`, 'error');
          return;
        }
        context.openDialog({
          kind: 'confirm',
          title: '分支尚未合并',
          message: `分支 ${quote(name)} 包含尚未合并到其它分支的提交。强制删除后，这些提交只能通过引用日志找回。`,
          confirm: '强制删除',
          danger: true,
          run: () =>
            void context.run(
              '强制删除分支',
              (workspace) => git.deleteBranch(workspace, name, true),
              {
                success: () => `已删除分支 ${name}`,
              },
            ),
        });
      }
    },
  });
}

/** IDEA-style branch actions. `current` is the checked-out branch (null when detached). */
export function branchMenu(
  context: GitContextValue,
  target: BranchTarget,
  branches: GitBranches,
  favorites: Set<string>,
  toggleFavorite: (name: string) => void,
): GitMenuEntry[] {
  const current = branches.current;
  const currentName = current ?? 'HEAD';
  const p = context.preferences;
  const name = target.kind === 'local' ? target.branch.name : target.branch.fullName;
  const isCurrent = target.kind === 'local' && target.branch.current;
  const operation = context.probe?.repository?.operation ?? 'none';
  const blocked = operation !== 'none';
  const touch = { touchesWorkTree: true } as const;
  const merge = () =>
    void context
      .run('合并', (id) => git.merge(id, name, p.conflictStrategy), touch)
      .then((result) => context.reportUpdate(`将 ${name} 合并到 ${currentName}`, result));
  const rebaseCurrent = () =>
    void context
      .run('变基', (id) => git.rebase(id, name, null), touch)
      .then((result) => context.reportUpdate(`将 ${currentName} 变基到 ${name}`, result));
  const compare: GitMenuEntry[] = [
    {
      id: 'compare',
      label: `与 ${quote(currentName)} 比较`,
      icon: 'diff',
      disabled: isCurrent,
      run: () =>
        context.openDialog({
          kind: 'compare',
          from: currentName,
          to: name,
          title: `${currentName} ↔ ${name}`,
        }),
    },
    {
      id: 'worktree',
      label: '显示与工作树的差异',
      icon: 'diff',
      run: () =>
        context.openDialog({
          kind: 'compare',
          from: name,
          to: 'WORKTREE',
          title: `${name} ↔ 工作树`,
        }),
    },
  ];
  const log: GitMenuEntry = {
    id: 'log',
    label: '查看日志',
    icon: 'history',
    run: () => context.openView('log', { revisions: [name] }),
  };
  const favorite: GitMenuEntry = {
    id: 'favorite',
    label: favorites.has(name) ? '取消收藏' : '收藏',
    icon: 'star',
    run: () => toggleFavorite(name),
  };
  const newBranch: GitMenuEntry = {
    id: 'new',
    label: `从 ${quote(name)} 新建分支…`,
    icon: 'plus',
    run: () => context.openDialog({ kind: 'new-branch', from: name, checkout: true }),
  };

  if (target.kind === 'local' && isCurrent) {
    const branch = target.branch;
    return [
      newBranch,
      {
        id: 'update',
        label: '更新',
        icon: 'pull',
        hint: branch.upstream ?? '无跟踪分支',
        disabled: !branch.upstream || blocked,
        run: () => void context.update(),
      },
      {
        id: 'push',
        label: '推送…',
        icon: 'push',
        run: () => context.openDialog({ kind: 'push', branch: branch.name }),
      },
      'separator',
      {
        id: 'rename',
        label: '重命名…',
        run: () => context.openDialog({ kind: 'rename-branch', name: branch.name }),
      },
      ...(branch.upstream
        ? [
            {
              id: 'untrack',
              label: `取消跟踪 ${branch.upstream}`,
              run: () =>
                void context.run('取消跟踪', (id) => git.setUpstream(id, branch.name, null), {
                  success: () => `${branch.name} 不再跟踪 ${branch.upstream}`,
                }),
            },
          ]
        : []),
      log,
      favorite,
    ];
  }
  if (target.kind === 'local') {
    const branch = target.branch;
    return [
      {
        id: 'checkout',
        label: '签出',
        icon: 'branch',
        disabled: blocked,
        run: () => void checkoutBranch(context, branch.name, 'local'),
      },
      ...(branch.upstream
        ? [
            {
              id: 'checkout-update',
              label: '签出并更新',
              icon: 'pull',
              disabled: blocked,
              run: () =>
                void checkoutBranch(context, branch.name, 'local').then((done) => {
                  if (done) void context.update();
                }),
            } satisfies GitMenuEntry,
          ]
        : []),
      newBranch,
      {
        id: 'checkout-rebase',
        label: `签出并变基到 ${quote(currentName)}`,
        disabled: blocked || !current,
        run: () =>
          void context
            .run('签出并变基', (id) => git.rebase(id, currentName, branch.name), touch)
            .then((result) =>
              context.reportUpdate(`将 ${branch.name} 变基到 ${currentName}`, result),
            ),
      },
      'separator',
      ...compare,
      'separator',
      {
        id: 'rebase',
        label: `将 ${quote(currentName)} 变基到 ${quote(branch.name)}`,
        disabled: blocked || !current,
        run: rebaseCurrent,
      },
      {
        id: 'merge',
        label: `将 ${quote(branch.name)} 合并到 ${quote(currentName)}`,
        icon: 'merge',
        disabled: blocked,
        run: merge,
      },
      'separator',
      {
        id: 'update',
        label: '更新',
        icon: 'pull',
        hint: branch.upstream ?? '无跟踪分支',
        disabled: !branch.upstream,
        run: () =>
          void context.run('更新分支', (id) => git.updateBranch(id, branch.name, gitNetwork(p)), {
            network: true,
            success: () => `已将 ${branch.name} 快进到 ${branch.upstream}`,
          }),
      },
      {
        id: 'push',
        label: '推送…',
        icon: 'push',
        run: () => context.openDialog({ kind: 'push', branch: branch.name }),
      },
      'separator',
      {
        id: 'rename',
        label: '重命名…',
        run: () => context.openDialog({ kind: 'rename-branch', name: branch.name }),
      },
      log,
      favorite,
      'separator',
      {
        id: 'delete',
        label: '删除',
        danger: true,
        run: () => deleteBranch(context, branch.name),
      },
    ];
  }
  const branch = target.branch;
  return [
    {
      id: 'checkout',
      label: '签出',
      icon: 'branch',
      hint: `新建本地分支 ${branch.name}`,
      disabled: blocked,
      run: () => void checkoutBranch(context, branch.fullName, 'remote'),
    },
    newBranch,
    {
      id: 'checkout-rebase',
      label: `签出并变基到 ${quote(currentName)}`,
      disabled: blocked || !current,
      run: () =>
        void checkoutBranch(context, branch.fullName, 'remote').then((done) => {
          if (!done) return;
          void context
            .run('变基', (id) => git.rebase(id, currentName, null), touch)
            .then((result) =>
              context.reportUpdate(`将 ${branch.name} 变基到 ${currentName}`, result),
            );
        }),
    },
    'separator',
    ...compare,
    'separator',
    {
      id: 'rebase',
      label: `将 ${quote(currentName)} 变基到 ${quote(branch.fullName)}`,
      disabled: blocked || !current,
      run: rebaseCurrent,
    },
    {
      id: 'merge',
      label: `将 ${quote(branch.fullName)} 合并到 ${quote(currentName)}`,
      icon: 'merge',
      disabled: blocked,
      run: merge,
    },
    'separator',
    log,
    favorite,
    'separator',
    {
      id: 'delete-remote',
      label: '删除远程分支…',
      danger: true,
      run: () =>
        context.openDialog({
          kind: 'confirm',
          title: '删除远程分支',
          message: `将从远程 ${quote(branch.remote)} 删除分支 ${quote(branch.name)}。其他协作者将无法再获取它。`,
          confirm: '删除远程分支',
          danger: true,
          run: () =>
            void context.run(
              '删除远程分支',
              (id) => git.deleteRemoteBranch(id, branch.remote, branch.name, gitNetwork(p)),
              { network: true, success: () => `已删除远程分支 ${branch.fullName}` },
            ),
        }),
    },
  ];
}

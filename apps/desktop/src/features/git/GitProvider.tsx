import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  type GitError,
  type GitProbe,
  type GitProgress,
  type GitRemote,
  type GitStatus,
  type GitUpdateResult,
  git,
  gitError,
  onGitChanged,
  onGitProgress,
} from '../../services/git.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import { notify } from '../notices/notices.js';
import {
  commitMessage,
  type GitPreferences,
  gitNetwork,
  SYNC_AFTER_SAVE_DELAY_MS,
} from './git-preferences.js';

export type GitTab = 'commit' | 'log' | 'stash' | 'repository';
export interface DiffSide {
  /** A `GitFileSpec.rev`; null is an empty side (no such file before or after). */
  rev: string | null;
  label: string;
}
export interface DiffEntry {
  path: string;
  origPath?: string | null;
  status?: string;
  /** Sides for this file when they differ from the request's (new or deleted files). */
  sides?: { left: DiffSide; right: DiffSide };
}
export interface DiffRequest {
  title: string;
  left: DiffSide;
  right: DiffSide;
  files: DiffEntry[];
  index: number;
}
export interface LogFilter {
  revisions?: string[];
  path?: string;
  text?: string;
}
export type GitDialog =
  | { kind: 'new-branch'; from: string; checkout: boolean }
  | { kind: 'rename-branch'; name: string }
  | { kind: 'push'; branch?: string }
  | { kind: 'checkout-revision' }
  | { kind: 'init' }
  | { kind: 'remote'; remote: GitRemote | null }
  | { kind: 'tag'; target: string; label: string }
  | { kind: 'reset'; target: string; label: string }
  | { kind: 'conflicts' }
  | { kind: 'merge'; path: string }
  | { kind: 'diff'; request: DiffRequest }
  | { kind: 'compare'; from: string; to: string; title: string }
  | {
      kind: 'confirm';
      title: string;
      message: ReactNode;
      confirm: string;
      danger?: boolean;
      /** Optional checkbox, e.g. force deletion. */
      option?: string;
      run: (option: boolean) => void | Promise<void>;
    };
export interface RunOptions<T> {
  /** Uses the network; enables cancellation and progress. */
  network?: boolean;
  /** The work tree may change: save the open document first and re-check it afterwards. */
  touchesWorkTree?: boolean;
  /** No error notice (automatic synchronization reports on its own terms). */
  quiet?: boolean;
  success?: (result: T) => string | null;
}
export interface GitHooks {
  /** Saves the open document before the work tree changes. Resolves false to stop. */
  prepare: (automatic: boolean) => Promise<boolean>;
  /** The work tree may have changed: re-check the open document against the disk. */
  workTreeChanged: () => void;
  /** Opens the settings page on the Git section. */
  openSettings: () => void;
}
export interface LastSync {
  time: number;
  ok: boolean;
  message: string;
}
export interface GitContextValue {
  workspace: WorkspaceFolder | null;
  preferences: GitPreferences;
  setPreferences: (change: Partial<GitPreferences>) => void;
  probe: GitProbe | null;
  probing: boolean;
  status: GitStatus | null;
  busy: { label: string; network: boolean } | null;
  progress: GitProgress | null;
  lastSync: LastSync | null;
  /** Bumps after every mutation, for views that cache repository data. */
  revision: number;
  refresh: (full?: boolean) => Promise<void>;
  run: <T>(
    label: string,
    work: (workspaceId: string) => Promise<T>,
    options?: RunOptions<T>,
  ) => Promise<T | undefined>;
  cancel: () => void;
  sync: (trigger: 'manual' | 'auto' | 'open' | 'save') => Promise<void>;
  update: () => Promise<void>;
  fetch: () => Promise<void>;
  /** Reports an update-like result (conflicts open the resolver). */
  reportUpdate: (label: string, result: GitUpdateResult | undefined) => void;
  view: { tab: GitTab; filter: LogFilter | null; serial: number } | null;
  openView: (tab?: GitTab, filter?: LogFilter | null) => void;
  closeView: () => void;
  dialogs: GitDialog[];
  openDialog: (dialog: GitDialog) => void;
  closeDialog: () => void;
  branchPopup: DOMRect | null;
  openBranches: (anchor: DOMRect | null) => void;
  /** Repository is usable for read and write operations. */
  ready: boolean;
}

// One controller per window. It is published through a small external store rather than a React
// context, so the shell mounts it beside its other parts instead of wrapping the whole window.
let published: GitContextValue | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(value: GitContextValue | null) {
  published = value;
  for (const listener of listeners) listener();
}
export function useOptionalGit(): GitContextValue | null {
  return useSyncExternalStore(
    subscribe,
    () => published,
    () => null,
  );
}
export function useGit(): GitContextValue {
  const value = useOptionalGit();
  if (!value) throw new Error('GitProvider is missing');
  return value;
}

const STATUS_POLL_MS = 4000;
const HIDDEN_POLL_MS = 30_000;
const describe = (error: GitError) =>
  error.detail
    ? `${error.message}\n${error.detail.split('\n').slice(-3).join('\n')}`
    : error.message;

export function GitProvider(props: {
  workspace: WorkspaceFolder | null;
  preferences: GitPreferences;
  onPreferences: (change: Partial<GitPreferences>) => void;
  hooks: GitHooks;
  /** Changes whenever the open document is saved (any value; compared by identity). */
  savedRevision: unknown;
  /** Receives the context on every render, for native menu actions handled outside it. */
  apiRef?: MutableRefObject<GitContextValue | null>;
  /** The Git view opened or closed (the shell makes the editor inert under it). */
  onViewChange?: (open: boolean) => void;
  /** Whether the open folder is a usable repository (enables Git menu items). */
  onRepositoryChange?: (available: boolean) => void;
}): null {
  const { workspace, preferences } = props;
  const workspaceId = workspace?.id ?? null;
  const hooks = useRef(props.hooks);
  hooks.current = props.hooks;
  const prefs = useRef(preferences);
  prefs.current = preferences;
  const [probe, setProbe] = useState<GitProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [busy, setBusyState] = useState<{ label: string; network: boolean } | null>(null);
  const busyRef = useRef<{ label: string; network: boolean } | null>(null);
  const [progress, setProgress] = useState<GitProgress | null>(null);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<GitContextValue['view']>(null);
  const [dialogs, setDialogs] = useState<GitDialog[]>([]);
  const [branchPopup, setBranchPopup] = useState<DOMRect | null>(null);
  const ticket = useRef(0);
  const current = useRef({ workspaceId, probe, status });
  current.current = { workspaceId, probe, status };
  const setBusy = (value: { label: string; network: boolean } | null) => {
    busyRef.current = value;
    setBusyState(value);
  };

  // Status falls back to a full probe; the probe is defined after it and reached through a ref.
  const probeAgain = useRef<() => Promise<void>>(async () => {});
  const refreshStatus = useCallback(async () => {
    const id = current.current.workspaceId;
    if (!id || !current.current.probe?.repository) return;
    const mine = ticket.current;
    try {
      const next = await git.status(id);
      if (ticket.current === mine && current.current.workspaceId === id) setStatus(next);
    } catch (error) {
      const failure = gitError(error);
      // The folder stopped being a repository (deleted .git) or git went away: probe again.
      if (
        ticket.current === mine &&
        (failure.code === 'not-repository' || failure.code === 'git-missing')
      ) {
        setStatus(null);
        void probeAgain.current();
      }
    }
  }, []);
  const refreshProbe = useCallback(async () => {
    const id = current.current.workspaceId;
    if (!id) return;
    const mine = ticket.current;
    setProbing(true);
    try {
      const next = await git.probe(id);
      if (ticket.current !== mine) return;
      current.current = { ...current.current, probe: next };
      setProbe(next);
      if (next.repository) await refreshStatus();
      else setStatus(null);
    } catch (error) {
      if (ticket.current !== mine) return;
      const failure = gitError(error);
      setProbe({
        git: null,
        problem: { code: failure.code, message: failure.message },
        repository: null,
      });
      setStatus(null);
    } finally {
      if (ticket.current === mine) setProbing(false);
    }
  }, [refreshStatus]);
  probeAgain.current = refreshProbe;
  const refresh = useCallback(
    async (full = true) => {
      if (full) await refreshProbe();
      else await refreshStatus();
    },
    [refreshProbe, refreshStatus],
  );

  // A different folder is a different repository: drop everything learned about the old one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the workspace identity drives the reset.
  useEffect(() => {
    ticket.current++;
    current.current = { workspaceId, probe: null, status: null };
    setProbe(null);
    setStatus(null);
    setLastSync(null);
    setView(null);
    setDialogs([]);
    setBranchPopup(null);
    if (workspaceId) void refreshProbe();
  }, [workspaceId]);

  const repository = probe?.repository ?? null;
  // Polling keeps the branch widget and file colors current; changes made by other tools
  // (a terminal, another editor) show up within a few seconds.
  useEffect(() => {
    if (!repository || !workspaceId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const hidden = document.visibilityState === 'hidden';
      if (!busyRef.current) void refreshStatus();
      timer = setTimeout(tick, hidden ? HIDDEN_POLL_MS : STATUS_POLL_MS);
    };
    timer = setTimeout(tick, STATUS_POLL_MS);
    const focus = () => {
      if (!busyRef.current) void refreshProbe();
    };
    window.addEventListener('focus', focus);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('focus', focus);
    };
  }, [repository, workspaceId, refreshStatus, refreshProbe]);
  useEffect(() => {
    const stops = [
      onGitChanged((root) => {
        const known = current.current.probe?.repository?.root;
        if (!busyRef.current && (!known || known === root)) void refreshProbe();
        setRevision((value) => value + 1);
      }),
      onGitProgress((value) => {
        if (value.workspaceId === current.current.workspaceId) setProgress(value);
      }),
    ];
    return () => {
      for (const stop of stops) void stop.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [refreshProbe]);

  const openDialog = useCallback((dialog: GitDialog) => {
    setBranchPopup(null);
    setDialogs((list) => [...list, dialog]);
  }, []);
  const closeDialog = useCallback(() => setDialogs((list) => list.slice(0, -1)), []);
  const openView = useCallback((tab: GitTab = 'commit', filter: LogFilter | null = null) => {
    setBranchPopup(null);
    setView((previous) => ({ tab, filter, serial: (previous?.serial ?? 0) + 1 }));
  }, []);
  const closeView = useCallback(() => setView(null), []);
  const openBranches = useCallback((anchor: DOMRect | null) => setBranchPopup(anchor), []);

  const failureActions = (error: GitError) => {
    switch (error.code) {
      case 'auth':
      case 'proxy':
      case 'network':
        return [{ label: '网络与凭据设置', run: () => hooks.current.openSettings() }];
      case 'dubious-ownership':
        return [
          {
            label: '信任此目录',
            run: () =>
              void run('信任仓库目录', (id) => git.trust(id), {
                success: () => '已将仓库加入 safe.directory',
              }),
          },
        ];
      case 'conflicts':
        return [{ label: '解决冲突', run: () => openDialog({ kind: 'conflicts' }) }];
      case 'no-upstream':
        return [{ label: '推送…', run: () => openDialog({ kind: 'push' }) }];
      case 'non-fast-forward':
        return [{ label: '更新项目', run: () => void update() }];
      default:
        return [];
    }
  };
  const report = (label: string, error: unknown) => {
    const failure = gitError(error);
    if (failure.code === 'cancelled') {
      notify(`${label}已取消`, 'info');
      return failure;
    }
    notify(`${label}失败：${describe(failure)}`, 'error', { actions: failureActions(failure) });
    return failure;
  };

  const run = async <T,>(
    label: string,
    work: (workspaceId: string) => Promise<T>,
    options: RunOptions<T> = {},
  ): Promise<T | undefined> => {
    const id = current.current.workspaceId;
    if (!id) return undefined;
    if (busyRef.current) {
      if (!options.quiet) notify(`请等待“${busyRef.current.label}”完成`, 'warning');
      return undefined;
    }
    const state = { label, network: options.network === true };
    setBusy(state);
    const mine = ticket.current;
    try {
      if (options.touchesWorkTree && !(await hooks.current.prepare(options.quiet === true)))
        return undefined;
      const result = await work(id);
      const text = options.success?.(result);
      if (text) notify(text, 'success');
      return result;
    } catch (error) {
      if (options.quiet) throw gitError(error);
      report(label, error);
      return undefined;
    } finally {
      setBusy(null);
      setProgress(null);
      if (ticket.current === mine) {
        setRevision((value) => value + 1);
        void refreshProbe();
        if (options.touchesWorkTree) hooks.current.workTreeChanged();
      }
    }
  };
  const runRef = useRef(run);
  runRef.current = run;

  const reportUpdate = (label: string, result: GitUpdateResult | undefined) => {
    if (!result) return;
    if (result.outcome === 'conflicts') {
      notify(`${label}产生 ${result.conflicts.length} 个冲突，需要解决后继续`, 'warning', {
        actions: [{ label: '解决冲突', run: () => openDialog({ kind: 'conflicts' }) }],
      });
      openDialog({ kind: 'conflicts' });
      return;
    }
    if (result.stashKept)
      notify('本地更改未能自动恢复，已保留在储藏中，请在“储藏”中手动应用', 'warning', {
        actions: [{ label: '查看储藏', run: () => openView('stash') }],
      });
    if (result.outcome === 'no-upstream') {
      notify('当前分支没有跟踪的远程分支', 'warning', {
        actions: [{ label: '推送并跟踪…', run: () => openDialog({ kind: 'push' }) }],
      });
      return;
    }
    notify(
      result.outcome === 'up-to-date'
        ? `${label}：已是最新`
        : `${label}完成：${result.changed} 个文件已更新`,
      'success',
    );
  };

  const update = async () => {
    const p = prefs.current;
    const result = await run(
      '更新项目',
      (id) =>
        git.update(id, {
          method: p.pullMethod,
          autostash: p.autostash,
          conflictStrategy: p.conflictStrategy,
          prune: p.prune,
          network: gitNetwork(p),
        }),
      { network: true, touchesWorkTree: true },
    );
    reportUpdate('更新项目', result);
  };
  const fetch = async () => {
    const p = prefs.current;
    await run('获取', (id) => git.fetch(id, null, p.prune, gitNetwork(p)), {
      network: true,
      success: (result) =>
        result.proxy ? `已获取全部远程（经代理 ${result.proxy}）` : '已获取全部远程',
    });
  };

  const failures = useRef(0);
  const sync = async (trigger: 'manual' | 'auto' | 'open' | 'save') => {
    const repo = current.current.probe?.repository;
    const id = current.current.workspaceId;
    if (!repo || !id) return;
    const automatic = trigger !== 'manual';
    if (automatic && (busyRef.current || repo.remotes.length === 0)) return;
    const changes = current.current.status?.changes ?? [];
    if (repo.operation !== 'none' || changes.some((change) => change.kind === 'conflicted')) {
      if (!automatic)
        notify('仓库正在合并或变基，请先解决冲突', 'warning', {
          actions: [{ label: '解决冲突', run: () => openDialog({ kind: 'conflicts' }) }],
        });
      return;
    }
    const p = prefs.current;
    const message =
      p.autoCommit && changes.length
        ? commitMessage(p.commitTemplate, {
            branch: repo.head.branch,
            files: changes.map((change) => change.path),
          })
        : null;
    try {
      const result = await runRef.current(
        '同步',
        (workspace) =>
          git.sync(workspace, {
            commitMessage: message,
            push: p.pushAfterSync,
            method: p.pullMethod,
            autostash: p.autostash,
            conflictStrategy: p.conflictStrategy,
            prune: p.prune,
            network: gitNetwork(p),
          }),
        { network: true, touchesWorkTree: true, quiet: automatic },
      );
      if (!result) return;
      failures.current = 0;
      const parts: string[] = [];
      if (result.committed) parts.push('已提交本地更改');
      if (result.update?.outcome === 'updated') parts.push(`拉取 ${result.update.changed} 个文件`);
      if (result.pushed) parts.push(`推送 ${result.pushed} 个提交`);
      const text = result.idle ? '已是最新' : parts.join('，') || '已同步';
      setLastSync({ time: Date.now(), ok: true, message: text });
      if (result.update?.outcome === 'conflicts') {
        setLastSync({ time: Date.now(), ok: false, message: '同步产生冲突' });
        reportUpdate('同步', result.update);
        return;
      }
      if (result.update?.stashKept) reportUpdate('同步', result.update);
      if (!automatic || p.notify === 'all' || (p.notify === 'changes' && !result.idle))
        notify(`同步完成：${text}`, 'success');
    } catch (error) {
      failures.current++;
      const failure = gitError(error);
      setLastSync({ time: Date.now(), ok: false, message: failure.message });
      if (failure.code !== 'cancelled')
        notify(`自动同步失败：${describe(failure)}`, 'error', { actions: failureActions(failure) });
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Automatic synchronization: a timer, once when the repository opens, and after saves. All of
  // them follow the master switch; repeated failures back off up to four intervals.
  const hasRemote = (repository?.remotes.length ?? 0) > 0;
  useEffect(() => {
    if (!preferences.autoSync || !hasRemote || !workspaceId) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const factor = Math.min(4, 2 ** failures.current);
      timer = setTimeout(
        () => {
          void syncRef.current('auto').finally(schedule);
        },
        preferences.intervalMinutes * 60_000 * factor,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [preferences.autoSync, preferences.intervalMinutes, hasRemote, workspaceId]);
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!repository || !workspaceId || openedFor.current === workspaceId) return;
    openedFor.current = workspaceId;
    if (preferences.autoSync && preferences.syncOnOpen && hasRemote) void syncRef.current('open');
  }, [repository, workspaceId, preferences.autoSync, preferences.syncOnOpen, hasRemote]);
  const savedRevision = useRef(props.savedRevision);
  useEffect(() => {
    const changed = savedRevision.current !== props.savedRevision;
    savedRevision.current = props.savedRevision;
    if (!changed || !preferences.autoSync || !preferences.syncAfterSave || !hasRemote) return;
    const timer = setTimeout(() => void syncRef.current('save'), SYNC_AFTER_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [props.savedRevision, preferences.autoSync, preferences.syncAfterSave, hasRemote]);

  const cancel = useCallback(() => {
    const id = current.current.workspaceId;
    if (id && busyRef.current?.network) void git.cancel(id).catch(() => {});
  }, []);

  const viewOpen = view !== null;
  const onViewChange = useRef(props.onViewChange);
  onViewChange.current = props.onViewChange;
  useEffect(() => onViewChange.current?.(viewOpen), [viewOpen]);
  const onRepositoryChange = useRef(props.onRepositoryChange);
  onRepositoryChange.current = props.onRepositoryChange;
  const available = !!repository;
  useEffect(() => onRepositoryChange.current?.(available), [available]);
  const ready = !!repository && !busy;
  const value: GitContextValue = {
    workspace,
    preferences,
    setPreferences: props.onPreferences,
    probe,
    probing,
    status,
    busy,
    progress,
    lastSync,
    revision,
    refresh,
    run,
    cancel,
    sync,
    update,
    fetch,
    reportUpdate,
    view,
    openView,
    closeView,
    dialogs,
    openDialog,
    closeDialog,
    branchPopup,
    openBranches,
    ready,
  };
  if (props.apiRef) props.apiRef.current = value;
  // Consumers render after the controller; each render publishes the new value once.
  useLayoutEffect(() => publish(value));
  useEffect(() => () => publish(null), []);
  return null;
}

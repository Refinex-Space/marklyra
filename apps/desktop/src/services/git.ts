import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Git runs in the native host through the system `git` executable. Every command names the
// window's authorized workspace; the repository is the one containing that folder. Paths in
// requests and responses are relative to the repository root with `/` separators.

export type GitErrorCode =
  | 'git-missing'
  | 'not-repository'
  | 'dubious-ownership'
  | 'auth'
  | 'network'
  | 'proxy'
  | 'timeout'
  | 'cancelled'
  | 'conflicts'
  | 'dirty'
  | 'not-merged'
  | 'non-fast-forward'
  | 'no-upstream'
  | 'locked'
  | 'busy'
  | 'invalid'
  | 'failed';

/** Host errors arrive as `[code] message`; anything else is a plain failure. */
export class GitError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}
const CODES = new Set<string>([
  'git-missing',
  'not-repository',
  'dubious-ownership',
  'auth',
  'network',
  'proxy',
  'timeout',
  'cancelled',
  'conflicts',
  'dirty',
  'not-merged',
  'non-fast-forward',
  'no-upstream',
  'locked',
  'busy',
  'invalid',
  'failed',
]);
export function gitError(error: unknown): GitError {
  if (error instanceof GitError) return error;
  const text = error instanceof Error ? error.message : String(error);
  const match = /^\[([a-z-]+)\]\s*([\s\S]*)$/.exec(text);
  if (match && CODES.has(match[1] ?? '')) {
    const [message, ...rest] = (match[2] ?? '').split('\n\n');
    return new GitError(
      match[1] as GitErrorCode,
      message ?? '',
      rest.length ? rest.join('\n\n') : undefined,
    );
  }
  return new GitError('failed', text);
}

export type ProxyMode = 'auto' | 'direct' | 'custom';
/** Network policy for fetch, pull, push and remote tests. */
export interface GitNetwork {
  proxyMode: ProxyMode;
  /** http://, https://, socks5:// or socks5h:// with a host; only read in `custom` mode. */
  proxyUrl: string;
  /** Also route SSH remotes through the proxy (needs `nc` on macOS or `connect` on Windows). */
  proxySsh: boolean;
  /** After a proxy connection failure, retry once without any proxy. */
  fallbackDirect: boolean;
  timeoutSeconds: number;
}

export interface GitExecutable {
  path: string;
  version: string;
}
export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
  /** `https`, `http`, `ssh`, `git`, `file` or `other`. */
  protocol: string;
  /** Host name parsed from the URL, when there is one. */
  host: string | null;
  /** Credentials embedded in the URL were removed from these display strings. */
  hasEmbeddedCredentials: boolean;
}
export type RepositoryOperation =
  | 'none'
  | 'merging'
  | 'rebasing'
  | 'cherry-picking'
  | 'reverting'
  | 'bisecting';
export interface GitHead {
  /** Short branch name; null when detached. */
  branch: string | null;
  oid: string | null;
  detached: boolean;
  /** A branch without commits yet (fresh `git init`). */
  unborn: boolean;
}
export interface GitIdentity {
  name: string;
  email: string;
  /** Where the effective value comes from. */
  scope: 'repository' | 'global' | 'system' | 'none';
}
export interface GitRepository {
  /** Display path of the repository root (top level of the work tree). */
  root: string;
  /** Workspace folder relative to the repository root; '' when they are the same folder. */
  workspacePrefix: string;
  head: GitHead;
  /** Upstream of the current branch, e.g. `origin/main`. */
  upstream: string | null;
  ahead: number;
  behind: number;
  operation: RepositoryOperation;
  remotes: GitRemote[];
  identity: GitIdentity;
}
export interface GitProbe {
  git: GitExecutable | null;
  /** Why git could not be used, when `git` is null or the repository could not be read. */
  problem: { code: GitErrorCode; message: string } | null;
  repository: GitRepository | null;
}

export type ChangeKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'untracked'
  | 'conflicted';
export type ConflictKind =
  | 'both-modified'
  | 'both-added'
  | 'both-deleted'
  | 'added-by-us'
  | 'added-by-them'
  | 'deleted-by-us'
  | 'deleted-by-them';
export interface GitChange {
  path: string;
  /** Previous path of a rename or copy. */
  origPath: string | null;
  kind: ChangeKind;
  /** Index (`X`) and work tree (`Y`) status letters from `git status --porcelain=v2`. */
  index: string;
  worktree: string;
  conflict: ConflictKind | null;
}
export interface GitStatus {
  head: GitHead;
  upstream: string | null;
  ahead: number;
  behind: number;
  operation: RepositoryOperation;
  changes: GitChange[];
  /** True when more than the host limit (5000) changed; `changes` is then truncated. */
  truncated: boolean;
}

export interface GitLocalBranch {
  name: string;
  oid: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** The configured upstream no longer exists on the remote. */
  gone: boolean;
  current: boolean;
  subject: string;
  /** Committer time, seconds since epoch. */
  time: number;
}
export interface GitRemoteBranch {
  remote: string;
  /** Branch name without the remote prefix. */
  name: string;
  /** `remote/name`. */
  fullName: string;
  oid: string;
  subject: string;
  time: number;
}
export interface GitTag {
  name: string;
  oid: string;
  time: number;
}
export interface GitBranches {
  current: string | null;
  local: GitLocalBranch[];
  remote: GitRemoteBranch[];
  tags: GitTag[];
}

export interface GitRef {
  kind: 'head' | 'local' | 'remote' | 'tag';
  name: string;
}
export interface GitCommit {
  oid: string;
  parents: string[];
  subject: string;
  /** Message body after the subject; only filled by `commit` details. */
  body: string;
  authorName: string;
  authorEmail: string;
  authorTime: number;
  committerName: string;
  commitTime: number;
  refs: GitRef[];
}
export interface GitLogQuery {
  /** Revisions or ranges to walk; empty walks every branch, remote branch and tag (`--all`). */
  revisions: string[];
  skip: number;
  limit: number;
  /** Message or hash text; case-insensitive, matched literally. */
  text?: string;
  author?: string;
  /** Seconds since epoch. */
  since?: number;
  until?: number;
  /** Repository-relative path filter (file or folder); follows renames for one file. */
  path?: string;
  firstParent?: boolean;
}
export interface GitLogPage {
  commits: GitCommit[];
  hasMore: boolean;
}
export interface GitFileChange {
  path: string;
  origPath: string | null;
  /** `A`, `M`, `D`, `R`, `C` or `T`. */
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
}
export interface GitCommitDetails {
  commit: GitCommit;
  files: GitFileChange[];
}

/**
 * A file version. `rev` is a commit-ish, `:0` (index), `:1` (merge base), `:2` (stage 2),
 * `:3` (stage 3) or `WORKTREE` (the file on disk).
 */
export interface GitFileSpec {
  rev: string;
  path: string;
}
export interface GitFileText {
  /** Null when the file does not exist in that version. */
  text: string | null;
  binary: boolean;
  /** Larger than 4 MiB; text is null. */
  tooLarge: boolean;
  /** The bytes started with a UTF-8 BOM (removed from `text`). */
  bom: boolean;
  /** The text uses CRLF line endings. */
  crlf: boolean;
}

export type PullMethod = 'merge' | 'rebase' | 'ff-only';
/** For automatic resolution: keep the local side, the incoming side, or stop for manual work. */
export type ConflictStrategy = 'manual' | 'local' | 'remote';
export interface GitUpdateOptions {
  method: PullMethod;
  autostash: boolean;
  conflictStrategy: ConflictStrategy;
  prune: boolean;
  network: GitNetwork;
}
export interface GitUpdateResult {
  outcome: 'up-to-date' | 'updated' | 'conflicts' | 'no-upstream';
  /** Files changed by the update. */
  changed: number;
  /** Conflicted files when outcome is `conflicts`. */
  conflicts: string[];
  before: string | null;
  after: string | null;
  /** Proxy that carried the network traffic, if any (display form, no credentials). */
  proxy: string | null;
  /** Autostash could not be re-applied; the stash entry was kept. */
  stashKept: boolean;
}
export interface GitPushOptions {
  remote: string;
  /** Local branch to push. */
  branch: string;
  /** Branch name on the remote. */
  remoteBranch: string;
  setUpstream: boolean;
  force: 'none' | 'with-lease';
  tags: boolean;
  network: GitNetwork;
}
export interface GitPushResult {
  pushed: number;
  rejected: boolean;
  proxy: string | null;
  message: string;
}
export interface GitSyncOptions extends GitUpdateOptions {
  /** Commit every change with this message first; null skips the commit step. */
  commitMessage: string | null;
  push: boolean;
}
export interface GitSyncResult {
  committed: string | null;
  update: GitUpdateResult | null;
  pushed: number;
  /** Nothing to pull and nothing to push. */
  idle: boolean;
}

export interface GitConflict {
  path: string;
  kind: ConflictKind;
}
export interface GitConflicts {
  operation: RepositoryOperation;
  /** Index stage holding the local side: 2 while merging, 3 while rebasing. */
  yoursStage: 2 | 3;
  /** Short names for the two sides, e.g. `main` and `origin/main`. */
  yoursLabel: string;
  theirsLabel: string;
  files: GitConflict[];
}
export type GitResolution =
  | { kind: 'yours' }
  | { kind: 'theirs' }
  | { kind: 'delete' }
  | { kind: 'content'; text: string; bom: boolean; crlf: boolean };

export interface GitStash {
  index: number;
  message: string;
  oid: string;
  time: number;
}
export interface GitRemoteTest {
  ok: boolean;
  /** Remote HEAD branch, when advertised. */
  defaultBranch: string | null;
  branches: number;
  elapsedMs: number;
  proxy: string | null;
  message: string;
}
export interface GitProxyReport {
  /** HTTPS_PROXY/ALL_PROXY/HTTP_PROXY environment value. */
  environment: string | null;
  /** System proxy (Windows Internet Settings, macOS network configuration). */
  system: string | null;
  /** `http.proxy` from git configuration; git uses it unless MarkLyra overrides it. */
  gitConfig: string | null;
  /** What `auto` mode resolves to now. */
  effective: string | null;
}
export interface GitCredential {
  host: string;
  username: string;
}
export interface GitProgress {
  workspaceId: string;
  /** Operation label, e.g. `fetch`, `push`. */
  operation: string;
  /** Git's phase text, e.g. `Receiving objects`. */
  phase: string;
  /** 0-100, or null when git did not report a percentage. */
  percent: number | null;
}

const call = async <T>(command: string, args: Record<string, unknown>): Promise<T> => {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw gitError(error);
  }
};

export const git = {
  probe: (workspaceId: string) => call<GitProbe>('git_probe', { workspaceId }),
  init: (workspaceId: string, defaultBranch: string, gitignore: boolean) =>
    call<GitProbe>('git_init', { workspaceId, defaultBranch, gitignore }),
  /** Adds the repository root to the global `safe.directory` list. */
  trust: (workspaceId: string) => call<void>('git_trust_directory', { workspaceId }),
  status: (workspaceId: string) => call<GitStatus>('git_status', { workspaceId }),
  branches: (workspaceId: string) => call<GitBranches>('git_branches', { workspaceId }),
  log: (workspaceId: string, query: GitLogQuery) =>
    call<GitLogPage>('git_log', { workspaceId, query }),
  commitDetails: (workspaceId: string, oid: string) =>
    call<GitCommitDetails>('git_commit_details', { workspaceId, oid }),
  /** Changed files between two revisions; `to` may be `WORKTREE`. */
  compare: (workspaceId: string, from: string, to: string) =>
    call<GitFileChange[]>('git_compare', { workspaceId, from, to }),
  fileText: (workspaceId: string, spec: GitFileSpec) =>
    call<GitFileText>('git_file_text', { workspaceId, spec }),

  commit: (workspaceId: string, message: string, paths: string[], amend: boolean) =>
    call<{ oid: string }>('git_commit', { workspaceId, message, paths, amend }),
  /** Restores tracked paths to HEAD and un-adds newly added ones; untracked files stay. */
  rollback: (workspaceId: string, paths: string[]) =>
    call<void>('git_rollback', { workspaceId, paths }),

  fetch: (workspaceId: string, remote: string | null, prune: boolean, network: GitNetwork) =>
    call<{ proxy: string | null }>('git_fetch', { workspaceId, remote, prune, network }),
  update: (workspaceId: string, options: GitUpdateOptions) =>
    call<GitUpdateResult>('git_update', { workspaceId, options }),
  push: (workspaceId: string, options: GitPushOptions) =>
    call<GitPushResult>('git_push', { workspaceId, options }),
  sync: (workspaceId: string, options: GitSyncOptions) =>
    call<GitSyncResult>('git_sync', { workspaceId, options }),
  /** Kills the running network operation of this workspace, if any. */
  cancel: (workspaceId: string) => call<void>('git_cancel', { workspaceId }),

  checkout: (workspaceId: string, target: string, kind: 'local' | 'remote' | 'revision') =>
    call<void>('git_checkout', { workspaceId, target, kind }),
  createBranch: (workspaceId: string, name: string, from: string, checkout: boolean) =>
    call<void>('git_create_branch', { workspaceId, name, from, checkout }),
  renameBranch: (workspaceId: string, from: string, to: string) =>
    call<void>('git_rename_branch', { workspaceId, from, to }),
  deleteBranch: (workspaceId: string, name: string, force: boolean) =>
    call<void>('git_delete_branch', { workspaceId, name, force }),
  deleteRemoteBranch: (workspaceId: string, remote: string, name: string, network: GitNetwork) =>
    call<void>('git_delete_remote_branch', { workspaceId, remote, name, network }),
  /** Fast-forwards a local branch that is not checked out to its upstream. */
  updateBranch: (workspaceId: string, name: string, network: GitNetwork) =>
    call<void>('git_update_branch', { workspaceId, name, network }),
  setUpstream: (workspaceId: string, branch: string, upstream: string | null) =>
    call<void>('git_set_upstream', { workspaceId, branch, upstream }),
  merge: (workspaceId: string, target: string, conflictStrategy: ConflictStrategy) =>
    call<GitUpdateResult>('git_merge', { workspaceId, target, conflictStrategy }),
  /** Rebases `branch` (default: current) onto `onto`; with `branch` it is checked out first. */
  rebase: (workspaceId: string, onto: string, branch: string | null) =>
    call<GitUpdateResult>('git_rebase', { workspaceId, onto, branch }),
  /** Continue or abort the operation in progress. */
  operation: (workspaceId: string, action: 'continue' | 'abort' | 'skip') =>
    call<GitUpdateResult>('git_operation', { workspaceId, action }),
  cherryPick: (workspaceId: string, oid: string) =>
    call<GitUpdateResult>('git_cherry_pick', { workspaceId, oid }),
  revert: (workspaceId: string, oid: string) =>
    call<GitUpdateResult>('git_revert', { workspaceId, oid }),
  reset: (workspaceId: string, target: string, mode: 'soft' | 'mixed' | 'hard') =>
    call<void>('git_reset', { workspaceId, target, mode }),
  createTag: (workspaceId: string, name: string, target: string, message: string) =>
    call<void>('git_create_tag', { workspaceId, name, target, message }),
  deleteTag: (workspaceId: string, name: string) =>
    call<void>('git_delete_tag', { workspaceId, name }),

  conflicts: (workspaceId: string) => call<GitConflicts>('git_conflicts', { workspaceId }),
  resolve: (workspaceId: string, path: string, resolution: GitResolution) =>
    call<void>('git_resolve', { workspaceId, path, resolution }),

  stashes: (workspaceId: string) => call<GitStash[]>('git_stash_list', { workspaceId }),
  stash: (workspaceId: string, message: string, includeUntracked: boolean) =>
    call<void>('git_stash_push', { workspaceId, message, includeUntracked }),
  unstash: (workspaceId: string, index: number, pop: boolean) =>
    call<GitUpdateResult>('git_stash_apply', { workspaceId, index, pop }),
  dropStash: (workspaceId: string, index: number) =>
    call<void>('git_stash_drop', { workspaceId, index }),

  addRemote: (workspaceId: string, name: string, url: string) =>
    call<void>('git_remote_add', { workspaceId, name, url }),
  setRemoteUrl: (workspaceId: string, name: string, url: string) =>
    call<void>('git_remote_set_url', { workspaceId, name, url }),
  removeRemote: (workspaceId: string, name: string) =>
    call<void>('git_remote_remove', { workspaceId, name }),
  /** `ls-remote` against a configured remote name or a URL that is not saved yet. */
  testRemote: (workspaceId: string, target: string, network: GitNetwork) =>
    call<GitRemoteTest>('git_remote_test', { workspaceId, target, network }),
  setIdentity: (workspaceId: string, name: string, email: string, scope: 'repository' | 'global') =>
    call<void>('git_set_identity', { workspaceId, name, email, scope }),

  detectProxy: (workspaceId: string | null) =>
    call<GitProxyReport>('git_detect_proxy', { workspaceId }),
  credentials: () => call<GitCredential[]>('git_credentials_list', {}),
  saveCredential: (host: string, username: string, token: string) =>
    call<void>('git_credentials_save', { host, username, token }),
  removeCredential: (host: string) => call<void>('git_credentials_remove', { host }),
};

/** Mutations from any window; payload is the repository root display path. */
export const onGitChanged = (handler: (root: string) => void): Promise<UnlistenFn> =>
  listen<string>('marklyra:git-changed', (event) => handler(event.payload));
export const onGitProgress = (handler: (progress: GitProgress) => void): Promise<UnlistenFn> =>
  listen<GitProgress>('marklyra:git-progress', (event) => handler(event.payload));

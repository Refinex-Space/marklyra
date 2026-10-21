import type { ConflictStrategy, GitNetwork, ProxyMode, PullMethod } from '../../services/git.js';

export type DiffLayout = 'split' | 'unified';
export type SyncNotice = 'all' | 'changes' | 'errors';
export interface GitPreferences {
  /** Pull, commit and push on a timer while a repository folder is open. */
  autoSync: boolean;
  intervalMinutes: number;
  /** Pull once when a repository folder opens. */
  syncOnOpen: boolean;
  /** Synchronize a while after the last save. */
  syncAfterSave: boolean;
  /** Commit every change before pulling during a synchronization. */
  autoCommit: boolean;
  commitTemplate: string;
  pullMethod: PullMethod;
  autostash: boolean;
  conflictStrategy: ConflictStrategy;
  pushAfterSync: boolean;
  prune: boolean;
  notify: SyncNotice;
  proxyMode: ProxyMode;
  proxyUrl: string;
  proxySsh: boolean;
  fallbackDirect: boolean;
  timeoutSeconds: number;
  diffLayout: DiffLayout;
  ignoreWhitespace: boolean;
  collapseUnchanged: boolean;
  /** Color changed files in the file tree. */
  fileStatus: boolean;
  defaultBranch: string;
}
export const SYNC_INTERVALS = [5, 10, 15, 30, 60, 120] as const;
export const NETWORK_TIMEOUTS = [60, 120, 300, 600] as const;
export const SYNC_AFTER_SAVE_DELAY_MS = 90_000;
export const COMMIT_TEMPLATE_LIMIT = 500;
export const defaultGitPreferences: Readonly<GitPreferences> = Object.freeze({
  autoSync: false,
  intervalMinutes: 15,
  syncOnOpen: true,
  syncAfterSave: false,
  autoCommit: true,
  commitTemplate: 'docs: 同步笔记 {date} {time}',
  pullMethod: 'merge',
  autostash: true,
  conflictStrategy: 'manual',
  pushAfterSync: true,
  prune: true,
  notify: 'changes',
  proxyMode: 'auto',
  proxyUrl: '',
  proxySsh: false,
  fallbackDirect: true,
  timeoutSeconds: 300,
  diffLayout: 'split',
  ignoreWhitespace: false,
  collapseUnchanged: true,
  fileStatus: true,
  defaultBranch: 'main',
});

/** Mirrors the host rule; the host validates again before passing it to git. */
export function proxyUrlError(value: string): string | null {
  const text = value.trim();
  if (!text) return '请填写代理地址，例如 http://127.0.0.1:7890';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return '代理地址格式无效，例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080';
  }
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol))
    return '仅支持 http、https、socks5 与 socks5h 代理';
  if (!url.hostname) return '代理地址缺少主机名';
  return null;
}
/** A branch name `git check-ref-format --branch` accepts; the host checks again. */
export function branchNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return '请填写分支名称';
  if (name !== value) return '分支名称首尾不能有空格';
  if (name.startsWith('-')) return '分支名称不能以 - 开头';
  if (/[\s~^:?*[\\]/.test(name) || name.includes('..') || name.includes('@{'))
    return '分支名称不能包含空格、~ ^ : ? * [ \\、.. 或 @{';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are rejected.
  if (/[\u0000-\u001f\u007f]/.test(name)) return '分支名称不能包含控制字符';
  if (name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock') || name.startsWith('/'))
    return '分支名称不能以 /、. 或 .lock 结尾，也不能以 / 开头';
  if (name.split('/').some((part) => !part || part.startsWith('.')))
    return '分支名称的每一段都不能为空或以 . 开头';
  if (name === 'HEAD' || name === '@') return '分支名称不能是 HEAD 或 @';
  return null;
}

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
export function normalizeGitPreferences(value: unknown): GitPreferences {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const d = defaultGitPreferences;
  const proxyUrl = typeof input.proxyUrl === 'string' ? input.proxyUrl.trim().slice(0, 512) : '';
  const proxyMode = pick(input.proxyMode, ['auto', 'direct', 'custom'] as const, d.proxyMode);
  const template =
    typeof input.commitTemplate === 'string' &&
    input.commitTemplate.trim() &&
    input.commitTemplate.length <= COMMIT_TEMPLATE_LIMIT
      ? input.commitTemplate
      : d.commitTemplate;
  const branch =
    typeof input.defaultBranch === 'string' && !branchNameError(input.defaultBranch)
      ? input.defaultBranch
      : d.defaultBranch;
  return {
    autoSync: flag(input.autoSync, d.autoSync),
    intervalMinutes: (SYNC_INTERVALS as readonly number[]).includes(Number(input.intervalMinutes))
      ? Number(input.intervalMinutes)
      : d.intervalMinutes,
    syncOnOpen: flag(input.syncOnOpen, d.syncOnOpen),
    syncAfterSave: flag(input.syncAfterSave, d.syncAfterSave),
    autoCommit: flag(input.autoCommit, d.autoCommit),
    commitTemplate: template,
    pullMethod: pick(input.pullMethod, ['merge', 'rebase', 'ff-only'] as const, d.pullMethod),
    autostash: flag(input.autostash, d.autostash),
    conflictStrategy: pick(
      input.conflictStrategy,
      ['manual', 'local', 'remote'] as const,
      d.conflictStrategy,
    ),
    pushAfterSync: flag(input.pushAfterSync, d.pushAfterSync),
    prune: flag(input.prune, d.prune),
    notify: pick(input.notify, ['all', 'changes', 'errors'] as const, d.notify),
    // A custom proxy that no longer validates falls back to automatic detection.
    proxyMode: proxyMode === 'custom' && proxyUrlError(proxyUrl) ? 'auto' : proxyMode,
    proxyUrl,
    proxySsh: flag(input.proxySsh, d.proxySsh),
    fallbackDirect: flag(input.fallbackDirect, d.fallbackDirect),
    timeoutSeconds: (NETWORK_TIMEOUTS as readonly number[]).includes(Number(input.timeoutSeconds))
      ? Number(input.timeoutSeconds)
      : d.timeoutSeconds,
    diffLayout: pick(input.diffLayout, ['split', 'unified'] as const, d.diffLayout),
    ignoreWhitespace: flag(input.ignoreWhitespace, d.ignoreWhitespace),
    collapseUnchanged: flag(input.collapseUnchanged, d.collapseUnchanged),
    fileStatus: flag(input.fileStatus, d.fileStatus),
    defaultBranch: branch,
  };
}

export function gitNetwork(preferences: GitPreferences): GitNetwork {
  return {
    proxyMode: preferences.proxyMode,
    proxyUrl: preferences.proxyMode === 'custom' ? preferences.proxyUrl : '',
    proxySsh: preferences.proxySsh,
    fallbackDirect: preferences.fallbackDirect,
    timeoutSeconds: preferences.timeoutSeconds,
  };
}

const pad = (value: number) => String(value).padStart(2, '0');
/** Variables: {date} {time} {datetime} {host} {branch} {count} {files}. */
export function commitMessage(
  template: string,
  context: { now?: Date; branch?: string | null; files?: readonly string[]; host?: string },
): string {
  const now = context.now ?? new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const files = context.files ?? [];
  const names = files.map((path) => path.slice(path.lastIndexOf('/') + 1));
  const listed =
    names.length > 3
      ? `${names.slice(0, 3).join('、')} 等 ${names.length} 个文件`
      : names.join('、');
  const values: Record<string, string> = {
    date,
    time,
    datetime: `${date} ${time}`,
    host: context.host ?? '',
    branch: context.branch ?? '',
    count: String(files.length),
    files: listed,
  };
  const text = template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all).trim();
  return text || `docs: 同步笔记 ${date} ${time}`;
}

import { describe, expect, it } from 'vitest';
import { branchTree } from '../src/features/git/branch-store.js';
import { perspective } from '../src/features/git/ConflictsDialog.js';
import { workspacePath } from '../src/features/git/GitWorkbench.js';
import {
  branchNameError,
  commitMessage,
  defaultGitPreferences,
  gitNetwork,
  normalizeGitPreferences,
  proxyUrlError,
} from '../src/features/git/git-preferences.js';
import {
  parseRemoteUrl,
  remoteNameError,
  remoteUrlAdvice,
} from '../src/features/git/remote-url.js';
import { normalizePreferences } from '../src/features/settings/preferences.js';
import { GitError, gitError } from '../src/services/git.js';

describe('git preferences', () => {
  it('falls back to safe defaults for missing or invalid input', () => {
    expect(normalizeGitPreferences(undefined)).toEqual(defaultGitPreferences);
    expect(normalizeGitPreferences([])).toEqual(defaultGitPreferences);
    const value = normalizeGitPreferences({
      autoSync: 'yes',
      intervalMinutes: 7,
      pullMethod: 'squash',
      conflictStrategy: 'theirs',
      timeoutSeconds: 1,
      commitTemplate: '   ',
      defaultBranch: 'bad name',
    });
    expect(value.autoSync).toBe(false);
    expect(value.intervalMinutes).toBe(15);
    expect(value.pullMethod).toBe('merge');
    expect(value.conflictStrategy).toBe('manual');
    expect(value.timeoutSeconds).toBe(300);
    expect(value.commitTemplate).toBe(defaultGitPreferences.commitTemplate);
    expect(value.defaultBranch).toBe('main');
  });
  it('keeps valid choices', () => {
    const value = normalizeGitPreferences({
      autoSync: true,
      intervalMinutes: 30,
      pullMethod: 'rebase',
      conflictStrategy: 'local',
      proxyMode: 'custom',
      proxyUrl: 'socks5h://127.0.0.1:1080',
      diffLayout: 'unified',
    });
    expect(value).toMatchObject({
      autoSync: true,
      intervalMinutes: 30,
      pullMethod: 'rebase',
      conflictStrategy: 'local',
      proxyMode: 'custom',
      proxyUrl: 'socks5h://127.0.0.1:1080',
      diffLayout: 'unified',
    });
  });
  it('drops a custom proxy that no longer validates back to automatic detection', () => {
    expect(normalizeGitPreferences({ proxyMode: 'custom', proxyUrl: 'ftp://x' }).proxyMode).toBe(
      'auto',
    );
    expect(normalizeGitPreferences({ proxyMode: 'custom', proxyUrl: '' }).proxyMode).toBe('auto');
  });
  it('is part of the shell preferences', () => {
    expect(normalizePreferences({}).git).toEqual(defaultGitPreferences);
    expect(normalizePreferences({ git: { autoSync: true } }).git.autoSync).toBe(true);
  });
  it('sends the proxy URL only in custom mode', () => {
    const auto = gitNetwork({ ...defaultGitPreferences, proxyUrl: 'http://127.0.0.1:7890' });
    expect(auto.proxyUrl).toBe('');
    const custom = gitNetwork({
      ...defaultGitPreferences,
      proxyMode: 'custom',
      proxyUrl: 'http://127.0.0.1:7890',
    });
    expect(custom).toMatchObject({ proxyMode: 'custom', proxyUrl: 'http://127.0.0.1:7890' });
  });
});

describe('git input checks', () => {
  it('accepts http, https and socks proxies only', () => {
    expect(proxyUrlError('http://127.0.0.1:7890')).toBeNull();
    expect(proxyUrlError('socks5://localhost:1080')).toBeNull();
    expect(proxyUrlError('ftp://127.0.0.1')).not.toBeNull();
    expect(proxyUrlError('127.0.0.1:7890')).not.toBeNull();
    expect(proxyUrlError('')).not.toBeNull();
  });
  it('mirrors git branch name rules', () => {
    for (const name of ['main', 'feature/笔记', 'fix-1.2', 'release/2026/q4'])
      expect(branchNameError(name), name).toBeNull();
    for (const name of [
      '',
      ' main',
      '-x',
      'a b',
      'a..b',
      'a~1',
      'x^',
      'a:b',
      'a?',
      'a*',
      'a[',
      'a\\b',
      'a@{1}',
      'end/',
      'end.',
      'x.lock',
      '/start',
      'a//b',
      'a/.hidden',
      'HEAD',
      '@',
    ])
      expect(branchNameError(name), name).not.toBeNull();
  });
  it('fills commit message templates', () => {
    const now = new Date(2026, 9, 21, 9, 5);
    expect(commitMessage('docs: {date} {time} on {branch}', { now, branch: 'main' })).toBe(
      'docs: 2026-10-21 09:05 on main',
    );
    expect(
      commitMessage('{count}: {files}', { now, files: ['a/一.md', 'b.md', 'c/d.md', 'e.md'] }),
    ).toBe('4: 一.md、b.md、d.md 等 4 个文件');
    expect(commitMessage('{unknown} x', { now })).toBe('{unknown} x');
    expect(commitMessage('   ', { now })).toBe('docs: 同步笔记 2026-10-21 09:05');
  });
});

describe('remote addresses', () => {
  it('recognises hosted repositories over HTTPS and SSH', () => {
    expect(parseRemoteUrl('git@github.com:owner/notes.git')).toEqual({
      protocol: 'ssh',
      host: 'github.com',
      repository: 'owner/notes',
      provider: 'GitHub',
    });
    expect(parseRemoteUrl('https://gitee.com/owner/notes')?.repository).toBe('owner/notes');
    expect(parseRemoteUrl('https://gitlab.com/group/sub/notes/-/tree/main')?.repository).toBe(
      'group/sub/notes',
    );
    expect(parseRemoteUrl('ssh://git@example.com:2222/notes.git')).toMatchObject({
      protocol: 'ssh',
      host: 'example.com',
      repository: null,
    });
  });
  it('turns a pasted web page into the repository address and offers the other protocol', () => {
    const advice = remoteUrlAdvice('https://github.com/owner/notes/tree/main');
    expect(advice.error).toBeNull();
    expect(advice.suggestion).toBe('https://github.com/owner/notes.git');
    expect(advice.alternatives).toEqual([
      { label: '改用 SSH（GitHub）', url: 'git@github.com:owner/notes.git' },
    ]);
    expect(remoteUrlAdvice('https://github.com/owner/notes.git').suggestion).toBeNull();
    expect(remoteUrlAdvice('git@github.com:owner/notes.git').alternatives[0]?.url).toBe(
      'https://github.com/owner/notes.git',
    );
  });
  it('rejects transports that run commands and malformed addresses', () => {
    for (const url of [
      'ext::sh -c touch% /tmp/x',
      'fd::17',
      '-uploadpack=x',
      'not a url',
      'ftp://x/y',
    ])
      expect(remoteUrlAdvice(url).error, url).not.toBeNull();
  });
  it('warns about embedded credentials and plain HTTP', () => {
    const advice = remoteUrlAdvice('http://me:secret@example.com/notes.git');
    expect(advice.warnings).toHaveLength(2);
  });
  it('checks remote names', () => {
    expect(remoteNameError('origin')).toBeNull();
    expect(remoteNameError('my.remote-2')).toBeNull();
    expect(remoteNameError('-x')).not.toBeNull();
    expect(remoteNameError('a b')).not.toBeNull();
    expect(remoteNameError('')).not.toBeNull();
  });
});

describe('git host errors', () => {
  it('parses coded messages with details', () => {
    const error = gitError('[auth] 认证失败\n\nfatal: Authentication failed');
    expect(error).toBeInstanceOf(GitError);
    expect(error.code).toBe('auth');
    expect(error.message).toBe('认证失败');
    expect(error.detail).toBe('fatal: Authentication failed');
    expect(gitError(new Error('[unknown] x')).code).toBe('failed');
    expect(gitError('plain').message).toBe('plain');
  });
});

describe('git view helpers', () => {
  it('maps repository paths into the open folder', () => {
    expect(workspacePath('notes/a.md', '')).toBe('notes/a.md');
    expect(workspacePath('notes/a.md', 'notes')).toBe('a.md');
    expect(workspacePath('notes-old/a.md', 'notes')).toBeNull();
    expect(workspacePath('other/a.md', 'notes')).toBeNull();
  });
  it('groups branch names into folders', () => {
    const tree = branchTree(
      ['main', 'feature/a', 'feature/b', 'feature/ui/c'].map((name) => ({ name, value: name })),
    );
    expect(tree.items.map((item) => item.label)).toEqual(['main']);
    const feature = tree.folders[0];
    expect(feature?.path).toBe('feature');
    expect(feature?.items.map((item) => item.value)).toEqual(['feature/a', 'feature/b']);
    expect(feature?.folders[0]?.items[0]).toEqual({ label: 'c', value: 'feature/ui/c' });
  });
  it('names conflict sides from the person’s point of view while rebasing', () => {
    expect(perspective('deleted-by-us', 2)).toBe('deleted-by-us');
    expect(perspective('deleted-by-us', 3)).toBe('deleted-by-them');
    expect(perspective('added-by-them', 3)).toBe('added-by-us');
    expect(perspective('both-modified', 3)).toBe('both-modified');
  });
});

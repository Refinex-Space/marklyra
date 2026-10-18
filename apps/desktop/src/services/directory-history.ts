import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceFolder } from './workspaces.js';

export type DirectoryHistoryTarget =
  | { kind: 'history'; id: string }
  | { kind: 'workspace'; workspaceId: string };
export interface DirectoryHistoryEntry {
  target: DirectoryHistoryTarget;
  name: string;
  /** Display metadata only. Never accepted by an authorization command. */
  path: string;
  pinned: boolean;
  current: boolean;
  /** Has a host-owned identity bookmark; this is not an existence probe. */
  reopenable: boolean;
}
export interface DirectoryHistoryCatalog {
  revision: number;
  noRecentFiles: boolean;
  entries: DirectoryHistoryEntry[];
}
export interface DirectoryHistoryVersion {
  revision: number;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('目录历史响应无效。');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    !Object.keys(value).every((key) => keys.includes(key))
  )
    throw new Error('目录历史字段无效。');
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('目录历史版本无效。');
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(value))
    throw new Error('目录历史标识无效。');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
    throw new Error('目录显示信息无效。');
  return value;
}
export function directoryHistoryTarget(value: unknown): DirectoryHistoryTarget {
  const input = record(value);
  if (input.kind === 'history') {
    exact(input, ['kind', 'id']);
    return { kind: 'history', id: id(input.id) };
  }
  if (input.kind === 'workspace') {
    exact(input, ['kind', 'workspaceId']);
    return { kind: 'workspace', workspaceId: id(input.workspaceId) };
  }
  throw new Error('目录目标类型无效。');
}
export function directoryHistoryCatalog(value: unknown): DirectoryHistoryCatalog {
  const input = record(value);
  exact(input, ['revision', 'noRecentFiles', 'entries']);
  if (
    typeof input.noRecentFiles !== 'boolean' ||
    !Array.isArray(input.entries) ||
    input.entries.length > 33
  )
    throw new Error('目录历史响应无效。');
  const seen = new Set<string>();
  return {
    revision: revision(input.revision),
    noRecentFiles: input.noRecentFiles,
    entries: input.entries.map((value) => {
      const entry = record(value);
      exact(entry, ['target', 'name', 'path', 'pinned', 'current', 'reopenable']);
      if (
        typeof entry.pinned !== 'boolean' ||
        typeof entry.current !== 'boolean' ||
        typeof entry.reopenable !== 'boolean'
      )
        throw new Error('目录历史状态无效。');
      const target = directoryHistoryTarget(entry.target),
        key = JSON.stringify(target);
      if (seen.has(key)) throw new Error('目录历史标识重复。');
      seen.add(key);
      return {
        target,
        name: text(entry.name),
        path: text(entry.path),
        pinned: entry.pinned,
        current: entry.current,
        reopenable: entry.reopenable,
      };
    }),
  };
}
function version(value: unknown, expected: number): DirectoryHistoryVersion {
  const input = record(value);
  exact(input, ['revision']);
  const actual = revision(input.revision);
  if (actual !== expected + 1) throw new Error('目录历史未收到匹配的持久化确认。');
  return { revision: actual };
}
export const directoryHistory = {
  async reveal(workspaceId: string): Promise<void> {
    await invoke<void>('reveal_workspace_directory', { workspaceId: id(workspaceId) });
  },
  async list(currentWorkspaceId?: string): Promise<DirectoryHistoryCatalog> {
    return directoryHistoryCatalog(
      await invoke<unknown>('list_directory_history', {
        currentWorkspaceId: currentWorkspaceId === undefined ? null : id(currentWorkspaceId),
      }),
    );
  },
  async pin(
    expectedRevision: number,
    target: DirectoryHistoryTarget,
    pinned: boolean,
  ): Promise<DirectoryHistoryVersion> {
    if (typeof pinned !== 'boolean') throw new Error('目录固定状态无效。');
    return version(
      await invoke<unknown>('pin_directory_history', {
        expectedRevision: revision(expectedRevision),
        target: directoryHistoryTarget(target),
        pinned,
      }),
      expectedRevision,
    );
  },
  async remove(
    expectedRevision: number,
    target: DirectoryHistoryTarget,
  ): Promise<DirectoryHistoryVersion> {
    return version(
      await invoke<unknown>('remove_directory_history', {
        expectedRevision: revision(expectedRevision),
        target: directoryHistoryTarget(target),
      }),
      expectedRevision,
    );
  },
  async open(expectedRevision: number, target: DirectoryHistoryTarget): Promise<WorkspaceFolder> {
    const input = record(
      await invoke<unknown>('open_directory_history', {
        expectedRevision: revision(expectedRevision),
        target: directoryHistoryTarget(target),
      }),
    );
    exact(
      input,
      Object.hasOwn(input, 'metadataRevision')
        ? ['id', 'name', 'path', 'metadataRevision']
        : ['id', 'name', 'path'],
    );
    return {
      id: id(input.id),
      name: text(input.name),
      path: text(input.path),
      ...(Object.hasOwn(input, 'metadataRevision')
        ? { metadataRevision: revision(input.metadataRevision) }
        : {}),
    };
  },
  async openNewWindow(expectedRevision: number, target: DirectoryHistoryTarget): Promise<string> {
    return id(
      await invoke<unknown>('open_directory_history_window', {
        expectedRevision: revision(expectedRevision),
        target: directoryHistoryTarget(target),
      }),
    );
  },
};

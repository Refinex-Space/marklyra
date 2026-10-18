import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceEntry, WorkspaceFolder } from './workspaces.js';
export type EntryAction = 'open-new' | 'info' | 'copy-path' | 'reveal' | 'move';
export type EntryOperation = EntryAction | 'duplicate';
export interface EntryActionReceipt {
  operationId: string;
  entryToken: string;
  action: EntryAction;
  windowLabel: string | null;
  workspace?: WorkspaceFolder;
  warnings?: string[];
  moveEntry?: { relativePath: string; kind: 'file' | 'directory' };
}
export interface EntryEditorSnapshot {
  documentId: string | null;
  text: string;
  savedText: string;
}
export interface EntryDuplicateReceipt extends WorkspaceEntry {
  operationId: string;
  entryToken: string;
  kind: 'file';
  warnings: string[];
}
export type EntryResolution =
  | { status: 'prepared' }
  | { status: 'committed'; receipt: EntryActionReceipt | EntryDuplicateReceipt }
  | { status: 'rejected'; message: string }
  | { status: 'mutationUncertain'; message?: string };
const actions = ['open-new', 'info', 'copy-path', 'reveal', 'move', 'duplicate'] as const;
export function entryRequest(
  workspaceId: string,
  entryToken: string,
  operationId: string,
  action: EntryOperation,
) {
  if (
    ![workspaceId, entryToken].every((v) => /^[a-zA-Z0-9_-]{1,128}$/.test(v)) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(operationId) ||
    !actions.includes(action)
  )
    throw Error('文件动作参数无效');
  return { workspaceId, entryToken, operationId, action };
}
export function entryReceipt(
  value: unknown,
  token: string,
  operation: string,
  action: EntryOperation,
): EntryActionReceipt | EntryDuplicateReceipt {
  if (!value || typeof value !== 'object') throw Error('文件动作回执无效');
  const r = value as Record<string, unknown>;
  if (r.operationId !== operation || r.entryToken !== token)
    throw Error('文件动作回执不属于当前请求');
  if (r.moveEntry !== undefined) {
    const moved = r.moveEntry as Record<string, unknown> | null;
    if (
      action !== 'move' ||
      !moved ||
      typeof moved !== 'object' ||
      typeof moved.relativePath !== 'string' ||
      !moved.relativePath ||
      moved.relativePath.startsWith('/') ||
      moved.relativePath.split('/').some((part) => !part || part === '.' || part === '..') ||
      !['file', 'directory'].includes(String(moved.kind))
    )
      throw Error('移动条目回执无效');
  }
  if (action === 'duplicate') {
    if (
      r.kind !== 'file' ||
      typeof r.name !== 'string' ||
      !r.name ||
      typeof r.relativePath !== 'string' ||
      !r.relativePath ||
      r.relativePath.startsWith('/') ||
      r.relativePath.split('/').some((p) => !p || p === '.' || p === '..') ||
      !Array.isArray(r.warnings) ||
      r.warnings.some((x) => typeof x !== 'string') ||
      typeof r.size !== 'number' ||
      !Number.isSafeInteger(r.size) ||
      r.size < 0
    )
      throw Error('副本回执内容无效');
  } else if (
    r.action !== action ||
    !(action === 'open-new'
      ? typeof r.windowLabel === 'string' &&
        (/^editor-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(r.windowLabel) ||
          (r.windowLabel === 'main' && r.workspace !== undefined))
      : r.windowLabel === null)
  )
    throw Error('系统动作回执内容无效');
  if (r.workspace !== undefined) {
    const folder = r.workspace as Record<string, unknown>;
    if (
      action !== 'open-new' ||
      !folder ||
      typeof folder !== 'object' ||
      !['id', 'name', 'path'].every(
        (key) =>
          typeof folder[key] === 'string' &&
          folder[key] !== '' &&
          (folder[key] as string).length <= 4096 &&
          !(folder[key] as string).includes('\0'),
      )
    )
      throw Error('目录复用回执无效');
  }
  if (
    r.warnings !== undefined &&
    (!Array.isArray(r.warnings) || r.warnings.some((value) => typeof value !== 'string'))
  )
    throw Error('文件动作警告回执无效');
  return value as EntryActionReceipt | EntryDuplicateReceipt;
}
export const entryActions = {
  async perform(
    workspaceId: string,
    entryToken: string,
    operationId: string,
    action: EntryOperation,
    editorSnapshot?: EntryEditorSnapshot,
  ): Promise<EntryResolution> {
    const request = entryRequest(workspaceId, entryToken, operationId, action);
    if (action === 'duplicate') {
      const { action: _, ...payload } = request;
      const receipt = await invoke<unknown>('duplicate_workspace_entry', payload);
      return {
        status: 'committed',
        receipt: entryReceipt(receipt, entryToken, operationId, action),
      };
    }
    return checked(
      await invoke<unknown>('perform_workspace_entry_action', {
        ...request,
        ...(editorSnapshot ? { editorSnapshot } : {}),
      }),
      entryToken,
      operationId,
      action,
    );
  },
  async resolve(
    workspaceId: string,
    entryToken: string,
    operationId: string,
    action: EntryOperation,
  ): Promise<EntryResolution | null> {
    const request = entryRequest(workspaceId, entryToken, operationId, action);
    const { action: _, ...copy } = request;
    const result = await invoke<unknown>(
      action === 'duplicate'
        ? 'resolve_workspace_entry_duplicate'
        : 'resolve_workspace_entry_action',
      action === 'duplicate' ? copy : request,
    );
    return result === null ? null : checked(result, entryToken, operationId, action);
  },
};
function checked(
  value: unknown,
  token: string,
  operation: string,
  action: EntryOperation,
): EntryResolution {
  if (!value || typeof value !== 'object') throw Error('文件动作状态无效');
  const r = value as Record<string, unknown>;
  if (r.status === 'committed')
    return { status: 'committed', receipt: entryReceipt(r.receipt, token, operation, action) };
  if (r.status === 'prepared') return { status: 'prepared' };
  if (r.status === 'rejected' && typeof r.message === 'string')
    return { status: 'rejected', message: r.message };
  if (
    r.status === 'mutationUncertain' &&
    (r.message === undefined || typeof r.message === 'string')
  )
    return r as EntryResolution;
  throw Error('文件动作状态无效');
}

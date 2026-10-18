import { invoke } from '@tauri-apps/api/core';
import { type EntryResolution, entryReceipt, entryRequest } from './entry-actions.js';

export const workspaceMove = {
  async perform(
    workspaceId: string,
    entryToken: string,
    destinationToken: string | null,
    operationId: string,
  ): Promise<EntryResolution> {
    const request = entryRequest(workspaceId, entryToken, operationId, 'move');
    if (destinationToken !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(destinationToken))
      throw Error('移动目标令牌无效');
    const { action: _, ...payload } = request;
    return checked(
      await invoke<unknown>('move_workspace_entry', { ...payload, destinationToken }),
      entryToken,
      operationId,
    );
  },
  async resolve(
    workspaceId: string,
    entryToken: string,
    operationId: string,
    destinationToken: string | null,
  ): Promise<EntryResolution | null> {
    const request = entryRequest(workspaceId, entryToken, operationId, 'move');
    const { action: _, ...payload } = request;
    const value = await invoke<unknown>('resolve_workspace_entry_move', {
      ...payload,
      destinationToken,
    });
    return value === null ? null : checked(value, entryToken, operationId);
  },
};
function checked(value: unknown, token: string, operation: string): EntryResolution {
  if (!value || typeof value !== 'object') throw Error('移动回执无效');
  const state = value as Record<string, unknown>;
  if (state.status === 'committed')
    return { status: 'committed', receipt: entryReceipt(state.receipt, token, operation, 'move') };
  if (state.status === 'prepared') return { status: 'prepared' };
  if (state.status === 'rejected' && typeof state.message === 'string')
    return { status: 'rejected', message: state.message };
  if (state.status === 'mutationUncertain' && typeof state.message === 'string')
    return { status: 'mutationUncertain', message: state.message };
  throw Error('移动回执无效');
}

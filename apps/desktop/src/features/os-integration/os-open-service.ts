import { invoke } from '@tauri-apps/api/core';
import type { DocumentFile } from '../../services/documents.js';
import { windowStartupSnapshot } from '../../services/window-startup.js';

export type OsOpenResult =
  | { kind: 'handled' }
  | { kind: 'warning'; message: string }
  | { kind: 'document'; token: string; document: DocumentFile };
export function osOpenSnapshot(value: unknown): OsOpenResult | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('系统打开响应无效。');
  const input = value as Record<string, unknown>;
  if (input.kind === 'handled') return { kind: 'handled' };
  if (input.kind === 'warning' && typeof input.message === 'string' && input.message.length <= 8192)
    return { kind: 'warning', message: input.message };
  if (
    input.kind !== 'document' ||
    typeof input.token !== 'string' ||
    !input.token ||
    input.token.length > 128 ||
    input.token.includes('\0')
  )
    throw Error('系统打开响应无效。');
  const snapshot = windowStartupSnapshot({
    document: input.document,
    workspace: null,
    warnings: [],
  });
  if (!snapshot.document) throw Error('系统打开缺少文稿。');
  return { kind: 'document', token: input.token, document: snapshot.document };
}
export const osOpenService = {
  take: (reuseCurrent: boolean) =>
    invoke<unknown>('take_os_open', { reuseCurrent }).then(osOpenSnapshot),
  complete: (token: string, accepted: boolean) =>
    invoke<void>('complete_os_open', { token, accepted }),
};

import { invoke } from '@tauri-apps/api/core';
import type { DocumentFile } from './documents.js';
import type { WorkspaceFolder } from './workspaces.js';

export interface WindowStartup {
  document: DocumentFile | null;
  workspace: WorkspaceFolder | null;
  warnings: string[];
  draft?: { text: string; savedText: string };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('窗口恢复响应无效。');
  return value as Record<string, unknown>;
}
function string(input: Record<string, unknown>, name: string, maximum: number): string {
  const value = input[name];
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (name !== 'text' && value.includes('\0'))
  )
    throw new Error('窗口恢复响应无效。');
  return value;
}
export function windowStartupSnapshot(value: unknown): WindowStartup {
  const input = record(value);
  let document: DocumentFile | null = null;
  if (input.document !== null) {
    const file = record(input.document);
    document = {
      id: string(file, 'id', 128),
      path: string(file, 'path', 4096),
      text: string(file, 'text', 32 * 1024 * 1024),
      encoding: string(file, 'encoding', 128),
    };
    if (!document.id || !document.path) throw new Error('窗口恢复响应无效。');
  }
  let workspace: WorkspaceFolder | null = null;
  if (input.workspace !== null) {
    const folder = record(input.workspace);
    workspace = {
      id: string(folder, 'id', 128),
      name: string(folder, 'name', 4096),
      path: string(folder, 'path', 4096),
    };
    if (!workspace.id || !workspace.path) throw new Error('窗口恢复响应无效。');
  }
  if (
    !Array.isArray(input.warnings) ||
    input.warnings.length > 64 ||
    input.warnings.some((warning) => typeof warning !== 'string' || warning.length > 8192)
  )
    throw new Error('窗口恢复响应无效。');
  const result: WindowStartup = { document, workspace, warnings: [...input.warnings] as string[] };
  if (input.draft !== undefined) {
    const draft = record(input.draft);
    const text = string(draft, 'text', 32 * 1024 * 1024);
    const savedText = string(draft, 'savedText', 32 * 1024 * 1024);
    if (!document || document.text !== savedText) throw Error('窗口草稿保存基线不匹配。');
    result.draft = { text, savedText };
  }
  return result;
}

/** Native has already validated persistent authority and registered fresh window-local IDs. */
let startupRequest: Promise<WindowStartup> | undefined;
export const windowStartup = {
  take(): Promise<WindowStartup> {
    startupRequest ??= invoke<unknown>('get_window_startup').then(windowStartupSnapshot);
    return startupRequest;
  },
  track(documentId: string | null, workspaceId: string | null): Promise<void> {
    return invoke('track_window_session', { documentId, workspaceId });
  },
};

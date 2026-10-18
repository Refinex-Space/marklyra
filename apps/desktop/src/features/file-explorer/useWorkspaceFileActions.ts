import { useLayoutEffect, useRef, useState } from 'react';
import {
  type FileOperationResolution,
  type WorkspaceFileUndo,
  type WorkspaceFolder,
  type WorkspaceTrashReceipt,
  type WorkspaceUndoReceipt,
  workspaces,
} from '../../services/workspaces.js';
import type { EntryMenuTarget } from './WorkspaceEntryMenu.js';

interface Options {
  workspace: WorkspaceFolder | null;
  disabled: boolean;
  view: 'tree' | 'articles';
  nextArticle(path: string): string | undefined;
  isCurrent(path: string): boolean;
  open(path: string): void;
  presence(path: string, state: 'trashed' | 'restored'): void;
  highlight(path: string): void;
  refresh(): void;
}
interface Operation {
  workspaceId: string;
  operationId: string;
  type: 'trash' | 'undo';
  token: string;
  kind?: 'file' | 'directory';
  phase: 'working' | 'resolving';
  error: string;
  next?: string | undefined;
  currentPath?: string | undefined;
}
/** Acknowledgements are journal results, never permission to replay uncertain IO. */
export function useWorkspaceFileActions(options: Options) {
  const [state, setState] = useState<Operation | null>(null),
    [message, setMessage] = useState('');
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<Operation | null>(null),
    alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const old = active.current;
      active.current = null;
      if (old?.type === 'trash' && old.token)
        void workspaces.finishEntry(old.workspaceId, old.token).catch(() => {});
    };
  }, []);
  useLayoutEffect(() => {
    const old = active.current;
    if (old && old.workspaceId !== options.workspace?.id) {
      active.current = null;
      setState(null);
      if (old.type === 'trash' && old.token)
        void workspaces.finishEntry(old.workspaceId, old.token).catch(() => {});
    }
  }, [options.workspace?.id]);
  const current = (operation: Operation) =>
    alive.current &&
    active.current === operation &&
    latest.current.workspace?.id === operation.workspaceId;
  const publish = (operation: Operation) => {
    if (current(operation)) setState({ ...operation });
  };
  const release = (operation: Operation) =>
    operation.type === 'trash' && operation.token
      ? workspaces.finishEntry(operation.workspaceId, operation.token).catch(() => {})
      : Promise.resolve();
  const done = async (
    operation: Operation,
    receipt: WorkspaceTrashReceipt | WorkspaceUndoReceipt,
  ) => {
    if (
      (operation.type === 'trash' &&
        (!('status' in receipt) || !['trashed', 'cancelled'].includes(receipt.status))) ||
      (operation.type === 'undo' &&
        (!('restoredRelativePath' in receipt) ||
          (receipt.restoredRelativePath !== null &&
            typeof receipt.restoredRelativePath !== 'string')))
    )
      throw Error('无法核对文件操作结果');
    if (
      receipt.operationId !== operation.operationId ||
      (operation.type === 'trash'
        ? !('entryToken' in receipt) ||
          receipt.entryToken !== operation.token ||
          receipt.kind !== operation.kind
        : !('undoToken' in receipt) || receipt.undoToken !== operation.token)
    )
      throw Error('文件操作回执不属于当前请求，请核对结果');
    await release(operation);
    if (!current(operation)) return;
    if (receipt.warnings.length) setMessage(receipt.warnings.join('\n'));
    active.current = null;
    setState(null);
    if ('status' in receipt) {
      if (receipt.status === 'trashed') {
        latest.current.presence(receipt.relativePath, 'trashed');
        if (
          !receipt.preserveCurrent &&
          operation.next &&
          operation.currentPath &&
          latest.current.view === 'articles' &&
          latest.current.isCurrent(operation.currentPath)
        )
          latest.current.open(operation.next);
      }
    } else {
      if (receipt.restoredRelativePath !== null) {
        latest.current.presence(receipt.restoredRelativePath, 'restored');
        latest.current.highlight(receipt.restoredRelativePath);
      }
    }
    latest.current.refresh();
  };
  const resolve = async (operation: Operation) => {
    if (!operation.token || !current(operation)) return;
    operation.phase = 'resolving';
    publish(operation);
    try {
      const result: FileOperationResolution<WorkspaceTrashReceipt | WorkspaceUndoReceipt> | null =
        operation.type === 'trash'
          ? await workspaces.resolveTrash(
              operation.workspaceId,
              operation.token,
              operation.operationId,
            )
          : await workspaces.resolveFileUndo(
              operation.workspaceId,
              operation.token,
              operation.operationId,
            );
      if (!current(operation)) return;
      if (result?.status === 'committed') {
        await done(operation, result.receipt);
        return;
      }
      if (result?.status === 'rejected') {
        await release(operation);
        if (!current(operation)) return;
        setMessage(result.message);
        active.current = null;
        setState(null);
        return;
      }
      operation.error =
        result?.status === 'prepared'
          ? '操作仍在处理中，请核对结果；不会重复打开确认或执行文件操作。'
          : '文件状态尚未确认，请核对结果；不会重复执行文件操作。';
      publish(operation);
    } catch (reason) {
      if (current(operation)) {
        operation.error = `结果核对失败：${String(reason)}`;
        publish(operation);
      }
    }
  };
  const trash = async (target: EntryMenuTarget) => {
    const workspace = latest.current.workspace;
    if (!workspace || latest.current.disabled || active.current || !target.relativePath) return;
    const operation: Operation = {
      workspaceId: workspace.id,
      operationId: crypto.randomUUID(),
      type: 'trash',
      token: '',
      kind: target.kind,
      phase: 'working',
      error: '',
      currentPath: target.relativePath,
      next:
        latest.current.view === 'articles' && latest.current.isCurrent(target.relativePath)
          ? latest.current.nextArticle(target.relativePath)
          : undefined,
    };
    active.current = operation;
    setMessage('');
    publish(operation);
    try {
      const entry = await workspaces.inspect(workspace.id, target.relativePath);
      operation.token = entry.entryToken;
      operation.kind = entry.kind;
      if (!current(operation)) {
        await release(operation);
        return;
      }
      try {
        await done(
          operation,
          await workspaces.trashEntry(workspace.id, entry.entryToken, operation.operationId),
        );
      } catch {
        if (current(operation)) await resolve(operation);
      }
    } catch (reason) {
      if (current(operation)) {
        setMessage(String(reason));
        active.current = null;
        setState(null);
      }
    }
  };
  const undo = async (catalog: WorkspaceFileUndo) => {
    const workspace = latest.current.workspace;
    if (!workspace || latest.current.disabled || active.current) return;
    const operation: Operation = {
      workspaceId: workspace.id,
      operationId: crypto.randomUUID(),
      type: 'undo',
      token: catalog.token,
      phase: 'working',
      error: '',
    };
    active.current = operation;
    setMessage('');
    publish(operation);
    try {
      await done(
        operation,
        await workspaces.performFileUndo(workspace.id, catalog.token, operation.operationId),
      );
    } catch {
      if (current(operation)) await resolve(operation);
    }
  };
  return {
    state,
    message,
    busy: state !== null,
    trash,
    undo,
    check: async () => {
      if (active.current?.phase === 'resolving') await resolve(active.current);
    },
    report: (reason: unknown) => setMessage(String(reason)),
  };
}

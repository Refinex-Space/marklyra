import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  type CreatedWorkspaceEntry,
  type EntryRenameReceipt,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';
import {
  type CreationView,
  creationName,
  type PrepareCreatedDocument,
  parentPath,
  type WorkspaceCreationState,
} from './creation-types.js';
import { relocatedPath } from './entry-projection.js';

interface Options {
  workspace: WorkspaceFolder | null;
  disabled: boolean;
  view: CreationView;
  visible: boolean;
  windows: boolean;
  prepare?: PrepareCreatedDocument | undefined;
  named?: ((input: HTMLInputElement | null) => Promise<void>) | undefined;
  refresh(): void;
}
interface Operation extends WorkspaceCreationState {
  input?: HTMLInputElement | null;
  original: CreatedWorkspaceEntry | undefined;
  operationId?: string;
  requestedName?: string;
  resolution?: 'prepared' | 'unknown' | 'mutationUncertain';
  handoff: boolean;
}
/** Existing-entry capabilities never open or reload the document being edited. */
export function useWorkspaceRename(options: Options) {
  const [state, setState] = useState<WorkspaceCreationState | null>(null);
  const [message, setMessage] = useState('');
  const [completion, setCompletion] = useState<Operation | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<Operation | null>(null);
  const alive = useRef(true);
  const current = (operation: Operation) =>
    alive.current &&
    active.current === operation &&
    latest.current.workspace?.id === operation.workspaceId;
  const publish = (operation: Operation) => {
    if (current(operation)) setState({ ...operation });
  };
  const release = async (operation: Operation) => {
    if (operation.entry)
      await workspaces.finishEntry(operation.workspaceId, operation.entry.entryToken);
  };
  const retire = useCallback((operation: Operation) => {
    if (operation.entry)
      void workspaces
        .finishEntry(operation.workspaceId, operation.entry.entryToken)
        .catch(() => {});
  }, []);
  useLayoutEffect(() => {
    alive.current = true;
    const external = (event: Event) => {
      const operation = active.current;
      if (!operation) return;
      if (event.target instanceof Element && event.target.closest('.workspace-creation-input'))
        return;
      if (event.target instanceof HTMLIFrameElement || event.target === document.body) return;
      operation.handoff = false;
    };
    document.addEventListener('pointerdown', external, true);
    document.addEventListener('keydown', external, true);
    document.addEventListener('focusin', external, true);
    const blur = () => {
      if (active.current) active.current.handoff = false;
    };
    window.addEventListener('blur', blur);
    return () => {
      alive.current = false;
      const operation = active.current;
      active.current = null;
      if (operation) retire(operation);
      document.removeEventListener('pointerdown', external, true);
      document.removeEventListener('keydown', external, true);
      document.removeEventListener('focusin', external, true);
      window.removeEventListener('blur', blur);
    };
  }, [retire]);
  useLayoutEffect(() => {
    const operation = active.current;
    if (
      operation &&
      (operation.workspaceId !== options.workspace?.id ||
        operation.view !== options.view ||
        !options.visible)
    ) {
      active.current = null;
      setState(null);
      setCompletion(null);
      retire(operation);
    }
  }, [options.workspace?.id, options.view, options.visible, retire]);
  useLayoutEffect(() => {
    if (!completion) return;
    const operation = completion;
    const valid = () =>
      alive.current &&
      active.current === operation &&
      latest.current.workspace?.id === operation.workspaceId;
    void (async () => {
      try {
        if (valid() && operation.handoff && document.hasFocus())
          await latest.current.named?.(operation.input?.isConnected ? operation.input : null);
      } catch (reason) {
        if (valid()) setMessage(`名称已保存，返回正文失败：${String(reason)}`);
      } finally {
        if (valid()) {
          active.current = null;
          setState(null);
          setCompletion(null);
          latest.current.refresh();
        }
      }
    })();
  }, [completion]);
  const finish = async (operation: Operation, handoff: boolean) => {
    operation.phase = 'finishing';
    publish(operation);
    try {
      await release(operation);
      if (!current(operation)) return;
      operation.handoff &&= handoff;
      setCompletion(operation);
    } catch (reason) {
      if (!current(operation)) return;
      operation.phase = 'naming';
      operation.error = String(reason);
      publish(operation);
    }
  };
  const committed = async (operation: Operation, receipt: EntryRenameReceipt) => {
    if (
      receipt.operationId !== operation.operationId ||
      receipt.entryToken !== operation.entry?.entryToken ||
      receipt.name !== operation.requestedName ||
      receipt.kind !== operation.kind
    )
      throw new Error('改名回执不属于当前操作，请核对结果后继续');
    if (!current(operation)) {
      retire({ ...operation, entry: receipt });
      return;
    }
    // Keep the original display path/input until the real inner focus ACK.
    operation.original = receipt;
    if (receipt.warnings.length) setMessage(receipt.warnings.join('\n'));
    await finish(operation, true);
  };
  const resolve = async (operation: Operation) => {
    if (!operation.operationId || !current(operation)) return;
    operation.phase = 'resolving';
    operation.resolution = 'unknown';
    publish(operation);
    try {
      const result = await workspaces.resolveRename(operation.workspaceId, operation.operationId);
      if (!current(operation)) return;
      if (result?.status === 'committed') {
        await committed(operation, result.receipt);
        return;
      }
      if (result?.status === 'rejected') {
        operation.phase = 'naming';
        operation.error = result.message;
        delete operation.operationId;
        delete operation.requestedName;
        delete operation.resolution;
      } else {
        operation.resolution = result?.status ?? 'unknown';
        operation.error =
          result?.status === 'prepared'
            ? '改名尚未执行，可安全重试同一次操作。'
            : '文件状态尚未确认，请核对结果后继续；不会重复执行改名。';
      }
      publish(operation);
    } catch (reason) {
      if (current(operation)) {
        operation.error = `结果核对失败：${String(reason)}`;
        publish(operation);
      }
    }
  };
  const send = async (operation: Operation) => {
    if (!operation.entry || !operation.operationId || operation.requestedName === undefined) return;
    operation.phase = 'renaming';
    operation.error = '';
    publish(operation);
    try {
      const receipt = await workspaces.renameEntry(
        operation.workspaceId,
        operation.entry.entryToken,
        operation.requestedName,
        operation.operationId,
      );
      await committed(operation, receipt);
    } catch (reason) {
      if (!current(operation)) return;
      operation.error = String(reason);
      await resolve(operation);
    }
  };
  const start = async (relativePath: string, kind: 'file' | 'directory') => {
    const workspace = latest.current.workspace;
    if (!workspace || !relativePath || latest.current.disabled || active.current) return;
    const operation: Operation = {
      workspaceId: workspace.id,
      parentRelativePath: parentPath(relativePath),
      view: latest.current.view,
      kind,
      phase: 'inspecting',
      error: '',
      original: undefined,
      handoff: true,
    };
    active.current = operation;
    setMessage('');
    publish(operation);
    try {
      await latest.current.prepare?.();
      if (!current(operation)) return;
      const entry = await workspaces.inspect(workspace.id, relativePath);
      operation.entry = entry;
      if (!current(operation)) {
        retire(operation);
        return;
      }
      if (!operation.handoff || !document.hasFocus()) {
        await finish(operation, false);
        return;
      }
      operation.phase = 'naming';
      publish(operation);
    } catch (reason) {
      if (current(operation)) {
        setMessage(String(reason));
        active.current = null;
        setState(null);
      }
    }
  };
  const commit = async (name: string) => {
    const operation = active.current;
    if (!operation?.entry || operation.phase !== 'naming' || latest.current.disabled) return;
    const normalized = creationName(name, latest.current.windows);
    if (!normalized || normalized === operation.entry.name) {
      await finish(operation, operation.view === 'articles');
      return;
    }
    operation.operationId = crypto.randomUUID();
    operation.requestedName = normalized;
    await send(operation);
  };
  const cancel = async () => {
    const operation = active.current;
    if (operation?.phase === 'naming') await finish(operation, operation.view === 'articles');
  };
  const removed = (path: string) => {
    const operation = active.current,
      target = operation?.entry?.relativePath;
    if (!operation || !target || !(target === path || target.startsWith(path + '/'))) return;
    active.current = null;
    setState(null);
    setCompletion(null);
    setMessage('该项目已移入废纸篓，已结束命名。当前文稿保留。');
    retire(operation);
  };
  const registerInput = useCallback((entryToken: string, input: HTMLInputElement | null) => {
    const operation = active.current;
    if (operation?.entry?.entryToken === entryToken) operation.input = input;
  }, []);
  const relocate = (from: string, to: string) => {
    const operation = active.current;
    if (!operation?.entry) return;
    const path = relocatedPath(operation.entry.relativePath, from, to);
    if (path !== operation.entry.relativePath) {
      operation.entry = {
        ...operation.entry,
        relativePath: path,
        name: path.split('/').at(-1) ?? operation.entry.name,
      };
      operation.parentRelativePath = parentPath(path);
      publish(operation);
    }
  };
  return {
    state,
    message,
    start,
    commit,
    finish: cancel,
    registerInput,
    removed,
    relocate,
    completing: completion !== null,
    retryResolution: async () => {
      if (active.current?.phase === 'resolving') await resolve(active.current);
    },
    retryPrepared:
      state?.phase === 'resolving' && active.current?.resolution === 'prepared'
        ? async () => {
            if (active.current?.phase === 'resolving' && active.current.resolution === 'prepared')
              await send(active.current);
          }
        : undefined,
  };
}

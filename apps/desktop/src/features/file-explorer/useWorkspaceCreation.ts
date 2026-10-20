import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  type CreatedWorkspaceEntry,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';
import {
  type CreationKind,
  type CreationView,
  creationName,
  type PrepareCreatedDocument,
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
  operationId: string;
  opener?: ((workspaceId: string, relativePath: string) => Promise<void>) | undefined;
  prepared: boolean;
  interaction: number;
  namingEntry?: CreatedWorkspaceEntry;
  input?: HTMLInputElement | null;
}
const release = (workspaceId: string, entry: CreatedWorkspaceEntry) =>
  workspaces.finishCreation(workspaceId, entry.entryToken).catch(() => {});

/** One scoped creation receipt; cancellation ends naming, never deletes its file. */
export function useWorkspaceCreation(options: Options) {
  const [state, setState] = useState<WorkspaceCreationState | null>(null);
  const [message, setMessage] = useState('');
  const [namedCompletion, setNamedCompletion] = useState<Operation | null>(null);
  const completion = useRef<Operation | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<Operation | null>(null);
  const alive = useRef(true);
  const interactions = useRef(0);
  const releaseStale = useCallback(async (workspaceId: string, entry: CreatedWorkspaceEntry) => {
    await release(workspaceId, entry);
    if (alive.current && latest.current.workspace?.id === workspaceId) latest.current.refresh();
  }, []);
  useLayoutEffect(() => {
    alive.current = true;
    const interact = (event?: Event) => {
      const operation = active.current;
      if (!operation) return;
      if (['creating', 'opening'].includes(operation.phase)) interactions.current++;
      else if (
        ['naming', 'renaming', 'finishing'].includes(operation.phase) &&
        !(event?.target instanceof Element && event.target.closest('.workspace-creation-input'))
      )
        interactions.current++;
    };
    const focus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target !== document.body &&
        event.target.tagName !== 'IFRAME'
      )
        interact(event);
    };
    document.addEventListener('focusin', focus, true);
    document.addEventListener('pointerdown', interact, true);
    document.addEventListener('keydown', interact, true);
    const blur = () => {
      if (active.current && active.current.phase !== 'opening') interactions.current++;
    };
    window.addEventListener('blur', blur);
    return () => {
      alive.current = false;
      completion.current = null;
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
      window.removeEventListener('blur', blur);
      const previous = active.current;
      active.current = null;
      if (previous?.entry) void releaseStale(previous.workspaceId, previous.entry);
    };
  }, [releaseStale]);
  useLayoutEffect(() => {
    const previous = active.current;
    if (
      completion.current &&
      (completion.current.workspaceId !== options.workspace?.id ||
        completion.current.view !== options.view ||
        !options.visible)
    ) {
      completion.current = null;
      setNamedCompletion(null);
    }
    if (
      previous &&
      (previous.workspaceId !== options.workspace?.id ||
        previous.view !== options.view ||
        !options.visible)
    ) {
      active.current = null;
      setState(null);
      if (previous.entry) void releaseStale(previous.workspaceId, previous.entry);
    }
  }, [options.workspace?.id, options.view, options.visible, releaseStale]);
  useLayoutEffect(() => {
    if (!namedCompletion) return;
    const operation = namedCompletion;
    const valid = () =>
      alive.current &&
      completion.current === operation &&
      active.current === operation &&
      latest.current.workspace?.id === operation.workspaceId &&
      latest.current.view === operation.view &&
      latest.current.visible;
    const complete = () => {
      if (!valid()) return;
      completion.current = null;
      active.current = null;
      setState(null);
      setNamedCompletion(null);
      latest.current.refresh();
    };
    if (!valid()) return;
    if (operation.interaction !== interactions.current || !document.hasFocus()) {
      complete();
      return;
    }
    // The owned input remains read-only until the real inner focus ACK. Outer
    // iframe focus alone is earlier than its editable document is ready.
    void (async () => {
      try {
        const input = operation.input?.isConnected ? operation.input : null;
        await latest.current.named?.(input);
      } catch (reason) {
        if (valid()) setMessage(`名称已保存，返回正文失败：${String(reason)}`);
      } finally {
        complete();
      }
    })();
  }, [namedCompletion]);
  const current = (operation: Operation) =>
    alive.current &&
    active.current === operation &&
    latest.current.workspace?.id === operation.workspaceId;
  const publish = (operation: Operation) => {
    if (current(operation))
      setState(
        operation.namingEntry ? { ...operation, entry: operation.namingEntry } : { ...operation },
      );
  };
  const finishOperation = async (operation: Operation, handoff = false) => {
    if (!operation.entry) return;
    operation.phase = 'finishing';
    publish(operation);
    try {
      await workspaces.finishCreation(operation.workspaceId, operation.entry.entryToken);
      if (!current(operation)) return;
      if (handoff && operation.interaction === interactions.current) {
        completion.current = operation;
        setNamedCompletion(operation);
      } else {
        active.current = null;
        setState(null);
        latest.current.refresh();
      }
    } catch (reason) {
      if (!current(operation)) return;
      operation.phase = 'naming';
      operation.error = String(reason);
      publish(operation);
    }
  };
  const create = async (operation: Operation) => {
    if (!current(operation)) return;
    operation.phase = 'creating';
    operation.error = '';
    publish(operation);
    let entry: CreatedWorkspaceEntry;
    try {
      if (!operation.prepared) {
        operation.opener = await latest.current.prepare?.();
        operation.prepared = true;
        if (!current(operation)) return;
      }
      entry = await workspaces.create(
        operation.workspaceId,
        operation.parentRelativePath,
        operation.kind,
        operation.operationId,
      );
    } catch (reason) {
      if (!current(operation)) return;
      operation.phase = 'failed';
      operation.error = String(reason);
      publish(operation);
      return;
    }
    if (!current(operation)) {
      await releaseStale(operation.workspaceId, entry);
      return;
    }
    operation.entry = entry;
    operation.namingEntry = entry;
    if (operation.interaction !== interactions.current || latest.current.disabled) {
      await finishOperation(operation);
      return;
    }
    if (operation.opener && entry.kind === 'file') {
      operation.phase = 'opening';
      publish(operation);
      try {
        await operation.opener(operation.workspaceId, entry.relativePath);
      } catch (reason) {
        if (!current(operation)) {
          await releaseStale(operation.workspaceId, entry);
          return;
        }
        operation.opener = undefined;
        setMessage(`新文件已创建，未自动打开：${String(reason)}`);
        await finishOperation(operation);
        return;
      }
    }
    if (!current(operation)) {
      await releaseStale(operation.workspaceId, entry);
      return;
    }
    if (operation.interaction !== interactions.current || !document.hasFocus()) {
      await finishOperation(operation);
      return;
    }
    operation.phase = 'naming';
    publish(operation);
  };
  const start = async (parentRelativePath: string, kind: CreationKind, view: CreationView) => {
    const workspace = latest.current.workspace;
    if (!workspace || latest.current.disabled || active.current || completion.current) return;
    const operation: Operation = {
      workspaceId: workspace.id,
      parentRelativePath,
      kind,
      view,
      phase: 'creating',
      error: '',
      operationId: crypto.randomUUID(),
      prepared: false,
      interaction: interactions.current,
    };
    active.current = operation;
    setMessage('');
    publish(operation);
    await create(operation);
  };
  const commit = async (name: string) => {
    const operation = active.current;
    if (!operation?.entry || operation.phase !== 'naming' || latest.current.disabled) return;
    const normalized = creationName(name, latest.current.windows);
    if (!normalized || normalized === operation.entry.name) {
      await finishOperation(operation, operation.view === 'articles');
      return;
    }
    operation.phase = 'renaming';
    operation.error = '';
    publish(operation);
    try {
      const entry = await workspaces.renameCreation(
        operation.workspaceId,
        operation.entry.entryToken,
        normalized,
      );
      if (!current(operation)) {
        await releaseStale(operation.workspaceId, entry);
        return;
      }
      operation.entry = entry;
      await finishOperation(operation, true);
    } catch (reason) {
      if (!current(operation)) return;
      operation.phase = 'naming';
      operation.error = String(reason);
      publish(operation);
    }
  };
  const finish = async () => {
    const operation = active.current;
    if (operation?.phase === 'naming')
      await finishOperation(operation, operation.view === 'articles');
  };
  const retry = async () => {
    const operation = active.current;
    if (operation?.phase === 'failed') await create(operation);
  };
  const relocate = (from: string, to: string) => {
    const operation = active.current;
    if (!operation) return;
    operation.parentRelativePath = relocatedPath(operation.parentRelativePath, from, to);
    for (const key of ['entry', 'namingEntry'] as const) {
      const entry = operation[key];
      if (entry) {
        const path = relocatedPath(entry.relativePath, from, to);
        if (path !== entry.relativePath)
          operation[key] = {
            ...entry,
            relativePath: path,
            name: path.split('/').at(-1) ?? entry.name,
          };
      }
    }
    publish(operation);
  };
  const removed = (path: string) => {
    const operation = active.current,
      target = operation?.entry?.relativePath;
    if (!operation || !target || !(target === path || target.startsWith(path + '/'))) return;
    active.current = null;
    completion.current = null;
    setState(null);
    setNamedCompletion(null);
    setMessage(
      `该项目已移入${latest.current.windows ? '回收站' : '废纸篓'}，已结束命名。当前文稿保留。`,
    );
    if (operation.entry) void releaseStale(operation.workspaceId, operation.entry);
  };
  const registerInput = useCallback((entryToken: string, input: HTMLInputElement | null) => {
    const operation = active.current;
    if (operation?.entry?.entryToken === entryToken) operation.input = input;
  }, []);
  return {
    registerInput,
    removed,
    relocate,
    state: state?.workspaceId === options.workspace?.id ? state : null,
    message,
    completing: namedCompletion !== null,
    start,
    commit,
    finish,
    retry,
  };
}

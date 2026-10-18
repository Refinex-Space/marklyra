import { useLayoutEffect, useRef, useState } from 'react';
import {
  type EntryDuplicateReceipt,
  type EntryEditorSnapshot,
  type EntryOperation,
  type EntryResolution,
  entryActions,
} from '../../services/entry-actions.js';
import { type WorkspaceFolder, workspaces } from '../../services/workspaces.js';
import type { EntryMenuTarget } from './WorkspaceEntryMenu.js';

interface Operation {
  workspaceId: string;
  entryToken: string;
  operationId: string;
  action: EntryOperation;
  checking: boolean;
  interaction: number;
  editorPath: string | undefined;
  editorSource: string | undefined;
  sourceRelativePath: string;
  error: string;
}
interface Options {
  workspace: WorkspaceFolder | null;
  disabled: boolean;
  editorPath?: string | undefined;
  editorSource?: string | undefined;
  busy(value: boolean): void;
  prepareOpenNew?: (() => Promise<EntryEditorSnapshot>) | undefined;
  reused(workspace: WorkspaceFolder, focus: boolean): void;
  duplicated(
    receipt: EntryDuplicateReceipt,
    focus: boolean,
    sourceRelativePath: string,
  ): Promise<void>;
}
const release = (o: Operation) =>
  o.entryToken && o.entryToken !== o.workspaceId
    ? workspaces.finishEntry(o.workspaceId, o.entryToken).catch(() => {})
    : Promise.resolve();
export function useWorkspaceEntryActions(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const interactions = useRef(0);
  const active = useRef<Operation | null>(null),
    alive = useRef(true);
  const [state, setState] = useState<Operation | null>(null),
    [message, setMessage] = useState('');
  const [completion, setCompletion] = useState<{
    workspaceId: string;
    receipt: EntryDuplicateReceipt;
    interaction: number;
    editorPath: string | undefined;
    editorSource: string | undefined;
    sourceRelativePath: string;
  } | null>(null);
  const current = (o: Operation) =>
    alive.current && active.current === o && latest.current.workspace?.id === o.workspaceId;
  useLayoutEffect(() => {
    alive.current = true;
    const interact = () => {
      if (active.current) interactions.current++;
    };
    document.addEventListener('pointerdown', interact, true);
    document.addEventListener('keydown', interact, true);
    window.addEventListener('blur', interact);
    return () => {
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
      window.removeEventListener('blur', interact);
      alive.current = false;
      const old = active.current;
      active.current = null;
      if (old) void release(old);
    };
  }, []);
  useLayoutEffect(() => {
    const old = active.current;
    if (old && old.workspaceId !== options.workspace?.id) {
      active.current = null;
      setState(null);
      latest.current.busy(false);
      void release(old);
    }
  }, [options.workspace?.id]);
  useLayoutEffect(() => {
    if (!completion) return;
    setCompletion(null);
    if (completion.workspaceId === latest.current.workspace?.id)
      void latest.current
        .duplicated(
          completion.receipt,
          completion.interaction === interactions.current &&
            completion.editorPath === latest.current.editorPath &&
            completion.editorSource === latest.current.editorSource &&
            document.hasFocus(),
          completion.sourceRelativePath,
        )
        .catch((e) => setMessage(String(e)));
  }, [completion]);
  const done = async (o: Operation, result: EntryResolution | null) => {
    if (!current(o)) return;
    if (result?.status === 'committed' || result?.status === 'rejected') {
      await release(o);
      if (!current(o)) return;
      active.current = null;
      setState(null);
      latest.current.busy(false);
      if (result.status === 'rejected') setMessage(result.message);
      else if (o.action === 'open-new' && 'workspace' in result.receipt && result.receipt.workspace)
        latest.current.reused(
          result.receipt.workspace,
          o.interaction === interactions.current &&
            o.editorPath === latest.current.editorPath &&
            o.editorSource === latest.current.editorSource &&
            document.hasFocus(),
        );
      else if (o.action === 'duplicate')
        setCompletion({
          workspaceId: o.workspaceId,
          receipt: result.receipt as EntryDuplicateReceipt,
          interaction: o.interaction,
          editorPath: o.editorPath,
          editorSource: o.editorSource,
          sourceRelativePath: o.sourceRelativePath,
        });
      return;
    }
    o.checking = true;
    o.error =
      result?.status === 'mutationUncertain'
        ? '操作结果尚未确认；保留当前状态，不会重新执行。'
        : '操作仍在处理或回执未知；只核对结果，不会重新执行。';
    setState({ ...o });
  };
  const check = async (o: Operation) => {
    try {
      await done(
        o,
        await entryActions.resolve(o.workspaceId, o.entryToken, o.operationId, o.action),
      );
    } catch (e) {
      if (current(o)) {
        o.checking = true;
        o.error = `结果核对失败：${String(e)}`;
        setState({ ...o });
      }
    }
  };
  return {
    state,
    message,
    busy: state !== null,
    start: async (target: EntryMenuTarget, action: EntryOperation) => {
      const workspace = latest.current.workspace;
      if (!workspace || latest.current.disabled || active.current) return;
      const o: Operation = {
        workspaceId: workspace.id,
        entryToken: '',
        operationId: crypto.randomUUID(),
        action,
        checking: false,
        interaction: interactions.current,
        editorPath: latest.current.editorPath,
        editorSource: latest.current.editorSource,
        sourceRelativePath: target.relativePath,
        error: '',
      };
      active.current = o;
      latest.current.busy(true);
      setMessage('');
      setState({ ...o });
      try {
        if (target.relativePath === '' && action === 'copy-path') o.entryToken = workspace.id;
        else {
          if (target.relativePath === '') throw Error('目录根不支持此文件动作');
          const entry = await workspaces.inspect(workspace.id, target.relativePath);
          o.entryToken = entry.entryToken;
        }
        if (!current(o)) {
          await release(o);
          return;
        }
        const snapshot =
          action === 'open-new' ? await latest.current.prepareOpenNew?.() : undefined;
        if (!current(o)) {
          await release(o);
          return;
        }
        try {
          await done(
            o,
            await entryActions.perform(
              o.workspaceId,
              o.entryToken,
              o.operationId,
              action,
              snapshot,
            ),
          );
        } catch {
          await check(o);
        }
      } catch (e) {
        void release(o);
        if (current(o)) {
          active.current = null;
          setState(null);
          latest.current.busy(false);
          setMessage(String(e));
        }
      }
    },
    check: async () => {
      if (active.current?.checking) {
        active.current.interaction = interactions.current;
        await check(active.current);
      }
    },
  };
}

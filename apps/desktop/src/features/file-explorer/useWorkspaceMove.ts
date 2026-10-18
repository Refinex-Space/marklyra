import type { DragEvent } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { EntryResolution } from '../../services/entry-actions.js';
import { workspaceMove } from '../../services/workspace-move.js';
import { type WorkspaceFolder, workspaces } from '../../services/workspaces.js';
import { type PrepareCreatedDocument, parentPath } from './creation-types.js';

const MIME = 'application/x-marklyra-entry';
interface Drag {
  id: string;
  path: string;
  kind: 'file' | 'directory';
  workspaceId: string;
}
interface Move {
  workspaceId: string;
  token: string;
  destination: string | null;
  operation: string;
  checking: boolean;
  interaction: number;
  opener?: ((workspaceId: string, relativePath: string) => Promise<void>) | undefined;
}
interface Options {
  workspace: WorkspaceFolder | null;
  disabled: boolean;
  busy(value: boolean): void;
  refresh(): void;
  prepare?: PrepareCreatedDocument | undefined;
  named?: (() => Promise<void>) | undefined;
}
const release = (move: Move) =>
  Promise.all(
    [move.token, move.destination]
      .filter((token): token is string => !!token && token !== move.workspaceId)
      .map((token) => workspaces.finishEntry(move.workspaceId, token).catch(() => {})),
  );
/** The MIME value only identifies this gesture. Native inspections grant the IO. */
export function useWorkspaceMove(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const interactions = useRef(0);
  const drag = useRef<Drag | null>(null),
    active = useRef<Move | null>(null),
    alive = useRef(true);
  const [state, setState] = useState<Move | null>(null),
    [message, setMessage] = useState('');
  const valid = (move: Move) =>
    alive.current && active.current === move && latest.current.workspace?.id === move.workspaceId;
  useLayoutEffect(() => {
    alive.current = true;
    const interact = () => {
      if (active.current) interactions.current++;
    };
    document.addEventListener('pointerdown', interact, true);
    document.addEventListener('keydown', interact, true);
    return () => {
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
      alive.current = false;
      drag.current = null;
      const previous = active.current;
      active.current = null;
      if (previous) void release(previous);
    };
  }, []);
  useLayoutEffect(() => {
    drag.current = null;
    const previous = active.current;
    if (previous && previous.workspaceId !== options.workspace?.id) {
      active.current = null;
      setState(null);
      latest.current.busy(false);
      void release(previous);
    }
  }, [options.workspace?.id]);
  const done = async (move: Move, result: EntryResolution | null) => {
    if (!valid(move)) return;
    if (result?.status === 'committed' || result?.status === 'rejected') {
      await release(move);
      if (!valid(move)) return;
      if (
        result.status === 'committed' &&
        'moveEntry' in result.receipt &&
        result.receipt.moveEntry?.kind === 'file' &&
        move.opener &&
        move.interaction === interactions.current &&
        document.hasFocus()
      ) {
        try {
          await move.opener(move.workspaceId, result.receipt.moveEntry.relativePath);
          if (valid(move)) await latest.current.named?.();
        } catch (error) {
          if (valid(move)) setMessage(`移动已完成，保留当前文稿：${String(error)}`);
        }
        if (!valid(move)) return;
      }
      active.current = null;
      setState(null);
      latest.current.busy(false);
      if (result.status === 'rejected') setMessage(result.message);
      else {
        latest.current.refresh();
        if ('warnings' in result.receipt && result.receipt.warnings?.length)
          setMessage(result.receipt.warnings.join('；'));
      }
    } else {
      move.checking = true;
      setState({ ...move });
      setMessage('移动结果尚未确认；只核对原请求，不会重新移动。');
    }
  };
  const check = async (move: Move) => {
    try {
      await done(
        move,
        await workspaceMove.resolve(move.workspaceId, move.token, move.operation, move.destination),
      );
    } catch (error) {
      if (valid(move)) {
        move.checking = true;
        setState({ ...move });
        setMessage(`移动结果核对失败：${String(error)}`);
      }
    }
  };
  const start = async (source: Drag, destination: string | null) => {
    const workspace = latest.current.workspace;
    if (
      !workspace ||
      latest.current.disabled ||
      active.current ||
      source.workspaceId !== workspace.id
    )
      return;
    const move: Move = {
      workspaceId: workspace.id,
      token: '',
      destination: null,
      operation: crypto.randomUUID(),
      checking: false,
      interaction: interactions.current,
    };
    active.current = move;
    setState({ ...move });
    setMessage('');
    latest.current.busy(true);
    try {
      if (source.kind === 'file') move.opener = await latest.current.prepare?.();
      if (!valid(move)) return;
      move.token = (await workspaces.inspect(workspace.id, source.path)).entryToken;
      if (!valid(move)) {
        await release(move);
        return;
      }
      if (destination !== null)
        move.destination =
          destination === ''
            ? workspace.id
            : (await workspaces.inspect(workspace.id, destination)).entryToken;
      if (!valid(move)) {
        await release(move);
        return;
      }
      try {
        await done(
          move,
          await workspaceMove.perform(workspace.id, move.token, move.destination, move.operation),
        );
      } catch {
        await check(move);
      }
    } catch (error) {
      if (valid(move)) {
        await release(move);
        active.current = null;
        setState(null);
        latest.current.busy(false);
        setMessage(String(error));
      }
    }
  };
  const target = (event: DragEvent<HTMLElement>) => {
    const current = drag.current;
    if (
      !current ||
      latest.current.disabled ||
      !event.dataTransfer.types.some((type) => type === MIME || type === 'text/plain') ||
      latest.current.workspace?.id !== current.workspaceId
    )
      return null;
    const row =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-entry-path]')
        : null;
    const path =
      row?.dataset.entryKind === 'directory'
        ? (row.dataset.entryPath ?? '')
        : row?.dataset.entryPath
          ? parentPath(row.dataset.entryPath)
          : '';
    if (
      path === parentPath(current.path) ||
      path === current.path ||
      (current.kind === 'directory' && path.startsWith(current.path + '/'))
    )
      return null;
    return { current, path };
  };
  return {
    state,
    message,
    choose: (path: string, kind: 'file' | 'directory') => {
      const workspace = latest.current.workspace;
      if (workspace)
        void start({ id: crypto.randomUUID(), path, kind, workspaceId: workspace.id }, null);
    },
    check: () => {
      if (active.current?.checking) {
        active.current.interaction = interactions.current;
        void check(active.current);
      }
    },
    dragStart: (event: DragEvent<HTMLElement>) => {
      const workspace = latest.current.workspace,
        row =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-entry-path]')
            : null;
      if (
        !workspace ||
        latest.current.disabled ||
        !row?.dataset.entryPath ||
        row.closest('.workspace-creation-input')
      ) {
        event.preventDefault();
        return;
      }
      drag.current = {
        id: crypto.randomUUID(),
        path: row.dataset.entryPath,
        kind: row.dataset.entryKind === 'directory' ? 'directory' : 'file',
        workspaceId: workspace.id,
      };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(MIME, drag.current.id);
      // AppKit-backed WK drags may expose only the standard text flavor.
      // It carries the same gesture nonce, never a path or file authority.
      event.dataTransfer.setData('text/plain', drag.current.id);
    },
    dragEnd: () => {
      drag.current = null;
    },
    dragOver: (event: DragEvent<HTMLElement>) => {
      if (target(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    },
    drop: (event: DragEvent<HTMLElement>) => {
      const candidate = target(event);
      if (
        !candidate ||
        (event.dataTransfer.getData(MIME) || event.dataTransfer.getData('text/plain')) !==
          candidate.current.id
      )
        return;
      event.preventDefault();
      drag.current = null;
      void start(candidate.current, candidate.path);
    },
  };
}

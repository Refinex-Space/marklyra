import type {
  FileOperationResolution,
  InspectedWorkspaceEntry,
  WorkspaceEntry,
  WorkspaceFileUndo,
  WorkspaceTrashReceipt,
  WorkspaceUndoReceipt,
} from '../../apps/desktop/src/services/workspaces.js';
import type { RenameWindow } from './rename-test-util.js';

type Behavior =
  | 'normal'
  | 'cancel'
  | 'interactiveConfirmed'
  | 'lostCommitted'
  | 'prepared'
  | 'unknown'
  | 'rejected'
  | 'foreign';
interface Slot extends WorkspaceFileUndo {
  entries: WorkspaceEntry[];
  path: string;
  kind: 'file' | 'directory';
}
export interface TrashMock {
  trashBehavior: Behavior;
  undoBehavior: Behavior;
  trashMutations: number;
  undoMutations: number;
  deferCatalog: boolean;
  pendingCatalog: number;
  releaseCatalog(): void;
  completePending(): void;
  seedUndo(): void;
  outsideRestore: boolean;
  externalTrash(path: string): void;
}
export type TrashWindow = RenameWindow & { __trashMock: TrashMock };
export function installTrashMock() {
  if (window !== window.top) return;
  const host = window as TrashWindow;
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke,
    tokens = new Map<string, InspectedWorkspaceEntry>();
  const trashOps = new Map<string, FileOperationResolution<WorkspaceTrashReceipt>>(),
    undoOps = new Map<string, FileOperationResolution<WorkspaceUndoReceipt>>();
  let slot: Slot | null = null,
    serial = 0,
    metadataRevision = 0;
  let locationState: 'available' | 'trashed' = 'available';
  let pending: { type: 'trash' | 'undo'; args: Record<string, unknown> } | null = null;
  const catalogWaiters: (() => void)[] = [];
  const root = '/mock/Creation';
  const emit = (name: string, payload: unknown) =>
    host.__desktopMock.emitTarget('main', name, payload);
  const metadata = (path: string, state: 'available' | 'trashed') => {
    const document = host.__desktopMock.nextDocument;
    if (document.path !== root + '/' + path && !document.path.startsWith(root + '/' + path + '/'))
      return;
    locationState = state;
    emit('document-metadata-changed', [
      {
        id: document.id,
        path: document.path,
        encoding: document.encoding,
        metadataRevision: ++metadataRevision,
        locationState,
      },
    ]);
  };
  const commitTrash = (args: Record<string, unknown>, preserveCurrent = false) => {
    const entry = tokens.get(String(args.entryToken));
    if (!entry) throw Error('Unknown inspected token');
    const removed = host.__creationMock.entries.filter(
      (value) =>
        value.relativePath === entry.relativePath ||
        value.relativePath.startsWith(entry.relativePath + '/'),
    );
    const kept = host.__creationMock.entries.filter((value) => !removed.includes(value));
    host.__creationMock.entries.splice(0, host.__creationMock.entries.length, ...kept);
    host.__trashMock.trashMutations++;
    slot = {
      token: 'file-undo-' + ++serial,
      description: '删除 ' + entry.name,
      entries: structuredClone(removed),
      path: entry.relativePath,
      kind: entry.kind,
    };
    const receipt: WorkspaceTrashReceipt = {
      operationId: String(args.operationId),
      entryToken: entry.entryToken,
      status: 'trashed',
      preserveCurrent,
      relativePath: entry.relativePath,
      kind: entry.kind,
      warnings: [],
    };
    trashOps.set(receipt.operationId, { status: 'committed', receipt });
    metadata(entry.relativePath, 'trashed');
    emit('workspace-entry-trashed', { path: root + '/' + entry.relativePath, kind: entry.kind });
    emit('workspace-file-undo-changed', {});
    return receipt;
  };
  const commitUndo = (args: Record<string, unknown>) => {
    if (!slot || slot.token !== args.undoToken) throw Error('File Undo slot changed');
    const restored = slot;
    slot = null;
    if (!host.__trashMock.outsideRestore)
      host.__creationMock.entries.push(...structuredClone(restored.entries));
    host.__trashMock.undoMutations++;
    const receipt: WorkspaceUndoReceipt = {
      operationId: String(args.operationId),
      undoToken: String(args.undoToken),
      restoredRelativePath: host.__trashMock.outsideRestore ? null : restored.path,
      kind: restored.kind,
      warnings: [],
    };
    undoOps.set(receipt.operationId, { status: 'committed', receipt });
    metadata(restored.path, 'available');
    emit('workspace-entry-restored', {
      path: (host.__trashMock.outsideRestore ? '/outside' : root) + '/' + restored.path,
      kind: restored.kind,
    });
    if (receipt.restoredRelativePath !== null)
      emit('workspace-file-highlight', {
        workspaceId: 'creation-workspace',
        relativePath: restored.path,
      });
    emit('workspace-file-undo-changed', {});
    return receipt;
  };
  host.__trashMock = {
    trashBehavior: 'normal',
    undoBehavior: 'normal',
    trashMutations: 0,
    undoMutations: 0,
    deferCatalog: false,
    pendingCatalog: 0,
    outsideRestore: false,
    releaseCatalog() {
      for (const waiter of catalogWaiters.splice(0)) waiter();
      this.pendingCatalog = 0;
    },
    completePending() {
      if (!pending) throw Error('No pending operation');
      const operation = pending;
      pending = null;
      if (operation.type === 'trash') commitTrash(operation.args);
      else commitUndo(operation.args);
    },
    externalTrash(path) {
      const entry = host.__creationMock.entries.find((value) => value.relativePath === path);
      if (!entry) throw Error('Missing external entry');
      const token = 'external-inspection';
      tokens.set(token, { ...entry, entryToken: token });
      commitTrash({ entryToken: token, operationId: 'external-operation' });
    },
    seedUndo() {
      slot = {
        token: 'file-undo-seeded',
        description: '删除 Restored.md',
        path: 'Restored.md',
        kind: 'file',
        entries: [{ name: 'Restored.md', relativePath: 'Restored.md', kind: 'file', size: 4 }],
      };
      emit('workspace-file-undo-changed', {});
    },
  };
  internal.invoke = async (command, args = {}) => {
    const record = () => host.__desktopMock.calls.push({ command, args });
    if (command === 'inspect_workspace_entry') {
      const result = (await previous(command, args)) as InspectedWorkspaceEntry;
      tokens.set(result.entryToken, result);
      return result;
    }
    if (command === 'get_workspace_file_undo') {
      record();
      if (host.__trashMock.deferCatalog)
        await new Promise<void>((resolve) => {
          catalogWaiters.push(resolve);
          host.__trashMock.pendingCatalog++;
        });
      return slot ? { token: slot.token, description: slot.description } : null;
    }
    if (command === 'trash_workspace_entry') {
      record();
      const id = String(args.operationId),
        prior = trashOps.get(id);
      if (prior?.status === 'committed') return prior.receipt;
      const entry = tokens.get(String(args.entryToken));
      if (!entry) throw Error('Unknown inspected token');
      const behavior = host.__trashMock.trashBehavior;
      host.__trashMock.trashBehavior = 'normal';
      if (behavior === 'cancel')
        return {
          operationId: id,
          entryToken: entry.entryToken,
          status: 'cancelled',
          relativePath: entry.relativePath,
          kind: entry.kind,
          warnings: [],
        };
      if (behavior === 'prepared' || behavior === 'unknown') {
        pending = { type: 'trash', args };
        if (behavior === 'prepared') trashOps.set(id, { status: 'prepared' });
        throw Error('Trash reply lost');
      }
      if (behavior === 'rejected') {
        trashOps.set(id, { status: 'rejected', message: '未能移入废纸篓' });
        throw Error('Trash denied');
      }
      const receipt = commitTrash(args, behavior === 'interactiveConfirmed');
      if (behavior === 'foreign') {
        const invalid = { ...receipt, entryToken: 'foreign' };
        trashOps.set(id, { status: 'committed', receipt: invalid });
        return invalid;
      }
      if (behavior === 'lostCommitted') throw Error('Trash committed ACK lost');
      return receipt;
    }
    if (command === 'resolve_workspace_entry_trash') {
      record();
      return structuredClone(trashOps.get(String(args.operationId)) ?? null);
    }
    if (command === 'perform_workspace_file_undo') {
      record();
      const id = String(args.operationId),
        prior = undoOps.get(id);
      if (prior?.status === 'committed') return prior.receipt;
      const behavior = host.__trashMock.undoBehavior;
      host.__trashMock.undoBehavior = 'normal';
      if (behavior === 'prepared' || behavior === 'unknown') {
        pending = { type: 'undo', args };
        if (behavior === 'prepared') undoOps.set(id, { status: 'prepared' });
        throw Error('Undo reply lost');
      }
      if (behavior === 'rejected') {
        slot = null;
        undoOps.set(id, { status: 'rejected', message: '恢复位置已有文件，未覆盖' });
        emit('workspace-file-undo-changed', {});
        throw Error('Undo conflict');
      }
      const receipt = commitUndo(args);
      if (behavior === 'lostCommitted') throw Error('Undo committed ACK lost');
      return receipt;
    }
    if (command === 'resolve_workspace_file_undo') {
      record();
      return structuredClone(undoOps.get(String(args.operationId)) ?? null);
    }
    if (command === 'get_document_metadata') {
      record();
      return {
        id: args.id,
        path: host.__desktopMock.nextDocument.path,
        encoding: 'UTF-8',
        metadataRevision,
        locationState,
      };
    }
    return previous(command, args);
  };
}

import type {
  EntryRenameReceipt,
  EntryRenameResolution,
  InspectedWorkspaceEntry,
} from '../../apps/desktop/src/services/workspaces.js';
import type { CreationWindow } from './creation-test-util.js';

export interface RenameMock {
  behavior:
    | 'normal'
    | 'committed'
    | 'prepared'
    | 'unknown'
    | 'rejected'
    | 'mutationUncertain'
    | 'foreign';
  mutations: number;
  relocate(from: string, to: string): void;
  completeUnknown(): void;
}
export type RenameWindow = CreationWindow & { __renameMock: RenameMock };
export function installRenameMock() {
  if (window !== window.top) return;
  const host = window as RenameWindow;
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke;
  const tokens = new Map<string, InspectedWorkspaceEntry>();
  const operations = new Map<string, EntryRenameResolution>();
  let unknown: Record<string, unknown> | undefined;
  let root = '/mock/Creation';
  let metadataRevision = 0;
  const move = (path: string, from: string, to: string) =>
    path === from ? to : path.startsWith(from + '/') ? to + path.slice(from.length) : path;
  const relocate = (from: string, to: string) => {
    for (const entry of host.__creationMock.entries) {
      entry.relativePath = move(entry.relativePath, from, to);
      entry.name = entry.relativePath.split('/').at(-1) ?? entry.name;
    }
    for (const entry of tokens.values()) {
      entry.relativePath = move(entry.relativePath, from, to);
      entry.name = entry.relativePath.split('/').at(-1) ?? entry.name;
    }
    const document = host.__desktopMock.nextDocument;
    const oldPath = root + '/' + from,
      newPath = root + '/' + to;
    const next = move(document.path, oldPath, newPath);
    if (next !== document.path) {
      document.path = next;
      host.__desktopMock.emitTarget('main', 'document-metadata-changed', [
        {
          id: document.id,
          path: next,
          encoding: document.encoding,
          metadataRevision: ++metadataRevision,
        },
      ]);
    }
    host.__desktopMock.emitTarget('main', 'workspace-entry-renamed', {
      oldPath,
      newPath,
      kind: host.__creationMock.entries.find((e) => e.relativePath === to)?.kind ?? 'directory',
    });
  };
  const commit = (args: Record<string, unknown>) => {
    const token = String(args.entryToken),
      entry = tokens.get(token);
    if (!entry) throw Error('Unknown inspected capability');
    const oldRelativePath = entry.relativePath;
    const parent = oldRelativePath.slice(0, Math.max(0, oldRelativePath.lastIndexOf('/')));
    const relativePath = [parent, args.newName].filter(Boolean).join('/');
    const receipt: EntryRenameReceipt = {
      ...entry,
      operationId: String(args.operationId),
      oldRelativePath,
      relativePath,
      name: String(args.newName),
      warnings: [],
    };
    host.__renameMock.mutations++;
    relocate(oldRelativePath, relativePath);
    operations.set(receipt.operationId, { status: 'committed', receipt });
    return receipt;
  };
  host.__renameMock = {
    behavior: 'normal',
    mutations: 0,
    relocate,
    completeUnknown() {
      if (!unknown) throw Error('No unknown operation');
      commit(unknown);
      unknown = undefined;
    },
  };
  host.__creationMock.entries.push({
    name: 'Child.md',
    relativePath: 'Folder/Child.md',
    kind: 'file',
    size: 5,
  });
  internal.invoke = async (command, args = {}) => {
    const record = () => host.__desktopMock.calls.push({ command, args });
    if (command === 'inspect_workspace_entry') {
      record();
      const entry = host.__creationMock.entries.find((e) => e.relativePath === args.relativePath);
      if (!entry) throw Error('Missing entry');
      const inspected = { ...entry, entryToken: 'inspected-' + crypto.randomUUID() };
      tokens.set(inspected.entryToken, inspected);
      return { ...inspected };
    }
    if (command === 'rename_workspace_entry') {
      record();
      const id = String(args.operationId),
        prior = operations.get(id);
      if (prior?.status === 'committed') return prior.receipt;
      const behavior = host.__renameMock.behavior;
      host.__renameMock.behavior = 'normal';
      if (behavior === 'unknown') {
        unknown = args;
        throw Error('IPC result unavailable');
      }
      if (behavior === 'rejected') {
        operations.set(id, { status: 'rejected', message: '目标名称已存在' });
        throw Error('Conflict');
      }
      if (behavior === 'prepared' || behavior === 'mutationUncertain') {
        operations.set(id, { status: behavior });
        throw Error('Operation response lost');
      }
      const receipt = commit(args);
      if (behavior === 'foreign') {
        const invalid = { ...receipt, entryToken: 'foreign-capability' };
        operations.set(id, { status: 'committed', receipt: invalid });
        return invalid;
      }
      if (behavior === 'committed') throw Error('Committed ACK lost');
      return receipt;
    }
    if (command === 'resolve_workspace_entry_rename') {
      record();
      return structuredClone(operations.get(String(args.operationId)) ?? null);
    }
    if (command === 'finish_workspace_entry') {
      record();
      tokens.delete(String(args.entryToken));
      return null;
    }
    if (command === 'get_document_metadata') {
      record();
      return {
        id: args.id,
        path: host.__desktopMock.nextDocument.path,
        encoding: 'UTF-8',
        metadataRevision,
      };
    }
    if (command === '__test_relocate_workspace') {
      root = String(args.path);
      host.__desktopMock.emitTarget('main', 'workspace-metadata-changed', [
        {
          id: 'creation-workspace',
          name: root.split('/').at(-1),
          path: root,
          metadataRevision: Number(args.revision),
        },
      ]);
      return null;
    }
    const result = await previous(command, args);
    return command === 'list_directory' || command === 'list_workspace_documents'
      ? structuredClone(result)
      : result;
  };
}

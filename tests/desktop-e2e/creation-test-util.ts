import type {
  CreatedWorkspaceEntry,
  WorkspaceEntry,
} from '../../apps/desktop/src/services/workspaces.js';
import type { TestWindow } from './desktop.helpers.js';

export interface CreationMock {
  entries: WorkspaceEntry[];
  hold: boolean;
  holdOpen: boolean;
  pendingOpen: number;
  releaseOpen(): void;
  failedCreate: boolean;
  failedRename: boolean;
  pending: number;
  release(): void;
}
export type CreationWindow = TestWindow & { __creationMock: CreationMock };

/** Real Shell/editor with capability-shaped in-memory filesystem operations. No disk writes. */
export function installCreationMock(configuration: {
  runtimeUrl: string;
  nested?: boolean;
  articles?: boolean;
}) {
  if (window !== window.top) return;
  const host = window as CreationWindow;
  const root = { id: 'creation-workspace', path: '/mock/Creation', name: 'Creation' };
  host.__desktopMock.startupBoot.workspace = root;
  localStorage.setItem(
    'marklyra-preferences-v1',
    JSON.stringify({
      fileSidebar: {
        view: configuration.articles ? 'articles' : 'tree',
        treeSort: 0,
        articleSort: 0,
        treeNoGroup: false,
        articleNoGroup: false,
      },
    }),
  );
  const entries: WorkspaceEntry[] = [
    { name: 'Folder', relativePath: 'Folder', kind: 'directory', size: null },
    { name: 'Existing.md', relativePath: 'Existing.md', kind: 'file', size: 5 },
  ];
  if (configuration.nested)
    entries.push({ name: 'Nested.md', relativePath: 'Folder/Nested.md', kind: 'file', size: 8 });
  const receipts = new Map<string, CreatedWorkspaceEntry>();
  const completed = new Set<string>();
  const waiting: (() => void)[] = [];
  const waitingOpen: (() => void)[] = [];
  host.__creationMock = {
    entries,
    hold: false,
    holdOpen: false,
    pendingOpen: 0,
    releaseOpen() {
      for (const next of waitingOpen.splice(0)) next();
      this.pendingOpen = 0;
    },
    failedCreate: false,
    failedRename: false,
    pending: 0,
    release() {
      for (const next of waiting.splice(0)) next();
      this.pending = 0;
    },
  };
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const original = internals.invoke;
  internals.invoke = async (command, args = {}) => {
    if (command === 'editor_runtime_url') return configuration.runtimeUrl;
    const record = () => host.__desktopMock.calls.push({ command, args });
    if (command === 'list_directory') {
      record();
      return {
        entries: entries.filter(
          (entry) =>
            entry.relativePath.slice(0, Math.max(0, entry.relativePath.lastIndexOf('/'))) ===
            (args.relativePath ?? ''),
        ),
        truncated: false,
        skipped: 0,
      };
    }
    if (command === 'list_workspace_documents') {
      record();
      return {
        entries: entries
          .filter((entry) => entry.kind === 'file')
          .map((entry) => ({
            ...entry,
            folderName: entry.relativePath.includes('/') ? 'Folder' : root.name,
            folderRelativePath: entry.relativePath.includes('/') ? 'Folder' : '',
            modifiedAt: 100,
            createdAt: 100,
            summary: 'Summary',
            summaryTruncated: false,
          })),
        truncated: false,
        scannedFiles: 2,
        scannedEntries: 3,
        readBytes: 0,
        skipped: {
          symlinks: 0,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 0,
        },
        truncationReasons: [],
      };
    }
    if (command === 'create_workspace_entry') {
      record();
      if (host.__creationMock.hold)
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
          host.__creationMock.pending++;
        });
      const operation = String(args.operationId);
      const prior = receipts.get(operation);
      if (prior) return { ...prior };
      const name = args.kind === 'directory' ? 'Untitled Folder' : 'Untitled.md';
      const relativePath = [args.parentRelativePath, name].filter(Boolean).join('/');
      const entry: CreatedWorkspaceEntry = {
        name,
        relativePath,
        kind: args.kind === 'directory' ? 'directory' : 'file',
        size: args.kind === 'directory' ? null : 0,
        entryToken: operation,
      };
      receipts.set(operation, entry);
      entries.push(entry);
      if (host.__creationMock.failedCreate) {
        host.__creationMock.failedCreate = false;
        throw new Error('Create response lost; retry the same operation');
      }
      return { ...entry };
    }
    if (command === 'rename_workspace_creation') {
      record();
      if (host.__creationMock.failedRename) {
        host.__creationMock.failedRename = false;
        throw new Error('目标名称已存在');
      }
      const entry = receipts.get(String(args.entryToken));
      if (!entry || completed.has(entry.entryToken)) throw new Error('Stale creation authority');
      const parent = entry.relativePath.slice(0, Math.max(0, entry.relativePath.lastIndexOf('/')));
      entry.name = String(args.newName);
      entry.relativePath = [parent, entry.name].filter(Boolean).join('/');
      return { ...entry };
    }
    if (command === 'finish_workspace_creation') {
      record();
      completed.add(String(args.entryToken));
      return null;
    }
    if (command === 'create_workspace_file_with_dialog') {
      record();
      return true;
    }
    if (command === 'open_workspace_document') {
      record();
      if (host.__creationMock.holdOpen)
        await new Promise<void>((resolve) => {
          waitingOpen.push(resolve);
          host.__creationMock.pendingOpen++;
        });
      return {
        id: 'created-document',
        path: `${root.path}/${String(args.relativePath)}`,
        text: '',
        encoding: 'UTF-8',
      };
    }
    if (command === 'get_document_metadata') {
      record();
      return {
        id: args.id,
        path:
          args.id === 'created-document'
            ? `${root.path}/${entries.find((entry) => 'entryToken' in entry)?.relativePath ?? 'Untitled.md'}`
            : host.__desktopMock.nextDocument.path,
        metadataRevision: 0,
        encoding: 'UTF-8',
      };
    }
    return original(command, args);
  };
}

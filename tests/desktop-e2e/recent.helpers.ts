import type { DocumentFile } from '../../apps/desktop/src/services/documents.js';
import type { RecentFile } from '../../apps/desktop/src/services/recent.js';
import type { MockCall } from './desktop.helpers.js';
import type { RecoveryMockWindow } from './recovery.helpers.js';

export interface RecentMock {
  entries: RecentFile[];
  files: Record<string, Omit<DocumentFile, 'id'>>;
  calls: MockCall[];
  deferOpen: boolean;
  pendingOpens: number;
  holdNextList: boolean;
  pendingLists: number;
  rememberError: string | null;
  listError: string | null;
  saveError: string | null;
  saveAsPath: string;
  holdFolder: boolean;
  folderError: string | null;
  pendingFolders: number;
  releaseFolder(): void;
  seed(path: string, text: string, encoding?: string): string;
  releaseOpen(): void;
  releaseList(): void;
}
export type RecentMockWindow = RecoveryMockWindow & { __recentMock: RecentMock };

/** Simulated native metadata/file IPC; only the separate Rust tests perform IO.
 * Dedicated test storage survives page reload and is not production storage. */
export function installRecentMock() {
  if (window !== window.top) return;
  const target = window as RecentMockWindow;
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke;
  const key = '__test_recent_files_v1';
  const stored = JSON.parse(
    localStorage.getItem(key) ?? '{"entries":[],"files":{},"serial":0,"revision":0}',
  ) as {
    entries: RecentFile[];
    files: RecentMock['files'];
    serial: number;
    revision: number;
  };
  let serial = stored.serial,
    revision = stored.revision;
  const documents = new Map<string, DocumentFile>();
  const folders = new Map<string, string>();
  const folderReplies: (() => void)[] = [];
  const opens: (() => void)[] = [],
    lists: (() => void)[] = [];
  const persist = () =>
    localStorage.setItem(
      key,
      JSON.stringify({ entries: mock.entries, files: mock.files, serial, revision }),
    );
  const listing = () => ({ revision, entries: structuredClone(mock.entries) });
  const touch = (path: string): string => {
    const old = mock.entries.find((entry) => entry.path === path);
    const entry = {
      id: old?.id ?? crypto.randomUUID(),
      path,
      name: path.split(/[\\/]/).at(-1) ?? path,
      lastOpenedAt: Date.now(),
    };
    mock.entries = [entry, ...mock.entries.filter((entry) => entry.path !== path)].slice(0, 32);
    revision++;
    persist();
    target.__desktopMock.emitEvent('recent-files-changed', null);
    return entry.id;
  };
  const mock: RecentMock = {
    entries: stored.entries,
    files: stored.files,
    calls: [],
    deferOpen: false,
    pendingOpens: 0,
    holdNextList: false,
    pendingLists: 0,
    rememberError: null,
    listError: null,
    saveError: null,
    saveAsPath: '/mock/Saved.md',
    holdFolder: false,
    folderError: null,
    pendingFolders: 0,
    releaseFolder() {
      folderReplies.shift()?.();
      this.pendingFolders = folderReplies.length;
    },
    seed(path, text, encoding = 'UTF-8') {
      this.files[path] = { path, text, encoding };
      return touch(path);
    },
    releaseOpen() {
      opens.shift()?.();
      this.pendingOpens = opens.length;
    },
    releaseList() {
      lists.shift()?.();
      this.pendingLists = lists.length;
    },
  };
  target.__recentMock = mock;
  internal.invoke = async (command, args = {}) => {
    if (command === 'open_document_workspace') {
      target.__desktopMock.calls.push({ command, args });
      if (mock.folderError) throw new Error(mock.folderError);
      const document = documents.get(String(args.documentId));
      if (!document) throw new Error('文档不存在或已关闭');
      const path = document.path.replace(/[\\/][^\\/]+$/, '');
      const folder = { id: `recent-folder-${++serial}`, name: path.split(/[\\/]/).at(-1), path };
      folders.set(folder.id, path);
      if (mock.holdFolder)
        return new Promise((resolve) => {
          folderReplies.push(() => resolve(folder));
          mock.pendingFolders = folderReplies.length;
        });
      return folder;
    }
    const root = folders.get(String(args.workspaceId));
    if (root && ['list_directory', 'list_workspace_documents'].includes(command)) {
      const prefix = `${root}/`.replaceAll('\\', '/');
      const entries = Object.keys(mock.files).flatMap((path) => {
        const relative = path.replaceAll('\\', '/').slice(prefix.length);
        return path.replaceAll('\\', '/').startsWith(prefix) && !relative.includes('/')
          ? [{ name: relative, relativePath: relative, kind: 'file', size: 10 }]
          : [];
      });
      if (command === 'list_workspace_documents')
        return {
          entries: entries.map((entry) => ({
            ...entry,
            folderName: root.split(/[\\/]/).at(-1),
            folderRelativePath: '',
            modifiedAt: 100,
            createdAt: 100,
            summary: '',
            summaryTruncated: false,
          })),
          truncated: false,
          scannedFiles: entries.length,
          scannedEntries: entries.length,
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
      return {
        entries,
        truncated: false,
        skipped: 0,
      };
    }
    if (root && command === 'count_workspace_documents')
      return { counts: {}, scannedEntries: 0, truncated: false };
    if (root && command === 'close_workspace') folders.delete(String(args.workspaceId));
    if (
      [
        'list_recent_files',
        'remember_recent_file',
        'open_recent_file',
        'remove_recent_file',
        'clear_recent_files',
      ].includes(command)
    ) {
      const call = { command, args: structuredClone(args) };
      mock.calls.push(call);
      target.__desktopMock.calls.push(call);
      if (command === 'list_recent_files') {
        if (mock.listError) throw new Error(mock.listError);
        const value = listing();
        if (mock.holdNextList) {
          mock.holdNextList = false;
          return new Promise((resolve) => {
            lists.push(() => resolve(value));
            mock.pendingLists = lists.length;
          });
        }
        return value;
      }
      if (command === 'remember_recent_file') {
        if (mock.rememberError) throw new Error(mock.rememberError);
        const document = documents.get(String(args.documentId));
        if (!document) throw new Error('文档不存在或已关闭');
        const id = touch(document.path);
        return structuredClone(mock.entries.find((entry) => entry.id === id));
      }
      if (command === 'open_recent_file') {
        const entry = mock.entries.find((entry) => entry.id === args.id);
        if (!entry) throw new Error('最近记录已被移除');
        const file = mock.files[entry.path];
        if (!file) throw new Error('最近文件不存在，当前稿件保留');
        const document = { ...structuredClone(file), id: `recent-doc-${++serial}` };
        documents.set(document.id, document);
        if (mock.deferOpen)
          return new Promise((resolve) => {
            opens.push(() => resolve(document));
            mock.pendingOpens = opens.length;
          });
        return document;
      }
      if (command === 'remove_recent_file')
        mock.entries = mock.entries.filter((entry) => entry.id !== args.id);
      else {
        mock.entries = [];
        mock.listError = null;
      }
      revision++;
      persist();
      target.__desktopMock.emitEvent('recent-files-changed', null);
      return listing();
    }
    if ((command === 'save_document' || command === 'save_document_as') && mock.saveError) {
      target.__desktopMock.calls.push({ command, args });
      throw new Error(mock.saveError);
    }
    const result = await previous(command, args);
    if (
      ['open_document', 'open_workspace_document', 'save_document', 'save_document_as'].includes(
        command,
      ) &&
      result &&
      typeof result === 'object'
    ) {
      let document = structuredClone(result) as DocumentFile;
      if (command === 'save_document') {
        const current = documents.get(String(args.id));
        if (current) document = { ...document, path: current.path, encoding: current.encoding };
      }
      if (command === 'save_document_as')
        document = { ...document, id: `saved-doc-${++serial}`, path: mock.saveAsPath };
      documents.set(document.id, document);
      mock.files[document.path] = {
        path: document.path,
        text: document.text,
        encoding: document.encoding,
      };
      persist();
      return document;
    }
    if (command === 'close_document') documents.delete(String(args.id));
    return result;
  };
}

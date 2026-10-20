import { listen } from '@tauri-apps/api/event';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../components/Icon.js';
import { ShellGlyph } from '../../components/ShellGlyph.js';
import { type DirectoryHistoryEntry, directoryHistory } from '../../services/directory-history.js';
import { desktopAvailable, type SavedDocumentPreview } from '../../services/documents.js';
import type { EntryEditorSnapshot } from '../../services/entry-actions.js';
import {
  type WorkspaceEntryPresence,
  type WorkspaceEntryRenamed,
  type WorkspaceFolder,
  type WorkspaceMatchPosition,
  workspaces,
} from '../../services/workspaces.js';
import { DirectoryTree } from './DirectoryTree.js';
import {
  defaultFileSidebarPreferences,
  type FileSidebarPlatform,
  type FileSidebarPreferences,
  trashName,
} from './file-preferences.js';
import { DEFAULT_SIDEBAR_SEARCH_TARGET } from './SidebarHeader.js';
import { WorkspaceArticles } from './WorkspaceArticles.js';
import { WorkspaceFooter } from './WorkspaceFooter.js';
import { WorkspaceGlyph } from './WorkspaceGlyph.js';
import { WorkspaceSearch } from './WorkspaceSearch.js';
import './workspace-sidebar.css';
import { workspacePathIsActive } from './article-model.js';
import type { CreationKind, PrepareCreatedDocument } from './creation-types.js';
import {
  EntryIdentities,
  type RelativeEntryPresence,
  type RelativeEntryRename,
  relativeEventPath,
} from './entry-projection.js';
import { SidebarSkeleton } from './SidebarSkeleton.js';
import { useWorkspaceCatalog } from './useWorkspaceCatalog.js';
import { useWorkspaceCreation } from './useWorkspaceCreation.js';
import { useWorkspaceEntryActions } from './useWorkspaceEntryActions.js';
import { useWorkspaceFileActions } from './useWorkspaceFileActions.js';
import { useWorkspaceMove } from './useWorkspaceMove.js';
import { useWorkspaceRename } from './useWorkspaceRename.js';
import {
  type EntryMenuTarget,
  useWorkspaceEntryMenu,
  WorkspaceEntryMenu,
} from './WorkspaceEntryMenu.js';

export interface WorkspaceSidebarProps {
  initialWorkspace?: WorkspaceFolder | null;
  onWorkspaceChange?: (workspace: WorkspaceFolder | null) => void;
  onCurrentDocument?: (match?: WorkspaceMatchPosition) => void;
  onOpenDocument: (
    workspaceId: string,
    relativePath: string,
    match?: WorkspaceMatchPosition,
  ) => void;
  chooseRequest?: number;
  disabled?: boolean | undefined;
  activePath?: string | undefined;
  activeSource?: string | undefined;
  activeSavedSource?: string | undefined;
  savedPreview?: SavedDocumentPreview | undefined;
  filePlatform?: FileSidebarPlatform;
  compact?: boolean;
  mode?: 'files' | 'search';
  onModeChange?: (mode: 'files' | 'search') => void;
  onNewDocument?: () => void;
  shouldOpenDirectoryWindow?: () => Promise<boolean>;
  prepareEntryOpenNew?: () => Promise<EntryEditorSnapshot>;
  onDuplicateCompleted?: (
    workspaceId: string,
    relativePath: string,
    sourceIsCurrent: boolean,
  ) => Promise<boolean>;
  prepareCreatedDocument?: PrepareCreatedDocument;
  onCreatedDocumentNamed?: (input: HTMLInputElement | null) => Promise<void>;
  searchTargetId?: string;
  filePreferences?: FileSidebarPreferences;
  onFilePreferencesChange?: (value: FileSidebarPreferences) => void;
}

export function WorkspaceSidebar({
  initialWorkspace,
  onWorkspaceChange,
  onOpenDocument,
  onCurrentDocument,
  chooseRequest = 0,
  disabled = false,
  activePath,
  activeSource,
  activeSavedSource,
  savedPreview,
  filePlatform = 'browser',
  compact = false,
  mode,
  onModeChange,
  onNewDocument,
  shouldOpenDirectoryWindow,
  prepareEntryOpenNew,
  onDuplicateCompleted,
  prepareCreatedDocument,
  onCreatedDocumentNamed,
  searchTargetId = DEFAULT_SIDEBAR_SEARCH_TARGET,
  filePreferences,
  onFilePreferencesChange,
}: WorkspaceSidebarProps) {
  const [workspace, setWorkspace] = useState<WorkspaceFolder | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'files' | 'search'>('files');
  const [refresh, setRefresh] = useState(0);
  const [nestedArticles, setNestedArticles] = useState<{ workspaceId: string; nested: boolean }>();
  const [creationDialog, setCreationDialog] = useState(false);
  const creationDialogRef = useRef(false);
  const [localPreferences, setLocalPreferences] = useState<FileSidebarPreferences>({
    ...defaultFileSidebarPreferences,
  });
  const preferences = filePreferences ?? localPreferences;
  const changePreferences = (value: FileSidebarPreferences) => {
    setLocalPreferences(value);
    onFilePreferencesChange?.(value);
  };
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number; version: number }>();
  const current = useRef<WorkspaceFolder | null>(null);
  const mounted = useRef(false);
  const selectingRef = useRef(false);
  const generation = useRef(0);
  const workspaceIntent = useRef(0);
  const initialConsumed = useRef(false);
  const tabsId = useId();
  const [entryBusy, setEntryBusy] = useState(false);
  const [duplicateName, setDuplicateName] = useState<{ workspaceId: string; path: string } | null>(
    null,
  );
  const controlsDisabled = disabled || selecting || entryBusy;
  const refreshBlocked = useRef(false);
  const pendingRefresh = useRef<string | null>(null);
  const requestRefresh = useCallback(() => {
    const folder = current.current;
    if (!folder) return;
    if (refreshBlocked.current) pendingRefresh.current = folder.id;
    else setRefresh((value) => value + 1);
  }, []);
  const catalogStatus = useWorkspaceCatalog(workspace, requestRefresh);
  const activeTab = mode ?? tab;
  const changeTab = (value: 'files' | 'search') => {
    setTab(value);
    onModeChange?.(value);
  };
  const creation = useWorkspaceCreation({
    workspace,
    disabled: controlsDisabled,
    view: preferences.view,
    visible: activeTab === 'files',
    windows: filePlatform === 'windows',
    prepare: prepareCreatedDocument,
    named: onCreatedDocumentNamed,
    refresh: requestRefresh,
  });
  const rename = useWorkspaceRename({
    workspace,
    disabled: controlsDisabled,
    view: preferences.view,
    visible: activeTab === 'files',
    windows: filePlatform === 'windows',
    prepare: prepareCreatedDocument,
    named: onCreatedDocumentNamed,
    refresh: requestRefresh,
  });
  const naming = rename.state ? rename : creation;
  const namingRef = useRef({ creation, rename });
  namingRef.current = { creation, rename };
  const identities = useMemo(() => new EntryIdentities(workspace?.id), [workspace?.id]);
  const identitiesRef = useRef(identities);
  identitiesRef.current = identities;
  const [entryRenames, setEntryRenames] = useState<{
    workspaceId: string;
    values: RelativeEntryRename[];
  }>({ workspaceId: '', values: [] });
  const renames = entryRenames.workspaceId === workspace?.id ? entryRenames.values : [];
  const renameSequence = useRef(0);
  const previousRename = useRef('');
  const [entryPresence, setEntryPresence] = useState<{
    workspaceId: string;
    values: RelativeEntryPresence[];
  }>({ workspaceId: '', values: [] });
  const presence = entryPresence.workspaceId === workspace?.id ? entryPresence.values : [];
  const [highlight, setHighlight] = useState<{
    workspaceId: string;
    path: string;
    version: number;
  }>();
  const highlightPath = highlight?.workspaceId === workspace?.id ? highlight?.path : undefined;
  const pulse = (path: string) => {
    if (current.current)
      setHighlight({ workspaceId: current.current.id, path, version: Date.now() });
  };
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(
      () => setHighlight((previous) => (previous === highlight ? undefined : previous)),
      2000,
    );
    return () => clearTimeout(timer);
  }, [highlight]);
  const updatePresence = (path: string, state: 'trashed' | 'restored') => {
    const folder = current.current;
    if (!folder) return;
    const sequence = ++renameSequence.current;
    if (state === 'trashed') {
      identitiesRef.current.retire(path);
      namingRef.current.creation.removed(path);
      namingRef.current.rename.removed(path);
    }
    setEntryPresence((previous) => ({
      workspaceId: folder.id,
      values: [
        ...(previous.workspaceId === folder.id ? previous.values : []),
        { sequence, path, state },
      ],
    }));
    requestRefresh();
  };
  const presenceRef = useRef(updatePresence);
  presenceRef.current = updatePresence;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;
  const fileActions = useWorkspaceFileActions({
    workspace,
    disabled: controlsDisabled || !!naming.state,
    view: preferences.view,
    nextArticle: (path) => {
      const rows = [
        ...document.querySelectorAll<HTMLElement>('.workspace-articles button[data-article-path]'),
      ];
      const index = rows.findIndex((row) => row.dataset.articlePath === path);
      return index < 0 ? undefined : rows[index + 1]?.dataset.articlePath;
    },
    isCurrent: (path) =>
      !!current.current &&
      workspacePathIsActive(current.current.path, path, activePath, filePlatform),
    open: (path) => open(path),
    presence: updatePresence,
    highlight: pulse,
    refresh: requestRefresh,
  });
  const entryActions = useWorkspaceEntryActions({
    workspace,
    disabled: controlsDisabled || fileActions.busy || !!naming.state,
    busy: setEntryBusy,
    editorPath: activePath,
    editorSource: activeSource,
    prepareOpenNew: prepareEntryOpenNew,
    reused: (next, focus) => {
      if (!focus) {
        void workspaces.close(next.id).catch(() => {});
        return;
      }
      const previous = current.current;
      current.current = next;
      setWorkspace(next);
      onWorkspaceChange?.(next);
      changeTab('files');
      setRefresh(0);
      if (previous && previous.id !== next.id) void workspaces.close(previous.id).catch(() => {});
    },
    duplicated: async (receipt, focus, sourceRelativePath) => {
      pulse(receipt.relativePath);
      requestRefresh();
      if (focus && workspace && onDuplicateCompleted) {
        const mayName = await onDuplicateCompleted(
          workspace.id,
          receipt.relativePath,
          workspacePathIsActive(workspace.path, sourceRelativePath, activePath, filePlatform),
        );
        if (!mayName) return;
      }
      if (focus && activeTab === 'files' && workspace)
        setDuplicateName({ workspaceId: workspace.id, path: receipt.relativePath });
    },
  });
  useEffect(() => {
    if (!duplicateName || controlsDisabled || fileActions.busy || naming.state) return;
    setDuplicateName(null);
    if (workspace?.id === duplicateName.workspaceId && document.hasFocus())
      void rename.start(duplicateName.path, 'file');
  }, [
    duplicateName,
    controlsDisabled,
    fileActions.busy,
    naming.state,
    workspace?.id,
    rename.start,
  ]);
  const move = useWorkspaceMove({
    workspace,
    prepare: prepareCreatedDocument,
    named: () => onCreatedDocumentNamed?.(null) ?? Promise.resolve(),
    disabled: controlsDisabled || fileActions.busy || !!naming.state,
    busy: setEntryBusy,
    refresh: requestRefresh,
  });
  const mutationDisabled = controlsDisabled || fileActions.busy;
  const deferRefresh =
    !!naming.state || creation.completing || rename.completing || creationDialog || entryBusy;
  refreshBlocked.current = deferRefresh;
  useEffect(() => {
    if (deferRefresh) return;
    const pending = pendingRefresh.current;
    pendingRefresh.current = null;
    if (pending && pending === workspace?.id) requestRefresh();
  }, [deferRefresh, workspace?.id, requestRefresh]);

  const createEntry = async (parentRelativePath: string, kind: CreationKind) => {
    if (
      !workspace ||
      controlsDisabled ||
      naming.state ||
      creation.completing ||
      rename.completing ||
      creationDialogRef.current ||
      fileActions.busy
    )
      return;
    if (
      preferences.view === 'articles' &&
      nestedArticles?.workspaceId === workspace.id &&
      nestedArticles.nested &&
      kind === 'file'
    ) {
      const id = workspace.id;
      creationDialogRef.current = true;
      setCreationDialog(true);
      try {
        if (
          (await workspaces.createWithDialog(id)) &&
          mounted.current &&
          current.current?.id === id
        )
          requestRefresh();
      } catch (reason) {
        if (mounted.current && current.current?.id === id) setError(String(reason));
      } finally {
        creationDialogRef.current = false;
        if (mounted.current) setCreationDialog(false);
      }
      return;
    }
    await creation.start(
      preferences.view === 'articles' ? '' : parentRelativePath,
      kind,
      preferences.view,
    );
  };
  const entryMenu = useWorkspaceEntryMenu({
    scope: activeTab === 'files' ? workspace?.id : undefined,
    native: desktopAvailable && filePlatform === 'macos',
    platform: filePlatform,
    disabled: controlsDisabled,
    busy:
      !!naming.state ||
      creation.completing ||
      rename.completing ||
      creationDialog ||
      fileActions.busy,
    view: preferences.view,
    create: (parent, kind) => void createEntry(parent, kind),
    open: (path) => open(path),
    search: () => changeTab('search'),
    changeView: (view) => changePreferences({ ...preferences, view }),
    revealRoot: () => void revealDirectory(),
    nativeInfo: filePlatform === 'macos' || filePlatform === 'windows',
    entryAction: (target, action) => void entryActions.start(target, action),
    rename: (target) => void rename.start(target.relativePath, target.kind),
    trash: (target) => void fileActions.trash(target),
    fileUndo: () => (workspace ? workspaces.fileUndo(workspace.id) : Promise.resolve(null)),
    undo: (catalog) => void fileActions.undo(catalog),
    report: fileActions.report,
  });
  const showEntryMenu = (target: EventTarget | null, x: number, y: number) => {
    if (
      !compact ||
      !workspace ||
      activeTab !== 'files' ||
      controlsDisabled ||
      !(target instanceof Element) ||
      target.closest('.workspace-creation-input, .workspace-footer')
    )
      return false;
    const row = target.closest<HTMLElement>('[data-entry-path]');
    const entry: EntryMenuTarget = {
      relativePath: row?.dataset.entryPath ?? '',
      kind: row?.dataset.entryKind === 'file' ? 'file' : 'directory',
    };
    void entryMenu.show(entry, x, y);
    return true;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      const previous = current.current;
      current.current = null;
      if (previous) void workspaces.close(previous.id).catch(() => {});
    };
  }, []);
  const notifyWorkspace = useRef(onWorkspaceChange);
  notifyWorkspace.current = onWorkspaceChange;
  useEffect(() => {
    if (!initialWorkspace || initialConsumed.current) return;
    let active = true;
    // StrictMode replays effect setup/cleanup before committing an authority.
    queueMicrotask(() => {
      if (!active || !mounted.current || initialConsumed.current) return;
      initialConsumed.current = true;
      if (current.current || selectingRef.current || workspaceIntent.current !== 0) {
        void workspaces.close(initialWorkspace.id).catch(() => {});
        return;
      }
      current.current = initialWorkspace;
      setWorkspace(initialWorkspace);
      notifyWorkspace.current?.(initialWorkspace);
    });
    return () => {
      active = false;
    };
  }, [initialWorkspace]);
  useEffect(() => {
    if (!desktopAvailable) return;
    let active = true;
    const stops = ['file-preferences-changed', 'workspace-files-changed'].map((event) =>
      listen(event, () => {
        if (active) requestRefresh();
      }),
    );
    for (const stop of stops)
      void stop.catch((error: unknown) => {
        if (active) setError(`目录更新监听失败：${String(error)}`);
      });
    return () => {
      active = false;
      for (const stop of stops) void stop.then((dispose) => dispose()).catch(() => {});
    };
  }, [requestRefresh]);

  useEffect(() => {
    if (!desktopAvailable) return;
    let live = true;
    const stops = [
      ...(['trashed', 'restored'] as const).map((state) =>
        listen<WorkspaceEntryPresence>(`workspace-entry-${state}`, (event) => {
          if (!live || !current.current || typeof event.payload?.path !== 'string') return;
          const folder = current.current;
          const ancestor = relativeEventPath(
            event.payload.path,
            folder.path,
            filePlatform === 'windows',
          );
          const same =
            filePlatform === 'windows'
              ? folder.path.replaceAll('\\', '/').toLowerCase() ===
                event.payload.path.replaceAll('\\', '/').toLowerCase()
              : folder.path === event.payload.path;
          if (state === 'trashed' && (same || ancestor !== undefined)) {
            generation.current++;
            workspaceIntent.current++;
            selectingRef.current = false;
            setSelecting(false);
            current.current = null;
            setWorkspace(null);
            notifyWorkspace.current?.(null);
            setError(`文件夹已移入${trashName(filePlatform)}，当前文稿保留。请重新选择文件夹。`);
            void workspaces.close(folder.id).catch(() => {});
            return;
          }
          const path = relativeEventPath(
            folder.path,
            event.payload.path,
            filePlatform === 'windows',
          );
          if (path !== undefined) presenceRef.current(path, state);
        }),
      ),
      listen<{ workspaceId: string; relativePath: string }>('workspace-file-highlight', (event) => {
        if (
          live &&
          event.payload?.workspaceId === current.current?.id &&
          typeof event.payload.relativePath === 'string'
        )
          pulseRef.current(event.payload.relativePath);
      }),
      listen<string[]>('workspace-roots-removed', (event) => {
        const previous = current.current;
        if (
          !live ||
          !previous ||
          !Array.isArray(event.payload) ||
          !event.payload.includes(previous.id)
        )
          return;
        generation.current++;
        workspaceIntent.current++;
        selectingRef.current = false;
        setSelecting(false);
        current.current = null;
        setWorkspace(null);
        notifyWorkspace.current?.(null);
        setError(
          `文件夹已移入${trashName(filePlatform)}，当前文稿保留。可在有权限的父目录菜单中撤销。`,
        );
        void workspaces.close(previous.id).catch(() => {});
      }),
      listen<string[]>('workspace-file-operation-uncertain', (event) => {
        const previous = current.current;
        if (
          !live ||
          !previous ||
          !Array.isArray(event.payload) ||
          !event.payload.includes(previous.id)
        )
          return;
        generation.current += 1;
        workspaceIntent.current += 1;
        selectingRef.current = false;
        setSelecting(false);
        current.current = null;
        setWorkspace(null);
        notifyWorkspace.current?.(null);
        setError(
          '目录文件操作状态尚未确认，已停止使用该目录授权；请重新选择文件夹。当前文稿保留。',
        );
        void workspaces.close(previous.id).catch(() => {});
      }),
      listen<WorkspaceFolder[]>('workspace-metadata-changed', (event) => {
        if (!live || !current.current || !Array.isArray(event.payload)) return;
        const previous = current.current;
        const next = event.payload.find((value) => value.id === previous.id);
        if (
          !next ||
          typeof next.path !== 'string' ||
          typeof next.name !== 'string' ||
          typeof next.metadataRevision !== 'number' ||
          next.metadataRevision <= (previous.metadataRevision ?? -1)
        )
          return;
        current.current = next;
        setWorkspace(next);
        notifyWorkspace.current?.(next);
      }),
      listen<WorkspaceEntryRenamed>('workspace-entry-renamed', (event) => {
        if (!live || !current.current) return;
        const change = event.payload;
        if (!change || typeof change.oldPath !== 'string' || typeof change.newPath !== 'string')
          return;
        const folder = current.current;
        const from = relativeEventPath(folder.path, change.oldPath, filePlatform === 'windows');
        const to = relativeEventPath(folder.path, change.newPath, filePlatform === 'windows');
        if (!from || !to || from === to) return;
        const key = folder.id + '\0' + from + '\0' + to;
        if (previousRename.current === key) return;
        previousRename.current = key;
        identitiesRef.current.relocate(from, to);
        namingRef.current.creation.relocate(from, to);
        namingRef.current.rename.relocate(from, to);
        const sequence = ++renameSequence.current;
        setEntryRenames((previous) => ({
          workspaceId: folder.id,
          values: [
            ...(previous.workspaceId === folder.id ? previous.values : []),
            { sequence, from, to },
          ],
        }));
        requestRefresh();
      }),
    ];
    for (const stop of stops)
      void stop.catch((reason) => {
        if (live) setError(`目录身份更新监听失败：${String(reason)}`);
      });
    return () => {
      live = false;
      for (const stop of stops) void stop.then((dispose) => dispose()).catch(() => {});
    };
  }, [filePlatform, requestRefresh]);

  const release = (id: string) => {
    void workspaces.close(id).catch((reason) => {
      if (mounted.current) setError(`关闭目录授权失败：${String(reason)}`);
    });
  };
  const choose = async () => {
    if (disabled || selectingRef.current || !desktopAvailable) return;
    selectingRef.current = true;
    workspaceIntent.current += 1;
    setSelecting(true);
    setError('');
    const version = ++generation.current;
    try {
      const result = await workspaces.select();
      if (!mounted.current || version !== generation.current) {
        release(result.id);
        return;
      }
      const previous = current.current;
      if (compact && previous) {
        try {
          const catalog = await directoryHistory.list(result.id);
          if (!mounted.current || version !== generation.current) return;
          await directoryHistory.openNewWindow(catalog.revision, {
            kind: 'workspace',
            workspaceId: result.id,
          });
        } finally {
          release(result.id);
        }
        return;
      }
      current.current = result;
      setWorkspace(result);
      notifyWorkspace.current?.(result);
      changeTab('files');
      setRefresh(0);
      if (previous) release(previous.id);
    } catch (reason) {
      if (
        mounted.current &&
        version === generation.current &&
        !String(reason).includes('已取消选择目录')
      ) {
        setError(String(reason));
      }
    } finally {
      selectingRef.current = false;
      if (mounted.current && version === generation.current) setSelecting(false);
    }
  };
  const navigateDirectory = async (
    entry: DirectoryHistoryEntry,
    revision: number,
    modifier: boolean,
  ) => {
    if (
      disabled ||
      selectingRef.current ||
      !desktopAvailable ||
      !entry.reopenable ||
      (entry.current && !modifier)
    )
      return;
    selectingRef.current = true;
    workspaceIntent.current++;
    setSelecting(true);
    setError('');
    const version = ++generation.current;
    try {
      const separate =
        modifier &&
        (shouldOpenDirectoryWindow
          ? await shouldOpenDirectoryWindow()
          : Boolean(
              activePath ||
                (activeSource !== undefined &&
                  activeSavedSource !== undefined &&
                  activeSource !== activeSavedSource),
            ));
      if (!mounted.current || version !== generation.current) return;
      if (separate) {
        await directoryHistory.openNewWindow(revision, entry.target);
        return;
      }
      const result = await directoryHistory.open(revision, entry.target);
      if (!mounted.current || version !== generation.current) {
        release(result.id);
        return;
      }
      const previous = current.current;
      current.current = result;
      setWorkspace(result);
      notifyWorkspace.current?.(result);
      changeTab('files');
      setRefresh(0);
      if (previous && previous.id !== result.id) release(previous.id);
    } catch (reason) {
      if (mounted.current && version === generation.current) setError(String(reason));
    } finally {
      selectingRef.current = false;
      if (mounted.current && version === generation.current) setSelecting(false);
    }
  };
  const revealDirectory = async () => {
    const id = current.current?.id;
    if (!id || disabled) return;
    try {
      await directoryHistory.reveal(id);
    } catch (reason) {
      if (mounted.current && current.current?.id === id) setError(String(reason));
    }
  };
  const chooseLatest = useRef(choose);
  chooseLatest.current = choose;
  const previousChoose = useRef(chooseRequest);
  useEffect(() => {
    if (chooseRequest !== previousChoose.current) {
      previousChoose.current = chooseRequest;
      void chooseLatest.current();
    }
  }, [chooseRequest]);
  const close = () => {
    if (controlsDisabled) return;
    workspaceIntent.current += 1;
    generation.current += 1;
    const previous = current.current;
    current.current = null;
    setWorkspace(null);
    notifyWorkspace.current?.(null);
    setError('');
    if (previous) release(previous.id);
  };
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'files'
        : event.key === 'End'
          ? 'search'
          : activeTab === 'files'
            ? 'search'
            : 'files';
    changeTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  };
  const open = (relative: string, match?: WorkspaceMatchPosition) => {
    if (controlsDisabled || !current.current) return;
    if (workspacePathIsActive(current.current.path, relative, activePath, filePlatform)) {
      onCurrentDocument?.(match);
      return;
    }
    onOpenDocument(current.current.id, relative, match);
  };

  return (
    <section
      className={`workspace-sidebar${compact ? ' workspace-sidebar-compact' : ''}`}
      aria-label="目录与全文搜索"
      data-mode={activeTab}
      data-empty={!workspace || undefined}
      onDragStart={move.dragStart}
      onDragEnd={move.dragEnd}
      onDragOver={move.dragOver}
      onDrop={move.drop}
      onKeyDown={(event) => {
        if (!compact || !workspace || activeTab !== 'files' || controlsDisabled) return;
        if (
          event.target instanceof Element &&
          event.target.closest('.workspace-creation-input, .workspace-navigation-header button')
        )
          return;
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault();
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        if (!showEntryMenu(event.target, bounds.left, bounds.bottom))
          setContextPoint({ x: bounds.left, y: bounds.bottom, version: Date.now() });
      }}
      onContextMenu={(event) => {
        if (!compact || !workspace || activeTab !== 'files' || controlsDisabled) return;
        if (
          event.target instanceof Element &&
          event.target.closest('.workspace-creation-input, .workspace-navigation-header button')
        )
          return;
        event.preventDefault();
        if (!showEntryMenu(event.target, event.clientX, event.clientY))
          setContextPoint({ x: event.clientX, y: event.clientY, version: Date.now() });
      }}
    >
      {!compact && (
        <header className="workspace-folder-header">
          <div className="workspace-folder-title" title={workspace?.path ?? '本地 Markdown 文件'}>
            <WorkspaceGlyph name="folder" />
            <strong>{workspace?.name ?? '文件夹'}</strong>
          </div>
          {workspace && (
            <div className="workspace-tabs" role="tablist" aria-label="目录面板">
              {(['files', 'search'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${item}`}
                  aria-controls={`${tabsId}-${item}-panel`}
                  aria-selected={activeTab === item}
                  aria-label={item === 'files' ? '文件' : '全文搜索'}
                  title={item === 'files' ? '浏览文件' : '全文搜索'}
                  tabIndex={activeTab === item ? 0 : -1}
                  disabled={controlsDisabled}
                  onKeyDown={tabKey}
                  onClick={() => changeTab(item)}
                >
                  {item === 'files' ? <WorkspaceGlyph name="file" /> : <Icon name="search" />}
                </button>
              ))}
            </div>
          )}
          {workspace && (
            <div className="workspace-folder-actions">
              <button
                type="button"
                disabled={controlsDisabled}
                aria-label="刷新目录"
                title="重新读取已展开目录"
                onClick={requestRefresh}
              >
                <Icon name="refresh" />
              </button>
              <button
                type="button"
                disabled={controlsDisabled || !desktopAvailable}
                aria-label={selecting ? '选择中…' : '更换'}
                title="更换文件夹"
                onClick={() => void choose()}
              >
                <Icon name="open" />
              </button>
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={close}
                aria-label="关闭目录"
                title="关闭文件夹"
              >
                <WorkspaceGlyph name="close" />
              </button>
            </div>
          )}
        </header>
      )}
      {compact && (
        <nav
          className="workspace-navigation-header"
          aria-label="侧栏导航"
          hidden={activeTab !== 'files'}
        >
          {workspace ? (
            <div
              className="workspace-root-row"
              title={workspace.path}
              data-entry-path=""
              data-entry-kind="directory"
            >
              <WorkspaceGlyph name="folder" />
              <span className="workspace-root-name" title={workspace.name}>
                {workspace.name}
              </span>
            </div>
          ) : (
            <span className="workspace-navigation-spacer" aria-hidden="true" />
          )}
          {workspace && (
            <button
              id={`${searchTargetId}-trigger`}
              type="button"
              className="sidebar-header-action"
              aria-label="全文搜索"
              aria-controls={`${tabsId}-search-panel`}
              title="全文搜索"
              disabled={controlsDisabled}
              onClick={() => changeTab('search')}
            >
              <ShellGlyph className="ui-icon" name="search" />
            </button>
          )}
        </nav>
      )}
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {catalogStatus && (
        <p className="workspace-limit workspace-limit-compact" role="status" title={catalogStatus}>
          {catalogStatus}
        </p>
      )}
      {fileActions.message && (
        <p className="workspace-error" role="alert">
          {fileActions.message}
        </p>
      )}
      {fileActions.state && (
        <div
          className={fileActions.state.phase === 'resolving' ? 'workspace-error' : 'workspace-hint'}
          role={fileActions.state.phase === 'resolving' ? 'alert' : 'status'}
        >
          {fileActions.state.phase === 'resolving' ? fileActions.state.error : '正在处理文件操作…'}
          {fileActions.state.phase === 'resolving' && (
            <button type="button" onClick={() => void fileActions.check()}>
              核对结果
            </button>
          )}
        </div>
      )}
      {move.message && (
        <p className="workspace-error" role="alert">
          {move.message}
        </p>
      )}
      {move.state && (
        <p className={move.state.checking ? 'workspace-error' : 'workspace-hint'} role="status">
          {move.state.checking ? (
            <button type="button" onClick={move.check}>
              核对移动结果
            </button>
          ) : (
            '正在移动…'
          )}
        </p>
      )}
      {entryActions.message && (
        <p className="workspace-error" role="alert">
          {entryActions.message}
        </p>
      )}
      {entryActions.state?.checking && (
        <div className="workspace-error" role="alert">
          {entryActions.state.error}
          <button type="button" onClick={() => void entryActions.check()}>
            核对结果
          </button>
        </div>
      )}
      {rename.message && (
        <p className="workspace-error" role="alert">
          {rename.message}
        </p>
      )}
      {rename.state?.phase === 'inspecting' && <SidebarSkeleton variant="tree" rows={1} />}
      {creation.message && (
        <p className="workspace-error" role="alert">
          {creation.message}
        </p>
      )}
      {creation.state?.phase === 'creating' && <SidebarSkeleton variant="tree" rows={1} />}
      {creation.state?.phase === 'failed' && (
        <div className="workspace-error" role="alert">
          {creation.state.error}
          <button type="button" onClick={() => void creation.retry()}>
            重试创建
          </button>
        </div>
      )}
      {!workspace && !compact && (
        <div className="workspace-empty">
          <WorkspaceGlyph name="folderOpen" />
          <p>在这里浏览你的文档</p>
          <button
            type="button"
            className="workspace-choose"
            disabled={controlsDisabled || !desktopAvailable}
            onClick={() => void choose()}
          >
            <Icon name="open" />
            {selecting ? '选择中…' : '选择文件夹'}
          </button>
          <small>
            {desktopAvailable
              ? '打开文件夹，浏览或搜索 Markdown。'
              : '本地文件夹需要在桌面应用中打开。'}
          </small>
        </div>
      )}
      {!workspace && compact && (
        <div className="workspace-compact-empty">
          <p>没有打开的文件夹</p>
        </div>
      )}
      {workspace && (
        <>
          <section
            className="workspace-panel"
            role={compact ? 'region' : 'tabpanel'}
            id={`${tabsId}-files-panel`}
            aria-labelledby={compact ? undefined : `${tabsId}-files`}
            aria-label={compact ? '文件' : undefined}
            hidden={activeTab !== 'files'}
          >
            <div hidden={preferences.view !== 'tree'} className="workspace-file-view">
              <DirectoryTree
                key={workspace.id}
                workspace={workspace}
                activePath={activePath}
                disabled={mutationDisabled}
                refresh={refresh}
                onOpen={open}
                platform={filePlatform}
                sort={preferences.treeSort}
                noGroup={preferences.treeNoGroup}
                creation={naming}
                entryKey={identities.key}
                renames={renames}
                presence={presence}
                highlightPath={highlightPath}
                onRename={(target) => void rename.start(target.relativePath, target.kind)}
                onTrash={(target) => void fileActions.trash(target)}
              />
            </div>
            <div hidden={preferences.view !== 'articles'} className="workspace-file-view">
              <WorkspaceArticles
                key={workspace.id}
                workspace={workspace}
                compact={compact}
                active={activeTab === 'files' && preferences.view === 'articles'}
                activePath={activePath}
                activeSource={activeSource}
                activeSavedSource={activeSavedSource}
                savedPreview={savedPreview}
                platform={filePlatform}
                disabled={mutationDisabled}
                refresh={refresh}
                sort={preferences.articleSort}
                noGroup={preferences.articleNoGroup}
                onSwitchToTree={() => changePreferences({ ...preferences, view: 'tree' })}
                onOpen={open}
                creation={naming}
                entryKey={identities.key}
                renames={renames}
                presence={presence}
                highlightPath={highlightPath}
                onNestedContent={(nested) =>
                  setNestedArticles((previous) =>
                    previous?.workspaceId === workspace.id && previous.nested === nested
                      ? previous
                      : { workspaceId: workspace.id, nested },
                  )
                }
              />
            </div>
          </section>
          <section
            className="workspace-panel"
            role={compact ? 'region' : 'tabpanel'}
            id={`${tabsId}-search-panel`}
            aria-labelledby={compact ? undefined : `${tabsId}-search`}
            aria-label={compact ? '全文搜索' : undefined}
            hidden={activeTab !== 'search'}
          >
            <WorkspaceSearch
              key={workspace.id}
              workspaceId={workspace.id}
              refresh={refresh}
              metadataRevision={workspace.metadataRevision}
              active={activeTab === 'search'}
              disabled={controlsDisabled}
              onOpen={open}
              headerTargetId={compact ? searchTargetId : undefined}
              closeSearch={() => changeTab('files')}
              renames={renames}
              presence={presence}
            />
          </section>
        </>
      )}
      {compact && !workspace && (
        <WorkspaceSearch
          workspaceId=""
          active={activeTab === 'search'}
          disabled
          onOpen={open}
          headerTargetId={searchTargetId}
          closeSearch={() => changeTab('files')}
        />
      )}
      {compact && (activeTab === 'files' || !workspace) && (
        <WorkspaceFooter
          name={workspace?.name}
          workspace={workspace}
          platform={filePlatform}
          navigateDirectory={(entry, revision, modifier) =>
            void navigateDirectory(entry, revision, modifier)
          }
          search={() => changeTab('search')}
          reveal={workspace ? () => void revealDirectory() : undefined}
          path={workspace?.path}
          disabled={controlsDisabled}
          canChoose={desktopAvailable}
          choose={() => void choose()}
          refresh={requestRefresh}
          close={close}
          newDocument={workspace ? () => void createEntry('', 'file') : onNewDocument}
          creationBusy={
            !!naming.state ||
            creation.completing ||
            rename.completing ||
            creationDialog ||
            fileActions.busy
          }
          preferences={preferences}
          changePreferences={changePreferences}
          contextPoint={contextPoint}
        />
      )}
      <WorkspaceEntryMenu request={entryMenu.request} dismiss={entryMenu.dismiss} />
    </section>
  );
}

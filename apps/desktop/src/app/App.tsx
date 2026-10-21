import { MarkLyraMarkdownEditor } from '@marklyra/editor-react';
import type {
  HostAction,
  MarkLyraCommand,
  MarkLyraEditor,
  OutlineEntry,
} from '@marklyra/editor-runtime';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { CommandMenu } from '../components/CommandMenu.js';
import { focusInitialEditor } from '../components/focusInitialEditor.js';
import { Icon, type IconName } from '../components/Icon.js';
import { ShellGlyph } from '../components/ShellGlyph.js';
import { SidebarResize } from '../components/SidebarResize.js';
import { Titlebar } from '../components/Titlebar.js';
import { useModalFocus } from '../components/useModalFocus.js';
import { AiPanel } from '../features/ai/AiPanel.js';
import { DocumentDetailsPanel } from '../features/document-details/DocumentDetailsPanel.js';
import {
  documentDetailsTransitionMs,
  useDocumentDetailsLayout,
} from '../features/document-details/useDocumentDetailsLayout.js';
import { ExternalChangeNotice } from '../features/documents/ExternalChangeNotice.js';
import { RecoveryPanel } from '../features/documents/RecoveryPanel.js';
import {
  STALE_SEARCH_POSITION,
  searchPositionIsCurrent,
} from '../features/documents/search-position.js';
import { useAutoSave } from '../features/documents/useAutoSave.js';
import { useDocumentSession } from '../features/documents/useDocumentSession.js';
import { DocumentNamePopover } from '../features/documents/DocumentNamePopover.js';
import { DocumentSkeleton } from '../features/documents/DocumentSkeleton.js';
import { useDocumentRename } from '../features/documents/useDocumentRename.js';
import { useExternalChanges } from '../features/documents/useExternalChanges.js';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { QuickOpen } from '../features/quick-open/QuickOpen.js';
import type { QuickTab } from '../features/quick-open/quick-open-model.js';
import {
  loadQuickNotes,
  type QuickNotes,
  quickItems,
} from '../features/quick-open/quick-sources.js';
import { isExportAction, useDocumentExport } from '../features/export/useDocumentExport.js';
import { SidebarHeader, WorkspaceSidebar } from '../features/file-explorer/index.js';
import { nativeMenuCommandAllowed } from '../features/menus/native-menu-state.js';
import { hostTextInputFocused, useNativeMenus } from '../features/menus/useNativeMenus.js';
import { NoticeHost } from '../features/notices/NoticeHost.js';
import { notify, useNotice } from '../features/notices/notices.js';
import { useOsOpenEvents } from '../features/os-integration/useOsOpenEvents.js';
import { OutlinePanel } from '../features/outline/OutlinePanel.js';
import { RecentFilesPanel } from '../features/recent-files/RecentFilesPanel.js';
import { editorSessionPreferences } from '../features/settings/editor-session-preferences.js';
import { PreferencesPanel } from '../features/settings/PreferencesPanel.js';
import { PreferencesWindow } from '../features/settings/PreferencesWindow.js';
import { SettingsSkeleton } from '../features/settings/SettingsSkeleton.js';
import type { StatisticsUnit } from '../features/settings/preferences.js';
import {
  applicationEditorPreferences,
  applicationStatisticsPreferences,
} from '../features/settings/runtime-preferences/application-preferences.js';
import { startupEditorConfiguration } from '../features/settings/runtime-preferences/startup-editor-preferences.js';
import { useApplicationPreferences } from '../features/settings/useApplicationPreferences.js';
import { useMarkdownPreferences } from '../features/settings/useMarkdownPreferences.js';
import { usePreferences } from '../features/settings/usePreferences.js';
import { DocumentStatistics } from '../features/statistics/DocumentStatistics.js';
import { StatisticsStatus } from '../features/statistics/StatisticsStatus.js';
import { useStatistics } from '../features/statistics/useStatistics.js';
import { builtinTheme, validThemeId } from '../features/themes/model.js';
import { useSystemAppearance } from '../features/themes/useSystemAppearance.js';
import { useThemes } from '../features/themes/useThemes.js';
import { applicationPreferences } from '../services/application-preferences.js';
import { desktopContextHost } from '../services/context-menu.js';
import { directoryHistory } from '../services/directory-history.js';
import { displayPath } from '../services/display-path.js';
import { desktopAvailable, documents } from '../services/documents.js';
import { documentExports } from '../services/exports.js';
import { filePreferences } from '../services/file-preferences.js';
import { documentImages } from '../services/images.js';
import {
  cancelNativeInput,
  importNativeInput,
  nativeDropIntent,
  nativeFileDrop,
} from '../services/native-input.js';
import { discoverRecovery } from '../services/recovery.js';
import { type EditorRuntime, editorRuntime } from '../services/runtime.js';
import { completePreferenceTheme } from '../services/theme-preferences.js';
import { type EditorChrome, editorChrome } from '../services/ui-chrome.js';
import { windowStartup } from '../services/window-startup.js';
import { editorWindowIdentity, editorWindows } from '../services/windows.js';
import { type WorkspaceFolder, workspaces } from '../services/workspaces.js';
import { NativeEditorCommands, nativeEditorCommand } from './native-editor-commands.js';

function filename(path: string) {
  return path.split(/[\\/]/).at(-1) ?? '未命名';
}
export function App() {
  const createdDocumentFocus = useRef<{
    editor: MarkLyraEditor;
    owner: object;
    id: string | null;
  } | null>(null);
  const [windowIdentity] = useState(editorWindowIdentity);
  const [creatingWindow, setCreatingWindow] = useState(false);
  const creatingWindowRef = useRef(false);
  const applicationQuit = useRef<string | null>(null);
  const [cancellingDocument, setCancellingDocument] = useState(false);
  const cancellingDocumentRef = useRef(false);
  const [legacyPreferences, setPreferences, reloadPreferences] = usePreferences();
  const applicationSystem = useApplicationPreferences();
  const preferences = useMemo(
    () => ({
      ...legacyPreferences,
      ...applicationStatisticsPreferences(applicationSystem.value, legacyPreferences),
    }),
    [applicationSystem.value, legacyPreferences],
  );
  const storedEditorPreferences = useMemo(
    () =>
      applicationSystem.value
        ? applicationEditorPreferences(applicationSystem.value, preferences.editorPreferences)
        : preferences.editorPreferences,
    [applicationSystem.value, preferences.editorPreferences],
  );
  const editorStartup = useRef<typeof storedEditorPreferences | null>(null);
  if (applicationSystem.value && !editorStartup.current)
    editorStartup.current = storedEditorPreferences;
  const startupEditorPreferences = editorStartup.current ?? storedEditorPreferences;
  const appliedEditorPreferences = useMemo(
    () => editorSessionPreferences(storedEditorPreferences, startupEditorPreferences),
    [storedEditorPreferences, startupEditorPreferences],
  );
  const [chrome, setChrome] = useState<EditorChrome>({
    native: false,
    titlebar: 'none',
    preferencesWindow: false,
  });
  const [viewMode, setViewMode] = useState<'wysiwyg' | 'source'>();
  const [scrolledDown, setScrolledDown] = useState(false);
  const [osOpenReady, setOsOpenReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nativeOverlay, setNativeOverlay] = useState(true);
  const [titleBounds, setTitleBounds] = useState({ left: 0, right: 0 });
  const webTitlebar = chrome.native && chrome.titlebar === 'web';
  // AppKit's titlebar is 28pt; the Windows caption band is the standard 32px.
  const titlebarHeight = webTitlebar ? 32 : 28;
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  // The editor has been restored (or found empty); only then can the home view decide to show.
  const [startupSettled, setStartupSettled] = useState(false);
  const [homeDismissed, setHomeDismissed] = useState(false);
  // New windows start in the editor; closing a document brings any window back to the home view.
  const [homeAllowed, setHomeAllowed] = useState(windowIdentity.primary);
  const [quickOpen, setQuickOpen] = useState<{ tab: QuickTab } | null>(null);
  const [quickNotes, setQuickNotes] = useState<QuickNotes | null>(null);
  /** Application menu handler; the search window runs its actions through the same guards. */
  const menuHandler = useRef<(value: string) => void>(() => {});
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [settingsEffectNotice, setSettingsEffectNotice] = useState(0);
  useEffect(() => {
    if (!settingsEffectNotice) return;
    const timer = setTimeout(() => setSettingsEffectNotice(0), 6000);
    return () => clearTimeout(timer);
  }, [settingsEffectNotice]);
  const [preferencesEmbedded, setPreferencesEmbedded] = useState(false);
  const [preferencesCloseRequest, setPreferencesCloseRequest] = useState(0);
  const preferencesSession = useRef<Promise<boolean> | null>(null);
  const preferencesQuit = useRef<string | null>(null);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [closingPanel, setClosingPanel] = useState(false);
  const closingPanelRef = useRef(false);
  const panelEditorOrigin = useRef({ preferences: false, statistics: false });
  const nativePreferencesOrigin = useRef(false);
  const editor = useRef<MarkLyraEditor | null>(null);
  const editorCommandWork = useRef<Promise<void>>(Promise.resolve());
  const linkHintPreferenceWork = useRef<Promise<void>>(Promise.resolve());
  const nativeCommandBridge = useRef<NativeEditorCommands | null>(null);
  const sessionWork = useRef<Promise<void>>(Promise.resolve());
  const workspaceIdentity = useRef<WorkspaceFolder | null>(null);
  const [initialWorkspace, setInitialWorkspace] = useState<WorkspaceFolder | null>(null);
  const [sessionWorkspace, setSessionWorkspace] = useState<string | null>(null);
  const startupControl = useRef<HTMLElement | null>(null);
  const startupFocusDeferred = useRef(false);
  const modalFocusHandled = useRef(false);
  const recoveryCloseDeferred = useRef(false);
  const startupFocusRunning = useRef(false);
  const startupForegroundPending = useRef(false);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const preferenceThemes = useRef(new Map<string, AbortController>());
  const sidebarElement = useRef<HTMLElement | null>(null);
  const documentAreaElement = useRef<HTMLElement | null>(null);
  const detailsElement = useRef<HTMLElement | null>(null);
  const [importingImage, setImportingImage] = useState(false);
  const importingImageRef = useRef(false);
  const cancelApplicationQuit = () => {
    const token = applicationQuit.current;
    applicationQuit.current = null;
    if (token)
      void editorWindows
        .cancelQuit(token)
        .catch((error: unknown) =>
          actions.current.doc.setMessage(`无法取消退出：${String(error)}`),
        );
  };
  const doc = useDocumentSession(
    editor,
    async () => {
      if (desktopAvailable) {
        await trackSession().catch(() => {});
        await editorWindows.close(applicationQuit.current);
      }
      applicationQuit.current = null;
    },
    windowIdentity.draftKey,
    cancelApplicationQuit,
    async () => {
      if (desktopAvailable) {
        const bridge = nativeCommandBridge.current;
        if (!bridge) throw new Error('编辑器仍在启动，请稍后重试');
        await bridge.synchronize();
      }
      await editorCommandWork.current;
    },
  );
  const cancelDocumentAction = async () => {
    if (doc.working || !doc.pending || cancellingDocumentRef.current) return;
    cancellingDocumentRef.current = true;
    flushSync(() => setCancellingDocument(true));
    try {
      await editor.current?.focus();
    } catch (error) {
      doc.setMessage(`恢复编辑焦点失败：${String(error)}`);
    } finally {
      doc.cancel();
      cancellingDocumentRef.current = false;
      setCancellingDocument(false);
    }
  };
  const disk = useExternalChanges(doc);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recentOpen, setRecentOpenState] = useState(false);
  const recentRequested = useRef(false);
  const setRecentOpen = useCallback((open: boolean) => {
    recentRequested.current = open;
    setRecentOpenState(open);
  }, []);
  const autosave = useAutoSave(
    doc,
    !!disk.notice || recoveryOpen || recentOpen || preferencesOpen,
    applicationSystem.value?.values.enableAutoSave as boolean | undefined,
  );
  const unsavedPanel = useModalFocus(
    !!doc.pending,
    () => void cancelDocumentAction(),
    doc.working || cancellingDocument,
    cancellingDocument,
  );
  const offeredRecovery = useRef(false);
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const rememberControl = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target !== document.body &&
        target !== document.documentElement &&
        target.tagName !== 'IFRAME' &&
        target.closest('.shell')
      )
        startupControl.current = target;
    };
    document.addEventListener('focusin', rememberControl);
    return () => document.removeEventListener('focusin', rememberControl);
  }, [ready]);
  const statistics = useStatistics(
    editor,
    ready,
    doc.file?.id,
    doc.working,
    preferences.wordsPerMinute,
  );
  const [sidebar, setSidebar] = useState(true),
    [tab, setTab] = useState<'files' | 'search'>('files');
  const [sidebarDragWidth, setSidebarDragWidth] = useState<number | null>(null);
  const sidebarWidth = sidebarDragWidth ?? preferences.sidebarWidth;
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const separateDark = applicationSystem.value?.values.useSeparateDarkTheme === true;
  const systemDark = useSystemAppearance(separateDark, doc.setMessage);
  const themeSystem = useThemes(editor, ready, doc.setMessage, {
    separate: separateDark,
    systemDark,
    darkTheme: String(applicationSystem.value?.values.darkTheme ?? 'marklyra-dark.css').replace(
      /\.css$/,
      '',
    ),
    persistDark: async (theme) => {
      const previous = await applicationPreferences.get();
      const saved = await applicationPreferences.putFromEditor(
        'darkTheme',
        `${theme}.css`,
        previous,
      );
      return async () => {
        const latest = await applicationPreferences.get();
        if (
          latest.revision === saved.revision &&
          latest.values.darkTheme === saved.values.darkTheme
        )
          await applicationPreferences.putFromEditor(
            'darkTheme',
            String(previous.values.darkTheme ?? 'marklyra-dark.css'),
            latest,
          );
      };
    },
  });
  const markdownSystem = useMarkdownPreferences(editor, ready, doc.setMessage);
  const {
    theme,
    select: changeTheme,
    selectAndWait: selectThemeAndWait,
    reload: reloadThemes,
  } = themeSystem;
  const [currentHeading, setCurrentHeading] = useState<string | null>(null);
  const [outlinePanelOpen, setOutlinePanelOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<'outline' | 'ai'>('outline');
  const detailsLayout = useDocumentDetailsLayout(outlinePanelOpen || aiPanelOpen, detailsMode);
  const [chooseRequest, setChooseRequest] = useState(0);
  const exporter = useDocumentExport(editor, {
    title: doc.file ? filename(doc.file.path) : '未命名',
    owner: doc.getOwner,
    sourceId: () => doc.getFile()?.id,
    unavailable: doc.working || !!doc.pending || !ready || themeSystem.working,
  });
  const trackSession = (): Promise<void> => {
    if (!desktopAvailable) return Promise.resolve();
    const documentId = actions.current.doc.getFile()?.id ?? null,
      workspaceId = workspaceIdentity.current?.id ?? null;
    const work = sessionWork.current.then(() => windowStartup.track(documentId, workspaceId));
    sessionWork.current = work.catch((error: unknown) => {
      actions.current.doc.setMessage(`窗口会话尚未记录：${String(error)}`);
    });
    return work;
  };
  const closeRequested = async (): Promise<void> => {
    if (desktopAvailable) {
      try {
        await trackSession();
        await editorWindows.backup(applicationQuit.current);
      } catch (error) {
        actions.current.doc.setMessage(`关闭会话未能备份：${String(error)}`);
      }
    }
    await actions.current.doc.request({ kind: 'close' });
  };
  const command = (
    value: MarkLyraCommand,
    strict = false,
    expectedSource?: string,
  ): Promise<void> => {
    setStatisticsOpen(false);
    setRecoveryOpen(false);
    setRecentOpen(false);
    const active = editor.current;
    const owner = doc.getOwner();
    const work = editorCommandWork.current.then(async () => {
      if (!active || editor.current !== active || actions.current.doc.getOwner() !== owner)
        throw new Error('编辑文档已更换，请重试编辑操作');
      if (expectedSource !== undefined && active.getMarkdown() !== expectedSource)
        throw new Error(STALE_SEARCH_POSITION);
      if (strict && active.isComposing) {
        doc.setMessage('请先完成输入法候选');
        return;
      }
      try {
        await active.execute(value);
      } catch (error) {
        // Candidate input can begin while an issued command awaits this queue.
        // Its ordinary refusal is not an unknown Native delivery failure.
        if (!strict || !active.isComposing) throw error;
        doc.setMessage('请先完成输入法候选');
      }
    });
    editorCommandWork.current = work.catch(() => {});
    return work.catch((error: unknown) => {
      doc.setMessage(String(error));
      if (strict) throw error;
    });
  };
  const action = (value: HostAction) => {
    if (value === 'zoom-in' || value === 'zoom-out') {
      if (!preferencesOpen && !statisticsOpen && desktopAvailable)
        void applicationPreferences
          .stepZoom(value === 'zoom-in' ? 'in' : 'out')
          .catch((error) => doc.setMessage(`缩放未确认：${String(error)}`));
      return;
    }
    if (value === 'new' && homeVisible) {
      startWriting();
      return;
    }
    if (value === 'new' || value === 'new-window') {
      void newWindow(value === 'new' ? 'document' : 'window');
      return;
    }
    if (
      value === 'open' &&
      chrome.native &&
      (doc.getFile() || doc.hasUnsavedChanges() || editor.current?.hasPendingChanges)
    ) {
      void newWindow('open');
      return;
    }
    if (preferencesOpen || statisticsOpen) {
      if (value === 'close') void dismissAuxiliaryPanel();
      return;
    }
    setStatisticsOpen(false);
    setRecoveryOpen(false);
    setRecentOpen(false);
    setPreferencesOpen(false);
    if (value === 'save' || value === 'save-as') void doc.save(value === 'save-as');
    else if (value === 'close') void closeRequested();
    else void doc.request({ kind: value });
  };
  const openPreferences = (editorOrigin?: boolean) => {
    if (!editor.current || doc.working || doc.pending || closingPanelRef.current) return false;
    if (editor.current.isComposing) {
      doc.setMessage('请先完成输入法候选');
      return false;
    }
    if (preferencesOpen) return true;
    panelEditorOrigin.current.preferences =
      editorOrigin ??
      (statisticsOpen
        ? panelEditorOrigin.current.statistics
        : document.activeElement === editor.current.element);
    setRecoveryOpen(false);
    setRecentOpen(false);
    setStatisticsOpen(false);
    setPreferencesOpen(true);
    const embedded = desktopAvailable && chrome.preferencesWindow;
    setPreferencesEmbedded(embedded);
    if (embedded) {
      setPreferencesReady(false);
      setPreferencesCloseRequest(0);
      const session = editorChrome.openPreferences();
      preferencesSession.current = session;
      void session
        .then((opened) => {
          if (preferencesSession.current !== session) return;
          if (opened === false) {
            preferencesSession.current = null;
            setPreferencesOpen(false);
          } else setPreferencesReady(true);
        })
        .catch((error: unknown) => {
          if (preferencesSession.current !== session) return;
          preferencesSession.current = null;
          setPreferencesOpen(false);
          doc.setMessage(`无法打开设置：${String(error)}`);
        });
    }
    return true;
  };
  const windowOperation = async (work: () => Promise<unknown>, failure = '窗口操作未确认') => {
    if (
      !desktopAvailable ||
      !ready ||
      !editor.current ||
      creatingWindowRef.current ||
      doc.working ||
      doc.pending ||
      exporter.working ||
      importingImageRef.current ||
      preferencesOpen ||
      statisticsOpen ||
      recoveryOpen ||
      recentOpen ||
      closingPanelRef.current
    )
      return;
    if (editor.current.isComposing) {
      doc.setMessage('请先完成输入法候选');
      return;
    }
    creatingWindowRef.current = true;
    setCreatingWindow(true);
    const active = editor.current;
    const owner = doc.getOwner();
    try {
      await active.flush();
      if (active.isComposing) throw new Error('请先完成输入法候选');
      const revision = active.revision;
      await doc.checkpoint();
      await trackSession();
      if (active.isComposing) throw new Error('请先完成输入法候选');
      if (
        editor.current !== active ||
        actions.current.doc.getOwner() !== owner ||
        active.revision !== revision ||
        active.hasPendingChanges ||
        actions.current.blockedEditorCommand ||
        actions.current.editorObscured ||
        actions.current.doc.working ||
        actions.current.exporter.working ||
        importingImageRef.current
      )
        throw new Error('文稿或窗口状态已更改，请重试');
      await work();
    } catch (error) {
      doc.setMessage(`${failure}：${String(error)}`);
    } finally {
      creatingWindowRef.current = false;
      setCreatingWindow(false);
    }
  };
  const newWindow = (kind: 'document' | 'window' | 'tab' | 'open' = 'window') =>
    windowOperation(() => editorWindows.create(kind), '无法新建窗口');
  const tabAction = (action: 'next' | 'previous' | 'detach' | 'merge' | 'toggle') =>
    windowOperation(() => editorWindows.tab(action));
  const focusStartup = async (instance: MarkLyraEditor, initial = false) => {
    if (startupFocusRunning.current) {
      startupForegroundPending.current = true;
      return;
    }
    startupFocusRunning.current = true;
    try {
      const handled = await focusInitialEditor(
        instance,
        () => {
          const current = actions.current;
          return (
            editor.current === instance &&
            !current.doc.working &&
            !current.doc.pending &&
            !current.preferencesOpen &&
            !current.statisticsOpen &&
            !current.editorObscured
          );
        },
        () => startupControl.current,
        editorWindows.isFocused,
      );
      startupFocusDeferred.current = !handled;
    } catch (error) {
      startupFocusDeferred.current = false;
      if (editor.current === instance)
        actions.current.doc.setMessage(`初始编辑焦点设置失败：${String(error)}`);
    } finally {
      startupFocusRunning.current = false;
      if (initial && editor.current === instance) setReady(true);
      if (startupForegroundPending.current) {
        startupForegroundPending.current = false;
        if (startupFocusDeferred.current) void focusStartup(instance);
      }
    }
  };
  const toggleAiPanel = () => {
    setDetailsMode('ai');
    setAiPanelOpen((open) => !open);
    setOutlinePanelOpen(false);
    if (aiPanelOpen) void editor.current?.focus().catch((error) => doc.setMessage(String(error)));
  };
  // A start that has reported a problem stops presenting itself as loading: the skeleton gives
  // way to the message and its retry instead of waiting for something that is not coming.
  const startupFailed = Boolean(applicationSystem.error || markdownSystem.error || doc.message);
  // The first screen of a window with nothing open. It covers the editor, which stays mounted but
  // inert underneath, so no input or command can reach text nobody can see.
  const homeVisible =
    homeAllowed &&
    startupSettled &&
    !homeDismissed &&
    !doc.file &&
    !doc.dirty &&
    !doc.pending &&
    doc.snapshot === '';
  const startWriting = () => setHomeDismissed(true);
  // Closing a document is replacing it with an empty one, through the same unsaved-changes
  // confirmation as every other replacement; the home view appears once it has happened.
  const closeDocument = () => {
    if (homeVisible || !ready || doc.working || doc.pending || editor.current?.isComposing) return;
    void doc.request({ kind: 'new' });
  };
  const hadFile = useRef(false);
  useEffect(() => {
    if (doc.file) {
      hadFile.current = true;
    } else if (hadFile.current) {
      hadFile.current = false;
      setHomeAllowed(true);
      setHomeDismissed(false);
    }
  }, [doc.file]);
  const openQuickOpen = (tab: QuickTab = 'all') => {
    if (!ready || preferencesOpen || statisticsOpen || recoveryOpen || recentOpen) return;
    if (doc.working || doc.pending || editor.current?.isComposing) return;
    setQuickNotes(null);
    setQuickOpen({ tab });
  };
  const closeQuickOpen = () => {
    setQuickOpen(null);
    window.setTimeout(() => {
      const home = document.querySelector<HTMLElement>('.home-screen');
      if (home) home.focus({ preventScroll: true });
      else void editor.current?.focus().catch((error) => doc.setMessage(String(error)));
    });
  };
  const searchOpen = quickOpen !== null;
  useEffect(() => {
    if (!searchOpen) return;
    let alive = true;
    void loadQuickNotes(workspaceIdentity.current, {
      workspace: (workspaceId, relativePath) =>
        void actions.current.doc.request({ kind: 'workspace', workspaceId, relativePath }),
      recent: (id) => void actions.current.doc.request({ kind: 'recent', id }),
    }).then(
      (notes) => {
        if (alive) setQuickNotes(notes);
      },
      () => {
        if (alive) setQuickNotes({ items: [] });
      },
    );
    return () => {
      alive = false;
    };
  }, [searchOpen]);
  const wasHome = useRef(false);
  useEffect(() => {
    documentAreaElement.current
      ?.querySelector('.runtime-editor-mount')
      ?.toggleAttribute('inert', homeVisible);
    if (wasHome.current && !homeVisible) void editor.current?.focus().catch(() => {});
    wasHome.current = homeVisible;
  }, [homeVisible]);
  const rename = useDocumentRename({
    file:
      doc.file && doc.file.locationState !== 'trashed'
        ? { id: doc.file.id, path: doc.file.path }
        : null,
    disabled:
      !ready ||
      doc.working ||
      !!doc.pending ||
      exporter.working ||
      importingImage ||
      creatingWindow ||
      preferencesOpen ||
      statisticsOpen ||
      recoveryOpen ||
      recentOpen ||
      closingPanel,
    windows: runtime?.platform === 'windows',
    prepare: async () => {
      const active = editor.current;
      const before = actions.current.doc;
      if (!active || before.working || before.pending || active.isComposing)
        throw new Error('请先完成当前文档操作或输入法候选');
      const owner = before.getOwner();
      await active.flush();
      const latest = actions.current.doc;
      if (
        editor.current !== active ||
        latest.getOwner() !== owner ||
        latest.working ||
        latest.pending ||
        active.isComposing
      )
        throw new Error('当前文档状态已更改，请重试重命名');
    },
    onRenamed: (warnings) => {
      if (warnings.length) doc.setMessage(warnings.join('\n'));
      void editor.current?.focus().catch((error) => doc.setMessage(String(error)));
    },
    onCancelled: () => {
      void editor.current?.focus().catch((error) => doc.setMessage(String(error)));
    },
  });
  /** Hang the popover from the Windows title button, or from where the native macOS title sits. */
  const openRename = (element?: HTMLElement) => {
    if (rename.state) {
      rename.cancel();
      return;
    }
    const rect = (
      element ?? document.querySelector<HTMLElement>('.titlebar-title-button')
    )?.getBoundingClientRect();
    if (rect) {
      rename.begin({ left: rect.left, right: rect.right, bottom: rect.bottom });
      return;
    }
    const area = documentAreaElement.current?.getBoundingClientRect();
    const center = area ? (area.left + area.right) / 2 : document.documentElement.clientWidth / 2;
    rename.begin({ left: center - 60, right: center + 60, bottom: 28 });
  };
  const actions = useRef({
    closeDocument,
    openRename,
    openQuickOpen,
    action,
    toggleAiPanel,
    command,
    doc,
    exporter,
    openPreferences,
    newWindow,
    tabAction,
    windowOperation,
    dismissAuxiliaryPanel: () => dismissAuxiliaryPanel(),
    focusStartup,
    closeRequested,
    cancelApplicationQuit,
    unavailableForQuit:
      !ready ||
      doc.working ||
      !!doc.pending ||
      exporter.working ||
      importingImage ||
      creatingWindow ||
      preferencesOpen ||
      statisticsOpen ||
      recoveryOpen ||
      recentOpen ||
      closingPanel,
    // The editor is covered (home view or search window): nothing may edit text nobody can see.
    editorObscured: homeVisible || quickOpen !== null,
    blockedEditorCommand:
      !ready ||
      !editor.current ||
      preferencesOpen ||
      statisticsOpen ||
      recoveryOpen ||
      recentOpen ||
      !!doc.pending ||
      closingPanel,
    preferencesOpen,
    statisticsOpen,
  });
  actions.current = {
    closeDocument,
    openRename,
    openQuickOpen,
    action,
    toggleAiPanel,
    command,
    doc,
    exporter,
    openPreferences,
    newWindow,
    tabAction,
    windowOperation,
    dismissAuxiliaryPanel: () => dismissAuxiliaryPanel(),
    focusStartup,
    closeRequested,
    cancelApplicationQuit,
    unavailableForQuit:
      !ready ||
      doc.working ||
      !!doc.pending ||
      exporter.working ||
      importingImage ||
      creatingWindow ||
      preferencesOpen ||
      statisticsOpen ||
      recoveryOpen ||
      recentOpen ||
      closingPanel,
    // The editor is covered (home view or search window): nothing may edit text nobody can see.
    editorObscured: homeVisible || quickOpen !== null,
    blockedEditorCommand:
      !ready ||
      !editor.current ||
      preferencesOpen ||
      statisticsOpen ||
      recoveryOpen ||
      recentOpen ||
      !!doc.pending ||
      closingPanel,
    preferencesOpen,
    statisticsOpen,
  };
  const inputModalOpen = recoveryOpen || recentOpen || !!doc.pending;
  const previousInputModal = useRef(false);
  useEffect(() => {
    const closed = previousInputModal.current && !inputModalOpen;
    previousInputModal.current = inputModalOpen;
    if (closed) {
      if (!modalFocusHandled.current) startupFocusDeferred.current = true;
      modalFocusHandled.current = false;
    }
    if (!inputModalOpen && ready && !doc.working && startupFocusDeferred.current && editor.current)
      void actions.current.focusStartup(editor.current);
  }, [inputModalOpen, ready, doc.working]);
  const trackSessionLatest = useRef(trackSession);
  trackSessionLatest.current = trackSession;
  // File/authority changes only; ordinary input does not write session metadata.
  // biome-ignore lint/correctness/useExhaustiveDependencies: IDs schedule tracking; the callback reads the latest authoritative refs.
  useEffect(() => {
    if (ready && desktopAvailable) void trackSessionLatest.current().catch(() => {});
  }, [ready, doc.file?.id, doc.file?.metadataRevision, sessionWorkspace]);
  useEffect(() => {
    if (!desktopAvailable || !ready) return;
    let alive = true;
    const seen = new Set<string>();
    const window = getCurrentWindow();
    const receive = async (value: unknown) => {
      const drop = nativeFileDrop(value);
      if (seen.has(drop.ticket)) return;
      seen.add(drop.ticket);
      if (seen.size > 128) seen.delete(seen.values().next().value ?? '');
      const dropPoint = {
        x: (drop.position.x * globalThis.window.innerWidth) / drop.viewport.width,
        y: (drop.position.y * globalThis.window.innerHeight) / drop.viewport.height,
      };
      const dropTarget = document.elementFromPoint(dropPoint.x, dropPoint.y);
      if (dropTarget?.closest('.ai-settings-dialog[open]')) {
        await cancelNativeInput(drop.ticket);
        return;
      }
      if (dropTarget?.closest('.ai-composer')) {
        globalThis.window.dispatchEvent(
          new CustomEvent('marklyra-ai-native-drop', { detail: { ticket: drop.ticket } }),
        );
        return;
      }
      const active = editor.current;
      const origin = actions.current.doc;
      let leased = false;
      try {
        if (
          !active ||
          importingImageRef.current ||
          actions.current.unavailableForQuit ||
          active.isComposing
        )
          throw new Error('请先完成当前文稿操作或输入法候选，再拖入文件');
        importingImageRef.current = true;
        leased = true;
        setImportingImage(true);
        const owner = origin.getOwner();
        await active.flush();
        const text = active.getMarkdown(),
          revision = active.revision;
        const preferences = await filePreferences.get();
        if (
          !alive ||
          actions.current.blockedEditorCommand ||
          actions.current.exporter.working ||
          actions.current.doc.working ||
          actions.current.doc.pending ||
          editor.current !== active ||
          actions.current.doc.getOwner() !== owner ||
          active.isComposing ||
          active.hasPendingChanges ||
          active.revision !== revision ||
          active.getMarkdown() !== text
        )
          throw new Error('拖放期间文稿或输入已有变化，请重新拖入');
        const intent = nativeDropIntent(drop, preferences);
        if (intent === 'disabled-document')
          throw Error('该文件类型已关闭，可在设置 → 文件 → 支持的文件类型中重新启用');
        if (intent === 'unsupported-import')
          throw new Error('暂不支持此格式的导入；可在文件设置中选择插入链接');
        if (intent === 'document') {
          if (drop.entries.length !== 1) throw new Error('请逐个拖入需要打开的文稿');
          // Consume the Native receipt while its source owner is still current.
          // The unopened candidate survives an explicit Save/SaveAs confirmation;
          // it is never activated until the existing dirty-document gate accepts.
          const candidate = await documents.openNative(drop.ticket);
          if (candidate.nativeSameDocument || candidate.path === origin.getFile()?.path) {
            if (candidate.id !== origin.getFile()?.id) await documents.close(candidate.id);
            return;
          }
          if (
            !alive ||
            actions.current.blockedEditorCommand ||
            actions.current.exporter.working ||
            editor.current !== active ||
            actions.current.doc.getOwner() !== owner ||
            active.isComposing ||
            active.hasPendingChanges ||
            active.revision !== revision ||
            active.getMarkdown() !== text
          ) {
            await documents.close(candidate.id);
            throw new Error('准备打开期间文稿已有变化，请重新拖入');
          }
          await actions.current.doc.request({ kind: 'native-input', document: candidate });
          return;
        }
        if (intent === 'directory') {
          if (drop.entries.length !== 1) throw new Error('请逐个拖入需要打开的目录');
          const folder = await workspaces.openNative(drop.ticket);
          if (
            !alive ||
            actions.current.blockedEditorCommand ||
            editor.current !== active ||
            actions.current.doc.getOwner() !== owner
          ) {
            await workspaces.close(folder.id);
            return;
          }
          if (
            workspaceIdentity.current ||
            actions.current.doc.getFile() ||
            actions.current.doc.hasUnsavedChanges() ||
            active.hasPendingChanges
          ) {
            try {
              const catalog = await directoryHistory.list(folder.id);
              if (
                !alive ||
                actions.current.blockedEditorCommand ||
                editor.current !== active ||
                actions.current.doc.getOwner() !== owner ||
                active.isComposing ||
                active.hasPendingChanges ||
                active.revision !== revision ||
                active.getMarkdown() !== text
              )
                return;
              await directoryHistory.openNewWindow(catalog.revision, {
                kind: 'workspace',
                workspaceId: folder.id,
              });
            } finally {
              await workspaces.close(folder.id);
            }
          } else {
            setInitialWorkspace(folder);
            setSidebar(true);
            setTab('files');
          }
          return;
        }
        const point = {
          x: (drop.position.x * globalThis.window.innerWidth) / drop.viewport.width,
          y: (drop.position.y * globalThis.window.innerHeight) / drop.viewport.height,
        };
        if (intent === 'images' && document.elementFromPoint(point.x, point.y) !== active.element)
          throw new Error('请将图片拖入正文编辑区域');
        await active.importNativeInput(
          { id: drop.ticket, ...(intent === 'images' ? { point } : {}) },
          importNativeInput(drop.ticket, intent === 'images' ? 'paste' : 'references'),
        );
      } finally {
        await cancelNativeInput(drop.ticket).catch(() => {});
        if (leased) {
          importingImageRef.current = false;
          if (alive) setImportingImage(false);
        }
      }
    };
    const listeners = [
      window.listen<unknown>('native-file-drop', (event) => {
        void receive(event.payload).catch((error: unknown) => {
          if (alive) actions.current.doc.setMessage(`文件拖入未完成：${String(error)}`);
        });
      }),
      window.listen<string>('native-file-input-error', (event) => {
        if (alive) actions.current.doc.setMessage(`文件拖入未完成：${event.payload}`);
      }),
    ];
    return () => {
      alive = false;
      for (const listener of listeners) void listener.then((stop) => stop()).catch(() => {});
    };
  }, [ready]);
  const dismissAuxiliaryPanel = async () => {
    const current = actions.current;
    if (closingPanelRef.current || (!current.preferencesOpen && !current.statisticsOpen)) return;
    if (current.preferencesOpen && preferencesSession.current) {
      setPreferencesCloseRequest((value) => value + 1);
      return;
    }
    const kind = current.preferencesOpen ? 'preferences' : 'statistics';
    const instance = editor.current;
    closingPanelRef.current = true;
    flushSync(() => setClosingPanel(true));
    try {
      // Complete the cross-frame focus request before reporting the dialog closed.
      // No range reconstruction: the SDK preserves the existing editor selection.
      if (panelEditorOrigin.current[kind] && instance) await instance.focus();
    } catch (error) {
      actions.current.doc.setMessage(`恢复编辑焦点失败：${String(error)}`);
    } finally {
      setPreferencesOpen(false);
      setStatisticsOpen(false);
      closingPanelRef.current = false;
      setClosingPanel(false);
    }
  };
  const finishPreferencesPage = async () => {
    if (closingPanelRef.current) return;
    closingPanelRef.current = true;
    setClosingPanel(true);
    try {
      if ((await preferencesSession.current) !== false) await editorChrome.closePreferences();
      preferencesSession.current = null;
      flushSync(() => {
        setPreferencesOpen(false);
        setPreferencesReady(false);
      });
      reloadPreferences();
      if (panelEditorOrigin.current.preferences && editor.current) await editor.current.focus();
    } catch (error) {
      if (preferencesQuit.current) {
        preferencesQuit.current = null;
        cancelApplicationQuit();
      }
      throw error;
    } finally {
      closingPanelRef.current = false;
      flushSync(() => setClosingPanel(false));
    }
    const quit = preferencesQuit.current;
    preferencesQuit.current = null;
    if (quit && applicationQuit.current === quit) await actions.current.closeRequested();
  };
  useEffect(() => {
    if (!desktopAvailable) return;
    const bridge = new NativeEditorCommands({
      capture: (action) => {
        const active = editor.current;
        const composing = active?.isComposing === true;
        if (composing) actions.current.doc.setMessage('请先完成输入法候选');
        return {
          editor: active,
          documentOwner: actions.current.doc.getOwner(),
          blocked:
            actions.current.blockedEditorCommand ||
            actions.current.editorObscured ||
            !actions.current.doc.acceptsEditorCommands() ||
            composing ||
            (hostTextInputFocused(active) && action !== 'find' && action !== 'replace'),
        };
      },
      execute: async (value, expectedEditor, owner) => {
        if (
          !expectedEditor ||
          editor.current !== expectedEditor ||
          actions.current.doc.getOwner() !== owner
        )
          throw new Error('编辑命令所属文档窗口已更换');
        if (!nativeMenuCommandAllowed(expectedEditor.menuState, value)) return;
        if (hostTextInputFocused(expectedEditor) && value.type !== 'find') return;
        await actions.current.command(value, true);
      },
      onError: (error) => notify(`无法完成上一条编辑操作，暂未保存：${error.message}`, 'error'),
    });
    nativeCommandBridge.current = bridge;
    return () => {
      if (nativeCommandBridge.current === bridge) nativeCommandBridge.current = null;
      bridge.dispose();
    };
  }, []);
  useNativeMenus(
    ready ? editor.current : null,
    {
      ready,
      // The home view is reported as `home`, where native rules keep start and application
      // actions such as themes available; only the quick open overlay blocks the menus.
      blocked:
        actions.current.blockedEditorCommand ||
        quickOpen !== null ||
        doc.working ||
        exporter.working ||
        importingImage ||
        creatingWindow ||
        editor.current?.isComposing === true,
      editor: editor.current?.menuState ?? null,
      sidebar,
      sidebarTab: tab,
      outlinePanelOpen,
      fileView: preferences.fileSidebar.view,
      fullscreen,
      statisticsOpen,
      availableFormats: [
        'html-plain',
        ...(exporter.capabilities && exporter.capabilities.pdf !== 'none' ? ['pdf'] : []),
        ...(exporter.capabilities?.image ? ['image'] : []),
        ...(exporter.capabilities?.formats ?? []),
        ...exporter.customFormats,
      ],
      canImport: (exporter.capabilities?.importExtensions.length ?? 0) > 0,
      canRename: rename.canRename,
      home: homeVisible,
    },
    async () => {
      const bridge = nativeCommandBridge.current;
      if (!bridge) throw new Error('菜单命令通道尚未初始化');
      return bridge.whenReady();
    },
    doc.setMessage,
  );
  useOsOpenEvents(ready && osOpenReady, {
    editor: () => editor.current,
    available: () =>
      !actions.current.unavailableForQuit &&
      !actions.current.blockedEditorCommand &&
      !actions.current.doc.working &&
      !actions.current.doc.pending &&
      !actions.current.exporter.working,
    mayInitialize: () =>
      !actions.current.blockedEditorCommand &&
      !actions.current.exporter.working &&
      !importingImageRef.current &&
      !creatingWindowRef.current,
    owner: () => actions.current.doc.getOwner(),
    canReuse: () => !actions.current.doc.getFile() && !actions.current.doc.hasUnsavedChanges(),
    initialize: (file, revision, guard) => actions.current.doc.initialize(file, revision, guard),
    settleSession: () => trackSession(),
    report: (message) => actions.current.doc.setMessage(message),
  });
  useEffect(() => {
    if (ready && desktopAvailable) void actions.current.exporter.refreshCapabilities();
  }, [ready]);
  useEffect(() => {
    let alive = true;
    void editorChrome.initialize().then(
      (value) => {
        if (alive) setChrome(value);
      },
      (error: unknown) => {
        if (alive) actions.current.doc.setMessage(`标题栏初始化失败：${String(error)}`);
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !desktopAvailable || !windowIdentity.primary || offeredRecovery.current) return;
    offeredRecovery.current = true;
    const expected = actions.current.doc.source.current;
    const revision = editor.current?.revision;
    void discoverRecovery().then(
      (listing) => {
        if (listing.fallbackAvailable || listing.drafts.some((draft) => !draft.active)) {
          const current = actions.current.doc;
          if (
            !current.dirty &&
            !current.working &&
            !current.pending &&
            !recentRequested.current &&
            !actions.current.preferencesOpen &&
            !actions.current.statisticsOpen &&
            !editor.current?.isComposing &&
            !editor.current?.hasPendingChanges &&
            current.source.current === expected &&
            editor.current?.revision === revision
          )
            setRecoveryOpen(true);
          else current.setMessage('发现未保存的恢复副本，可从“恢复草稿”打开');
        }
        if (listing.issues.length)
          actions.current.doc.setMessage('部分恢复记录需要检查，请打开恢复草稿查看详情');
      },
      (error: unknown) => actions.current.doc.setMessage(`无法读取恢复副本：${String(error)}`),
    );
  }, [ready, windowIdentity.primary]);
  useEffect(() => {
    let alive = true;
    void editorRuntime().then(
      (value) => {
        if (alive) {
          setRuntime(value);
          if (value.nativeInputWarning) notify(value.nativeInputWarning, 'warning');
        }
      },
      (error) => {
        if (alive) actions.current.doc.setMessage(String(error));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    const stops: (() => void)[] = [];
    const menu = (value: string) => {
      if (value === 'new-tab') {
        void actions.current.newWindow('tab');
        return;
      }
      if (value.startsWith('tab:')) {
        const action = value.slice(4);
        if (
          action === 'next' ||
          action === 'previous' ||
          action === 'detach' ||
          action === 'merge' ||
          action === 'toggle'
        )
          void actions.current.tabAction(action);
        return;
      }
      if (value === 'new-window') {
        void actions.current.newWindow();
        return;
      }
      if (value === 'preferences') {
        actions.current.openPreferences();
        return;
      }
      // Native menus still dispatch while a WebView dialog has focus. Keep
      // document commands out of settings inputs and statistics dialogs.
      if (actions.current.preferencesOpen || actions.current.statisticsOpen) {
        if (value === 'close') actions.current.action('close');
        if (value === 'view:statistics' && actions.current.statisticsOpen)
          void actions.current.dismissAuxiliaryPanel();
        return;
      }
      if (value === 'quick-open') {
        actions.current.openQuickOpen('all');
        return;
      }
      if (value === 'view:sidebar') {
        setSidebar((visible) => !visible);
        return;
      }
      if (value === 'view:ai') {
        actions.current.toggleAiPanel();
        return;
      }
      if (value === 'view:outline' || value === 'view:outline-popover') {
        setDetailsMode('outline');
        setAiPanelOpen(false);
        setOutlinePanelOpen((open) => !open);
        return;
      }
      if (value === 'view:files' || value === 'view:articles') {
        const view = value === 'view:files' ? 'tree' : 'articles';
        setPreferences((current) => ({
          ...current,
          fileSidebar: { ...current.fileSidebar, view },
        }));
        setSidebar(true);
        setTab('files');
        return;
      }
      if (value === 'view:workspace-search') {
        setSidebar(true);
        setTab('search');
        return;
      }
      if (value.startsWith('statistics-unit:')) {
        const unit = value.slice('statistics-unit:'.length);
        if (['words', 'characters', 'lines', 'readingMinutes'].includes(unit))
          setPreferences((current) => ({ ...current, statisticsUnit: unit as StatisticsUnit }));
        return;
      }
      if (/^recent-open:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) {
        setRecoveryOpen(false);
        setRecentOpen(false);
        void actions.current.doc.request({
          kind: 'recent',
          id: value.slice('recent-open:'.length),
        });
        return;
      }
      if (value === 'recent-files') {
        setStatisticsOpen(false);
        const current = actions.current.doc;
        if (!editor.current || current.working || current.pending) return;
        if (editor.current.isComposing) {
          current.setMessage('请先完成输入法候选');
          return;
        }
        setRecoveryOpen(false);
        setRecentOpen(true);
        return;
      }
      if (value === 'marklyra-drafts') {
        const current = actions.current.doc;
        if (!editor.current || current.working || current.pending || editor.current.isComposing)
          return;
        setRecentOpen(false);
        setRecoveryOpen(true);
        return;
      }
      if (value === 'view:fullscreen') {
        const active = editor.current,
          owner = actions.current.doc.getOwner();
        if (
          actions.current.blockedEditorCommand ||
          actions.current.doc.working ||
          editor.current?.isComposing
        )
          return;
        const window = getCurrentWindow();
        void window
          .isFullscreen()
          .then((current) => {
            if (
              editor.current !== active ||
              actions.current.doc.getOwner() !== owner ||
              actions.current.unavailableForQuit ||
              active?.isComposing
            )
              return;
            return window.setFullscreen(!current);
          })
          .catch((error: unknown) =>
            actions.current.doc.setMessage(`全屏状态未确认：${String(error)}`),
          );
        return;
      }
      if (value === 'view:statistics') {
        const active = editor.current;
        if (
          !active ||
          actions.current.blockedEditorCommand ||
          actions.current.editorObscured ||
          actions.current.doc.working ||
          active.isComposing ||
          active.menuState?.sourceMode
        )
          return;
        panelEditorOrigin.current.statistics = document.activeElement === active.element;
        setRecoveryOpen(false);
        setRecentOpen(false);
        setPreferencesOpen(false);
        setStatisticsOpen(true);
        return;
      }
      if (value === 'import-document') {
        const active = editor.current,
          owner = actions.current.doc.getOwner();
        void actions.current.windowOperation(async () => {
          let imported: Awaited<ReturnType<typeof documentExports.importDocument>>;
          try {
            imported = await documentExports.importDocument();
          } catch (error) {
            if (String(error) === '已取消导入') return;
            throw error;
          }
          if (editor.current !== active || actions.current.doc.getOwner() !== owner) {
            await documents.close(imported.id);
            actions.current.doc.setMessage(
              `已导入另存为 ${displayPath(imported.path)}；当前文稿已切换，请手动打开导入结果`,
            );
            return;
          }
          await actions.current.doc.request({ kind: 'native-input', document: imported });
        }, '导入未完成');
        return;
      }
      if (isExportAction(value)) {
        setRecoveryOpen(false);
        setRecentOpen(false);
        void actions.current.exporter.run(value);
        return;
      }
      if (value === 'rename-document') {
        actions.current.openRename();
        return;
      }
      if (value === 'close-document') {
        actions.current.closeDocument();
        return;
      }
      if (['open', 'save', 'save-as', 'new', 'close'].includes(value)) {
        actions.current.action(value as HostAction);
        return;
      }
      if (value === 'open-folder') {
        setRecoveryOpen(false);
        setRecentOpen(false);
        setSidebar(true);
        setTab('files');
        setChooseRequest((value) => value + 1);
        return;
      }
      const item = nativeEditorCommand(value);
      if (item) {
        const active = editor.current;
        if (
          !nativeMenuCommandAllowed(active?.menuState ?? null, item, hostTextInputFocused(active))
        )
          return;
        void actions.current.command(item);
        return;
      }
      const [name, argument] = value.split(':');
      if (name === 'theme' && argument) changeTheme(argument);
    };
    menuHandler.current = menu;
    if (desktopAvailable) {
      const nativeWindow = getCurrentWindow();
      const tabLayoutListener = nativeWindow
        .listen<{ overlay: boolean }>('native-tab-layout', (event) => {
          if (typeof event.payload?.overlay === 'boolean') setNativeOverlay(event.payload.overlay);
        })
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const themeSelectionListener = nativeWindow
        .listen<{ token: string; themeId: string; target?: 'normal' | 'dark' }>(
          'preference-theme-request',
          (event) => {
            const payload = event.payload;
            if (
              !payload ||
              !/^[a-f0-9-]{36}$/.test(payload.token) ||
              !validThemeId(payload.themeId)
            )
              return;
            if (preferenceThemes.current.has(payload.token)) return;
            const abort = new AbortController();
            preferenceThemes.current.set(payload.token, abort);
            void selectThemeAndWait(payload.themeId, {
              target: payload.target ?? 'normal',
              signal: abort.signal,
              commit: (stylesToken) => completePreferenceTheme(payload.token, stylesToken, null),
            })
              .catch((error: unknown) =>
                completePreferenceTheme(payload.token, null, String(error)).catch(() => {}),
              )
              .finally(() => preferenceThemes.current.delete(payload.token));
          },
        )
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const themeCancellationListener = nativeWindow
        .listen<{ token: string }>('preference-theme-cancelled', (event) =>
          preferenceThemes.current.get(event.payload?.token)?.abort(),
        )
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const quitListener = nativeWindow
        .listen<{ token: string }>('application-quit-request', (event) => {
          const token = event.payload.token;
          if (typeof token !== 'string' || !token) return;
          const current = actions.current;
          if (applicationQuit.current === token) return;
          applicationQuit.current = token;
          if (current.preferencesOpen && preferencesSession.current) {
            preferencesQuit.current = token;
            setPreferencesCloseRequest((value) => value + 1);
            return;
          }
          if (current.unavailableForQuit || !editor.current || editor.current.isComposing) {
            current.cancelApplicationQuit();
            current.doc.setMessage(
              editor.current?.isComposing
                ? '请先完成输入法候选，再退出应用'
                : '请先完成当前操作或关闭对话框，再退出应用',
            );
            return;
          }
          void current.closeRequested();
        })
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const menuListener = nativeWindow
        .listen<unknown>('menu-action', (event) => {
          if (typeof event.payload === 'string') menu(event.payload);
          else nativeCommandBridge.current?.accept(event.payload);
        })
        .then(async (stop) => {
          if (!alive) {
            stop();
            return;
          }
          stops.push(stop);
          // Listener must be installed before Native begins issuing sequence IDs.
          await nativeCommandBridge.current?.start();
        });
      const closeListener = getCurrentWindow()
        .onCloseRequested((event) => {
          event.preventDefault();
          actions.current.action('close');
        })
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const focusListener = nativeWindow
        .onFocusChanged((event) => {
          if (event.payload) reloadThemes();
          if (
            event.payload &&
            editor.current &&
            (startupFocusDeferred.current || startupFocusRunning.current)
          )
            void actions.current.focusStartup(editor.current);
        })
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const settingsListener = nativeWindow
        .listen('preferences-changed', () => {
          reloadPreferences();
          reloadThemes();
        })
        .then((stop) => (alive ? stops.push(stop) : stop()));
      const preferencesClosed = nativeWindow
        .listen('preferences-closed', () => {
          void actions.current.exporter.refreshCapabilities();
          if (!nativePreferencesOrigin.current || !editor.current) return;
          nativePreferencesOrigin.current = false;
          const instance = editor.current;
          void focusInitialEditor(
            instance,
            () => {
              const current = actions.current;
              return (
                editor.current === instance &&
                !current.doc.working &&
                !current.doc.pending &&
                !current.preferencesOpen &&
                !current.statisticsOpen &&
                !instance.isComposing
              );
            },
            () => null,
            editorWindows.isFocused,
          ).catch((error: unknown) =>
            actions.current.doc.setMessage(`恢复编辑焦点失败：${String(error)}`),
          );
        })
        .then((stop) => (alive ? stops.push(stop) : stop()));
      void Promise.all([
        quitListener,
        menuListener,
        closeListener,
        focusListener,
        settingsListener,
        preferencesClosed,
        themeSelectionListener,
        themeCancellationListener,
        tabLayoutListener,
      ])
        .then(() => {
          if (alive) return editorWindows.ready();
        })
        .catch((error: unknown) => {
          if (alive) actions.current.doc.setMessage(`窗口事件初始化失败：${String(error)}`);
        });
    }
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.isComposing) return;
      const value = event.key.toLowerCase();
      if (value === ',') {
        event.preventDefault();
        actions.current.openPreferences();
        return;
      }
      if (actions.current.preferencesOpen || actions.current.statisticsOpen) {
        if (['s', 'o', 'n', 'w'].includes(value)) event.preventDefault();
        if (value === 'w') actions.current.action('close');
        return;
      }
      if (value === 'n' && event.shiftKey) {
        event.preventDefault();
        void actions.current.newWindow();
        return;
      }
      if (value === 's' || value === 'o' || value === 'n') {
        event.preventDefault();
        actions.current.action(
          value === 's' ? (event.shiftKey ? 'save-as' : 'save') : value === 'o' ? 'open' : 'new',
        );
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      alive = false;
      for (const stop of stops) stop();
      for (const abort of preferenceThemes.current.values()) abort.abort();
      preferenceThemes.current.clear();
      document.removeEventListener('keydown', key);
    };
  }, [
    setRecentOpen,
    reloadPreferences,
    setPreferences,
    changeTheme,
    reloadThemes,
    selectThemeAndWait,
  ]);
  useEffect(() => {
    document.documentElement.dataset.theme = themeSystem.dark ? 'dark' : 'light';
  }, [themeSystem.dark]);
  useEffect(() => {
    if (desktopAvailable && !chrome.native)
      void getCurrentWindow().setTitle(
        `${doc.dirty ? '● ' : ''}${doc.file ? filename(doc.file.path) : '未命名'} — MarkLyra`,
      );
  }, [doc.file, doc.dirty, chrome.native]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Native resolves the same ID to its new path after a metadata generation change.
  useEffect(() => {
    if (!chrome.native) return;
    void editorChrome
      .update(
        doc.file?.id ?? null,
        doc.dirty,
        statistics.value,
        preferences.statisticsUnit,
        preferences.alwaysShowWordCount,
        themeSystem.dark,
        outlinePanelOpen,
        viewMode,
        aiPanelOpen,
        !homeVisible,
      )
      .catch((error: unknown) =>
        actions.current.doc.setMessage(`标题栏更新失败：${String(error)}`),
      );
  }, [
    chrome.native,
    doc.file?.id,
    doc.file?.metadataRevision,
    doc.dirty,
    statistics.value,
    preferences.statisticsUnit,
    preferences.alwaysShowWordCount,
    themeSystem.dark,
    outlinePanelOpen,
    viewMode,
    aiPanelOpen,
    homeVisible,
  ]);
  useEffect(() => {
    if (!ready || !editor.current) return;
    const instance = editor.current;
    void instance.setPreferences(appliedEditorPreferences).catch((error: unknown) => {
      if (editor.current === instance)
        actions.current.doc.setMessage(`编辑器设置应用失败：${String(error)}`);
    });
  }, [ready, appliedEditorPreferences]);
  useEffect(() => {
    if (!ready || !editor.current) return;
    void editor.current
      .setOutlineTracking(outlinePanelOpen)
      .catch((error: unknown) =>
        actions.current.doc.setMessage(`大纲跟随设置失败：${String(error)}`),
      );
  }, [ready, outlinePanelOpen]);
  // Native chrome has no status bar; document messages use the shared toast.
  useNotice(chrome.native ? doc.message : '', 'warning');
  useEffect(() => {
    if (!chrome.native) return;
    let alive = true;
    const window = getCurrentWindow();
    const update = () =>
      void window.isFullscreen().then(
        (value) => {
          if (alive) setFullscreen(value === true);
        },
        (error: unknown) => {
          if (alive) actions.current.doc.setMessage(`无法读取全屏状态：${String(error)}`);
        },
      );
    update();
    const stop = window.onResized(update);
    return () => {
      alive = false;
      void stop.then((unlisten) => unlisten());
    };
  }, [chrome.native]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Read committed DOM geometry before the same paint as panel/sidebar state changes.
  useLayoutEffect(() => {
    if (!ready || !editor.current) return;
    const instance = editor.current;
    let active = true;
    let frame = 0;
    const panel = detailsElement.current;
    let previousTitleLayout = '';
    const update = () => {
      const panel = detailsElement.current;
      const pane = documentAreaElement.current;
      // Native shells draw the document as its own bordered pane: the runtime viewport spans the
      // window horizontally and its scrollport (and scrollbar) ends on this pane's inner edges.
      const inner = chrome.native && pane ? pane.getBoundingClientRect() : null;
      const left = inner && pane ? inner.left + pane.clientLeft : 0;
      const right =
        inner && pane
          ? Math.max(
              0,
              document.documentElement.clientWidth -
                (inner.left + pane.clientLeft + pane.clientWidth),
            )
          : panel
            ? panel.getBoundingClientRect().width +
              Number.parseFloat(getComputedStyle(panel).marginRight)
            : 0;
      if (webTitlebar && documentAreaElement.current) {
        const area = documentAreaElement.current.getBoundingClientRect();
        setTitleBounds((previous) =>
          previous.left === area.left && previous.right === area.right
            ? previous
            : { left: area.left, right: area.right },
        );
      } else if (chrome.native && documentAreaElement.current) {
        const area = documentAreaElement.current.getBoundingClientRect();
        const payload = {
          contentLeft: area.left,
          contentRight: area.right,
          viewportWidth: document.documentElement.clientWidth,
        };
        const key = JSON.stringify(payload);
        if (key !== previousTitleLayout) {
          previousTitleLayout = key;
          void editorChrome.updateTitleLayout(payload).catch((error: unknown) => {
            if (active) actions.current.doc.setMessage(`标题栏布局更新失败：${String(error)}`);
          });
        }
      }
      void instance
        .setContentInset(
          left,
          // The pane already starts below the titlebar; only the legacy full-bleed layout insets.
          0,
          chrome.native ? 28 : 0,
          right,
        )
        .catch((error: unknown) => {
          if (active) actions.current.doc.setMessage(`正文布局更新失败：${String(error)}`);
        });
    };
    const paint = () => {
      frame = 0;
      update();
      if (panel?.getAnimations().some((animation) => animation.playState === 'running')) schedule();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    update();
    schedule();
    // Never resize an iframe inside ResizeObserver delivery: nested viewports can feed back.
    const observer = new ResizeObserver(schedule);
    if (sidebarElement.current) observer.observe(sidebarElement.current);
    if (documentAreaElement.current) observer.observe(documentAreaElement.current);
    if (panel) {
      observer.observe(panel);
      panel.addEventListener('transitionrun', schedule);
      panel.addEventListener('transitionend', schedule);
      panel.addEventListener('transitioncancel', schedule);
    }
    window.addEventListener('resize', update);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      panel?.removeEventListener('transitionrun', schedule);
      panel?.removeEventListener('transitionend', schedule);
      panel?.removeEventListener('transitioncancel', schedule);
      window.removeEventListener('resize', update);
    };
  }, [
    chrome.native,
    webTitlebar,
    titlebarHeight,
    sidebar,
    ready,
    fullscreen,
    nativeOverlay,
    outlinePanelOpen,
    detailsLayout.width,
    detailsLayout.present,
    sidebarWidth,
  ]);
  const insertImages = async (files: File[]) => {
    if (!files.length || importingImageRef.current || doc.working || !editor.current) return;
    importingImageRef.current = true;
    setImportingImage(true);
    try {
      for (const file of files) await editor.current.insertImage(file, file.name);
      doc.setMessage(files.length > 1 ? `已插入 ${files.length} 张图片` : '已插入图片');
    } catch (error) {
      doc.setMessage(String(error));
    } finally {
      importingImageRef.current = false;
      setImportingImage(false);
    }
  };
  const toolbar: [string, MarkLyraCommand, IconName][] = [
    ['粗体', { type: 'format', style: 'strong' }, 'bold'],
    ['斜体', { type: 'format', style: 'em' }, 'italic'],
    ['表格', { type: 'insertTable' }, 'table'],
    ['代码', { type: 'codeBlock' }, 'code'],
    ['公式', { type: 'mathBlock' }, 'formula'],
    ['查找', { type: 'find' }, 'search'],
    ['源码', { type: 'toggleSource' }, 'source'],
  ];
  return (
    <div
      className="shell"
      data-native-chrome={chrome.native}
      data-native-overlay={nativeOverlay}
      data-titlebar={chrome.native ? chrome.titlebar : undefined}
      data-fullscreen={fullscreen}
      data-settings-page={(preferencesOpen && preferencesEmbedded) || undefined}
      data-theme-name={themeSystem.presented}
      data-theme-loading={themeSystem.working || undefined}
      style={themeSystem.appearance as CSSProperties}
    >
      {chrome.native && nativeOverlay && !fullscreen && !webTitlebar && (
        <div className="native-titlebar-drag" data-tauri-drag-region="" />
      )}
      {webTitlebar && (
        <Titlebar
          title={doc.file ? filename(doc.file.path) : '未命名'}
          dirty={doc.dirty}
          hasFile={!!doc.file}
          onRename={rename.canRename ? openRename : undefined}
          onHome={homeVisible ? undefined : closeDocument}
          renaming={rename.state !== null}
          sidebarOpen={sidebar}
          outlineOpen={outlinePanelOpen}
          aiOpen={aiPanelOpen}
          onSidebar={() => setSidebar((visible) => !visible)}
          onOutline={() => {
            setDetailsMode('outline');
            setAiPanelOpen(false);
            setOutlinePanelOpen((open) => !open);
          }}
          onAi={toggleAiPanel}
          sourceMode={viewMode === 'source'}
          onExitSource={() => void command({ type: 'toggleSource' })}
          settingsOpen={preferencesOpen && preferencesEmbedded}
          fullscreen={fullscreen}
          contentLeft={titleBounds.left}
          contentRight={titleBounds.right}
          sidebarWidth={sidebar ? sidebarWidth : 0}
          disabled={doc.working || !ready}
          onError={doc.setMessage}
        />
      )}
      {rename.state && (
        <DocumentNamePopover
          platform={webTitlebar ? 'windows' : 'mac'}
          state={rename.state}
          onCommit={(name) => void rename.commit(name)}
          onCancel={rename.cancel}
          onEdit={rename.clearError}
        />
      )}
      {!chrome.native && (
        <header className="toolbar">
          <button
            type="button"
            className="icon-button"
            title="切换侧栏"
            onClick={() => setSidebar(!sidebar)}
            aria-label="切换侧栏"
            aria-expanded={sidebar}
          >
            <Icon name="sidebar" />
          </button>
          <div
            className="document-title"
            title={doc.file ? displayPath(doc.file.path) : '未命名文档'}
          >
            {doc.file ? filename(doc.file.path) : '未命名'}
            {doc.dirty && (
              <span className="document-dirty" title="未保存">
                {' •'}
              </span>
            )}
          </div>
          <span className="toolbar-spacer" />
          <button
            type="button"
            className="icon-button"
            title="查找文档"
            aria-label="查找文档"
            disabled={!ready || doc.working}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void command({ type: 'find' })}
          >
            <Icon name="search" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="格式工具"
            aria-label="格式工具"
            aria-pressed={preferences.formatToolbar}
            onClick={() =>
              setPreferences((value) => ({ ...value, formatToolbar: !value.formatToolbar }))
            }
          >
            <Icon name="format" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="新建窗口"
            aria-label="新建窗口"
            disabled={!desktopAvailable || !ready || creatingWindow || doc.working || !!doc.pending}
            onClick={() => void newWindow()}
          >
            <Icon name="newWindow" />
          </button>
          <button
            type="button"
            className="tool-button"
            title="打开文档"
            aria-label="打开"
            disabled={doc.working || !ready}
            onClick={() => action('open')}
          >
            <Icon name="open" />
          </button>
          <button
            type="button"
            className="tool-button"
            title="保存文档"
            aria-label="保存"
            disabled={doc.working || !ready}
            onClick={() => action('save')}
          >
            <Icon name="save" />
          </button>
          <button
            type="button"
            disabled={
              exporter.working || doc.working || !!doc.pending || !ready || !desktopAvailable
            }
            className="icon-button"
            aria-label="导出 HTML"
            title="导出 HTML"
            onClick={() => void exporter.run('export-html')}
          >
            <Icon name="export" />
          </button>
          <button
            type="button"
            disabled={
              exporter.working || doc.working || !!doc.pending || !ready || !desktopAvailable
            }
            className="icon-button"
            aria-label="打印预览"
            title="打印预览 / PDF"
            onClick={() => void exporter.run('print-preview')}
          >
            <Icon name="print" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="AI 助手"
            aria-label="AI 助手"
            aria-pressed={aiPanelOpen}
            onClick={toggleAiPanel}
          >
            <Icon name="ai" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="文档目录"
            title="显示/隐藏文档目录"
            aria-pressed={outlinePanelOpen}
            disabled={!ready || doc.working}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDetailsMode('outline');
              setAiPanelOpen(false);
              setOutlinePanelOpen((open) => !open);
            }}
          >
            <ShellGlyph name="outline" />
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className="icon-button"
            aria-label="偏好设置"
            title="偏好设置"
            disabled={!ready || doc.working || !!doc.pending}
            onClick={(event) => {
              if (openPreferences(false)) event.currentTarget.focus();
            }}
          >
            <Icon name="settings" />
          </button>
        </header>
      )}
      <div
        className="workspace"
        inert={preferencesOpen && preferencesEmbedded}
        aria-hidden={(preferencesOpen && preferencesEmbedded) || undefined}
        data-details-open={detailsLayout.present || undefined}
        style={
          {
            '--document-details-width': `${detailsLayout.width}px`,
            '--document-details-transition': `${documentDetailsTransitionMs}ms`,
          } as CSSProperties
        }
      >
        <aside
          ref={sidebarElement}
          data-file-view={preferences.fileSidebar.view}
          data-sidebar-mode={tab}
          className="sidebar"
          hidden={!sidebar}
          style={{ width: sidebarWidth }}
        >
          {chrome.native ? (
            <SidebarHeader
              mode={tab}
              change={(mode) => {
                setTab(mode);
                if (mode !== 'search')
                  void editor.current
                    ?.focus()
                    .catch((error: unknown) =>
                      actions.current.doc.setMessage(`恢复编辑焦点失败：${String(error)}`),
                    );
              }}
              disabled={doc.working || !ready}
            />
          ) : (
            <div className="sidebar-tabs">
              <button type="button" aria-pressed={tab === 'files'} onClick={() => setTab('files')}>
                文件
              </button>
              <button
                type="button"
                aria-pressed={tab === 'search'}
                onClick={() => setTab('search')}
              >
                搜索
              </button>
            </div>
          )}
          <div className="sidebar-panel">
            <WorkspaceSidebar
              filePreferences={preferences.fileSidebar}
              onFilePreferencesChange={(value) =>
                setPreferences((current) => ({ ...current, fileSidebar: value }))
              }
              compact={chrome.native}
              mode={tab === 'search' ? 'search' : 'files'}
              onModeChange={setTab}
              onNewDocument={() => void newWindow('document')}
              prepareEntryOpenNew={async () => {
                const active = editor.current;
                const before = actions.current.doc;
                if (!active || before.working || before.pending || active.isComposing)
                  throw Error('请先完成当前文稿操作或输入法候选');
                const owner = before.getOwner();
                await active.flush();
                const latest = actions.current.doc;
                if (
                  editor.current !== active ||
                  latest.getOwner() !== owner ||
                  latest.working ||
                  latest.pending ||
                  active.isComposing ||
                  active.hasPendingChanges
                )
                  throw Error('当前文稿已更改，请重试新窗口操作');
                await trackSession();
                if (
                  editor.current !== active ||
                  actions.current.doc.getOwner() !== owner ||
                  active.isComposing ||
                  active.hasPendingChanges
                )
                  throw Error('新窗口准备期间文稿已更改，请重试');
                return {
                  documentId: latest.getFile()?.id ?? null,
                  text: active.getMarkdown(),
                  savedText: latest.getFile()?.text ?? '',
                };
              }}
              onDuplicateCompleted={async (workspaceId, relativePath, sourceIsCurrent) => {
                const active = editor.current;
                const current = actions.current.doc;
                if (!active || current.working || current.pending || active.isComposing)
                  return false;
                await active.flush();
                if (
                  !sourceIsCurrent &&
                  (current.getFile() || current.hasUnsavedChanges() || active.hasPendingChanges)
                )
                  return true;
                const previousId = current.getFile()?.id;
                await current.request({ kind: 'workspace', workspaceId, relativePath });
                return (
                  !actions.current.doc.pending && actions.current.doc.getFile()?.id !== previousId
                );
              }}
              prepareCreatedDocument={async () => {
                createdDocumentFocus.current = null;
                const active = editor.current;
                const before = actions.current.doc;
                if (!active || before.working || before.pending || active.isComposing)
                  throw new Error('请先完成当前文档操作或输入法候选');
                const owner = before.getOwner();
                await active.flush();
                const latest = actions.current.doc;
                if (
                  editor.current !== active ||
                  latest.getOwner() !== owner ||
                  latest.working ||
                  latest.pending ||
                  active.isComposing
                )
                  throw new Error('当前文档状态已更改，请重试新建操作');
                createdDocumentFocus.current = {
                  editor: active,
                  owner,
                  id: latest.getFile()?.id ?? null,
                };
                if (latest.getFile() || latest.hasUnsavedChanges() || active.hasPendingChanges)
                  return undefined;
                const revision = active.revision;
                return async (workspaceId, relativePath) => {
                  const origin = document.activeElement;
                  const mayLoad = () => {
                    const focused = document.activeElement;
                    return !(
                      focused !== origin &&
                      focused instanceof HTMLElement &&
                      focused.isConnected &&
                      focused.closest('.shell') &&
                      focused.matches(
                        'input, textarea, button, select, a[href], [tabindex], [contenteditable="true"]',
                      )
                    );
                  };
                  if (editor.current !== active || actions.current.doc.getOwner() !== owner)
                    throw new Error('当前文档已更换，已保留新文件');
                  const created = await workspaces.open(workspaceId, relativePath);
                  if (
                    editor.current !== active ||
                    actions.current.doc.getOwner() !== owner ||
                    !mayLoad()
                  ) {
                    await documents.close(created.id);
                    throw new Error('当前文档已更换，已保留新文件');
                  }
                  if (!(await actions.current.doc.initialize(created, revision, mayLoad)))
                    throw new Error('创建期间已有输入或文档操作，已保留当前文稿和新文件');
                  createdDocumentFocus.current = {
                    editor: active,
                    owner: actions.current.doc.getOwner(),
                    id: created.id,
                  };
                };
              }}
              onCreatedDocumentNamed={async (namingInput: HTMLInputElement | null = null) => {
                const ticket = createdDocumentFocus.current;
                createdDocumentFocus.current = null;
                if (
                  !ticket ||
                  editor.current !== ticket.editor ||
                  actions.current.doc.getOwner() !== ticket.owner ||
                  (actions.current.doc.getFile()?.id ?? null) !== ticket.id ||
                  ticket.editor.isComposing
                )
                  return;
                const focused = document.activeElement;
                if (
                  focused !== namingInput &&
                  focused instanceof HTMLElement &&
                  focused.isConnected &&
                  focused.closest('.shell') &&
                  focused.matches(
                    'input, textarea, button, select, a[href], [tabindex], [contenteditable="true"]',
                  )
                )
                  return;
                await ticket.editor.focus();
              }}
              shouldOpenDirectoryWindow={async () => {
                const active = editor.current;
                const current = actions.current.doc;
                if (!active || current.working || current.pending || active.isComposing)
                  throw new Error('请先完成当前文档操作或输入法候选');
                await active.flush();
                const latest = actions.current.doc;
                if (
                  editor.current !== active ||
                  latest.working ||
                  latest.pending ||
                  active.isComposing
                )
                  throw new Error('当前文档状态已更改，请重试目录操作');
                return latest.getFile() !== null || latest.hasUnsavedChanges();
              }}
              initialWorkspace={initialWorkspace}
              onWorkspaceChange={(workspace) => {
                workspaceIdentity.current = workspace;
                setSessionWorkspace(workspace?.id ?? null);
              }}
              chooseRequest={chooseRequest}
              disabled={doc.working || !ready}
              restoring={!startupSettled && !startupFailed}
              activePath={doc.file?.path}
              activeSource={doc.snapshot}
              activeSavedSource={doc.file?.text}
              savedPreview={doc.savedPreview}
              filePlatform={runtime?.platform ?? 'browser'}
              onOpenDocument={(workspaceId, relativePath, match) => {
                void doc.request({ kind: 'workspace', workspaceId, relativePath, match });
              }}
              onCurrentDocument={(match) => {
                if (match) {
                  const active = editor.current;
                  const owner = doc.getOwner();
                  if (!active) return;
                  void active
                    .flush()
                    .then((source) => {
                      if (editor.current !== active || actions.current.doc.getOwner() !== owner)
                        return;
                      if (!searchPositionIsCurrent(source, match)) {
                        actions.current.doc.setMessage(STALE_SEARCH_POSITION);
                        return;
                      }
                      return command(
                        {
                          type: 'sourcePosition',
                          line: match.line,
                          column: match.column,
                        },
                        false,
                        source,
                      );
                    })
                    .catch((error: unknown) => doc.setMessage(String(error)));
                } else
                  void editor.current
                    ?.focus()
                    .catch((error: unknown) => doc.setMessage(String(error)));
              }}
            />
          </div>
        </aside>
        {sidebar && (
          <SidebarResize
            native={chrome.native}
            hide={() => setSidebar(false)}
            width={sidebarWidth}
            trailingWidth={
              detailsLayout.present ? detailsLayout.width + (chrome.native ? 16 : 20) : 0
            }
            onDragWidthChange={setSidebarDragWidth}
            direct
            change={(sidebarWidth) => setPreferences((value) => ({ ...value, sidebarWidth }))}
          />
        )}
        <main
          ref={documentAreaElement}
          className="document-area runtime-area"
          aria-busy={!ready || doc.working}
        >
          <ExternalChangeNotice
            sync={disk}
            busy={doc.working || !!doc.pending}
            saveAs={() => void doc.save(true)}
          />
          <fieldset
            className="format-toolbar"
            hidden={chrome.native || !preferences.formatToolbar}
            aria-label="格式工具"
          >
            <button
              type="button"
              aria-label={importingImage ? '插入中…' : '本地图片'}
              disabled={!ready || doc.working || importingImage || !desktopAvailable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => imageInput.current?.click()}
            >
              <Icon name="image" />
              <span>{importingImage ? '插入中…' : '本地图片'}</span>
            </button>
            <input
              ref={imageInput}
              type="file"
              aria-label="选择本地图片"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void insertImages(files);
              }}
            />
            <CommandMenu
              disabled={!ready || doc.working}
              execute={(value) => void command(value)}
            />
            {toolbar.map(([label, item, icon]) => (
              <button
                type="button"
                key={label}
                title={label}
                aria-label={label}
                onMouseDown={(event) => event.preventDefault()}
                disabled={!ready}
                onClick={() => void command(item)}
              >
                <Icon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </fieldset>
          {applicationSystem.error && (
            <div role="alert">
              应用偏好尚未就绪：{applicationSystem.error}
              <button type="button" onClick={applicationSystem.retry}>
                重试
              </button>
            </div>
          )}
          <div className="runtime-editor-mount">
            {runtime && doc.recoveryReady && markdownSystem.initial && applicationSystem.value ? (
              <MarkLyraMarkdownEditor
                runtimeUrl={runtime.url}
                markdown={doc.initial}
                startupPreferences={startupEditorConfiguration(applicationSystem.value.values)}
                preferences={appliedEditorPreferences}
                markdownPreferences={{
                  indentSize: markdownSystem.initial.indentSize,
                  prettyIndent: markdownSystem.initial.prettyIndent,
                  headingStyle: markdownSystem.initial.headingStyle ?? 0,
                  ulStyle: markdownSystem.initial.ulStyle ?? 0,
                  olStyle: markdownSystem.initial.olStyle ?? 0,
                }}
                configuration={{
                  sourceBOM: 'text',
                  nativeMenus: runtime.nativeMenus,
                  platform: runtime.platform,
                  locale: 'zh-Hans',
                  theme: builtinTheme(theme),
                }}
                onReady={(instance) => {
                  editor.current = instance;
                  const initialRevision = instance.revision;
                  void (async () => {
                    if (desktopAvailable) {
                      try {
                        const boot = await windowStartup.take();
                        if (editor.current !== instance) return;
                        if (boot.document) {
                          await actions.current.doc.initialize(
                            boot.document,
                            initialRevision,
                            undefined,
                            boot.draft?.text,
                          );
                        }
                        if (editor.current !== instance) return;
                        if (boot.workspace) setInitialWorkspace(boot.workspace);
                        if (boot.warnings.length)
                          actions.current.doc.setMessage(boot.warnings.join('\n'));
                      } catch (error) {
                        if (editor.current === instance)
                          actions.current.doc.setMessage(`启动恢复未完成：${String(error)}`);
                      }
                    }
                    if (editor.current === instance) {
                      try {
                        await actions.current.doc.initializeImageContext(instance);
                      } catch (error) {
                        actions.current.doc.setMessage(`图片暂存尚未就绪：${String(error)}`);
                      }
                      await focusStartup(instance, true);
                      if (editor.current === instance) {
                        setStartupSettled(true);
                        setOsOpenReady(true);
                      }
                    }
                  })();
                }}
                onChange={doc.change}
                onStatisticsInvalidated={statistics.invalidate}
                onViewModeChange={setViewMode}
                onScrollAwayFromTopChange={setScrolledDown}
                onLinkHintPreferenceChange={(suppressed) => {
                  linkHintPreferenceWork.current = linkHintPreferenceWork.current.then(async () => {
                    try {
                      await applicationPreferences.putFromEditor('noHintForOpenLink', suppressed);
                    } catch (error) {
                      doc.setMessage(`链接提示偏好保存结果未确认：${String(error)}`);
                      applicationSystem.retry();
                    }
                  });
                }}
                onOutlineChange={setOutline}
                onCurrentHeadingChange={setCurrentHeading}
                onThemeAppearanceChange={themeSystem.receiveAppearance}
                onError={(error) => doc.setMessage(error.message)}
                host={{
                  ...desktopContextHost,
                  onAction: (value) => actions.current.action(value),
                  images: documentImages,
                }}
              />
            ) : startupFailed ? (
              // A start that cannot finish says so and offers the retry; while it is only
              // slow, the document skeleton below stands in for the page.
              <div className="editor-loading">
                {!doc.recoveryReady ? (
                  <>
                    <p>草稿保护未能就绪</p>
                    <button type="button" onClick={doc.retryRecovery}>
                      重新连接草稿保护
                    </button>
                  </>
                ) : markdownSystem.error ? (
                  <>
                    <p>{markdownSystem.error}</p>
                    <button type="button" onClick={markdownSystem.retry}>
                      重试读取设置
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          {ready && scrolledDown && (
            <button
              type="button"
              className="document-scroll-top"
              aria-label="回到顶部"
              title="回到顶部"
              disabled={doc.working}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void command({ type: 'scrollToTop' })}
            >
              <Icon name="scrollTop" />
            </button>
          )}
          {chrome.native &&
            ready &&
            !homeVisible &&
            viewMode !== 'source' &&
            (!fullscreen || preferences.alwaysShowWordCount) && (
              <DocumentStatistics
                statistics={statistics.value}
                unit={preferences.statisticsUnit}
                onUnit={(unit) =>
                  setPreferences((current) => ({ ...current, statisticsUnit: unit }))
                }
              />
            )}
          {!startupSettled && !startupFailed && <DocumentSkeleton />}
          {homeVisible && (
            <HomeScreen
              mac={runtime?.platform === 'macos'}
              onNew={startWriting}
              onOpenNote={() => openQuickOpen('note')}
              onOpenRecent={(id) => void doc.request({ kind: 'recent', id })}
              onViewAll={() => menuHandler.current('recent-files')}
            />
          )}
        </main>
        <DocumentDetailsPanel
          open={outlinePanelOpen || aiPanelOpen}
          mode={detailsMode}
          elementRef={detailsElement}
          width={detailsLayout.width}
          minimum={detailsLayout.minimum}
          maximum={detailsLayout.maximum}
          resize={detailsLayout.resize}
          finishTransition={detailsLayout.finishTransition}
        >
          <div hidden={detailsMode !== 'ai'} style={{ height: '100%', minHeight: 0 }}>
            <AiPanel
              open={aiPanelOpen}
              requestAttention={() => {
                setDetailsMode('ai');
                setAiPanelOpen(true);
                setOutlinePanelOpen(false);
              }}
              workspace={workspaceIdentity.current}
              currentPath={doc.file?.path ?? null}
              hasDocument={doc.file !== null || doc.snapshot.trim() !== ''}
              openDocument={(relativePath, scopeId) => {
                const workspaceId = scopeId ?? workspaceIdentity.current?.id;
                if (workspaceId)
                  void actions.current.doc.request({
                    kind: 'workspace',
                    workspaceId,
                    relativePath,
                  });
              }}
              snapshot={async () => {
                const active = editor.current,
                  current = actions.current.doc,
                  owner = current.getOwner();
                if (!active || active.isComposing || current.working || current.pending)
                  throw new Error('请先完成当前输入或文档操作');
                await nativeCommandBridge.current?.synchronize();
                await editorCommandWork.current;
                const text = await active.flush();
                if (
                  editor.current !== active ||
                  actions.current.doc.getOwner() !== owner ||
                  actions.current.doc.working ||
                  actions.current.doc.pending ||
                  active.isComposing
                )
                  throw new Error('当前文档已变化，请重新发送');
                const file = actions.current.doc.getFile();
                const dirty = actions.current.doc.hasUnsavedChanges();
                const oversized = new TextEncoder().encode(text).length > 96 * 1024;
                if (oversized && (!file || dirty))
                  throw new Error('当前正文较大，请先保存文档，或移除当前正文上下文后发送');
                return {
                  documentId: file?.id ?? null,
                  path: file?.path ?? null,
                  dirty,
                  text: oversized
                    ? '[正文较大，未直接嵌入。请调用 editor_read_document 读取完整文档。]'
                    : text,
                };
              }}
              beforeWrite={async (targetPath) => {
                const active = editor.current,
                  current = actions.current.doc,
                  owner = current.getOwner();
                if (!active || active.isComposing || current.working || current.pending)
                  throw new Error('请先完成当前输入或文档操作');
                await nativeCommandBridge.current?.synchronize();
                await editorCommandWork.current;
                await active.flush();
                if (
                  editor.current !== active ||
                  actions.current.doc.getOwner() !== owner ||
                  actions.current.doc.working ||
                  actions.current.doc.pending ||
                  active.isComposing
                )
                  throw new Error('当前输入或文档已变化，请重新批准操作');
                const normalize = (path: string) =>
                  path
                    .replaceAll('\\', '/')
                    .normalize('NFC')
                    .split('/')
                    .filter((part) => part !== '.')
                    .join('/')
                    .replace(/\/$/, '')
                    .toLowerCase();
                const currentPath = actions.current.doc.getFile()?.path;
                const touchesCurrent =
                  !targetPath ||
                  (currentPath &&
                    (normalize(currentPath) === normalize(targetPath) ||
                      normalize(currentPath).startsWith(`${normalize(targetPath)}/`)));
                if (touchesCurrent && actions.current.doc.hasUnsavedChanges())
                  throw new Error('请先保存当前文档，再批准 AI 对它的修改');
              }}
              changed={() => window.dispatchEvent(new Event('marklyra-ai-files-changed'))}
              settings={() => {
                sessionStorage.setItem('marklyra.settings.ai', 'true');
                actions.current.openPreferences();
              }}
              chooseFolder={() => {
                setSidebar(true);
                setTab('files');
                setChooseRequest((n) => n + 1);
              }}
            />
          </div>
          {detailsMode === 'outline' && (
            <OutlinePanel
              key={doc.file?.id ?? 'untitled'}
              entries={outline}
              collapsible={applicationSystem.value?.values.can_collapse_outline_panel !== false}
              onCollapsibleChange={async (value) => {
                try {
                  await applicationPreferences.putFromEditor('can_collapse_outline_panel', value);
                } catch (error) {
                  doc.setMessage(`大纲偏好保存结果未确认：${String(error)}`);
                }
              }}
              currentId={currentHeading}
              disabled={!outlinePanelOpen || !ready || doc.working}
              jump={async (id) => {
                await command({ type: 'jumpToBlock', id, preserveSelection: true });
                try {
                  await editor.current?.focus();
                } catch (error) {
                  doc.setMessage(`恢复编辑焦点失败：${String(error)}`);
                }
              }}
            />
          )}
        </DocumentDetailsPanel>
      </div>
      {quickOpen && (
        <QuickOpen
          initialTab={quickOpen.tab}
          items={quickItems({
            mac: runtime?.platform === 'macos',
            hasDocument: !homeVisible,
            canRename: rename.canRename,
            availableFormats: [
              ...(exporter.capabilities && exporter.capabilities.pdf !== 'none' ? ['pdf'] : []),
              'html',
              ...(exporter.capabilities?.image ? ['image'] : []),
              ...(exporter.capabilities?.formats ?? []),
            ],
            run: (action) => menuHandler.current(action),
            openAiSettings: () => {
              sessionStorage.setItem('marklyra.settings.ai', 'true');
              actions.current.openPreferences();
            },
          })}
          notes={quickNotes?.items ?? null}
          {...(quickNotes?.hint ? { notesHint: quickNotes.hint } : {})}
          onClose={closeQuickOpen}
        />
      )}
      <NoticeHost />
      {markdownSystem.initial && markdownSystem.error && (
        <div
          role="alert"
          id="markdown-preferences-sync-status"
          className="notice notice-error native-document-notice"
        >
          {markdownSystem.error}{' '}
          <button
            type="button"
            className="notice-action"
            disabled={markdownSystem.working}
            onClick={markdownSystem.retry}
          >
            重试同步
          </button>
        </div>
      )}
      {!chrome.native && (
        <footer className="statusbar">
          <span
            className="document-status"
            title={doc.message || (doc.file ? displayPath(doc.file.path) : '未命名文档')}
          >
            {doc.message || (doc.dirty ? '未保存更改' : doc.file ? '已保存' : '未命名文档')}
          </span>
          {desktopAvailable && (
            <>
              <button
                type="button"
                disabled={doc.working || !!doc.pending || !ready}
                title="最近文件"
                onClick={(event) => {
                  if (editor.current?.isComposing) {
                    doc.setMessage('请先完成输入法候选');
                    return;
                  }
                  event.currentTarget.focus();
                  setRecoveryOpen(false);
                  setRecentOpen(true);
                }}
              >
                <Icon name="history" />
                <span className="sr-only">最近文件</span>
              </button>
              <button
                type="button"
                disabled={doc.working || !!doc.pending || !ready}
                title="恢复草稿"
                onClick={(event) => {
                  event.currentTarget.focus();
                  setRecentOpen(false);
                  setRecoveryOpen(true);
                }}
              >
                <Icon name="recovery" />
                <span className="sr-only">恢复草稿</span>
              </button>
            </>
          )}
          {disk.notice && disk.dismissed && (
            <button type="button" onClick={disk.show}>
              查看磁盘变化
            </button>
          )}
          {doc.file && (
            <button
              type="button"
              disabled={disk.checking || doc.working}
              onClick={disk.check}
              title={
                disk.watchFallback
                  ? '自动通知不可用；仍会定期检查文件变化'
                  : '检查外部程序对文件的修改'
              }
            >
              <Icon name="refresh" />
              <span className="sr-only">{disk.checking ? '检查中…' : '检查文件变化'}</span>
            </button>
          )}
          {(doc.working || exporter.working) && (
            <span>{doc.working ? '处理中…' : '准备导出…'}</span>
          )}
          {doc.file && <span className="document-encoding">{doc.file.encoding}</span>}
          <StatisticsStatus
            statistics={statistics}
            unit={preferences.statisticsUnit}
            open={statisticsOpen}
            closing={closingPanel}
            setOpen={(open) => {
              if (!open) {
                void dismissAuxiliaryPanel();
                return;
              }
              if (closingPanelRef.current) return;
              if (open) {
                panelEditorOrigin.current.statistics =
                  document.activeElement === editor.current?.element;
                setPreferencesOpen(false);
                setRecentOpen(false);
                setRecoveryOpen(false);
              }
              setStatisticsOpen(open);
            }}
          />
        </footer>
      )}
      {settingsEffectNotice > 0 && (
        <div className="settings-effect-notice" role="status" aria-live="polite">
          <div>
            <strong>设置已保存</strong>
            <p>这些更改将在新建窗口或重启应用后生效。</p>
          </div>
          <button
            type="button"
            aria-label="关闭设置提示"
            onClick={() => setSettingsEffectNotice(0)}
          >
            ×
          </button>
        </div>
      )}
      {preferencesOpen &&
        !doc.pending &&
        preferencesEmbedded &&
        (preferencesReady ? (
          <PreferencesWindow
            embedded
            sidebarWidth={sidebarWidth}
            onSidebarWidthChange={(sidebarWidth) =>
              setPreferences((value) => ({ ...value, sidebarWidth }))
            }
            onSidebarDragWidthChange={setSidebarDragWidth}
            dark={themeSystem.dark}
            sidebarBackground={themeSystem.appearance?.['--marklyra-sidebar-bg']}
            closeRequest={preferencesCloseRequest}
            onClose={finishPreferencesPage}
            onDeferredChange={() => setSettingsEffectNotice((value) => value + 1)}
            onFailure={(error) => {
              doc.setMessage(`设置未完成：${error.message}`);
              if (preferencesQuit.current) {
                preferencesQuit.current = null;
                cancelApplicationQuit();
              }
            }}
          />
        ) : (
          <section
            className="preferences-page preferences-loading"
            aria-label="设置"
            aria-busy="true"
          >
            <SettingsSkeleton sidebarWidth={sidebarWidth} />
          </section>
        ))}
      {preferencesOpen && !doc.pending && !preferencesEmbedded && (
        <PreferencesPanel
          value={preferences}
          update={setPreferences}
          theme={theme}
          themes={themeSystem.catalog.themes.map((entry) => entry.id)}
          setTheme={changeTheme}
          autosave={autosave.enabled}
          setAutosave={autosave.setEnabled}
          desktop={desktopAvailable}
          closing={closingPanel}
          close={() => void dismissAuxiliaryPanel()}
        />
      )}
      {recentOpen && (
        <RecentFilesPanel
          close={() => setRecentOpen(false)}
          open={(id) => {
            setRecentOpen(false);
            void doc.request({ kind: 'recent', id });
          }}
        />
      )}
      {recoveryOpen && (
        <RecoveryPanel
          beforeClose={async (target, signal) => {
            const instance = editor.current;
            const owner = actions.current.doc.getOwner();
            recoveryCloseDeferred.current = false;
            const check = () => {
              if (signal.aborted) throw new Error('关闭已取消');
              const current = actions.current;
              if (
                !instance ||
                editor.current !== instance ||
                current.doc.getOwner() !== owner ||
                current.doc.working ||
                current.doc.pending ||
                current.preferencesOpen ||
                current.statisticsOpen ||
                instance.isComposing
              )
                throw new Error('请先完成当前文档操作或输入法候选');
            };
            const foreground = () =>
              desktopAvailable ? editorWindows.isFocused() : Promise.resolve(document.hasFocus());
            check();
            const initiallyForeground = await foreground();
            check();
            if (!initiallyForeground) {
              recoveryCloseDeferred.current = true;
              return;
            }
            if (
              target &&
              target !== instance?.element &&
              target !== document.body &&
              target !== document.documentElement &&
              target.isConnected &&
              target.getClientRects().length > 0 &&
              !target.matches(':disabled, [inert]')
            ) {
              target.focus();
              if (document.activeElement !== target) throw new Error('原输入位置暂时无法接收焦点');
            } else {
              await instance?.focus();
            }
            check();
            const stillForeground = await foreground();
            check();
            recoveryCloseDeferred.current = !stillForeground;
          }}
          close={(focusHandled = false) => {
            modalFocusHandled.current = focusHandled && !recentOpen && !doc.pending;
            if (modalFocusHandled.current)
              startupFocusDeferred.current = recoveryCloseDeferred.current;
            setRecoveryOpen(false);
          }}
          report={doc.setMessage}
          restore={(draft, associate) =>
            void doc.request({ kind: 'recover', id: draft.id, version: draft.version, associate })
          }
        />
      )}
      {doc.pending && (
        <div className="modal-backdrop">
          <section
            ref={unsavedPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <h2 id="unsaved-title">保存当前更改？</h2>
            <p>当前文稿有未保存的修改。保存后继续，或放弃修改；取消会保留当前文稿。</p>
            <div>
              <button
                type="button"
                disabled={doc.working || cancellingDocument}
                onClick={() => void cancelDocumentAction()}
              >
                取消
              </button>
              <button
                type="button"
                disabled={doc.working || cancellingDocument}
                onClick={() => void doc.discard()}
              >
                放弃修改
              </button>
              <button
                type="button"
                disabled={doc.working || cancellingDocument}
                autoFocus
                onClick={() => void doc.saveAndContinue()}
              >
                保存后继续
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

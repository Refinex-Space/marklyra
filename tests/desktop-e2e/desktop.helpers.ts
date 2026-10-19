export interface MockDocument {
  id: string;
  path: string;
  text: string;
  encoding: string;
}
export interface MockCall {
  command: string;
  args: Record<string, unknown>;
}
export interface DesktopMock {
  exportPreferences: {
    schemaVersion: 1;
    revision: number;
    html: Record<string, unknown>;
    pdf: Record<string, unknown>;
    image?: Record<string, unknown>;
    pandocPath?: string;
  };
  exportPreferencesError: string | null;
  formatCapabilities?: {
    pandoc: { status: string; path: string | null; version: string | null; message: string };
    formats: string[];
    importExtensions: string[];
    image: boolean;
  };
  selectedPandocPath?: string | null;
  importedDocument?: MockDocument;
  applicationPreferences: {
    schemaVersion: 1;
    revision: number;
    values: Record<string, boolean | number | string>;
  };
  markdownPreferences: {
    schemaVersion: 1;
    revision: number;
    indentSize: -1 | 0 | 2 | 3 | 4 | 5;
    prettyIndent: boolean;
  };
  filePreferences: {
    revision: number;
    defaultExtension: string;
    saveFileOnSwitch: boolean;
    noRecentFiles: boolean;
    alwaysConfirmsChanges: boolean;
  };
  filePreferencesError: string | null;
  calls: MockCall[];
  holdChanged: boolean;
  holdDirty: boolean;
  holdStateResponses: boolean;
  heldStateResponses: number;
  releaseStateResponses(): void;
  deferSave: boolean;
  deferOpen: boolean;
  deferClose: boolean;
  pendingSaves: number;
  pendingOpens: number;
  pendingCloses: number;
  exportError: string | null;
  deferExport: boolean;
  finishExport(): void;
  nextDocument: MockDocument;
  startupBoot: {
    document: MockDocument | null;
    workspace: { id: string; name: string; path: string } | null;
    warnings: string[];
  };
  finishSave(): void;
  finishOpen(): void;
  finishClose(): void;
  emitMenu(action: string): void;
  emitEvent(event: string, payload: unknown): void;
  emitTarget(label: string, event: string, payload: unknown): void;
}
export type TestWindow = Window & typeof globalThis & { __desktopMock: DesktopMock };

// Runs the actual React App against an in-memory Tauri IPC double.
// These tests do not validate native dialogs, filesystem writes, WKWebView or system IME.
export function installMock(
  configuration:
    | string
    | { label?: string; nativeChrome?: boolean; titlebar?: 'appkit' | 'web' } = 'main',
) {
  if (window !== window.top) return;
  const windowLabel =
    typeof configuration === 'string' ? configuration : (configuration.label ?? 'main');
  const nativeChrome = typeof configuration === 'object' && configuration.nativeChrome === true;
  // 'web' models the Windows host: the WebView draws titlebar, menu entry points and caption buttons.
  const titlebar = typeof configuration === 'object' ? (configuration.titlebar ?? 'appkit') : 'appkit';
  const menuTitles = ['MarkLyra', '文件', '编辑', '段落', '格式', '显示', '主题', '窗口'];
  let serial = 1;
  const callbacks = new Map<number, (event: unknown) => void>();
  const listeners = new Map<
    number,
    { event: string; callback: number; target: { kind: string; label?: string } }
  >();
  const pendingSaves: (() => void)[] = [];
  const pendingOpens: (() => void)[] = [];
  const pendingCloses: (() => void)[] = [];
  const heldResponses: MessageEvent[] = [];
  let finishExport: (() => void) | undefined;
  const mock: DesktopMock = {
    exportPreferences: { schemaVersion: 1, revision: 0, html: {}, pdf: {} },
    exportPreferencesError: null,
    applicationPreferences: { schemaVersion: 1, revision: 0, values: {} },
    markdownPreferences: { schemaVersion: 1, revision: 0, indentSize: 2, prettyIndent: false },
    startupBoot: { document: null, workspace: null, warnings: [] },
    filePreferences: {
      revision: 0,
      defaultExtension: 'md',
      saveFileOnSwitch: false,
      noRecentFiles: false,
      alwaysConfirmsChanges: true,
    },
    filePreferencesError: null,
    calls: [],
    holdChanged: false,
    holdDirty: false,
    holdStateResponses: false,
    heldStateResponses: 0,
    releaseStateResponses() {
      this.holdStateResponses = false;
      this.heldStateResponses = 0;
      for (const event of heldResponses.splice(0))
        window.dispatchEvent(
          new MessageEvent('message', {
            data: event.data,
            source: event.source,
            origin: event.origin,
          }),
        );
    },
    deferSave: false,
    deferOpen: false,
    deferClose: false,
    pendingSaves: 0,
    pendingOpens: 0,
    pendingCloses: 0,
    exportError: null,
    deferExport: false,
    finishExport() {
      finishExport?.();
      finishExport = undefined;
    },
    nextDocument: { id: 'doc-a', path: '/mock/A.md', text: 'Alpha', encoding: 'UTF-8' },
    finishSave() {
      pendingSaves.shift()?.();
      this.pendingSaves = pendingSaves.length;
    },
    finishOpen() {
      pendingOpens.shift()?.();
      this.pendingOpens = pendingOpens.length;
    },
    finishClose() {
      pendingCloses.shift()?.();
      this.pendingCloses = pendingCloses.length;
    },
    emitTarget(label, event, payload) {
      for (const [id, listener] of listeners)
        if (
          listener.event === event &&
          (listener.target.kind === 'Any' || listener.target.label === label)
        )
          callbacks.get(listener.callback)?.({ event, id, payload });
    },
    emitMenu(action) {
      this.emitEvent('menu-action', action);
    },
    emitEvent(event, payload) {
      for (const [id, listener] of listeners)
        if (listener.event === event) callbacks.get(listener.callback)?.({ event, id, payload });
    },
  };
  const preferencesChannel = new BroadcastChannel('mock-application-preferences');
  preferencesChannel.onmessage = (event) => {
    mock.applicationPreferences = event.data;
    mock.emitEvent('application-preferences-changed', event.data);
  };
  const invoke = async (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    mock.calls.push({ command, args });
    if (command === 'register_editor_command_context' || command === 'editor_command_fence')
      return { context: args.context, issued: 0 };
    if (command === 'apply_application_zoom' || command === 'sync_editor_menu_state') return null;
    if (command === 'get_format_capabilities')
      return (
        mock.formatCapabilities ?? {
          pandoc: {
            status: 'missing',
            path: null,
            version: null,
            message: '未检测到Pandoc；不会自动安装',
          },
          formats: [],
          importExtensions: [],
          image: true,
        }
      );
    if (command === 'choose_pandoc_path') {
      if (mock.selectedPandocPath === null) return null;
      const saved = localStorage.getItem('mock-export-preferences');
      const before = saved
        ? (JSON.parse(saved) as DesktopMock['exportPreferences'])
        : mock.exportPreferences;
      if (before.revision !== args.expectedRevision) throw Error('导出设置版本冲突');
      mock.exportPreferences = {
        ...before,
        revision: before.revision + 1,
        pandocPath: mock.selectedPandocPath ?? '/mock/pandoc',
      };
      localStorage.setItem('mock-export-preferences', JSON.stringify(mock.exportPreferences));
      return structuredClone(mock.exportPreferences);
    }
    if (command === 'import_document') {
      if (mock.exportError) throw mock.exportError;
      return structuredClone(
        mock.importedDocument ?? {
          id: 'imported',
          path: '/mock/Imported.md',
          text: 'Imported',
          encoding: 'UTF-8',
        },
      );
    }
    if (command === 'get_export_preferences') {
      if (mock.exportPreferencesError) throw Error(mock.exportPreferencesError);
      const saved = localStorage.getItem('mock-export-preferences');
      if (saved) mock.exportPreferences = JSON.parse(saved);
      return structuredClone(mock.exportPreferences);
    }
    if (command === 'put_export_preferences') {
      if (mock.exportPreferencesError) throw Error(mock.exportPreferencesError);
      const saved = localStorage.getItem('mock-export-preferences');
      const before = saved
        ? (JSON.parse(saved) as DesktopMock['exportPreferences'])
        : mock.exportPreferences;
      if (before.revision !== args.expectedRevision) throw Error('导出设置版本冲突');
      const change = args.change as { key: string; value: Record<string, unknown> | string };
      if (!['export.html', 'export.pdf', 'export.image', 'pandocPath'].includes(change.key))
        throw Error('无效导出设置');
      mock.exportPreferences = {
        ...before,
        revision: before.revision + 1,
        [change.key === 'pandocPath' ? 'pandocPath' : change.key.slice(7)]: structuredClone(
          change.value,
        ),
      };
      localStorage.setItem('mock-export-preferences', JSON.stringify(mock.exportPreferences));
      return structuredClone(mock.exportPreferences);
    }
    if (command === 'get_application_preferences') {
      const saved = localStorage.getItem('mock-application-preferences');
      if (saved) mock.applicationPreferences = JSON.parse(saved);
      return structuredClone(mock.applicationPreferences);
    }
    if (
      command === 'put_application_preferences' ||
      command === 'put_editor_appearance_preference'
    ) {
      const saved = localStorage.getItem('mock-application-preferences');
      const before = saved
        ? (JSON.parse(saved) as DesktopMock['applicationPreferences'])
        : mock.applicationPreferences;
      if (args.expectedRevision !== before.revision) throw Error('stale application preferences');
      const change = args.change as { key: string; value: boolean | number | string };
      const next = {
        ...before,
        revision: before.revision + 1,
        values: { ...before.values, [change.key]: change.value },
      };
      if (change.key === 'wordsPerMinute') next.values.customWordsPerMinute = true;
      if (change.key === 'customWordsPerMinute' && change.value === false)
        next.values.wordsPerMinute = 382;
      localStorage.setItem('mock-application-preferences', JSON.stringify(next));
      mock.applicationPreferences = next;
      preferencesChannel.postMessage(next);
      mock.emitEvent('application-preferences-changed', next);
      return structuredClone(next);
    }
    if (command === 'get_markdown_preferences') return { ...mock.markdownPreferences };
    if (command === 'get_file_preferences') {
      if (mock.filePreferencesError) throw Error(mock.filePreferencesError);
      return { ...mock.filePreferences };
    }
    if (command === 'put_file_preference') {
      if (mock.filePreferencesError) throw Error(mock.filePreferencesError);
      if (args.expectedRevision !== mock.filePreferences.revision) throw Error('文件设置版本冲突');
      const change = args.change as { key: string; value: string | boolean };
      const field = {
        defaultExtension: 'defaultExtension',
        save_file_on_switch: 'saveFileOnSwitch',
        noRecentFiles: 'noRecentFiles',
      }[change.key] as 'defaultExtension' | 'saveFileOnSwitch' | 'noRecentFiles' | undefined;
      if (!field) throw Error('无效文件设置');
      mock.filePreferences = {
        ...mock.filePreferences,
        [field]: change.value,
        revision: mock.filePreferences.revision + 1,
      };
      mock.emitEvent('file-preferences-changed', { ...mock.filePreferences });
      return { ...mock.filePreferences };
    }
    if (command === 'ask_clear_recent_history') return false;
    if (command === 'list_directory_history')
      return { revision: 0, noRecentFiles: false, entries: [] };
    if (command === 'reveal_workspace_directory') return null;
    if (command === 'initialise_editor_chrome')
      return { native: nativeChrome, titlebar, preferencesWindow: nativeChrome };
    if (command === 'list_app_menu') return menuTitles;
    if (command === 'plugin:window|is_maximized') return Reflect.get(window, '__testMaximized') === true;
    if (command === 'editor_runtime_url') return 'http://127.0.0.1:4174/index.html';
    if (command === 'reset_dialog_warnings') return null;
    if (command === 'system_appearance_dark')
      return Reflect.get(window, '__testSystemDark') === true;
    if (command === 'host_platform') return titlebar === 'web' ? 'windows' : 'macos';
    // Legacy browser vectors retain the explicitly unsupported host route.
    if (command === 'prepare_untitled_close') return { kind: 'unsupported' };
    if (command === 'list_theme_catalog')
      return {
        folderPath: '/mock/themes',
        themes: ['marklyra-light', 'marklyra-dark'].map((id) => ({
          id,
          name: id,
          builtin: true,
        })),
      };
    if (command === 'load_theme_styles')
      return {
        token: `theme-${String(args.requestId)}`,
        theme: args.themeId,
        styles: { theme: null, baseUser: null, themeUser: null },
      };
    if (
      command === 'sync_theme_menu' ||
      command === 'accept_theme_styles' ||
      command === 'open_theme_folder' ||
      command === 'open_theme_gallery'
    )
      return null;
    if (command === 'fallback_recovery_context')
      return {
        owner: '00000000-0000-4000-8000-000000000001',
        activeOwners: ['00000000-0000-4000-8000-000000000001'],
        activeLabels: ['main'],
      };
    if (command === 'editor_window_focused') return true;
    if (command === 'get_window_startup') return structuredClone(mock.startupBoot);
    if (command === 'get_startup_preferences')
      return { revision: 0, restoreWhenLaunch: 0, pinFolder: null };
    if (command === 'create_editor_window') return 'editor-00000000-0000-4000-8000-000000000001';
    // Existing document-flow tests acknowledge auxiliary recent metadata writes.
    // The dedicated recent-files helper models persistence, authority and errors.
    if (command === 'remember_recent_file')
      return {
        id: `recent-${String(args.documentId)}`,
        path: mock.nextDocument.path,
        name: mock.nextDocument.path.split('/').at(-1) ?? 'document.md',
        lastOpenedAt: Date.now(),
      };
    if (
      command === 'list_recent_files' ||
      command === 'remove_recent_file' ||
      command === 'clear_recent_files'
    )
      return { revision: 0, entries: [] };
    if (command === 'check_document_change') return { status: 'unchanged' };
    if (command === 'start_document_watch')
      return { status: 'watching', watchId: `watch-${serial++}` };
    if (command === 'stop_document_watch') return true;
    if (command === 'plugin:event|listen') {
      const id = serial++;
      listeners.set(id, {
        event: String(args.event),
        callback: Number(args.handler),
        target: (args.target as { kind: string; label?: string } | undefined) ?? { kind: 'Any' },
      });
      return id;
    }
    if (command === 'plugin:event|unlisten') {
      listeners.delete(Number(args.eventId));
      return null;
    }
    if (command === 'open_document') {
      const result = { ...mock.nextDocument };
      if (mock.deferOpen)
        return new Promise((resolve) => {
          pendingOpens.push(() => resolve(result));
          mock.pendingOpens = pendingOpens.length;
        });
      return result;
    }
    if (command === 'save_document' || command === 'save_document_as') {
      const result = {
        id: String(args.id ?? args.sourceId ?? 'new-document'),
        path: '/mock/A.md',
        text: String(args.text),
        encoding: String(args.encoding ?? 'UTF-8'),
      };
      if (mock.deferSave)
        return new Promise((resolve) => {
          pendingSaves.push(() => resolve(result));
          mock.pendingSaves = pendingSaves.length;
        });
      return result;
    }
    if (command === 'close_document' && mock.deferClose)
      return new Promise((resolve) => {
        pendingCloses.push(() => resolve(null));
        mock.pendingCloses = pendingCloses.length;
      });
    if (
      [
        'save_export_html',
        'open_print_preview',
        'save_export_image',
        'save_export_format',
      ].includes(command)
    ) {
      if (mock.exportError) throw mock.exportError;
      if (mock.deferExport)
        await new Promise<void>((resolve) => {
          finishExport = resolve;
        });
      return command !== 'open_print_preview'
        ? { path: '/mock/A.html', bytes: new TextEncoder().encode(String(args.html)).length }
        : { id: 'preview-test' };
    }
    return null;
  };
  // Delay real runtime messages to exercise transport races, without an App test API.
  window.addEventListener('message', (event) => {
    const message = event.data as {
      protocol?: unknown;
      kind?: unknown;
      payload?: { canonical?: unknown };
    } | null;
    if (!message || message.protocol !== 'marklyra/editor/v1') return;
    if (
      (mock.holdChanged && message.kind === 'changed') ||
      (mock.holdDirty && message.kind === 'dirty')
    )
      event.stopImmediatePropagation();
    if (
      mock.holdStateResponses &&
      message.kind === 'response' &&
      typeof message.payload?.canonical === 'string'
    ) {
      heldResponses.push(event);
      mock.heldStateResponses = heldResponses.length;
      event.stopImmediatePropagation();
    }
  });
  Object.assign(window, {
    isTauri: true,
    __desktopMock: mock,
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label: windowLabel }, currentWebview: { label: windowLabel } },
      invoke,
      transformCallback(callback: (event: unknown) => void) {
        const id = serial++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: {
      unregisterListener(_event: string, id: number) {
        listeners.delete(id);
      },
    },
  });
}

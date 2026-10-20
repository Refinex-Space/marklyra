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
export interface MockExportPreferences {
  schemaVersion: 1;
  revision: number;
  html: Record<string, unknown>;
  pdf: Record<string, unknown>;
  // Groups a test does not mention hold nothing, as on a fresh install.
  general?: Record<string, unknown>;
  image?: Record<string, unknown>;
  formats?: Record<string, Record<string, unknown>>;
  custom?: { id: string; options: Record<string, unknown>; [key: string]: unknown }[];
  pandocPath?: string;
}
type CompleteExportPreferences = Required<MockExportPreferences>;
export interface MockFormatCapabilities {
  pandoc: { status: string; path: string | null; version: string | null; message: string };
  formats: string[];
  writers?: string[];
  importExtensions: string[];
  image: boolean;
  /** Windows hosts write the PDF themselves; macOS hands the page to the print panel. */
  pdf?: 'direct' | 'dialog' | 'none';
  headerFooter?: boolean;
}
export interface DesktopMock {
  exportPreferences: MockExportPreferences;
  exportPreferencesError: string | null;
  /** Makes the next write of export settings fail once with this message. */
  exportPutError?: string | null;
  formatCapabilities?: MockFormatCapabilities;
  selectedPandocPath?: string | null;
  /** The path a native choose-path dialog answers with; `null` cancels the dialog. */
  chosenPath?: string | null;
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
  /** Fails the next rename of the open document's file with this message. */
  renameError: string | null;
  /** Warnings a successful rename reports. */
  renameWarnings: string[];
  /** Warnings a successful export reports alongside its file. */
  exportWarnings: string[];
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
    | { label?: string; nativeChrome?: boolean; titlebar?: 'appkit' | 'web'; home?: boolean } = 'main',
) {
  if (window !== window.top) return;
  const windowLabel =
    typeof configuration === 'string' ? configuration : (configuration.label ?? 'main');
  const nativeChrome = typeof configuration === 'object' && configuration.nativeChrome === true;
  // 'web' models the Windows host: the WebView draws titlebar, menu entry points and caption buttons.
  const titlebar = typeof configuration === 'object' ? (configuration.titlebar ?? 'appkit') : 'appkit';
  // Most specs exercise the editor itself. They start where a person lands after pressing
  // "新建笔记" on the home view; only specs about the home view itself pass `home: true`.
  if (!(typeof configuration === 'object' && configuration.home === true)) {
    new MutationObserver(() => {
      document.querySelector<HTMLButtonElement>('.home-screen .home-action')?.click();
    }).observe(document, { childList: true, subtree: true });
  }
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
    exportPreferences: {
      schemaVersion: 1,
      revision: 0,
      general: {},
      html: {},
      pdf: {},
      image: {},
      formats: {},
      custom: [],
      pandocPath: '',
    },
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
    renameError: null,
    renameWarnings: [],
    exportWarnings: [],
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
      return {
        pdf: 'direct',
        headerFooter: true,
        writers: [],
        ...(mock.formatCapabilities ?? {
          pandoc: {
            status: 'missing',
            path: null,
            version: null,
            message: '未检测到Pandoc；不会自动安装',
          },
          formats: [],
          importExtensions: [],
          image: true,
        }),
      };
    const storedExportPreferences = (): CompleteExportPreferences => {
      const saved = localStorage.getItem('mock-export-preferences');
      const value = saved ? (JSON.parse(saved) as MockExportPreferences) : mock.exportPreferences;
      return {
        general: {},
        image: {},
        formats: {},
        custom: [],
        pandocPath: '',
        ...structuredClone(value),
      };
    };
    const commitExportPreferences = (next: CompleteExportPreferences) => {
      mock.exportPreferences = next;
      localStorage.setItem('mock-export-preferences', JSON.stringify(next));
      mock.emitEvent('export-preferences-changed', structuredClone(next));
      return structuredClone(next);
    };
    if (command === 'choose_pandoc_path') {
      if (mock.selectedPandocPath === null) return null;
      const before = storedExportPreferences();
      if (before.revision !== args.expectedRevision) throw Error('导出设置已由其它窗口修改，请重新打开设置');
      return commitExportPreferences({
        ...before,
        revision: before.revision + 1,
        pandocPath: mock.selectedPandocPath ?? '/mock/pandoc',
      });
    }
    if (command === 'choose_export_path') {
      if (mock.chosenPath === null) return null;
      const before = storedExportPreferences();
      if (before.revision !== args.expectedRevision) throw Error('导出设置已由其它窗口修改，请重新打开设置');
      const target = args.target as { kind: string; format?: string };
      const next = structuredClone(before);
      if (target.kind === 'folder') {
        next.general = {
          ...next.general,
          folder: mock.chosenPath ?? '/mock/exports',
          folderMode: 'custom',
        };
      } else {
        const field = target.kind === 'referenceDoc' ? 'referenceDoc' : 'template';
        const path =
          mock.chosenPath ?? (field === 'referenceDoc' ? '/mock/ref.docx' : '/mock/template.tex');
        const format = String(target.format);
        if (format.startsWith('custom:')) {
          const entry = next.custom.find((item) => item.id === format.slice(7));
          if (!entry) throw Error('自定义导出不存在');
          entry.options = { ...entry.options, [field]: path };
        } else {
          if (!['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml'].includes(format))
            throw Error('导出格式未知');
          next.formats[format] = { ...next.formats[format], [field]: path };
        }
      }
      next.revision = before.revision + 1;
      return commitExportPreferences(next);
    }
    if (command === 'check_export_arguments') {
      const allowed = new Set([
        '--toc',
        '--table-of-contents',
        '--toc-depth',
        '--number-sections',
        '--number-offset',
        '--shift-heading-level-by',
        '--top-level-division',
        '--columns',
        '--tab-stop',
        '--preserve-tabs',
        '--wrap',
        '--variable',
        '--metadata',
        '--id-prefix',
        '--reference-links',
        '--reference-location',
        '--markdown-headings',
        '--epub-chapter-level',
        '--section-divs',
        '--ascii',
        '--strip-comments',
        '--eol',
      ]);
      const flags = new Set(['--toc', '--table-of-contents', '--number-sections', '--preserve-tabs', '--reference-links', '--section-divs', '--ascii', '--strip-comments']);
      const short: Record<string, string> = { N: '--number-sections', V: '--variable', M: '--metadata', p: '--preserve-tabs' };
      const text = String(args.text ?? '');
      const tokens = [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
      const result: string[] = [];
      for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index] ?? '';
        let name = token;
        let value: string | undefined;
        if (token.startsWith('--')) {
          const at = token.indexOf('=');
          if (at > 0) {
            name = token.slice(0, at);
            value = token.slice(at + 1);
          }
        } else if (token.startsWith('-') && token.length > 1 && short[token[1] ?? '']) {
          name = short[token[1] ?? ''] ?? '';
          value = token.length > 2 ? token.slice(2) : undefined;
        } else throw Error(`意外的参数“${token}”；选项必须以 - 或 -- 开头`);
        if (!allowed.has(name)) throw Error(`不支持的选项 ${name}；仅允许版式类选项`);
        if (flags.has(name)) {
          if (value !== undefined) throw Error(`选项 ${name} 不接受值`);
          result.push(name);
          continue;
        }
        if (value === undefined) {
          value = tokens[++index];
          if (value === undefined) throw Error(`选项 ${name} 缺少值`);
        }
        if (name === '--toc-depth' && !/^[1-6]$/.test(value)) throw Error(`选项 ${name} 的值“${value}”无效`);
        result.push(`${name}=${value}`);
      }
      return result;
    }
    if (command === 'reveal_export_file' || command === 'open_export_file') return null;
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
      mock.exportPreferences = storedExportPreferences();
      return structuredClone(mock.exportPreferences);
    }
    if (command === 'put_export_preferences') {
      if (mock.exportPreferencesError) throw Error(mock.exportPreferencesError);
      if (mock.exportPutError) {
        const message = mock.exportPutError;
        mock.exportPutError = null;
        throw Error(message);
      }
      const before = storedExportPreferences();
      if (before.revision !== args.expectedRevision) throw Error('导出设置已由其它窗口修改，请重新打开设置');
      const change = args.change as { key: string; value: unknown };
      const fields: Record<string, keyof CompleteExportPreferences> = {
        'export.general': 'general',
        'export.html': 'html',
        'export.pdf': 'pdf',
        'export.image': 'image',
        'export.formats': 'formats',
        'export.custom': 'custom',
        pandocPath: 'pandocPath',
      };
      const field = fields[change.key];
      if (!field) throw Error('无效导出设置');
      // Paths come only from a native dialog: a typed one may only be cleared or left as stored.
      const keep = (proposed: unknown, stored: unknown) => {
        if (proposed !== undefined && proposed !== '' && proposed !== stored)
          throw Error('文件与文件夹路径只能通过“选择…”对话框设置');
      };
      if (change.key === 'pandocPath') keep(change.value, before.pandocPath);
      if (change.key === 'export.general')
        keep((change.value as { folder?: string }).folder, before.general.folder);
      if (change.key === 'export.formats')
        for (const [key, options] of Object.entries(
          change.value as Record<string, Record<string, unknown>>,
        )) {
          keep(options.referenceDoc, before.formats[key]?.referenceDoc);
          keep(options.template, before.formats[key]?.template);
        }
      if (change.key === 'export.custom')
        for (const entry of change.value as { id: string; options: Record<string, unknown> }[]) {
          const stored = before.custom.find((item) => item.id === entry.id)?.options;
          keep(entry.options.referenceDoc, stored?.referenceDoc);
          keep(entry.options.template, stored?.template);
        }
      return commitExportPreferences({
        ...before,
        revision: before.revision + 1,
        [field]: structuredClone(change.value),
      });
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
    if (command === 'rename_document_file') {
      if (mock.renameError) {
        const message = mock.renameError;
        mock.renameError = null;
        throw new Error(message);
      }
      const document = mock.nextDocument;
      document.path = `${document.path.slice(0, document.path.lastIndexOf('/') + 1)}${String(args.newName)}`;
      mock.emitTarget('main', 'document-metadata-changed', [
        {
          id: String(args.documentId),
          path: document.path,
          encoding: document.encoding,
          metadataRevision: 100 + mock.calls.length,
        },
      ]);
      return {
        operationId: args.operationId,
        entryToken: 'rename-mock',
        oldRelativePath: '',
        name: args.newName,
        relativePath: args.newName,
        kind: 'file',
        size: 0,
        warnings: mock.renameWarnings,
      };
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
        'save_export_pdf',
        'save_export_format',
      ].includes(command)
    ) {
      if (mock.exportError) throw mock.exportError;
      if (mock.deferExport)
        await new Promise<void>((resolve) => {
          finishExport = resolve;
        });
      return command !== 'open_print_preview'
        ? {
            path: command === 'save_export_pdf' ? '/mock/A.pdf' : '/mock/A.html',
            bytes: new TextEncoder().encode(String(args.html ?? args.markdown)).length,
            warnings: [...mock.exportWarnings],
          }
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

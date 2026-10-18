import type { ContextAction } from '../context-menu/contracts.js';
import type { ContextCutCommit, ContextExecutionRequest } from '../context-menu/execution.js';
import type { ExportHTMLOptions } from '../export/options.js';
import type { ImageCheckpoint, ImageContextMessage } from '../images/contracts.js';
import { marklyraMarkdownPreferences } from '../markdown-preferences.js';
import {
  type Envelope,
  type HostAction,
  isEnvelope,
  type MarkLyraCommand,
  PROTOCOL,
  type RuntimeConfiguration,
  type RuntimeState,
} from '../protocol.js';
import type { RuntimeReloadRequest } from '../reload/contracts.js';
import { marklyraStartupPreferences } from '../startup-preferences.js';
import {
  clipboardMarkupEvent,
  clipboardSelectionHTML,
  clipboardSelectionMarkupHTML,
} from './clipboard-html.js';
import { pendingCodeLanguage } from './code-language.js';
import { RuntimeContextMenu } from './context-menu.js';
import { beginDocumentLoad, finishDocumentLoad } from './document-load.js';
import { RuntimeExport } from './export.js';
import { RuntimeFindPanel } from './find-panel.js';
import { installFindReplaceGuard } from './find-replace-guard.js';
import { RuntimeFocus } from './focus.js';
import { guardHTMLCallback } from './html-callbacks.js';
import { validHTMLMessage } from './html-messages.js';
import { RuntimeImageLayout } from './image-layout.js';
import { type RuntimeImageReferenceRequest, RuntimeImageReferences } from './image-references.js';
import { RuntimeImages } from './images.js';
import type { LegacyGlobals } from './legacy-types.js';
import { installLiteralPrefix } from './literal-prefix.js';
import { RuntimeMarkdownPreferences } from './markdown-preferences.js';
import { readRuntimeMenuState } from './menu-state.js';
import { installNodeLookup, type RuntimeNodeLookup } from './node-lookup.js';
import { RuntimeOutline, refreshOutlineModel } from './outline.js';
import { RuntimeOutlineNavigation } from './outline-navigation.js';
import { RuntimeOutlinePopover } from './outline-popover.js';
import { RuntimePreferences } from './preferences.js';
import { type RuntimeDocumentSnapshot, RuntimeReload } from './reload.js';
import { RuntimeRenderTickets } from './render-tickets.js';
import { readSelectionText } from './selection-text.js';
import { parserSource } from './source-prefix.js';
import { RuntimeSourceTracking } from './source-tracking.js';
import { RuntimeStatistics } from './statistics.js';
import { originalSuggestedName } from './suggested-name.js';
import { RuntimeThemes } from './themes.js';

// Newly written host adapter. No runtime implementation is included in this package.
const runtime = window as unknown as LegacyGlobals;
const channel = new URL(location.href).searchParams.get('channel') ?? '';
// The disposable export renderer must never steal input focus from the live editor.
if (new URL(location.href).searchParams.get('export-renderer') === 'true') {
  HTMLElement.prototype.focus = () => {};
  window.focus = () => {};
}
let configuration: RuntimeConfiguration = {
  nativeMenus: false,
  platform: 'browser',
  locale: 'en',
  theme: 'github',
};
let changeSequence = 0;
let documentGeneration = 0;
let contextEvent: MouseEvent | null = null;
let content = '';
let modified = false;
let loading = false;
let nativeComposition = false;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let clipboard: ClipboardEvent | null = null;
let clipboardReadCompletion: Promise<void> | undefined;
let imageLayout: RuntimeImageLayout | undefined;
let nodeLookup: RuntimeNodeLookup | undefined;
const abort = new AbortController();
runtime.__MARKLYRA_HTML_CALLBACK__ = (callback) =>
  guardHTMLCallback(
    runtime,
    () => documentGeneration,
    () => !disposed && !loading && !composing(),
    callback,
  );
runtime.__MARKLYRA_HTML_MESSAGE__ = (event) =>
  !disposed && validHTMLMessage(runtime, event, () => !loading && !composing());
const renderTickets = new RuntimeRenderTickets(
  runtime,
  () => documentGeneration,
  () => !disposed && !loading && !composing(),
);
runtime.__MARKLYRA_RENDER_TICKET__ = (preview, cm) => renderTickets.begin(preview, cm);
const outline = new RuntimeOutline({
  entries: () => {
    refreshOutlineModel(runtime);
    return Array.isArray(runtime.editor?.nodeMap.toc?.headers)
      ? runtime.editor.library.outline
          .getHeaderMatrix(true)
          .map(([level, text, id]) => ({ id, level, text }))
      : undefined;
  },
  changed: () => outlineNavigation.changed(),
});
const focus = new RuntimeFocus(
  runtime,
  () => documentGeneration,
  undefined,
  () => !disposed && !loading && !composing(),
);
runtime.__MARKLYRA_RESTORE_BRUSH_CURSOR__ = (editor, bookmark, restore) =>
  focus.restoreBrushCursor(editor, bookmark, restore);
const send = (kind: string, payload?: unknown, id?: number, error?: string) => {
  const message: Envelope = { protocol: PROTOCOL, channel, kind };
  if (payload !== undefined) message.payload = payload;
  if (id !== undefined) message.id = id;
  if (error !== undefined) message.error = error;
  parent.postMessage(message, '*');
};
const findPanel = new RuntimeFindPanel((bounds) => send('find-panel-layout', bounds));
const images = new RuntimeImages({
  runtime,
  send,
  state,
  composing: () => composing(),
  loading: () => loading,
  changed: () => dirty(),
  normalizeSelection: () => tracking.normalizePlainSelection(),
  pasteContent: (content) => {
    const editor = runtime.editor;
    if (!editor) throw new Error('编辑器尚未初始化');
    if (editor.sourceView.inSourceMode) {
      const cm = editor.sourceView.cm;
      if (!cm || !content.text) return;
      cm.operation(() =>
        cm.replaceSelections(
          cm.listSelections().map(() => content.text),
          'end',
          'paste',
        ),
      );
      return;
    }
    tracking.normalizePlainSelection();
    if (content.markHtml)
      editor.UserOp.pasteHandler(
        editor,
        clipboardMarkupEvent(content, (value) => images.clipboardHTML(value, true)),
      );
    else if (content.html)
      editor.UserOp.pasteHandler(editor, images.clipboardHTML(content.html, true), false);
    else {
      tracking.armAuthorizedReplacement(content.text, 'insertText');
      editor.UserOp.pasteHandler(editor, content.text, true);
    }
  },
  decorate: (update) => {
    if (imageLayout) imageLayout.decorate(update);
    else update();
  },
});
const tracking = new RuntimeSourceTracking(runtime, () => loading || disposed || composing());
const contextMenu = new RuntimeContextMenu({
  runtime,
  stamp: () => ({ generation: documentGeneration, sequence: changeSequence }),
  composing: () => composing(),
  loading: () => loading,
  disposed: () => disposed,
  capabilities: () => configuration.contextMenu,
  send: (request) => send('context-menu', request),
  cancel: (requestId) => send('context-menu-cancel', requestId),
  clipboardHTML: (html, forPaste) => images.clipboardHTML(html, forPaste),
  normalizeSelection: () => tracking.normalizePlainSelection(),
  armReplacement: (text, type) => tracking.armAuthorizedReplacement(text, type),
  armTableRow: (rowId, action) => tracking.armAuthorizedTableAction(rowId, action),
  armCodeLineCut: (cid, cm, ranges) => tracking.armAuthorizedCodeLineCut(cid, cm, ranges),
  importImage: (image) => images.importClipboardImage(image),
  imageActions: () => images.actions,
  imageReference: (source) => images.reference(source),
  imageStorageContext: () => images.storageContext(),
});
runtime.__MARKLYRA_REPLAY_SOURCE_CONTEXT__ = (cm, event, execute) =>
  contextMenu.replaySourceContext(cm, event, execute);
const exporter = new RuntimeExport({
  runtime,
  composing: () => composing(),
  loading: () => loading,
});
const statistics = new RuntimeStatistics({
  runtime,
  state: passiveState,
  available: () => !disposed && !loading && !composing() && !runtime.File?._onInitParse,
  invalidated: () => send('statistics-invalidated'),
});
const reloads = new RuntimeReload({
  runtime,
  tracking,
  images,
  sourceBOM: () => configuration.sourceBOM ?? 'metadata',
  composing: () => composing(),
  loading: () => loading,
  setLoading: (value) => {
    loading = value;
    if (value) imageLayout?.beginLoad();
    else imageLayout?.endLoad();
  },
  state,
});
const imageReferences = new RuntimeImageReferences({
  runtime,
  images,
  tracking,
  state,
  composing: () => composing(),
  loading: () => loading,
  setLoading: (value) => {
    loading = value;
  },
  changed: () => dirty(),
  snapshot: () => reloads.snapshot(),
  restore: (snapshot, source) => reloads.restore(snapshot, source),
});
const action = (name: HostAction) => send('host-action', name);
const composing = () => nativeComposition || Boolean(runtime.editor?.isIME);
const preferences = new RuntimePreferences({ runtime, composing });
const markdownPreferences = new RuntimeMarkdownPreferences({
  runtime,
  state: () => state(),
  available: () => !disposed && !loading && !composing() && !runtime.File?._onInitParse,
  tracking,
});
const outlineNavigation = new RuntimeOutlineNavigation({
  runtime,
  available: () => !disposed && !loading && !composing() && !runtime.File?._onInitParse,
  onCurrent: (id) => send('current-heading', id),
});
const outlinePopover = new RuntimeOutlinePopover({
  runtime,
  composing,
  onChange: (open) => send('outline-popover', open),
  onPin: () => send('outline-pin'),
  onError: (error) => send('runtime-error', error.message),
});
const themes = new RuntimeThemes((appearance) => send('theme-appearance', appearance));
const selection = () => ({
  bookmark: focus.bookmark() ?? runtime.editor?.selection.buildUndo() ?? null,
  text: readSelectionText(getSelection()),
});
function dirty() {
  images.documentChanged();
  modified = true;
  changeSequence++;
  send('dirty', changeSequence);
  schedule();
}
let menuSequence = 0;
function menuPacket() {
  return { menu: readRuntimeMenuState(runtime), sequence: ++menuSequence };
}
function state(sync = true, resetTracking = false): RuntimeState {
  const editor = runtime.editor,
    file = runtime.File;
  if (!editor || !file || file._onInitParse || loading) throw new Error('编辑器尚未完成加载');
  if (sync && composing()) throw new Error('请先完成输入法候选');
  const captured = tracking.read(
    () => (sync ? file.sync(false, false, true) : editor.getMarkdown()) ?? editor.getMarkdown(),
    resetTracking,
  );
  const canonical = captured.canonical;
  const menu = menuPacket();
  return {
    tracking: captured.tracking,
    canonical,
    sequence: changeSequence,
    composing: composing(),
    sourceMode: editor.sourceView.inSourceMode,
    selection: selection(),
    outline: outline.read(document.getElementById('write')),
    canUndo: editor.undo.hasUndo(),
    canRedo: editor.undo.hasRedo(),
    menu: menu.menu,
    menuSequence: menu.sequence,
  };
}
function notifyChange() {
  if (disposed || loading || composing() || !runtime.editor || runtime.File?._onInitParse) return;
  try {
    const snapshot = passiveState();
    send('changed', snapshot);
  } catch (error) {
    send('runtime-error', String(error));
  }
}
function passiveState() {
  return state(!pendingCodeLanguage(runtime.editor));
}
function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(notifyChange, content.length > 200_000 ? 650 : 180);
}
function respond(name: string, data: unknown): unknown {
  if (name === 'contextMenu.setItems') {
    if (contextEvent) contextMenu.offer(data, contextEvent);
    return null;
  }
  // Original HTML export falls back to already-loaded CSSOM. No arbitrary native file read.
  if (name === 'path.readText') return null;
  // No OS text replacements are granted; the original callback requires an object.
  if (name === 'word.getTextReplacement') return {};
  if (name === 'document.loadData') return [content, null, images.documentState()];
  if (name === 'document.getContent') return content;
  if (name === 'document.setContent') {
    if (typeof data === 'string') content = data;
    schedule();
    return null;
  }
  if (name === 'document.isActiveWindow') return true;
  if (name === 'document.isDocumentEdited') return modified;
  if (name === 'document.updateChangeCount' || name === 'document.updateChangeCountIfUnedited') {
    if (!images.isDecorating) dirty();
    return null;
  }
  if (name === 'setting.get') return runtime._options[String(data)] ?? null;
  if (name === 'setting.put' && data && typeof data === 'object') {
    const setting = data as { key?: unknown; value?: unknown };
    if (typeof setting.key === 'string') runtime._options[setting.key] = setting.value;
    return null;
  }
  if (name === 'clipboard.write' && data && typeof data === 'object') {
    if (contextMenu.captureClipboardWrite(data)) return null;
    const formats = (data as { data?: Record<string, unknown> }).data;
    if (clipboard && clipboard.type !== 'paste' && formats) {
      for (const format of ['text/plain', 'text/html', 'text/markhtml'])
        if (typeof formats[format] === 'string')
          clipboard.clipboardData?.setData(
            format,
            format === 'text/plain' ? formats[format] : images.clipboardHTML(formats[format]),
          );
      clipboard.preventDefault();
      return null;
    }
    send('unsupported-host-call', 'clipboard.write outside a native clipboard event');
    return null;
  }
  if (name === 'clipboard.read')
    return {
      text: clipboard?.clipboardData?.getData('text/plain') ?? '',
      html: [clipboard?.clipboardData?.getData('text/html') ?? ''],
      files: [],
    };
  if (name === 'clipboard.readText') return clipboard?.clipboardData?.getData('text/plain') ?? '';
  if (name === 'path.currentFilePath' || name === 'document.currentFilePath') return '';
  if (name === 'document.save' || name === 'controller.saveDocument') {
    action('save');
    return null;
  }
  if (name === 'window.zoomIn' || name === 'window.zoomOut') {
    action(name === 'window.zoomIn' ? 'zoom-in' : 'zoom-out');
    return null;
  }
  if (name === 'document.saveAs') {
    action('save-as');
    return null;
  }
  // Unimplemented native capabilities have no authority here. They are observable,
  // never forwarded to arbitrary file paths, processes, network or host eval.
  if (
    !/^(?:logger\.|menu\.|window\.(?:loadFinished|setTitle|setDocumentEdited|resize)|document\.(?:needsUpdateSnap|requestBuildSnap)|contextMenu\.)/.test(
      name,
    )
  )
    send('unsupported-host-call', name);
  return null;
}
const selectedLocale =
  new URL(location.href).searchParams.get('locale') === 'zh-Hans' ? 'zh-Hans' : 'Base';
const requestedTheme = new URL(location.href).searchParams.get('theme') ?? 'github';
const theme = ['github', 'gothic', 'night', 'newsprint', 'pixyll', 'whitey'].includes(
  requestedTheme,
)
  ? requestedTheme
  : 'github';
const startupOptions = marklyraStartupPreferences(
  JSON.parse(new URL(location.href).searchParams.get('startup-preferences') ?? '{}'),
);
const initialMarkdown = marklyraMarkdownPreferences(
  JSON.parse(new URL(location.href).searchParams.get('markdown-preferences') ?? '{}'),
);
runtime._options = {
  userLocale: selectedLocale,
  locale: selectedLocale,
  currentThemeFolder: '/__marklyra_themes__',
  theme,
  curTheme: theme,
  preferCRLF: false,
  preferFinalNewline: false,
  sendAnonymousUsage: false,
  moveRowUpKey: '',
  moveRowDownKey: '',
  sidebarTab: null,
  useRelativePathForImg: true,
  applyImageMoveForLocal: false,
  applyImageMoveForWeb: false,
  allowImageMove: false,
  allowImageUpload: false,
  defaultImageStorage: null,
  headingStyle: initialMarkdown.headingStyle,
  ulStyle: initialMarkdown.ulStyle,
  olStyle: initialMarkdown.olStyle,
  ...startupOptions,
};
const originalSetAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (name: string, value: string) {
  if (
    name === 'href' &&
    this.tagName === 'LINK' &&
    ['theme_css', 'base_user_css', 'theme_user_css'].includes(this.id) &&
    String(value).startsWith('file:///__marklyra_themes__/')
  ) {
    value = themes.resolveLink(this.id, String(value));
  }
  return originalSetAttribute.call(this, name, value);
};
const marklyraBridge = {
  postMessage(message: { handlerName: string; data: unknown; callbackId?: string }) {
    const result = respond(message.handlerName, message.data);
    if (message.callbackId) {
      const reply = () =>
        runtime.bridge?._handleMessageFromObjC(
          JSON.stringify({ responseId: message.callbackId, responseData: result }),
        );
      if (message.handlerName === 'clipboard.read') {
        clipboardReadCompletion = new Promise<void>((resolve, reject) => {
          queueMicrotask(() => {
            try {
              reply();
              // The runtime read Promise's insertion continuation is now
              // queued. Resolve our receipt behind it, in the same task.
              queueMicrotask(resolve);
            } catch (error) {
              send('runtime-error', String(error));
              reject(error);
            }
          });
        });
        // DOM paste has no awaited IPC caller; retain an observed rejection.
        void clipboardReadCompletion.catch(() => {});
      } else queueMicrotask(reply);
    }
  },
};
// The generated runtime page directs its single native transport call here.
// Never modify WKWebView's non-configurable native message-handler container.
Object.defineProperty(window, '__MARKLYRA_BRIDGE__', { value: marklyraBridge });
if (!Reflect.get(window, 'webkit'))
  Object.defineProperty(window, 'webkit', {
    configurable: true,
    value: { messageHandlers: {} },
  });
window.prompt = (message?: string, data?: string) => {
  if (message !== '__bridge__') return null;
  const request = JSON.parse(data ?? '{}') as { name: string; method: string; data: unknown };
  return JSON.stringify(respond(`${request.name}.${request.method}`, request.data));
};
window.open = () => null;
const disabled = [
  'showOpenFilePicker',
  'showSaveFilePicker',
  'showDirectoryPicker',
  'webkitRequestFileSystem',
  'webkitResolveLocalFileSystemURL',
];
for (const name of disabled)
  if (name in window) Object.defineProperty(window, name, { configurable: true, value: undefined });

function command(value: MarkLyraCommand) {
  contextMenu.invalidate();
  const editor = runtime.editor,
    file = runtime.File;
  if (!editor || !file) throw new Error('编辑器尚未初始化');
  if (composing()) throw new Error('请先完成输入法候选');
  imageLayout?.interaction();
  const element = editor.writingArea;
  switch (value.type) {
    case 'undo':
      editor.undo.undo();
      break;
    case 'redo':
      editor.undo.redo();
      break;
    case 'insertText':
      editor.insertText(value.text);
      break;
    case 'find': {
      editor.searchPanel.showPanel(value.replace);
      if (value.text !== undefined) {
        const input = document.querySelector<HTMLInputElement>('#search-panel-input');
        if (input) input.value = value.text;
        editor.searchPanel.doSearch(value.text);
        editor.searchPanel.highlightNext();
      }
      break;
    }
    case 'sourcePosition': {
      const sourceMode = editor.sourceView.inSourceMode;
      if (!sourceMode) editor.sourceView.show();
      editor.sourceView.cm?.setCursor({
        line: Math.max(0, value.line - 1),
        ch: Math.max(0, value.column - 1),
      });
      if (!sourceMode) editor.sourceView.hide();
      break;
    }
    case 'heading':
      editor.stylize.changeBlock(value.level === 0 ? 'paragraph' : `header${value.level}`);
      break;
    case 'format':
      editor.stylize.toggleStyle(value.style);
      break;
    case 'list':
      if (value.style === 'blockquote') tracking.armStructuralIndent('quote');
      editor.stylize.toggleIndent(value.style);
      break;
    case 'codeBlock':
      editor.stylize.toggleFences();
      break;
    case 'mathBlock':
      editor.stylize.toggleMathBlock();
      break;
    case 'horizontalRule':
      editor.stylize.insertBlock('hr');
      break;
    case 'insertTable':
      editor.tableEdit.insertTable();
      break;
    case 'indent':
      tracking.armStructuralIndent('indent');
      editor.UserOp.moreIndent(editor);
      break;
    case 'outdent':
      tracking.armStructuralIndent('outdent');
      editor.UserOp.lessIndent(editor);
      break;
    case 'toggleSource':
      file.toggleSourceMode();
      break;
    case 'toggleFocus':
      editor.toggleFocusMode();
      break;
    case 'toggleTypewriter':
      editor.toggleTypeWriterMode();
      break;
    case 'insertLink':
      editor.UserOp.insertUrlWithTitle(editor, value.url, value.title);
      break;
    case 'setTheme':
      runtime._options.theme = value.theme;
      runtime._options.curTheme = value.theme;
      file.option.theme = value.theme;
      file.option.curTheme = value.theme;
      file.setTheme(value.theme);
      break;
    case 'restoreSelection':
      editor.undo.exeCommand(value.bookmark);
      break;
    case 'jumpToBlock': {
      if (value.preserveSelection) {
        refreshOutlineModel(runtime);
        editor.library.outline.renderOutline();
        const label = Array.from(
          document.querySelectorAll<HTMLElement>('#outline-content .outline-label[data-ref]'),
        ).find((item) => item.getAttribute('data-ref') === value.id);
        if (!label) throw new Error('大纲标题已变化，请重试');
        // The original outline handler restores its saved editing range and
        // scrolls to the heading. Generic jumps below deliberately move caret.
        label.click();
        break;
      }
      const block = Array.from(element.querySelectorAll<HTMLElement>('[cid]')).find(
        (block) => block.getAttribute('cid') === value.id,
      );
      if (block) {
        editor.selection.jumpIntoElemBegin(runtime.$(block));
        editor.refocus(value.id);
        block.scrollIntoView({ block: 'center' });
      }
      break;
    }
  }
  schedule();
}
window.addEventListener(
  'message',
  (event) => {
    if (
      event.source !== parent ||
      !isEnvelope(event.data, channel) ||
      event.data.kind !== 'request' ||
      typeof event.data.id !== 'number'
    )
      return;
    const message = event.data;
    void (async () => {
      try {
        let result: unknown;
        switch (message.operation) {
          case 'suggested-file-name': {
            if (loading || disposed || composing() || !runtime.File || runtime.File._onInitParse)
              throw new Error('请等待文档与输入法候选完成后再获取文件名');
            result = { name: originalSuggestedName(runtime.File), state: state() };
            break;
          }
          case 'statistics': {
            const isolated =
              (message.payload as { isolated?: boolean } | undefined)?.isolated === true;
            if (isolated && new URL(location.href).searchParams.get('export-renderer') !== 'true')
              throw new Error('隔离统计只能在专用运行时执行');
            result = await statistics.read(isolated);
            break;
          }
          case 'statistics-current': {
            const value = message.payload as {
              sequence: number;
              epoch: number;
              sourceMode: boolean;
            };
            result =
              runtime.editor?.sourceView.inSourceMode === value.sourceMode &&
              statistics.current(value.sequence, value.epoch, changeSequence);
            break;
          }
          case 'configure': {
            configuration = message.payload as RuntimeConfiguration;
            result = true;
            break;
          }
          case 'preferences':
            preferences.apply(message.payload);
            outlineNavigation.schedule();
            result = true;
            break;
          case 'markdown-preferences-initialize':
            markdownPreferences.initialize(message.payload);
            result = true;
            break;
          case 'markdown-preferences-prepare':
            result = markdownPreferences.prepare(message.payload);
            break;
          case 'markdown-preferences-commit':
            result = markdownPreferences.commit(message.payload);
            break;
          case 'markdown-preferences-cancel':
            markdownPreferences.cancel(message.payload);
            result = true;
            break;
          case 'markdown-preferences-resolve':
            result = markdownPreferences.resolve(message.payload);
            break;
          case 'theme-styles': {
            if (composing()) throw new Error('请先完成输入法候选');
            const value = message.payload as { styles?: unknown; theme?: unknown } | null;
            const file = runtime.File;
            if (!file || !value) throw new Error('Theme runtime is unavailable');
            if (
              value.theme !== undefined &&
              !['github', 'gothic', 'night', 'newsprint', 'pixyll', 'whitey'].includes(
                String(value.theme),
              )
            )
              throw new TypeError('Invalid base theme');
            const previous = runtime._options.theme;
            const setTheme = (theme: unknown) => {
              if (typeof theme !== 'string') return;
              runtime._options.theme = theme;
              runtime._options.curTheme = theme;
              file.option.theme = theme;
              file.option.curTheme = theme;
              file.setTheme(theme);
            };
            result = await themes.apply(
              value.styles,
              value.theme === undefined ? undefined : () => setTheme(value.theme),
              value.theme === undefined ? undefined : () => setTheme(previous),
            );
            break;
          }
          case 'theme-appearance':
            result = await themes.read();
            break;
          case 'theme-fonts':
            result = await themes.fonts();
            break;
          case 'outline-popover-toggle':
            refreshOutlineModel(runtime);
            result = outlinePopover.toggle();
            break;
          case 'outline-popover-close':
            outlinePopover.close();
            result = true;
            break;
          case 'outline-tracking': {
            const enabled = (message.payload as { enabled?: unknown } | null)?.enabled;
            if (typeof enabled !== 'boolean') throw new TypeError('Invalid outline tracking');
            outlineNavigation.setEnabled(enabled);
            result = true;
            break;
          }
          case 'content-inset': {
            const left = (message.payload as { left?: unknown } | null)?.left;
            const top = (message.payload as { top?: unknown } | null)?.top ?? 0;
            const outlineTop =
              (message.payload as { outlineTop?: unknown } | null)?.outlineTop ?? top;
            if (typeof left !== 'number' || !Number.isFinite(left) || left < 0 || left > 16384)
              throw new Error('Invalid content inset');
            if (typeof top !== 'number' || !Number.isFinite(top) || top < 0 || top > 16384)
              throw new Error('Invalid content inset');
            if (
              typeof outlineTop !== 'number' ||
              !Number.isFinite(outlineTop) ||
              outlineTop < 0 ||
              outlineTop > 16384
            )
              throw new Error('Invalid outline inset');
            document.documentElement.style.setProperty('--marklyra-content-inset', `${left}px`);
            document.documentElement.style.setProperty('--marklyra-content-top', `${top}px`);
            findPanel.refresh();
            const popup = document.getElementById('toc-dropmenu');
            if (popup) popup.style.top = `${outlineTop}px`;
            result = true;
            break;
          }
          case 'load': {
            if (composing()) throw new Error('请先完成输入法候选');
            const value = message.payload as {
              source: string;
              expected?: { canonical: string; sequence: number };
              images?: ImageContextMessage;
            };
            if (!value || typeof value.source !== 'string')
              throw new Error('Invalid Markdown payload');
            outlinePopover.close();
            outlineNavigation.reset();
            if (value.expected) {
              const current = state();
              if (
                current.canonical !== value.expected.canonical ||
                current.sequence !== value.expected.sequence
              ) {
                result = { applied: false, state: current };
                break;
              }
            }
            const file = runtime.File;
            if (!file) throw new Error('Runtime not initialized');
            documentGeneration++;
            contextMenu.invalidate();
            loading = true;
            try {
              const sourceMode = beginDocumentLoad(runtime);
              if (value.images) images.setContext(value.images);
              imageLayout?.beginLoad();
              content = value.source;
              modified = false;
              if (timer) clearTimeout(timer);
              await file.loadFile('', false, [
                parserSource(content, configuration.sourceBOM),
                null,
                images.documentState(),
              ]);
              if (sourceMode) await finishDocumentLoad(sourceMode);
              refreshOutlineModel(runtime);
            } finally {
              loading = false;
              imageLayout?.endLoad();
            }
            const loaded = state(true, true);
            result = { applied: true, state: loaded };
            break;
          }
          case 'tracking-ack':
            tracking.acknowledge(Number(message.payload));
            result = true;
            break;
          case 'flush':
            result = state();
            break;
          case 'execute': {
            const value = message.payload as MarkLyraCommand & {
              expectedPosition?: { canonical: string; sequence: number };
            };
            if (value.type === 'sourcePosition' && value.expectedPosition) {
              const current = state();
              if (
                current.canonical !== value.expectedPosition.canonical ||
                current.sequence !== value.expectedPosition.sequence
              )
                throw new Error('定位期间正文已变化，请重新搜索');
            }
            focus.command(() => command(message.payload as MarkLyraCommand));
            result = state();
            outlineNavigation.schedule();
            break;
          }
          case 'selection':
            result = selection();
            break;
          case 'context-menu-native-capture':
            result = focus.command(() => {
              const value = message.payload as { requestId: string; action: ContextAction };
              contextMenu.prepareNativePaste(value.requestId, value.action);
              return images.captureNative();
            }, false);
            break;
          case 'image-check':
            result = focus.command(() => images.verify(message.payload as ImageCheckpoint), false);
            break;
          case 'context-menu-execute': {
            const previousRead = clipboardReadCompletion;
            const effect = focus.command(
              () => contextMenu.execute(message.payload as ContextExecutionRequest),
              false,
            );
            // ClipboardEvent deletes before its async read inserts. Await the
            // exact owned callback receipt, never an arbitrary delay or a
            // serialization of the intermediate, deleted-target model.
            if (clipboardReadCompletion !== previousRead) await clipboardReadCompletion;
            result = {
              ...effect,
              state: state(),
            };
            break;
          }
          case 'context-menu-cut':
            focus.command(() => contextMenu.commitCut(message.payload as ContextCutCommit), false);
            result = { state: state() };
            break;
          case 'context-menu-cancel':
            contextMenu.invalidate((message.payload as { requestId: string }).requestId);
            result = true;
            break;
          case 'snapshot':
            result = reloads.snapshot();
            break;
          case 'restore': {
            documentGeneration++;
            contextMenu.invalidate();
            const value = message.payload as {
              source: string;
              snapshot: RuntimeDocumentSnapshot;
              images?: ImageContextMessage;
            };
            if (value.images) images.setContext(value.images);
            result = await reloads.restore(value.snapshot, value.source);
            break;
          }
          case 'reload-from-disk':
            documentGeneration++;
            contextMenu.invalidate();
            result = await reloads.reload(message.payload as RuntimeReloadRequest);
            break;
          case 'export-html':
            result = await exporter.html(message.payload as ExportHTMLOptions);
            break;
          case 'image-context':
            images.setContext(message.payload as ImageContextMessage);
            result = true;
            break;
          case 'image-references':
            result = imageReferences.list();
            break;
          case 'image-reference-facts':
            result = imageReferences.facts();
            break;
          case 'image-automatic-check': {
            const value = message.payload as { id: number; generation: number };
            result = images.automatic.check(value.id, value.generation);
            break;
          }
          case 'image-automatic-release': {
            const value = message.payload as { id: number };
            images.automatic.release(value.id);
            result = true;
            break;
          }
          case 'image-storage-context':
            result = images.storageContext();
            break;
          case 'image-update-references': {
            const value = message.payload as RuntimeImageReferenceRequest;
            if (value.contextRequestId) contextMenu.verifyImage(value.contextRequestId);
            contextMenu.finishImage();
            contextMenu.invalidate();
            result = await imageReferences.update(value);
            break;
          }
          case 'image-resolved':
            images.resolved(message.payload as Parameters<RuntimeImages['resolved']>[0]);
            result = true;
            break;
          case 'image-imported':
            images.imported(message.payload as Parameters<RuntimeImages['imported']>[0]);
            result = true;
            break;
          case 'clipboard-read-result':
            images.clipboardResult(
              message.payload as Parameters<RuntimeImages['clipboardResult']>[0],
            );
            result = true;
            break;
          case 'image-capture':
            result = focus.command(() => images.capture());
            break;
          case 'image-native-capture':
            result = focus.command(() =>
              images.captureNative((message.payload as { point?: { x: number; y: number } }).point),
            );
            break;
          case 'image-insert-many':
            imageLayout?.interaction();
            result = focus.command(
              () =>
                images.insertMany(message.payload as Parameters<RuntimeImages['insertMany']>[0]),
              false,
            );
            break;
          case 'image-insert':
            imageLayout?.interaction();
            result = focus.command(
              () => images.insert(message.payload as Parameters<RuntimeImages['insert']>[0]),
              false,
            );
            break;
          case 'focus':
            imageLayout?.interaction();
            if (loading || composing()) throw new Error('请先完成当前编辑操作');
            focus.focus();
            result = true;
            break;
          case 'mark-saved': {
            const expected = message.payload as { canonical: string; sequence: number };
            const current = state();
            const saved =
              expected &&
              current.canonical === expected.canonical &&
              current.sequence === expected.sequence;
            if (saved) modified = false;
            result = { saved: Boolean(saved), state: current };
            break;
          }
          case 'destroy':
            disposed = true;
            focus.destroy();
            contextMenu.destroy();
            if (timer) clearTimeout(timer);
            imageLayout?.dispose();
            outline.dispose();
            outlinePopover.destroy();
            findPanel.destroy();
            outlineNavigation.destroy();
            nodeLookup?.dispose();
            images.destroy();
            exporter.destroy();
            statistics.destroy();
            themes.destroy();
            abort.abort();
            result = true;
            break;
          default:
            throw new Error(`Unknown runtime operation: ${message.operation}`);
        }
        send('response', result, message.id);
      } catch (error) {
        send(
          'response',
          undefined,
          message.id,
          error instanceof Error ? error.message : String(error),
        );
      }
    })();
  },
  { signal: abort.signal },
);
for (const name of ['input', 'paste', 'cut', 'drop'])
  document.addEventListener(name, dirty, { capture: true, signal: abort.signal });
document.addEventListener(
  'contextmenu',
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#write,#typora-source,.CodeMirror')) return;
    contextEvent = event;
    event.preventDefault();
    // Trusted browser events run microtask checkpoints between listeners.
    // Keep the event available through the original delegated bridge handler.
    setTimeout(() => {
      if (contextEvent === event) contextEvent = null;
    }, 0);
  },
  { capture: true, signal: abort.signal },
);
for (const name of ['focusin', 'mousedown'] as const)
  document.addEventListener(name, (event) => focus.observe(event.target), {
    capture: true,
    signal: abort.signal,
  });
for (const name of ['beforeinput', 'paste', 'cut', 'drop'] as const)
  document.addEventListener(name, (event) => focus.interact(event.target), {
    capture: true,
    signal: abort.signal,
  });
document.addEventListener(
  'mousedown',
  (event) => {
    if (event.button === 0) focus.interact(event.target);
  },
  { capture: true, signal: abort.signal },
);
document.addEventListener(
  'keydown',
  (event) => {
    if (
      !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'].includes(
        event.key,
      ) &&
      !((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c')
    )
      focus.interact(event.target);
  },
  { capture: true, signal: abort.signal },
);
window.addEventListener('focus', () => queueMicrotask(() => focus.resume()), {
  signal: abort.signal,
});
document.addEventListener(
  'compositionstart',
  () => {
    focus.interact(runtime.editor?.writingArea ?? null);
    nativeComposition = true;
    send('composition', true);
  },
  { capture: true, signal: abort.signal },
);
document.addEventListener(
  'compositionend',
  () => {
    setTimeout(() => {
      nativeComposition = false;
      send('composition', Boolean(runtime.editor?.isIME));
      schedule();
      outlineNavigation.schedule();
    }, 0);
  },
  { capture: true, signal: abort.signal },
);
for (const name of ['copy', 'cut', 'paste'] as const)
  document.addEventListener(
    name,
    (event) => {
      clipboard = event;
      const editor = runtime.editor;
      const target = event.target instanceof Element ? event.target : null;
      if (name === 'paste' && editor && !composing() && target?.closest('#write'))
        tracking.normalizePlainSelection();
      const selected = getSelection();
      if (
        name !== 'paste' &&
        editor &&
        !composing() &&
        event.clipboardData &&
        target?.closest('#write') &&
        !target.closest('input,textarea') &&
        selected &&
        !selected.isCollapsed &&
        selected.rangeCount
      ) {
        // Browser clipboard writes must happen before the event returns; the
        // original native bridge finishes its copy work on a later timer.
        const html = clipboardSelectionHTML(editor.writingArea, selected.getRangeAt(0), (html) =>
          images.clipboardHTML(html),
        );
        const markup = clipboardSelectionMarkupHTML(
          editor.writingArea,
          selected.getRangeAt(0),
          (value) => images.clipboardHTML(value),
        );
        if (html !== undefined) event.clipboardData.setData('text/html', html);
        if (name === 'cut') runtime.File?.cut();
        else editor.UserOp.copyHandler(editor);
        if (markup !== undefined) event.clipboardData.setData('text/markhtml', markup);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      queueMicrotask(() => {
        clipboard = null;
      });
    },
    { capture: true, signal: abort.signal },
  );
document.addEventListener(
  'selectionchange',
  () => {
    if (!composing() && !loading && runtime.editor && !runtime.File?._onInitParse) {
      send('selection', selection());
      try {
        send('menu-state', menuPacket());
      } catch (error) {
        send('runtime-error', String(error));
      }
    }
  },
  { signal: abort.signal },
);
document.addEventListener(
  'keydown',
  (event) => {
    if (
      composing() ||
      event.isComposing ||
      event.keyCode === 229 ||
      !(event.metaKey || event.ctrlKey)
    )
      return;
    const key = event.key.toLowerCase();
    let host: HostAction | undefined;
    if (key === 's') host = event.shiftKey ? 'save-as' : 'save';
    if (key === 'o') host = 'open';
    if (key === 'n') host = event.shiftKey ? 'new-window' : 'new';
    if (key === 'f') {
      event.preventDefault();
      event.stopImmediatePropagation();
      command({ type: 'find' });
      return;
    }
    if (host) {
      event.preventDefault();
      event.stopImmediatePropagation();
      action(host);
      return;
    }
    if (!configuration.nativeMenus && (key === 'z' || key === 'y')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      command({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (configuration.platform === 'windows' && event.ctrlKey && (key === 'b' || key === 'i')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      command({ type: 'format', style: key === 'b' ? 'strong' : 'em' });
    }
  },
  { capture: true, signal: abort.signal },
);
window.addEventListener(
  'error',
  (event) => {
    if (typeof event.message === 'string') send('runtime-error', event.message);
  },
  { signal: abort.signal },
);
window.addEventListener(
  'unhandledrejection',
  (event) => send('runtime-error', String(event.reason)),
  { signal: abort.signal },
);
async function ready() {
  const started = Date.now();
  while (!runtime.editor || !runtime.File || runtime.File._onInitParse) {
    if (Date.now() - started > 30_000) {
      send('runtime-error', '原始运行时初始化超时');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  installLiteralPrefix(runtime.editor);
  focus.install();
  nodeLookup = installNodeLookup(runtime.editor, runtime.$);
  images.install();
  statistics.install();
  themes.install();
  outlinePopover.install();
  outlineNavigation.install();
  contextMenu.install();
  reloads.install();
  imageLayout = new RuntimeImageLayout(runtime.editor, {
    onError: (error) => send('runtime-error', String(error)),
  });
  const style = document.createElement('style');
  style.textContent =
    ':root{--sidebar-width:var(--marklyra-content-inset,0px)!important}#typora-sidebar,#footer-word-count,#top-titlebar{display:none!important}body{padding:0!important}content{left:var(--marklyra-content-inset,0px)!important;margin-top:var(--marklyra-content-top,0px)!important;bottom:0!important}#write{--sidebar-width:var(--marklyra-content-inset,0px);min-height:calc(100vh - var(--marklyra-content-top,0px))}#typora-source{left:var(--marklyra-content-inset,0px)!important;top:var(--marklyra-content-top,0px)!important}#md-searchpanel{top:var(--marklyra-content-top,0px)!important}';
  document.head.append(style);
  // Install query guards outside tracking's Source replace-all proof wrapper.
  // Unsupported/no-result queries retain their own diagnostics before proof.
  const initialState = state(false);
  installFindReplaceGuard(runtime.editor.searchPanel);
  findPanel.install();
  send('ready', initialState);
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => void ready(), { once: true });
else void ready();

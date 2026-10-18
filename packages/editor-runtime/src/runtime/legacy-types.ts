import type { CursorBookmark } from '../protocol.js';
export interface JQueryElement {
  length: number;
  [index: number]: HTMLElement;
  trigger(name: string): JQueryElement;
}
export interface LegacyNode {
  cid: string;
  toMark(): string;
  get(name: 'after'): LegacyNode | undefined;
  get(
    name: 'text' | 'type' | 'lang' | 'ahead' | 'tail' | 'parent' | 'marginLeft' | 'marginRight',
  ): unknown;
  getFirstChild(): LegacyNode | undefined;
  getFirstBrother(): LegacyNode;
}
export interface LegacyCodeMirrorChange {
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  text: string[];
  origin?: string;
}
export interface LegacyEditor {
  library: {
    outline: {
      toggleOutline(): void;
      hideOutline(): void;
      renderOutline(): void;
      highlightVisibleHeader(): void;
      getHeaderMatrix(plain: boolean): [number, string, string][];
    };
  };
  wordCount: {
    delimiter: number;
    getWordCount(): number;
    getWordCountInSelection(): number;
    getCharCountInSelection(): number;
  };
  isIME: boolean;
  sessionStr: string;
  lastCursor?: CursorBookmark | null;
  focusCid: string | null;
  writingArea: HTMLElement;
  refresh(): void;
  getMarkdown(): string;
  getNode(id: string): LegacyNode | undefined;
  warpContentWithOption(source: string): string;
  store(id?: string | null, deep?: boolean): unknown;
  export: {
    beforeExport(forPrint: boolean): boolean;
    exportToHTML(options: {
      noStyle?: boolean;
      forPrint?: boolean;
      splitPages?: boolean;
    }): Promise<string>;
  };
  imgEdit: {
    insertImageFromURL(source: string): unknown;
    getRealSrc(source: string, ...options: unknown[]): string;
    getLocalRootUrlForInsert(): string;
    buildImageMap(filter?: (source: string) => boolean): string[];
    replaceImageMap(mapping: Record<string, string>, upload?: boolean, message?: string): void;
    switchPattern(
      wrapper: JQueryElement,
      html: boolean,
      restrict?: boolean,
      history?: boolean,
    ): unknown;
    zoomAction(wrapper: JQueryElement, percent: string): void;
  };
  nodeMap: {
    toc?: {
      headers?: unknown[];
      refresh(immediate?: boolean, skipHTML?: boolean): void;
      refreshTimeout?: unknown;
    };
    toMark(...args: unknown[]): string;
    blocks: { sortedFirst(): LegacyNode | undefined };
    link_list: { getHrefByRef(reference: string): string | undefined };
  };
  docMenu: {
    getMetaNode(): { get(key: string): unknown } | null;
    buildMetaMap?(): Record<string, unknown>;
  };
  brush: { brushNode(id: string): void };
  insertText(text: string): void;
  refocus(id?: string): unknown;
  undo: {
    addSnap(id: string, flag: 0 | 2): void;
    index: number;
    commandStack: { redo: object }[];
    undo(): void;
    redo(): void;
    hasUndo(): boolean;
    hasRedo(): boolean;
    exeCommand(command: CursorBookmark): unknown;
    endSnap(force: boolean): void;
    register(command: {
      undo: { type: 'fences-pos'; id: string; pos: { line: number; ch: number } }[];
      redo: object[];
    }): unknown;
  };
  contextMenu: {
    showCustom(...args: unknown[]): unknown;
    getMenuItemsForMac(target: Element): string[];
    getContextTarget(): Element | undefined;
    insertParagraphBefore(): void;
    insertParagraphAfter(): void;
    editActive(): void;
    deleteActive(): void;
  };
  fences: {
    getOptionsFromFencesAttr(language: string): { lineNumbers?: boolean; firstLineNumber?: number };
    copyContent(): void;
    formatContent(selectionOnly?: boolean): void;
    queue?: Record<string, LegacyConfigurableCodeMirror>;
  };
  mathBlock?: { currentCm?: LegacyConfigurableCodeMirror };
  htmlBlock?: { currentCm?: LegacyConfigurableCodeMirror };

  selection: {
    selectAllElem(element: JQueryElement): void;
    buildUndo(): CursorBookmark | null;
    setRange(range: unknown): void;
    jumpIntoElemBegin(element: JQueryElement): void;
    scrollAdjust(): void;
    selectLineWrap(): void;
  };
  sourceView: {
    inSourceMode: boolean;
    show(): void;
    hide(): void;
    cm?: {
      getOption(name: string): unknown;
      setOption(name: string, value: unknown): void;
      getValue(): string;
      getWrapperElement(): HTMLElement;
      getSelection(separator?: string): string;
      getSelections(separator?: string): string[];
      replaceSelections(text: string[], collapse?: string, origin?: string): void;
      getLine(line: number): string | undefined;
      changeGeneration(closeEvent?: boolean): number;
      operation<T>(operation: () => T): T;
      replaceRange(
        text: string,
        from: { line: number; ch: number },
        to?: { line: number; ch: number },
        origin?: string,
      ): void;
      getCursor(which?: 'anchor' | 'head'): { line: number; ch: number };
      listSelections(): {
        anchor: { line: number; ch: number };
        head: { line: number; ch: number };
      }[];
      setSelections(
        ranges: { anchor: { line: number; ch: number }; head: { line: number; ch: number } }[],
        primary?: number,
      ): void;
      doc: {
        cantEdit?: boolean;
        lineSeparator(): string;
        history: {
          generation: number;
          maxGeneration: number;
          done: { changes?: unknown; generation?: number }[];
          undone: { changes?: unknown; generation?: number }[];
        };
      };
      indexFromPos(position: { line: number; ch: number }): number;
      on(
        name: 'beforeChange' | 'change',
        listener: (editor: unknown, change: LegacyCodeMirrorChange) => void,
      ): void;
      focus(): void;
      setCursor(position: { line: number; ch: number }): void;
      coordsChar(
        point: { left: number; top: number },
        mode: 'window',
      ): { line: number; ch: number };
    };
  };
  stylize: {
    toggleStyle(style: string): void;
    changeBlock(type: string): void;
    toggleIndent(type: string): void;
    toggleFences(): void;
    toggleMathBlock(): void;
    insertBlock(type: string): void;
  };
  searchPanel: {
    showPanel(replace?: boolean): void;
    doSearch(text?: string): void;
    highlightNext(backwards?: boolean): void;
  };
  tableEdit: {
    insertTable(): void;
    addRow(before: boolean): unknown;
    addCol(before: boolean): unknown;
    deleteRow(flag?: boolean): void;
    deleteCol(): void;
    deleteTable(): unknown;
    moveRowUpOrDown(up: boolean): unknown;
    moveColLeftOrRight(left: boolean): unknown;
    copyTable(): void;
    reformatTable(): void;
  };
  UserOp: {
    copyHandler(editor: LegacyEditor): void;
    copyAsMarkdown(editor: LegacyEditor): void;
    copyAsHTMLSource(editor: LegacyEditor): void;
    copyAsSemanticHTML(editor: LegacyEditor): void;
    backspaceHandler(editor: LegacyEditor, event: null, mode: 'delSelection'): unknown;
    pasteHandler(editor: LegacyEditor, event: ClipboardEvent | string, plain?: boolean): void;
    moreIndent(editor: LegacyEditor): void;
    lessIndent(editor: LegacyEditor): void;
    insertUrlWithTitle(editor: LegacyEditor, url: string, title: string): void;
  };
  toggleFocusMode(): void;
  toggleTypeWriterMode(): void;
}
export interface LegacyFile {
  editor: LegacyEditor;
  _onInitParse: boolean;
  activeWindow: boolean;
  isLocked: boolean;
  inBusyMode?: boolean;
  option: Record<string, unknown>;
  bundle: Record<string, unknown>;
  useCRLF: boolean;
  finalNewline: boolean;
  setLineEnding(useCRLF: boolean): void;
  reloadContent(source: string, options: { fromDiskChange: true; delayRefresh: false }): void;
  loadFile(path?: string, reload?: boolean, data?: unknown): Promise<void>;
  generateSnap(): unknown;
  getSuggestedFileName(): string;
  sync(save?: boolean, force?: boolean, skipHost?: boolean, modified?: boolean): string | undefined;
  toggleSourceMode(): void;
  setTheme(theme?: string): void;
  markSaved?(): void;
  cut(): void;
}
export interface LegacyConfigurableCodeMirror {
  getOption(name: string): unknown;
  setOption(name: string, value: unknown): void;
}
export interface LegacyGlobals {
  showNotification?(
    message: string,
    html?: boolean,
    buttons?: string,
    action?: () => void,
  ): unknown;
  __MARKLYRA_HTML_MESSAGE__?: (event: unknown) => boolean;
  __MARKLYRA_RENDER_TICKET__?: (preview: unknown, cm: unknown) => { current(): boolean };
  __MARKLYRA_HTML_CALLBACK__?: (callback: () => unknown) => () => unknown;
  __MARKLYRA_RESET_PAIRING__?: () => void;
  __MARKLYRA_RESTORE_BRUSH_CURSOR__?: (
    editor: LegacyEditor,
    bookmark: CursorBookmark,
    restore?: (value: CursorBookmark) => unknown,
  ) => unknown;
  __MARKLYRA_REPLAY_SOURCE_CONTEXT__?: (
    cm: unknown,
    event: unknown,
    execute: () => unknown,
  ) => unknown;
  CodeMirror?: { keyMap: { default: Record<string, unknown> } };
  editor?: LegacyEditor;
  File?: LegacyFile;
  _options: Record<string, unknown>;
  bridge?: { _handleMessageFromObjC(message: string): void };
  $: (element: Element | string) => JQueryElement;
}

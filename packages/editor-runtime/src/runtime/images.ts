import {
  type ClipboardContent,
  type ClipboardImage,
  clipboardContent,
} from '../context-menu/contracts.js';
import {
  displayImageUrl,
  type ImageCheckpoint,
  type ImageContextMessage,
  ImageHostError,
  type ImageImportMessage,
  type ImageResolutionMessage,
  imageHostReference,
  imageMetadataValue,
  imageRoot,
  imageType,
  MAX_IMAGE_FILES,
  type NativeImageResult,
  type NativeInputResult,
  nativeImageResults,
  nativeInputMarkdown,
  VIRTUAL_DOCUMENT_FOLDER,
  VIRTUAL_DOCUMENT_PATH,
} from '../images/contracts.js';
import { imageDestinations } from '../images/references.js';
import type { RuntimeState } from '../protocol.js';
import { clipboardMarkupEvent } from './clipboard-html.js';
import { codeLanguageField, pasteCodeLanguage } from './code-language.js';
import { RuntimeAutomaticImages } from './image-automatic.js';
import { refreshImageBlocks } from './image-refresh.js';
import { preserveImageCodeSelection } from './image-selection.js';
import type { LegacyGlobals } from './legacy-types.js';

interface NativeCodeMirror {
  focus(): void;
  setCursor(point: { line: number; ch: number }): void;
  coordsChar(point: { left: number; top: number }, mode: 'window'): { line: number; ch: number };
}
function nativeCodeMirror(area: HTMLElement, target: Element | null): NativeCodeMirror | undefined {
  const wrapper = target?.closest('.CodeMirror');
  if (!wrapper || !area.contains(wrapper)) return undefined;
  const cm: unknown = Reflect.get(wrapper, 'CodeMirror');
  if (!cm || typeof cm !== 'object') return undefined;
  for (const method of ['focus', 'setCursor', 'coordsChar'])
    if (typeof Reflect.get(cm, method) !== 'function') return undefined;
  return cm as NativeCodeMirror;
}
interface ImageEntry {
  source: string;
  reference: string;
  url?: string;
  state: 'loading' | 'ready' | 'unavailable' | 'error';
}
interface ImportPending {
  resolve(value: { source: string; url: string }): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Dependencies {
  runtime: LegacyGlobals;
  send(kind: string, payload?: unknown): void;
  state(): RuntimeState;
  composing(): boolean;
  loading(): boolean;
  changed(): void;
  pasteContent?(content: ClipboardContent): void;
  normalizeSelection?(): boolean;
  /** The host is replacing image decorations, not editing document text. */
  decorate?(update: () => void): void;
}
/** Image URLs are view decorations. This module never opens native files or writes source URLs. */
export class RuntimeImages {
  private generation = 0;
  private enabled = false;
  private canImport = false;
  private canReadClipboard = false;
  private nativeDrop = false;
  private interaction = 0;
  private hostActions: NonNullable<ImageContextMessage['actions']> = [];
  private nextId = 0;
  private entries = new Map<string, ImageEntry>();
  private requests = new Map<number, string>();
  private imports = new Map<number, ImportPending>();
  private clipboardReads = new Map<
    number,
    {
      resolve(value: ClipboardContent): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly abort = new AbortController();
  private observer: MutationObserver | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private fullRefresh = false;
  private readonly dirtyKeys = new Set<string>();
  private readonly wrappers = new Map<string, Set<HTMLElement>>();
  private readonly wrapperKeys = new WeakMap<HTMLElement, string>();
  private observedRoot = '';
  private installed = false;
  private lastInput = 0;
  private decorating = false;
  readonly automatic: RuntimeAutomaticImages;
  get isDecorating() {
    return this.decorating;
  }
  private readonly placeholder = URL.createObjectURL(
    new Blob(
      [
        Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (char) =>
          char.charCodeAt(0),
        ),
      ],
      { type: 'image/gif' },
    ),
  );
  constructor(private readonly deps: Dependencies) {
    this.automatic = new RuntimeAutomaticImages({
      runtime: deps.runtime,
      state: () => deps.state(),
      available: () => !deps.composing() && !deps.loading(),
      reference: (source) => this.reference(source),
      storage: () => this.storageContext(),
      send: deps.send,
    });
    document.addEventListener(
      'input',
      () => {
        this.lastInput = Date.now();
      },
      { capture: true, signal: this.abort.signal },
    );
    for (const name of ['beforeinput', 'compositionstart', 'pointerdown', 'keydown'])
      document.addEventListener(
        name,
        () => {
          this.interaction++;
        },
        { capture: true, signal: this.abort.signal },
      );
    window.addEventListener(
      'blur',
      () => {
        this.interaction++;
      },
      { signal: this.abort.signal },
    );
    document.addEventListener('paste', this.paste, { capture: true, signal: this.abort.signal });
    document.addEventListener('drop', this.drop, { capture: true, signal: this.abort.signal });
  }
  documentState() {
    return { currentFilePath: VIRTUAL_DOCUMENT_PATH, currentFolderPath: VIRTUAL_DOCUMENT_FOLDER };
  }
  setContext(value: ImageContextMessage): void {
    if (!Number.isSafeInteger(value.generation) || value.generation < this.generation)
      throw new ImageHostError('图片文档世代无效');
    this.generation = value.generation;
    this.enabled = value.enabled;
    this.canImport = value.canImport;
    this.canReadClipboard = Boolean(value.readClipboard);
    this.nativeDrop = Boolean(value.nativeDrop);
    this.hostActions = value.actions ?? [];
    this.automatic.configure(value.generation, Boolean(value.automatic));
    this.entries.clear();
    this.requests.clear();
    this.wrappers.clear();
    this.observedRoot = this.root();
    for (const item of this.imports.values()) {
      clearTimeout(item.timer);
      item.reject(new ImageHostError('图片导入已取消：文档上下文已改变'));
    }
    this.imports.clear();
    this.cancelClipboardReads();
    if (this.deps.runtime.File) Object.assign(this.deps.runtime.File.bundle, this.documentState());
    this.scheduleRefresh();
  }
  get actions() {
    return this.hostActions;
  }
  get contextGeneration() {
    return this.generation;
  }
  install(): void {
    const editor = this.deps.runtime.editor;
    if (this.installed || !editor) return;
    this.installed = true;
    this.automatic.install();
    // The resolver otherwise creates file:// URLs. No fallback may grant file/network access.
    editor.imgEdit.getRealSrc = (source: string) => this.resolve(source);
    document.addEventListener('load', this.imageLoaded, {
      capture: true,
      signal: this.abort.signal,
    });
    document.addEventListener('error', this.imageFailed, {
      capture: true,
      signal: this.abort.signal,
    });
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes)
          this.visitWrappers(node, (item) => this.untrack(item));
        for (const node of record.addedNodes) this.visitWrappers(node, (item) => this.track(item));
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement;
        const wrapper = target?.closest<HTMLElement>('.md-image');
        if (wrapper) this.track(wrapper);
      }
      this.documentChanged();
    });
    this.observer.observe(editor.writingArea, { childList: true, subtree: true });
    this.visitWrappers(editor.writingArea, (item) => this.track(item));
    const style = document.createElement('style');
    style.textContent =
      '#write .md-image[data-marklyra-image-state]:not([data-marklyra-image-state="ready"]){min-width:110px;min-height:28px;outline:1px dashed currentColor}#write .md-image[data-marklyra-image-state="loading"]::after{content:"图片加载中…"}#write .md-image[data-marklyra-image-state="unavailable"]::after,#write .md-image[data-marklyra-image-state="error"]::after{content:"图片不可用"}';
    document.head.append(style);
  }
  private root(): string {
    const text = this.deps.runtime.editor?.docMenu.getMetaNode()?.get('text');
    return imageRoot(typeof text === 'string' ? text : '');
  }
  private key(source: string) {
    return `${this.root()}\u0000${source}`;
  }
  /** Reuse an already-authorized display resource; never expose the loading placeholder. */
  previewUrl(source: string): string | undefined {
    if (/^data:/i.test(source)) {
      try {
        return displayImageUrl(source, location.href);
      } catch {
        return undefined;
      }
    }
    const entry = this.entries.get(this.key(source));
    return entry?.state === 'ready' ? entry.url : undefined;
  }
  private resolve(source: string): string {
    if (/^data:/i.test(source)) {
      try {
        return displayImageUrl(source, location.href);
      } catch {
        return this.placeholder;
      }
    }
    const key = this.key(source);
    const old = this.entries.get(key);
    if (old) return old.url ?? this.placeholder;
    let reference: string;
    try {
      reference = imageHostReference(source, this.root());
    } catch {
      this.entries.set(key, { source, reference: '', state: 'unavailable' });
      return this.placeholder;
    }
    const entry: ImageEntry = {
      source,
      reference,
      state: this.enabled ? 'loading' : 'unavailable',
    };
    this.entries.set(key, entry);
    if (this.enabled) {
      const id = ++this.nextId;
      this.requests.set(id, key);
      this.deps.send('image-resolve', {
        generation: this.generation,
        id,
        source,
        reference,
      } satisfies ImageResolutionMessage);
    }
    return this.placeholder;
  }
  resolved(value: { generation: number; id: number; url?: string; error?: string }): void {
    if (value.generation !== this.generation) return;
    const key = this.requests.get(value.id);
    if (!key) return;
    this.requests.delete(value.id);
    const entry = this.entries.get(key);
    if (!entry) return;
    try {
      if (value.url) {
        entry.url = displayImageUrl(value.url, location.href);
        entry.state = 'ready';
      } else entry.state = value.error ? 'error' : 'unavailable';
    } catch {
      entry.state = 'error';
    }
    this.scheduleRefresh(key);
  }
  imported(value: {
    generation: number;
    id: number;
    source?: string;
    url?: string;
    error?: string;
  }): void {
    if (value.generation !== this.generation) return;
    const pending = this.imports.get(value.id);
    if (!pending) return;
    this.imports.delete(value.id);
    clearTimeout(pending.timer);
    if (value.error || !value.source || !value.url)
      pending.reject(new ImageHostError(value.error ?? '宿主未返回图片资源'));
    else pending.resolve({ source: value.source, url: value.url });
  }
  /** Called after model changes, including edits to YAML outside image DOM. */
  documentChanged(): void {
    this.automatic.changed();
    if (!this.installed || this.deps.loading()) return;
    const root = this.root();
    if (root === this.observedRoot) return;
    this.observedRoot = root;
    this.entries.clear();
    this.requests.clear();
    this.scheduleRefresh();
  }
  refreshReferences(): void {
    this.entries.clear();
    this.requests.clear();
    this.scheduleRefresh();
  }
  reference(source: string): string {
    return imageHostReference(source, this.root());
  }
  private visitWrappers(node: Node, visit: (item: HTMLElement) => void): void {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLElement && node.matches('.md-image')) visit(node);
    for (const wrapper of node.querySelectorAll<HTMLElement>('.md-image')) visit(wrapper);
  }
  private untrack(wrapper: HTMLElement): void {
    const previous = this.wrapperKeys.get(wrapper);
    if (previous) {
      const elements = this.wrappers.get(previous);
      elements?.delete(wrapper);
      if (!elements?.size) this.wrappers.delete(previous);
    }
    this.wrapperKeys.delete(wrapper);
  }
  private track(wrapper: HTMLElement): void {
    const source = this.sourceFor(wrapper);
    if (!source || !wrapper.isConnected) return;
    const key = this.key(source);
    if (this.wrapperKeys.get(wrapper) !== key) this.untrack(wrapper);
    wrapper.dataset.marklyraImageSource = source;
    this.wrapperKeys.set(wrapper, key);
    let elements = this.wrappers.get(key);
    if (!elements) {
      elements = new Set();
      this.wrappers.set(key, elements);
    }
    elements.add(wrapper);
    const entry = this.entries.get(key);
    if (entry) wrapper.dataset.marklyraImageState = entry.state;
  }
  /** A completion only touches blocks displaying that source/root key. */
  private scheduleRefresh(key?: string): void {
    if (key === undefined) this.fullRefresh = true;
    else this.dirtyKeys.add(key);
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => this.refresh(), 30);
  }
  private refresh(): void {
    this.refreshTimer = undefined;
    if (this.abort.signal.aborted) return;
    if (this.deps.loading() || this.deps.composing() || Date.now() - this.lastInput < 150) {
      this.refreshTimer = setTimeout(() => this.refresh(), 30);
      return;
    }
    this.documentChanged();
    const editor = this.deps.runtime.editor;
    if (!editor) return;
    const blocks = new Set<string>();
    const collect = (image: HTMLElement) => {
      const cid = image.isConnected ? image.closest('[cid]')?.getAttribute('cid') : null;
      if (cid) blocks.add(cid);
      else this.untrack(image);
    };
    if (this.fullRefresh) {
      this.wrappers.clear();
      this.visitWrappers(editor.writingArea, (item) => {
        this.track(item);
        collect(item);
      });
    } else {
      for (const key of this.dirtyKeys)
        for (const image of this.wrappers.get(key) ?? []) collect(image);
    }
    this.fullRefresh = false;
    this.dirtyKeys.clear();
    if (!blocks.size) return;
    const restoreCodeSelection = preserveImageCodeSelection(editor.writingArea, () =>
      editor.sourceView.inSourceMode ? editor.sourceView.cm : undefined,
    );
    const selected = document.getSelection();
    const preserve =
      document.hasFocus() &&
      selected?.anchorNode &&
      editor.writingArea.contains(selected.anchorNode) &&
      editor.writingArea.contains(document.activeElement);
    // Bookmarks read an Element-end caret as text offset zero. Use the
    // proven plain source range before bookmarking a decoration-only refresh.
    if (
      preserve &&
      (selected.anchorNode instanceof Element || selected.focusNode instanceof Element)
    )
      this.deps.normalizeSelection?.();
    const bookmark = preserve ? editor.selection.buildUndo() : null;
    const range = selected?.rangeCount ? selected.getRangeAt(0) : null;
    const backward = Boolean(
      preserve &&
        range &&
        !selected?.isCollapsed &&
        (selected?.anchorNode !== range.startContainer ||
          selected?.anchorOffset !== range.startOffset),
    );
    this.decorating = true;
    try {
      const repaint = () => {
        refreshImageBlocks(editor, blocks);
      };
      if (this.deps.decorate) this.deps.decorate(repaint);
      else repaint();
      if (bookmark) {
        editor.undo.exeCommand(bookmark);
        // Undo bookmarks preserve the range but not its selection direction.
        const restored = document.getSelection();
        const restoredRange = restored?.rangeCount ? restored.getRangeAt(0) : null;
        if (backward && restored && restoredRange)
          restored.setBaseAndExtent(
            restoredRange.endContainer,
            restoredRange.endOffset,
            restoredRange.startContainer,
            restoredRange.startOffset,
          );
      }
      restoreCodeSelection?.();
    } finally {
      this.decorating = false;
    }
  }
  sourceFor(wrapper: HTMLElement): string | undefined {
    const image = wrapper.querySelector('img');
    const sourceSpan = wrapper.querySelector('.md-image-src-span')?.textContent?.trim();
    if (sourceSpan && this.entries.has(this.key(sourceSpan))) return sourceSpan;
    if (wrapper.dataset.ref) {
      const reference = this.deps.runtime.editor?.nodeMap.link_list.getHrefByRef(
        wrapper.dataset.ref,
      );
      if (reference) return reference;
    }
    return (
      wrapper.dataset.src ||
      image?.dataset.marklyraImageSource ||
      wrapper.dataset.marklyraImageSource ||
      [...this.entries.values()].find((entry) => entry.url === image?.getAttribute('src'))?.source
    );
  }
  private imageLoaded = (event: Event): void => {
    if (!(event.target instanceof HTMLImageElement) || event.target.naturalWidth === 0) return;
    const wrapper = event.target.closest<HTMLElement>('#write .md-image');
    if (!wrapper) return;
    const source = this.sourceFor(wrapper),
      entry = source ? this.entries.get(this.key(source)) : undefined;
    if (entry?.url === event.target.getAttribute('src')) {
      entry.state = 'ready';
      wrapper.dataset.marklyraImageState = 'ready';
    }
  };
  private imageFailed = (event: Event): void => {
    if (!(event.target instanceof HTMLImageElement)) return;
    const wrapper = event.target.closest<HTMLElement>('#write .md-image');
    if (!wrapper) return;
    const source = this.sourceFor(wrapper),
      entry = source ? this.entries.get(this.key(source)) : undefined;
    if (entry?.url === event.target.getAttribute('src')) {
      entry.state = 'error';
      wrapper.dataset.marklyraImageState = 'error';
    }
  };
  private decorate(): void {
    for (const image of this.deps.runtime.editor?.writingArea.querySelectorAll<HTMLElement>(
      '.md-image',
    ) ?? []) {
      this.track(image);
    }
  }
  capture(): ImageCheckpoint {
    if (this.deps.composing() || this.deps.loading())
      throw new ImageHostError('请先完成输入或文档切换');
    // The bookmark reads valid Element boundaries as offset zero.
    // Reuse the source-proven endpoint normalization before freezing its cursor.
    this.deps.normalizeSelection?.();
    const state = this.deps.state();
    return {
      generation: this.generation,
      canonical: state.canonical,
      sequence: state.sequence,
      bookmark: state.selection.bookmark,
      ...this.storageContext(),
    };
  }
  storageContext(): { referenceRoot: string; storageFolder?: string; sourceMode: boolean } {
    const editor = this.deps.runtime.editor;
    const setting = editor?.sourceView.inSourceMode
      ? undefined
      : imageMetadataValue(
          Object.entries(editor?.docMenu.buildMetaMap?.() ?? {}),
          'copy-images-to',
        );
    let storageFolder: string | undefined;
    if (typeof setting === 'string' && setting.trim()) {
      if (/^(?:ipic|upload)$/i.test(setting)) storageFolder = 'upload';
      else {
        storageFolder = setting.replace(/^(?:\.\/)+/, '').replace(/^[\\/]+/, '') || '.';
        // These are ordinary YAML directory paths, unlike the exact bare
        // upload value or the host preference's internal TextBundle mode.
        if (/^(?:ipic|upload|textbundle)$/i.test(storageFolder))
          storageFolder = `./${storageFolder}`;
      }
    }
    return {
      referenceRoot: this.root(),
      sourceMode: Boolean(editor?.sourceView.inSourceMode),
      ...(storageFolder === undefined ? {} : { storageFolder }),
    };
  }
  captureNative(point?: { x: number; y: number }): ImageCheckpoint {
    if (this.deps.composing() || this.deps.loading())
      throw new ImageHostError('请先完成输入或文档切换');
    const editor = this.deps.runtime.editor;
    if (!editor) throw new ImageHostError('编辑器尚未初始化');
    if (point) {
      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x >= 1 ||
        point.y < 0 ||
        point.y >= 1
      )
        throw new ImageHostError('文件拖入位置无效');
      const x = point.x * window.innerWidth,
        y = point.y * window.innerHeight;
      const target = document.elementFromPoint(x, y);
      if (editor.sourceView.inSourceMode) {
        const cm = editor.sourceView.cm;
        if (!cm || !target?.closest('#marklyra-source'))
          throw new ImageHostError('文件拖入位置不在源码编辑区域');
        cm.focus();
        cm.setCursor(cm.coordsChar({ left: x, top: y }, 'window'));
      } else {
        if (!target || !editor.writingArea.contains(target))
          throw new ImageHostError('文件拖入位置不在正文编辑区域');
        const cm = nativeCodeMirror(editor.writingArea, target);
        if (cm) {
          cm.focus();
          cm.setCursor(cm.coordsChar({ left: x, top: y }, 'window'));
        } else {
          const doc = document as Document & {
            caretRangeFromPoint?(x: number, y: number): Range | null;
            caretPositionFromPoint?(
              x: number,
              y: number,
            ): { offsetNode: Node; offset: number } | null;
          };
          let range = doc.caretRangeFromPoint?.(x, y);
          if (!range) {
            const position = doc.caretPositionFromPoint?.(x, y);
            if (position) {
              range = document.createRange();
              range.setStart(position.offsetNode, position.offset);
              range.collapse(true);
            }
          }
          if (!range || !editor.writingArea.contains(range.startContainer))
            throw new ImageHostError('无法绑定文件拖入选区');
          editor.writingArea.focus();
          document.getSelection()?.removeAllRanges();
          document.getSelection()?.addRange(range);
        }
      }
    }
    if (
      !editor.sourceView.inSourceMode &&
      !nativeCodeMirror(editor.writingArea, document.activeElement)
    ) {
      const selection = document.getSelection();
      if (
        !selection?.anchorNode ||
        !selection.focusNode ||
        !editor.writingArea.contains(selection.anchorNode) ||
        !editor.writingArea.contains(selection.focusNode)
      )
        throw new ImageHostError('无法绑定原生输入选区');
    }
    const checkpoint = this.capture();
    return {
      ...checkpoint,
      destination: {
        selection: JSON.stringify(checkpoint.bookmark),
        interaction: this.interaction,
      },
    };
  }
  insert(value: {
    checkpoint: ImageCheckpoint;
    source: string;
    url: string;
    name: string;
  }): RuntimeState {
    return this.insertMany({ checkpoint: value.checkpoint, images: [value] });
  }
  verify(expected: ImageCheckpoint): boolean {
    const current = this.capture();
    if (
      expected.generation !== current.generation ||
      expected.sequence !== current.sequence ||
      expected.canonical !== current.canonical ||
      (expected.destination &&
        (expected.destination.interaction !== this.interaction ||
          expected.destination.selection !== JSON.stringify(current.bookmark)))
    )
      throw new ImageHostError(
        '图片导入期间文档或选区已有更改，已取消迟到的插入；宿主已创建的资源文件可能保留',
      );
    return true;
  }
  insertMany(value: {
    checkpoint: ImageCheckpoint;
    images: readonly NativeInputResult[];
  }): RuntimeState {
    this.verify(value.checkpoint);
    const editor = this.deps.runtime.editor;
    if (!editor) throw new ImageHostError('编辑器尚未初始化');
    if (
      !Array.isArray(value.images) ||
      !value.images.length ||
      value.images.length > MAX_IMAGE_FILES
    )
      throw new ImageHostError('一次最多导入 128 张图片');
    // Validate the complete batch before changing either source or decoration state.
    const images = nativeImageResults(value.images, location.href);
    const markdown = images.map(nativeInputMarkdown).join('\n\n');
    for (const image of images)
      if (image.kind !== 'link')
        this.entries.set(this.key(image.source), {
          source: image.source,
          reference: imageHostReference(image.source, this.root()),
          url: image.url,
          state: 'ready',
        });
    if (value.checkpoint.bookmark) editor.undo.exeCommand(value.checkpoint.bookmark);
    this.automatic.managed(() => editor.insertText(markdown));
    this.deps.changed();
    this.decorate();
    return this.deps.state();
  }
  private async prepareData(
    name: string,
    type: string,
    bytes: Uint8Array,
    checkpoint: ImageCheckpoint,
  ): Promise<NativeImageResult> {
    if (!this.canImport) throw new ImageHostError('宿主尚未提供图片导入能力');
    imageType(name, type, bytes.byteLength);
    this.verify(checkpoint);
    const id = ++this.nextId;
    const result = await new Promise<{ source: string; url: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.imports.delete(id);
        reject(new ImageHostError('图片导入超时'));
      }, 30_000);
      this.imports.set(id, { resolve, reject, timer });
      this.deps.send('image-import', {
        generation: this.generation,
        referenceRoot: checkpoint.referenceRoot,
        ...(checkpoint.storageFolder === undefined
          ? {}
          : { storageFolder: checkpoint.storageFolder }),
        id,
        name,
        type,
        bytes,
      } satisfies ImageImportMessage);
    });
    this.verify(checkpoint);
    return { ...result, name };
  }
  private async importData(
    name: string,
    type: string,
    bytes: Uint8Array,
    checkpoint: ImageCheckpoint,
  ): Promise<void> {
    const result = await this.prepareData(name, type, bytes, checkpoint);
    this.insert({ checkpoint, ...result });
  }
  importClipboardImage(image: ClipboardImage): void {
    const checkpoint = this.capture();
    if (!this.canImport) throw new ImageHostError('宿主尚未提供图片导入能力');
    void this.importData(image.name, image.type, image.bytes, checkpoint).catch((error) =>
      this.deps.send('runtime-error', String(error)),
    );
  }
  clipboardResult(value: {
    id: number;
    generation: number;
    content?: unknown;
    error?: string;
  }): void {
    if (value.generation !== this.generation) return;
    const pending = this.clipboardReads.get(value.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.clipboardReads.delete(value.id);
    if (value.error) pending.reject(new ImageHostError(value.error));
    else {
      try {
        pending.resolve(clipboardContent(value.content));
      } catch (error) {
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  private cancelClipboardReads(): void {
    for (const pending of this.clipboardReads.values()) {
      clearTimeout(pending.timer);
      pending.reject(new ImageHostError('剪贴板粘贴已取消：文档上下文已改变'));
    }
    this.clipboardReads.clear();
  }
  private async pasteFromHost(): Promise<void> {
    const checkpoint = this.captureNative();
    const editor = this.deps.runtime.editor;
    if (!editor) throw new ImageHostError('编辑器尚未初始化');
    const id = ++this.nextId;
    const content = await new Promise<ClipboardContent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.clipboardReads.delete(id);
        reject(new ImageHostError('剪贴板读取超时'));
      }, 30_000);
      this.clipboardReads.set(id, { resolve, reject, timer });
      this.deps.send('clipboard-read', { id, generation: this.generation, checkpoint });
    });
    if (this.deps.runtime.editor !== editor) throw new ImageHostError('剪贴板编辑器上下文已改变');
    this.verify(checkpoint);
    if (content.imageReferences && !content.html && !content.markHtml) {
      this.insertMany({ checkpoint, images: content.imageReferences });
    } else if (content.image && !content.html && !content.markHtml) {
      if (!this.canImport) throw new ImageHostError('宿主尚未提供图片导入能力');
      await this.importData(
        content.image.name,
        content.image.type,
        content.image.bytes,
        checkpoint,
      );
    } else if (content.text || content.html || content.markHtml) {
      if (checkpoint.bookmark) this.deps.runtime.editor?.undo.exeCommand(checkpoint.bookmark);
      this.deps.pasteContent?.(content);
      this.deps.changed();
    }
  }
  private importFiles(files: File[]): void {
    void (async () => {
      if (files.length > MAX_IMAGE_FILES) throw new ImageHostError('一次最多导入 128 张图片');
      const checkpoint = this.captureNative();
      const entries = files.map((file) => ({
        file,
        type: imageType(file.name, file.type, file.size),
      }));
      const images: NativeImageResult[] = [];
      for (const { file, type } of entries) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        images.push(await this.prepareData(file.name, type, bytes, checkpoint));
      }
      this.insertMany({ checkpoint, images });
    })().catch((error) => this.deps.send('runtime-error', String(error)));
  }
  /** Restore source destinations before image HTML crosses document/iframe boundaries. */
  clipboardHTML(html: string, forPaste = false): string {
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const image of template.content.querySelectorAll<HTMLImageElement>('img')) {
      const wrapper = image.closest<HTMLElement>(
        '.md-image,[md-inline="image"],[md-inline="imgtag"]',
      );
      const src = image.getAttribute('src') ?? '';
      const known = [...this.entries.values()].find((entry) => entry.url === src);
      let model: ReturnType<typeof imageDestinations> = [];
      if (forPaste && wrapper) {
        try {
          model = imageDestinations(wrapper.textContent ?? '');
        } catch {
          /* Retained source metadata still receives the URL checks below. */
        }
      }
      const source =
        (model.length === 1 ? model[0]?.source : undefined) ??
        image.dataset.marklyraImageSource ??
        (wrapper ? this.sourceFor(wrapper) : undefined) ??
        known?.source;
      if (!source) continue;
      if (!/^data:/i.test(source)) imageHostReference(source);
      image.setAttribute('src', source);
      image.dataset.marklyraImageSource = source;
      if (wrapper) {
        wrapper.dataset.src = source;
        if (forPaste) {
          wrapper.dataset.root =
            this.deps.runtime.editor?.imgEdit.getLocalRootUrlForInsert() || VIRTUAL_DOCUMENT_PATH;
          wrapper.dataset.copyFromPath = VIRTUAL_DOCUMENT_PATH;
        }
      }
    }
    return template.innerHTML;
  }
  private paste = (event: ClipboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#write,#marklyra-source')) return;
    const language = codeLanguageField(this.deps.runtime.editor, target);
    if (language) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.deps.composing() || this.deps.loading() || this.deps.runtime.File?.isLocked) return;
      pasteCodeLanguage(language, event.clipboardData?.getData('text/plain') ?? '');
      return;
    }
    const sourceMode = Boolean(this.deps.runtime.editor?.sourceView.inSourceMode);
    const files = Array.from(event.clipboardData?.files ?? []);
    const markup = event.clipboardData?.getData('text/markhtml') ?? '';
    const html = event.clipboardData?.getData('text/html') ?? '';
    const stop = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (markup || html) {
      // Keep the ordinary HTML route, but never let a mixed Files
      // flavor outrank the richer content or force a duplicate binary import.
      if (!markup && !files.length) return;
      stop();
      if (this.deps.composing() || this.deps.loading()) return;
      const editor = this.deps.runtime.editor;
      if (!editor) return;
      try {
        const content = {
          text: event.clipboardData?.getData('text/plain') ?? '',
          html,
          ...(markup ? { markHtml: markup } : {}),
        };
        // Rich paste bookmarks read an Element-end caret as offset
        // zero; normalize that proven source position before its snapshot.
        this.deps.normalizeSelection?.();
        if (!sourceMode && markup)
          editor.UserOp.pasteHandler(
            editor,
            clipboardMarkupEvent(content, (value) => this.clipboardHTML(value, true)),
          );
        else this.deps.pasteContent?.(content);
        this.deps.changed();
      } catch (error) {
        this.deps.send('runtime-error', String(error));
      }
      return;
    }
    if (files.length) {
      stop();
      // Native snapshots own real system format selection (including TIFF to
      // PNG conversion). Synthetic browser File tests retain their Blob route;
      // isTrusted chooses a transport and never grants native file authority.
      const native =
        this.canReadClipboard &&
        ((event.isTrusted && this.nativeDrop) ||
          files.some(
            (file) =>
              /^(?:image\/(?:tiff|x-tiff))$/i.test(file.type) || /\.tiff?$/i.test(file.name),
          ));
      if (native)
        void this.pasteFromHost().catch((error) => this.deps.send('runtime-error', String(error)));
      else this.importFiles(files);
      return;
    }
    if (this.canReadClipboard && (sourceMode || !target.closest('input,textarea'))) {
      stop();
      void this.pasteFromHost().catch((error) => this.deps.send('runtime-error', String(error)));
    }
  };
  private drop = (event: DragEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#write,#marklyra-source')) return;
    // Native has relinquished rich drops to WebKit. Preserve every
    // rich flavor and its priority; Files must not claim that same gesture.
    const markup = event.dataTransfer?.getData('text/markhtml') ?? '';
    const html = event.dataTransfer?.getData('text/html') ?? '';
    if (markup || html) {
      const sourceMode = Boolean(this.deps.runtime.editor?.sourceView.inSourceMode);
      // CodeMirror's native File handling cannot provide Source text semantics.
      // The SDK private Markdown flavor also needs its existing sanitizer;
      // ordinary WYS HTML remains entirely on the drop route.
      if (sourceMode || (markup && !html)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.deps.composing() || this.deps.loading()) return;
        const text = event.dataTransfer?.getData('text/plain') ?? '';
        if (sourceMode && !text) return;
        try {
          this.captureNative({
            x: event.clientX / window.innerWidth,
            y: event.clientY / window.innerHeight,
          });
          this.deps.pasteContent?.(sourceMode ? { text } : { text, markHtml: markup });
          this.deps.changed();
        } catch (error) {
          this.deps.send('runtime-error', String(error));
        }
      }
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    const filePayload =
      files.length > 0 || Array.from(event.dataTransfer?.types ?? []).includes('Files');
    if (this.nativeDrop && filePayload) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const doc = document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null };
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range && this.deps.runtime.editor?.writingArea.contains(range.startContainer)) {
      const selected = document.getSelection();
      selected?.removeAllRanges();
      selected?.addRange(range);
    }
    this.importFiles(files);
  };
  destroy(): void {
    this.automatic.destroy();
    this.abort.abort();
    this.observer?.disconnect();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    URL.revokeObjectURL(this.placeholder);
    for (const item of this.imports.values()) {
      clearTimeout(item.timer);
      item.reject(new ImageHostError('Editor has been destroyed'));
    }
    this.imports.clear();
    this.cancelClipboardReads();
  }
}

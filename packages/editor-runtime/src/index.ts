import {
  type MarkLyraStartupPreferences,
  marklyraStartupPreferences,
} from './startup-preferences.js';

export {
  defaultMarkLyraStartupPreferences,
  type MarkLyraStartupPreferences,
  marklyraStartupPreferences,
} from './startup-preferences.js';

import {
  type MarkLyraMarkdownPreferences,
  markdownSerializationPolicy,
  marklyraMarkdownPreferences,
  type ResolvedMarkLyraMarkdownPreferences,
  sameMarkdownPolicy,
} from './markdown-preferences.js';
import type { MarkLyraMenuState } from './menu-state.js';
import { MenuStateObserver } from './menu-state-observer.js';
import { type MarkLyraEditorPreferences, marklyraEditorPreferences } from './preferences.js';

export type { MarkLyraMenuState } from './menu-state.js';

import { type MarkLyraStatistics, type StatisticsOptions, statisticsSpeed } from './statistics.js';

export {
  defaultMarkLyraMarkdownPreferences,
  type MarkLyraMarkdownPreferences,
  marklyraMarkdownPreferences,
  type ResolvedMarkLyraMarkdownPreferences,
} from './markdown-preferences.js';
export {
  defaultMarkLyraEditorPreferences,
  type MarkLyraEditorPreferences,
  marklyraEditorPreferences,
  type ResolvedMarkLyraEditorPreferences,
} from './preferences.js';
export type { MarkLyraStatistics, StatisticsOptions } from './statistics.js';

import {
  type ReloadFromDiskOptions,
  type RuntimeReloadResult,
  validateReload,
} from './reload/contracts.js';

export type { ReloadFromDiskOptions } from './reload/contracts.js';

import { type ExportHTMLOptions, exportOptions } from './export/options.js';

export type { ExportHTMLOptions } from './export/options.js';

import { SourceMirror } from '@marklyra/editor-core';
import type {
  MarkLyraExtension,
  MarkLyraExtensionError,
  MarkLyraExtensionRegistration,
} from './extensions/contracts.js';
import { MarkLyraExtensionRegistry } from './extensions/registry.js';

export type {
  MarkLyraExtension,
  MarkLyraExtensionCleanup,
  MarkLyraExtensionCommandContext,
  MarkLyraExtensionCommandHandler,
  MarkLyraExtensionContext,
  MarkLyraExtensionEditorCommand,
  MarkLyraExtensionError,
  MarkLyraExtensionRegistration,
} from './extensions/contracts.js';

import { clipboardContent, nativeClipboardImages } from './context-menu/contracts.js';
import { type ContextMenuHostOptions, HostContextMenu } from './context-menu/host.js';
import {
  type ImageAutomaticMessage,
  type ImageCheckpoint,
  type ImageContextMessage,
  type ImageHostAdapter,
  ImageHostError,
  type ImageImportMessage,
  type ImageResolutionMessage,
  imageType,
  type NativeImageImporter,
  type NativeImageInput,
} from './images/contracts.js';
import { DocumentImages, type ImageGeneration } from './images/host.js';
import {
  applyImagePatches,
  type ImageReferenceReplacement,
  imageDestinations,
  imageReferencePatches,
} from './images/references.js';
import {
  type Envelope,
  type HostAction,
  isEnvelope,
  type MarkdownPreferencesResolution,
  type MarkLyraCommand,
  type OutlineEntry,
  PROTOCOL,
  type RuntimeConfiguration,
  type RuntimeSelection,
  type RuntimeState,
  type RuntimeStatisticsPacket,
} from './protocol.js';
import { offsetAt, positionAt } from './source-position.js';
import { type ThemeAppearance, themeAppearance } from './styles/appearance.js';
import { emptyThemeStyles, type ThemeStyles, themeStyles } from './styles/contracts.js';
import { type ThemeFont, themeFonts } from './styles/fonts.js';

export { browserClipboard, browserContextMenu } from './context-menu/browser.js';
export type {
  ClipboardAdapter,
  ClipboardContent,
  ClipboardImage,
  ContextAction,
  ContextMenuAdapter,
  ContextMenuItem,
  ContextMenuRequest,
} from './context-menu/contracts.js';
export type {
  ImageActionRequest,
  ImageAutomaticRequest,
  ImageHostAction,
  ImageHostAdapter,
  ImageImportRequest,
  ImageResolveRequest,
  NativeImageImporter,
  NativeImageImportRequest,
  NativeImageInput,
  NativeImageResult,
  NativeInput,
  NativeInputImporter,
  NativeInputImportRequest,
  NativeInputResult,
  NativeLinkResult,
} from './images/contracts.js';
export { MAX_IMAGE_BYTES } from './images/contracts.js';
export type { ImageReferenceReplacement } from './images/references.js';
export { rewriteImageReferences } from './images/references.js';
export type {
  CursorBookmark,
  HostAction,
  MarkLyraCommand,
  OutlineEntry,
  RuntimeConfiguration,
  RuntimeSelection,
} from './protocol.js';
export type { ThemeAppearance } from './styles/appearance.js';
export type { ThemeStyles } from './styles/contracts.js';
export type { ThemeFont, ThemeFontDescriptors, ThemeFontSource } from './styles/fonts.js';
export {
  MAX_THEME_FONT_BYTES,
  MAX_THEME_FONT_FACES,
  MAX_THEME_FONT_TOTAL_BYTES,
  themeFonts,
} from './styles/fonts.js';
export interface MarkLyraHostAdapter extends ContextMenuHostOptions {
  images?: ImageHostAdapter;
  onAction?: (action: HostAction) => void;
  onUnsupportedCapability?: (name: string) => void;
}
export type MarkLyraViewMode = 'wysiwyg' | 'source';
export interface MarkLyraEditorOptions {
  runtimeUrl: string;
  markdown?: string;
  documentContext?: string | null;
  configuration?: Partial<RuntimeConfiguration>;
  preferences?: Partial<MarkLyraEditorPreferences>;
  startupPreferences?: Partial<MarkLyraStartupPreferences>;
  markdownPreferences?: Partial<MarkLyraMarkdownPreferences>;
  styles?: Partial<ThemeStyles>;
  onThemeAppearanceChange?: (appearance: ThemeAppearance) => void;
  onOutlinePopoverChange?: (open: boolean) => void;
  onViewModeChange?: (mode: MarkLyraViewMode) => void;
  onScrollAwayFromTopChange?: (awayFromTop: boolean) => void;
  onLinkHintPreferenceChange?: (suppressed: boolean) => void;
  onMenuStateChange?: (state: MarkLyraMenuState) => void;
  onOutlinePin?: () => void;
  onCurrentHeadingChange?: (id: string | null) => void;
  host?: MarkLyraHostAdapter;
  onChange?: (source: string) => void;
  onSelectionChange?: (selection: RuntimeSelection) => void;
  onOutlineChange?: (outline: OutlineEntry[]) => void;
  onError?: (error: Error) => void;
  onExtensionError?: (error: MarkLyraExtensionError) => void;
  onStatisticsInvalidated?: () => void;
}
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
/** Independent browser SDK. The runtime URL is provided by a host, never a filesystem path. */
export class MarkLyraEditor {
  readonly element: HTMLIFrameElement;
  readonly ready: Promise<void>;
  private channel = crypto.randomUUID();
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private disposed = false;
  private composing = false;
  private readonly compositionWaiters = new Set<{ resolve(): void; reject(error: Error): void }>();
  private pendingChanges = false;
  private latestSequence = 0;
  private viewMode: MarkLyraViewMode | undefined;
  private viewModeOrder = 0;
  private readonly viewStateOrders = new WeakMap<object, number>();
  private readonly menuObserver = new MenuStateObserver((error) => {
    if (!this.disposed)
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  });
  private mirror: SourceMirror | null = null;
  private checkpoint = 0;
  private checkpointStates = new Map<number, number>();
  private runtimeProjectionEpochOffset = 0;
  private source: string;
  private readonly images: DocumentImages;
  private readonly nativeImageInputs = new Set<string>();
  private readonly contextMenu: HostContextMenu;
  private readonly extensions: MarkLyraExtensionRegistry;
  private readonly exportRenderers = new Set<MarkLyraEditor>();
  private readonly imageReferenceRenderers = new Set<MarkLyraEditor>();
  private readonly imageAutomaticRequests = new Map<string, AbortController>();
  private statisticsVersion = 0;
  private statisticsGeneration = 0;
  private statisticsSourceCache:
    | { canonical: string; generation: number; words: number }
    | undefined;
  private readonly statisticsRenderers = new Set<MarkLyraEditor>();
  private activeTheme: RuntimeConfiguration['theme'];
  private activeStyles: ThemeStyles = { ...emptyThemeStyles };
  private readonly startupPreferences: MarkLyraStartupPreferences;
  private activePreferences: MarkLyraEditorPreferences;
  private activeMarkdownPreferences: ResolvedMarkLyraMarkdownPreferences;
  private unconfirmedMarkdownToken: number | undefined;
  private outlinePopoverOpen = false;
  private currentHeading: string | null = null;
  private contentInset = { left: 0, top: 0, right: 0 };
  private contentInsetTarget = { left: 0, top: 0, outlineTop: 0, right: 0, sequence: 0 };
  private contentInsetApplied = 0;
  private findPanelBounds: { top: number; bottom: number; shadow: string } | null = null;
  private findPanelShadow: HTMLDivElement | null = null;
  private findPanelTrailingShadow: HTMLDivElement | null = null;
  private readonly sourceBOM: NonNullable<RuntimeConfiguration['sourceBOM']>;
  private documentRevision = 0;
  private latestSelection: RuntimeSelection = { bookmark: null, text: '' };
  private outline: OutlineEntry[] = [];
  private receivedOutline = false;
  private listeners = new Set<(source: string) => void>();
  private readyResolve: () => void = () => {};
  private readyReject: (error: Error) => void = () => {};
  private readyTimer: ReturnType<typeof setTimeout>;
  private loading = false;
  private fault: Error | null = null;
  private operations: Promise<unknown> = Promise.resolve();
  constructor(
    container: HTMLElement,
    private readonly options: MarkLyraEditorOptions,
  ) {
    this.menuObserver.subscribe((state) => this.options.onMenuStateChange?.(state));
    this.source = options.markdown ?? '';
    this.startupPreferences = marklyraStartupPreferences(options.startupPreferences ?? {});
    this.activePreferences = marklyraEditorPreferences(options.preferences ?? {});
    this.activeMarkdownPreferences = marklyraMarkdownPreferences(options.markdownPreferences ?? {});
    this.sourceBOM = options.configuration?.sourceBOM ?? 'metadata';
    if (this.sourceBOM !== 'metadata' && this.sourceBOM !== 'text')
      throw new TypeError('sourceBOM must be metadata or text');
    this.activeTheme = options.configuration?.theme ?? 'marklyra-light';
    this.images = new DocumentImages(
      options.host?.images,
      options.documentContext ?? null,
      options.runtimeUrl,
    );
    this.element = container.ownerDocument.createElement('iframe');
    this.element.className = 'marklyra-editor-frame';
    this.element.title = 'Markdown 编辑器';
    this.element.style.cssText =
      'display:block;width:100%;height:100%;border:0;background:transparent;';
    this.element.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    this.element.setAttribute('referrerpolicy', 'no-referrer');
    this.contextMenu = new HostContextMenu({
      frame: this.element,
      host: options.host,
      request: (operation, payload) => this.request(operation, payload),
      accept: (state) => {
        this.accept(state);
        if (this.fault) throw this.fault;
      },
      run: (work) => this.enqueue(work),
      assertAvailable: () => this.assertAvailable(),
      report: (error) => this.options.onError?.(error),
      ...(options.host?.clipboard
        ? {
            readClipboard: async (
              signal: AbortSignal,
              requestId: string,
              action: import('./context-menu/contracts.js').ContextAction,
            ) => {
              const adapter = this.options.host?.clipboard;
              if (!adapter) throw new Error('宿主未提供剪贴板读取能力');
              const token = this.images.capture();
              const checkpoint = (await this.request('context-menu-native-capture', {
                requestId,
                action,
              })) as ImageCheckpoint;
              const raw = await adapter.read(signal);
              signal.throwIfAborted();
              this.images.assert(token);
              const native = action === 'edit.paste' ? nativeClipboardImages(raw) : undefined;
              if (!native) return clipboardContent(raw);
              if (!this.reserveNativeInput(native.id)) return null;
              await this.commitNativeInput(native.import, checkpoint, token, signal);
              return null;
            },
          }
        : {}),
      imageAction: async (effect, signal) => {
        const token = this.images.capture();
        const source = await this.flush(),
          revision = this.documentRevision;
        const result = await this.images.action(
          effect.action,
          effect.source,
          effect.reference,
          token.generation,
          signal,
          {
            referenceRoot: effect.referenceRoot,
            ...(effect.storageFolder === undefined ? {} : { storageFolder: effect.storageFolder }),
          },
        );
        signal.throwIfAborted();
        if (!result || effect.action === 'reveal') return;
        await this.updateImageReferencesInternal(
          [{ source: effect.source, target: result.source }],
          { expectedSource: source, expectedRevision: revision },
          true,
          { token, signal, contextRequestId: effect.requestId },
        );
      },
    });
    const url = new URL(options.runtimeUrl, container.ownerDocument.baseURI);
    if (!['http:', 'https:', 'marklyra:'].includes(url.protocol))
      throw new Error('Unsupported editor runtime protocol');
    // A runtime carrying runtime code must not share the shell origin/IPC authority.
    if (url.origin !== 'null' && url.origin === container.ownerDocument.location.origin)
      throw new Error('Editor runtime requires a separate origin');
    this.activeStyles = themeStyles(options.styles ?? {}, url.href);
    url.searchParams.set('startup-preferences', JSON.stringify(this.startupPreferences));
    url.searchParams.set('markdown-preferences', JSON.stringify(this.activeMarkdownPreferences));
    url.searchParams.set('channel', this.channel);
    url.searchParams.set('locale', options.configuration?.locale ?? 'en');
    url.searchParams.set('theme', options.configuration?.theme ?? 'marklyra-light');
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimer = setTimeout(
      () => this.fail(new Error('MarkLyra 编辑器加载超时，请检查运行资源')),
      35_000,
    );
    this.extensions = new MarkLyraExtensionRegistry({
      ready: this.ready,
      getMarkdown: () => this.getMarkdown(),
      getSelection: () => this.getSelection(),
      isComposing: () => this.isComposing,
      documentSignal: () => this.images.capture().signal,
      onChange: (listener) => this.onChange(listener),
      execute: (command, guard) => this.executeContentCommand(command, guard),
      insertImage: (blob, name, guard, signal) =>
        this.insertImageInternal(blob, name, guard, signal),
      report: (error) => this.options.onExtensionError?.(error),
    });
    window.addEventListener('message', this.receive);
    window.addEventListener('resize', this.updateViewportClip);
    window.addEventListener('scroll', this.updateViewportClip, true);
    this.element.src = url.href;
    container.append(this.element);
  }
  get isComposing() {
    return this.composing;
  }
  get hasPendingChanges() {
    return this.pendingChanges;
  }
  get revision() {
    return this.documentRevision;
  }
  getMarkdown() {
    return this.source;
  }
  getMarkdownPreferences(): Readonly<MarkLyraMarkdownPreferences> {
    if (this.unconfirmedMarkdownToken !== undefined)
      throw new Error('Markdown策略结果尚未确认，请重试同步');
    return { ...this.activeMarkdownPreferences };
  }
  getSelection() {
    return this.latestSelection;
  }
  getOutline() {
    return this.outline;
  }
  get menuState(): MarkLyraMenuState | null {
    return this.menuObserver.value;
  }
  onMenuStateChange(listener: (state: MarkLyraMenuState) => void): () => void {
    return this.menuObserver.subscribe(listener);
  }
  registerExtension(extension: MarkLyraExtension): MarkLyraExtensionRegistration {
    return this.extensions.register(extension);
  }
  unregisterExtension(id: string): boolean {
    return this.extensions.unregister(id);
  }
  getExtensionIds(): readonly string[] {
    return this.extensions.ids();
  }
  executeExtension(id: string, commandId: string, input?: unknown): Promise<void> {
    return this.extensions.execute(id, commandId, input);
  }
  getCurrentHeading() {
    return this.currentHeading;
  }
  get isOutlinePopoverOpen() {
    return this.outlinePopoverOpen;
  }
  /** Apply the original theme/base-user/theme-user cascade without replacing editable DOM. */
  async setThemeStyles(
    value: Partial<ThemeStyles>,
    theme?: RuntimeConfiguration['theme'],
    signal?: AbortSignal,
  ): Promise<ThemeAppearance> {
    const next = themeStyles(value, this.element.src);
    return this.updateThemeStyles(next, theme, signal);
  }
  private async updateThemeStyles(
    next: ThemeStyles | undefined,
    theme?: RuntimeConfiguration['theme'],
    signal?: AbortSignal,
  ): Promise<ThemeAppearance> {
    if (theme !== undefined && !['marklyra-light', 'marklyra-dark'].includes(theme))
      throw new TypeError('Invalid base theme');
    await this.ready;
    return this.enqueue(async () => {
      while (true) {
        if (this.disposed) throw new Error('Editor has been destroyed');
        if (signal?.aborted) throw new Error('Theme update was cancelled');
        if (this.composing)
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => signal?.removeEventListener('abort', cancelled);
            const waiter = {
              resolve: () => {
                cleanup();
                resolve();
              },
              reject: (error: Error) => {
                cleanup();
                reject(error);
              },
            };
            const cancelled = () => {
              this.compositionWaiters.delete(waiter);
              waiter.reject(new Error('Theme update was cancelled'));
            };
            this.compositionWaiters.add(waiter);
            signal?.addEventListener('abort', cancelled, { once: true });
            if (signal?.aborted) cancelled();
          });
        if (this.disposed) throw new Error('Editor has been destroyed');
        if (signal?.aborted) throw new Error('Theme update was cancelled');
        try {
          const styles = next ?? this.activeStyles;
          const appearance = themeAppearance(await this.request('theme-styles', { styles, theme }));
          this.activeStyles = styles;
          if (theme !== undefined) this.activeTheme = theme;
          this.cancelExports();
          return appearance;
        } catch (error) {
          if (!this.composing) throw error;
        }
      }
    });
  }
  async getThemeAppearance(): Promise<ThemeAppearance> {
    await this.ready;
    return this.enqueue(async () => themeAppearance(await this.request('theme-appearance')));
  }
  async getThemeFonts(): Promise<ThemeFont[]> {
    await this.ready;
    return this.enqueue(async () => themeFonts(await this.request('theme-fonts')));
  }
  async getSuggestedFileName(): Promise<string> {
    await this.ready;
    this.assertAvailable();
    return this.enqueue(async () => {
      if (this.composing || this.loading) throw new Error('请先完成文档载入与输入法候选');
      const source = this.getMarkdown();
      const result = (await this.request('suggested-file-name')) as {
        name: unknown;
        state: RuntimeState;
      };
      this.accept(result.state);
      if (this.fault) throw this.fault;
      if (this.getMarkdown() !== source || this.hasPendingChanges)
        throw new Error('获取文件名期间文档已更改，请重试');
      if (typeof result.name !== 'string' || !result.name || result.name.length > 120)
        throw new Error('编辑器未返回有效文件名');
      return result.name;
    });
  }
  async setPreferences(change: Partial<MarkLyraEditorPreferences>): Promise<void> {
    // Validate now and copy, then merge against the latest serialized update.
    marklyraEditorPreferences(change);
    const patch = { ...change };
    await this.ready;
    await this.enqueue(async () => {
      if (this.disposed) throw new Error('Editor has been destroyed');
      const next = marklyraEditorPreferences(patch, this.activePreferences);
      while (true) {
        if (this.composing)
          await new Promise<void>((resolve, reject) =>
            this.compositionWaiters.add({ resolve, reject }),
          );
        if (this.disposed) throw new Error('Editor has been destroyed');
        try {
          await this.request('preferences', next);
          break;
        } catch (error) {
          if (!this.composing) throw error;
        }
      }
      this.activePreferences = next;
    });
  }
  async setMarkdownPreferences(
    change: Partial<MarkLyraMarkdownPreferences>,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    marklyraMarkdownPreferences(change);
    const patch = { ...change };
    const signal = options.signal;
    const assertCurrent = (allowComposition = false) => {
      if (signal?.aborted) throw new Error('缩进设置请求已取消');
      if (allowComposition) {
        if (this.disposed) throw new Error('Editor has been destroyed');
        if (this.loading) throw new Error('编辑器正在切换文档');
      } else this.assertAvailable();
    };
    await this.ready;
    await this.enqueue(async () => {
      assertCurrent(true);
      while (this.composing) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => signal?.removeEventListener('abort', cancelled);
          const waiter = {
            resolve: () => {
              cleanup();
              resolve();
            },
            reject: (error: Error) => {
              cleanup();
              reject(error);
            },
          };
          const cancelled = () => {
            this.compositionWaiters.delete(waiter);
            cleanup();
            reject(new Error('缩进设置请求已取消'));
          };
          this.compositionWaiters.add(waiter);
          signal?.addEventListener('abort', cancelled, { once: true });
          if (signal?.aborted) cancelled();
        });
        assertCurrent(true);
      }
      if (this.unconfirmedMarkdownToken !== undefined)
        await this.resolveMarkdownPreferences(this.unconfirmedMarkdownToken);
      assertCurrent();
      const next = marklyraMarkdownPreferences(patch, this.activeMarkdownPreferences);
      if (
        next.indentSize === this.activeMarkdownPreferences.indentSize &&
        sameMarkdownPolicy(
          markdownSerializationPolicy(next),
          markdownSerializationPolicy(this.activeMarkdownPreferences),
        )
      )
        return;
      const prepared = (await this.request('markdown-preferences-prepare', next)) as {
        token: number;
        before: RuntimeState;
        canonical: string;
      };
      try {
        assertCurrent();
        this.accept(prepared.before);
        if (this.fault) throw this.fault;
        if (!this.mirror) throw new Error('Source projection is unavailable');
        // Prove the candidate correspondence before the child commits options.
        // This disposable mirror has no document/history authority.
        new SourceMirror(this.source, prepared.canonical, {
          sourceBOM: this.sourceBOM,
          canonicalBOM: 'text',
        });
        assertCurrent();
        let state: RuntimeState;
        try {
          state = (await this.request('markdown-preferences-commit', {
            token: prepared.token,
          })) as RuntimeState;
        } catch (failure) {
          this.unconfirmedMarkdownToken = prepared.token;
          const outcome = await this.resolveMarkdownPreferences(prepared.token);
          if (!outcome.committed) throw failure;
          return;
        }
        this.activeMarkdownPreferences = next;
        this.unconfirmedMarkdownToken = undefined;
        this.accept(state);
        if (this.fault) throw this.fault;
        this.invalidateStatistics();
      } finally {
        await this.request('markdown-preferences-cancel', { token: prepared.token }).catch(
          () => {},
        );
      }
    });
  }
  private async resolveMarkdownPreferences(token: number): Promise<MarkdownPreferencesResolution> {
    let outcome: MarkdownPreferencesResolution;
    try {
      outcome = (await this.request('markdown-preferences-resolve', {
        token,
      })) as MarkdownPreferencesResolution;
      if (
        outcome.token !== token ||
        typeof outcome.committed !== 'boolean' ||
        !outcome.preferences ||
        Object.keys(outcome.preferences).some(
          (key) =>
            !['indentSize', 'prettyIndent', 'headingStyle', 'ulStyle', 'olStyle'].includes(key),
        ) ||
        !Object.hasOwn(outcome.preferences, 'indentSize') ||
        !Object.hasOwn(outcome.preferences, 'prettyIndent')
      )
        throw new Error('Markdown策略确认回执无效');
      const preferences = marklyraMarkdownPreferences(outcome.preferences);
      this.activeMarkdownPreferences = preferences;
      this.unconfirmedMarkdownToken = undefined;
    } catch (failure) {
      this.unconfirmedMarkdownToken = token;
      const error = new Error(`Markdown策略结果尚未确认，原稿保留，请重试同步：${String(failure)}`);
      this.options.onError?.(error);
      throw error;
    }
    this.accept(outcome.state);
    if (this.fault) throw this.fault;
    this.invalidateStatistics();
    return outcome;
  }
  async toggleOutlinePopover(): Promise<boolean> {
    await this.ready;
    return this.enqueue(async () => {
      if (this.disposed) throw new Error('Editor has been destroyed');
      return (await this.request('outline-popover-toggle')) === true;
    });
  }
  async closeOutlinePopover(): Promise<void> {
    await this.ready;
    await this.enqueue(() => this.request('outline-popover-close'));
  }
  async setOutlineTracking(enabled: boolean): Promise<void> {
    if (typeof enabled !== 'boolean') throw new TypeError('Outline tracking must be boolean');
    await this.ready;
    await this.enqueue(() => this.request('outline-tracking', { enabled }));
  }
  /** Keep theme media queries and find UI at the full host width while side panels
   * reserve content space. This changes geometry without rebuilding editable DOM. */
  async setContentInset(left: number, top = 0, outlineTop = top, right = 0): Promise<void> {
    if (
      [left, top, outlineTop, right].some(
        (value) => !Number.isFinite(value) || value < 0 || value > 16384,
      )
    )
      throw new RangeError('Content inset must be between 0 and 16384 pixels');
    if (this.disposed) throw new Error('Editor has been destroyed');
    // Geometry belongs to the host's current paint, independently of runtime round trips or IME.
    this.element.style.width = left + right ? `calc(100% + ${left + right}px)` : '100%';
    this.element.style.marginLeft = left ? `-${left}px` : '0px';
    this.contentInset = { left, top, right };
    const sequence = this.contentInsetTarget.sequence + 1;
    this.contentInsetTarget = { left, top, outlineTop, right, sequence };
    this.updateViewportClip();
    await this.ready;
    await this.enqueue(async () => {
      if (sequence <= this.contentInsetApplied) return;
      const target = this.contentInsetTarget;
      const { sequence: applied, ...payload } = target;
      await this.request('content-inset', payload);
      this.contentInsetApplied = applied;
    });
  }
  private updateViewportClip = (): void => {
    const { left, top, right } = this.contentInset;
    const panel = this.findPanelBounds;
    const trailing = right ? `calc(100% - ${right}px)` : '100%';
    // The real scrollport ends at the trailing inset, so its scrollbar is already inside the
    // visible region. The host may round the visible pane through --marklyra-frame-radius.
    this.element.style.clipPath =
      !left && !top && !right
        ? ''
        : panel && (left || right)
          ? `polygon(${left}px ${top}px,${trailing} ${top}px,${trailing} ${panel.top}px,100% ${panel.top}px,100% ${panel.bottom}px,${trailing} ${panel.bottom}px,${trailing} 100%,${left}px 100%,${left}px ${panel.bottom}px,0 ${panel.bottom}px,0 ${panel.top}px,${left}px ${panel.top}px)`
          : `inset(${top}px ${right}px 0 ${left}px round var(--marklyra-frame-radius, 0px))`;
    if (!panel || (!left && !right)) {
      if (this.findPanelShadow) this.findPanelShadow.hidden = true;
      if (this.findPanelTrailingShadow) this.findPanelTrailingShadow.hidden = true;
      return;
    }
    const rect = this.element.getBoundingClientRect();
    for (const [key, width, clip] of [
      ['findPanelShadow', left, `inset(0 ${Math.max(0, rect.width - left)}px -32px 0)`],
      ['findPanelTrailingShadow', right, `inset(0 0 -32px ${Math.max(0, rect.width - right)}px)`],
    ] as const) {
      if (!width) {
        this[key]?.remove();
        this[key] = null;
        continue;
      }
      if (!this[key]) {
        const shadow = this.element.ownerDocument.createElement('div');
        shadow.className = 'marklyra-find-panel-shadow';
        shadow.setAttribute('aria-hidden', 'true');
        shadow.inert = true;
        shadow.style.cssText = 'position:fixed;pointer-events:none;';
        this.element.before(shadow);
        this[key] = shadow;
      }
      const shadow = this[key];
      shadow.hidden = false;
      Object.assign(shadow.style, {
        left: `${rect.left}px`,
        top: `${rect.top + panel.top}px`,
        width: `${rect.width}px`,
        height: `${panel.bottom - panel.top}px`,
        boxShadow: panel.shadow,
        clipPath: clip,
      });
    }
  };
  async flush(): Promise<string> {
    await this.ready;
    this.assertAvailable();
    const state = (await this.request('flush')) as RuntimeState;
    this.accept(state);
    if (this.fault) throw this.fault;
    return this.source;
  }
  async load(
    source: string,
    options: {
      expectedSource?: string;
      expectedRevision?: number;
      documentContext?: string | null;
    } = {},
  ): Promise<void> {
    if (
      options.expectedRevision !== undefined &&
      (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)
    )
      throw new Error('文档修订号无效');
    await this.ready;
    this.assertAvailable();
    this.contextMenu.invalidate();
    this.statisticsGeneration++;
    this.invalidateStatistics();
    await this.enqueue(() =>
      this.loadInternal(
        source,
        options.expectedSource,
        options.documentContext,
        options.expectedRevision,
      ),
    );
  }
  async reloadFromDisk(source: string, options: ReloadFromDiskOptions): Promise<void> {
    validateReload(source, options);
    await this.ready;
    this.assertAvailable();
    this.contextMenu.invalidate();
    this.statisticsGeneration++;
    this.invalidateStatistics();
    await this.enqueue(async () => {
      this.assertAvailable();
      const current = await this.flush();
      if (current !== options.expectedSource || this.documentRevision !== options.expectedRevision)
        throw new Error('重载期间内容已有更改，已保留当前稿件');
      if (source === current) return;
      this.contextMenu.invalidate();
      this.cancelExports();
      const context = this.images.capture().context;
      const imageToken = this.images.transition(context);
      this.loading = true;
      try {
        const before = (await this.request('flush')) as RuntimeState;
        this.accept(before, true);
        if (this.fault) throw this.fault;
        if (
          this.source !== options.expectedSource ||
          this.documentRevision !== options.expectedRevision
        )
          throw new Error('重载期间内容已有更改，已保留当前稿件');
        const result = (await this.request('reload-from-disk', {
          source,
          expectedSource: current,
          expected: {
            canonical: before.canonical,
            sequence: before.sequence,
            checkpoint: before.tracking.checkpoint,
          },
          images: this.imageContext(imageToken),
        })) as RuntimeReloadResult;
        this.accept(result.state, true);
        if (this.fault) throw this.fault;
        if (!result.applied) throw new Error(result.reason ?? '重载未应用，已保留当前稿件');
        if (this.source !== source) throw new Error('外部版本源文本未能完整接纳');
      } catch (error) {
        if (!this.disposed) {
          const token = this.images.transition(context);
          await this.request('image-context', this.imageContext(token));
        }
        throw error;
      } finally {
        this.loading = false;
      }
    });
  }
  async setDocumentContext(context: string | null, force = false): Promise<void> {
    if (force) {
      if (this.disposed) throw new Error('Editor has been destroyed');
      // A delayed metadata event may belong to a load that has not entered its
      // queue yet, or has already rolled back. Never take over another context.
      if (this.images.capture().context !== context) return;
      // Revoke before yielding: a location update must cancel old imports even
      // while an unrelated editor operation still owns the serialized queue.
      const token = this.images.transition(context);
      await this.ready;
      await this.enqueue(async () => {
        if (this.disposed || token.signal.aborted) return;
        while (this.composing) {
          await new Promise<void>((resolve, reject) =>
            this.compositionWaiters.add({ resolve, reject }),
          );
          if (this.disposed || token.signal.aborted) return;
        }
        this.images.assert(token);
        this.assertAvailable();
        this.cancelExports();
        await this.request('image-context', this.imageContext(token));
      });
      return;
    }
    await this.ready;
    if (this.disposed) throw new Error('Editor has been destroyed');
    if (this.images.capture().context === context) return;
    this.assertAvailable();
    await this.enqueue(async () => {
      if (this.disposed) throw new Error('Editor has been destroyed');
      if (this.images.capture().context === context) return;
      this.assertAvailable();
      this.cancelExports();
      const token = this.images.transition(context);
      await this.request('image-context', this.imageContext(token));
    });
  }
  /** Returns only conservatively recognized image destinations. Unsupported
   * source syntax is rejected before the host starts a resource transaction. */
  async getImageReferences(): Promise<string[]> {
    await this.ready;
    this.assertAvailable();
    return this.enqueue(async () => {
      const source = await this.flush();
      return this.proveCurrentImageReferences(source);
    });
  }
  async getImageStorageContext(): Promise<{
    referenceRoot: string;
    storageFolder?: string;
    sourceMode: boolean;
  }> {
    await this.ready;
    this.assertAvailable();
    return this.enqueue(async () => {
      await this.flush();
      return (await this.request('image-storage-context')) as {
        referenceRoot: string;
        storageFolder?: string;
        sourceMode: boolean;
      };
    });
  }
  /** Host files must already exist. This operation edits only proved image
   * destinations and remains one original Undo/Redo transaction. */
  async updateImageReferences(
    replacements: readonly ImageReferenceReplacement[],
    options: ReloadFromDiskOptions,
  ): Promise<void> {
    validateReload(options?.expectedSource, options);
    imageReferencePatches(options.expectedSource, replacements);
    await this.ready;
    this.assertAvailable();
    await this.enqueue(() => this.updateImageReferencesInternal(replacements, options));
  }
  private async updateImageReferencesInternal(
    replacements: readonly ImageReferenceReplacement[],
    options: ReloadFromDiskOptions,
    menu = false,
    guard: {
      token?: ImageGeneration;
      signal?: AbortSignal;
      automatic?: { id: number; generation: number };
      contextRequestId?: string;
    } = {},
  ): Promise<void> {
    const token = guard.token ?? this.images.capture();
    const assertCurrent = () => {
      this.images.assert(token);
      guard.signal?.throwIfAborted();
    };
    assertCurrent();
    const patches = imageReferencePatches(options.expectedSource, replacements);
    const source = await this.flush();
    assertCurrent();
    if (source !== options.expectedSource || this.documentRevision !== options.expectedRevision)
      throw new Error('图片迁移期间正文已有更改，已保留原文与资源');
    if (!patches.length) return;
    await this.proveCurrentImageReferences(source);
    assertCurrent();
    if (!menu) this.contextMenu.invalidate();
    const before = (await this.request('flush')) as RuntimeState;
    assertCurrent();
    this.accept(before);
    if (this.fault) throw this.fault;
    if (
      this.source !== options.expectedSource ||
      this.documentRevision !== options.expectedRevision
    )
      throw new Error('图片迁移期间正文已有更改，已保留原文与资源');
    const result = (await this.request('image-update-references', {
      generation: token.generation,
      ...(guard.automatic ? { automatic: guard.automatic } : {}),
      ...(guard.contextRequestId ? { contextRequestId: guard.contextRequestId } : {}),
      replacements,
      expectedSource: source,
      expected: {
        canonical: before.canonical,
        sequence: before.sequence,
        checkpoint: before.tracking.checkpoint,
      },
    })) as RuntimeState;
    this.accept(result);
    if (this.fault) throw this.fault;
    if (this.source !== applyImagePatches(source, patches))
      throw new Error('图片引用未能保持精确源码补丁');
  }
  private async proveCurrentImageReferences(source: string): Promise<string[]> {
    const destinations = imageDestinations(source),
      counts = new Map<string, number>();
    for (const item of destinations)
      counts.set(item.source, (counts.get(item.source) ?? 0) + (item.uses ?? 1));
    const actual = (await this.request('image-reference-facts')) as {
      references: string[];
      counts: [string, number][];
      sourceMode: boolean;
    };
    const nativeCounts = new Map(actual.counts);
    if (
      counts.size !== nativeCounts.size ||
      [...counts].some(([source, count]) => nativeCounts.get(source) !== count)
    )
      throw new Error('图片引用的源码与模型不一致，已取消资源迁移');
    const raw = [...counts.keys()];
    if (actual.sourceMode) await this.proveSourceImageReferences(source, raw);
    return raw;
  }
  private async proveSourceImageReferences(
    source: string,
    expected: readonly string[],
  ): Promise<void> {
    const token = this.images.capture(),
      revision = this.documentRevision;
    const container = this.element.ownerDocument.createElement('div');
    container.style.cssText =
      'position:fixed;left:-100000px;top:0;width:900px;height:700px;visibility:hidden;pointer-events:none;';
    container.inert = true;
    container.setAttribute('aria-hidden', 'true');
    this.element.ownerDocument.body.append(container);
    const url = new URL(this.options.runtimeUrl, this.element.ownerDocument.baseURI);
    url.searchParams.set('export-renderer', 'true');
    const renderer = new MarkLyraEditor(container, {
      runtimeUrl: url.href,
      markdown: source,
      startupPreferences: this.startupPreferences,
      markdownPreferences: { ...this.activeMarkdownPreferences },
      configuration: {
        ...this.options.configuration,
        nativeMenus: false,
        sourceBOM: this.sourceBOM,
      },
    });
    this.imageReferenceRenderers.add(renderer);
    try {
      await renderer.ready;
      const actual = await renderer.getImageReferences();
      this.images.assert(token);
      if (
        this.source !== source ||
        this.documentRevision !== revision ||
        expected.length !== actual.length ||
        expected.some((item) => !actual.includes(item))
      )
        throw new Error('源码图片引用未能通过原内核核验，已保留原文与资源');
    } finally {
      this.imageReferenceRenderers.delete(renderer);
      renderer.destroy();
      container.remove();
    }
  }
  /** Captures stable source, then exports in a disposable isolated renderer. */
  async exportHTML(value: ExportHTMLOptions = {}): Promise<string> {
    const options = exportOptions(value);
    await this.ready;
    this.assertAvailable();
    const source = await this.flush();
    if (this.exportRenderers.size) throw new Error('已有 HTML 导出正在进行');
    const generation = this.images.capture();
    const revision = this.documentRevision;
    const container = this.element.ownerDocument.createElement('div');
    container.style.cssText =
      'position:fixed;left:-100000px;top:0;width:900px;height:700px;visibility:hidden;pointer-events:none;';
    container.setAttribute('aria-hidden', 'true');
    container.inert = true;
    this.element.ownerDocument.body.append(container);
    const rendererUrl = new URL(this.options.runtimeUrl, this.element.ownerDocument.baseURI);
    rendererUrl.searchParams.set('export-renderer', 'true');
    const renderer = new MarkLyraEditor(container, {
      runtimeUrl: rendererUrl.href,
      markdown: source,
      startupPreferences: this.startupPreferences,
      preferences: { ...this.activePreferences },
      markdownPreferences: { ...this.activeMarkdownPreferences },
      documentContext: generation.context,
      styles:
        options.theme === undefined || options.theme === this.activeTheme
          ? this.activeStyles
          : { baseUser: this.activeStyles.baseUser },
      configuration: {
        ...this.options.configuration,
        sourceBOM: this.sourceBOM,
        nativeMenus: false,
        theme: options.theme ?? this.activeTheme,
      },
      ...(this.options.host?.images ? { host: { images: this.options.host.images } } : {}),
    });
    this.exportRenderers.add(renderer);
    try {
      await renderer.ready;
      this.images.assert(generation);
      const html = await renderer.request('export-html', options);
      this.assertAvailable();
      this.images.assert(generation);
      const current = await this.flush();
      this.images.assert(generation);
      if (this.documentRevision !== revision || current !== source || this.pendingChanges)
        throw new Error('导出期间文档已有更改，已取消旧快照导出，请重试');
      if (typeof html !== 'string') throw new Error('HTML 导出返回值无效');
      return html;
    } finally {
      this.exportRenderers.delete(renderer);
      renderer.destroy();
      container.remove();
    }
  }
  /** Query on demand. In source mode a disposable original renderer counts the current source. */
  async getStatistics(options: StatisticsOptions = {}): Promise<MarkLyraStatistics> {
    const wordsPerMinute = statisticsSpeed(options);
    const generation = this.statisticsGeneration;
    await this.ready;
    this.assertAvailable();
    const packet = (await this.request('statistics')) as RuntimeStatisticsPacket;
    if (generation !== this.statisticsGeneration) throw new Error('统计已取消');
    this.accept(packet.state);
    if (this.fault) throw this.fault;
    this.assertAvailable();
    if (this.pendingChanges) throw new Error('统计期间内容已有更改，请重试');
    const version = this.statisticsVersion;
    const revision = this.documentRevision;
    let words = packet.words;
    if (
      packet.state.sourceMode &&
      this.statisticsSourceCache?.generation === generation &&
      this.statisticsSourceCache.canonical === packet.state.canonical
    ) {
      words = this.statisticsSourceCache.words;
    } else if (packet.state.sourceMode) {
      const container = this.element.ownerDocument.createElement('div');
      container.style.cssText =
        'position:fixed;left:-100000px;top:0;width:900px;height:700px;visibility:hidden;pointer-events:none;';
      container.inert = true;
      container.setAttribute('aria-hidden', 'true');
      this.element.ownerDocument.body.append(container);
      const url = new URL(this.options.runtimeUrl, this.element.ownerDocument.baseURI);
      url.searchParams.set('export-renderer', 'true');
      const renderer = new MarkLyraEditor(container, {
        runtimeUrl: url.href,
        markdown: packet.state.canonical,
        startupPreferences: this.startupPreferences,
        markdownPreferences: { ...this.activeMarkdownPreferences },
        configuration: { ...this.options.configuration, nativeMenus: false, sourceBOM: 'text' },
      });
      this.statisticsRenderers.add(renderer);
      try {
        await renderer.ready;
        const rendered = (await renderer.request('statistics', {
          isolated: true,
        })) as RuntimeStatisticsPacket;
        words = rendered.words;
        this.statisticsSourceCache = { canonical: packet.state.canonical, generation, words };
      } finally {
        this.statisticsRenderers.delete(renderer);
        renderer.destroy();
        container.remove();
      }
    }
    this.assertAvailable();
    if (
      version !== this.statisticsVersion ||
      revision !== this.documentRevision ||
      this.pendingChanges
    )
      throw new Error('统计期间文档或选区已有更改，请重试');
    const valid = await this.request('statistics-current', {
      sequence: packet.state.sequence,
      epoch: packet.renderEpoch,
      sourceMode: packet.state.sourceMode,
    });
    if (!valid || version !== this.statisticsVersion) throw new Error('统计结果已过期，请重试');
    const canonical = packet.state.canonical;
    return {
      algorithm: 'marklyra-rendered-v1',
      wordBasis: 'legacy-rendered',
      characterUnit: 'utf16-code-unit',
      sourceBasis: 'canonical-markdown',
      mode: packet.state.sourceMode ? 'source' : 'wysiwyg',
      revision,
      renderEpoch: packet.renderEpoch,
      words,
      characters: canonical.length,
      lines: canonical.split('\n').length,
      readingMinutes: Math.round(words / wordsPerMinute),
      wordsPerMinute,
      selection: packet.selection,
    };
  }
  private invalidateStatistics(): void {
    this.statisticsVersion++;
    for (const renderer of this.statisticsRenderers) renderer.destroy();
    this.statisticsRenderers.clear();
    this.options.onStatisticsInvalidated?.();
  }
  private reserveNativeInput(id: string): boolean {
    if (typeof id !== 'string' || !id || id.length > 256)
      throw new ImageHostError('原生图片事件标识无效');
    if (this.nativeImageInputs.has(id)) return false;
    // Reserve before asynchronous work; cancellation must not replay the same physical event.
    this.nativeImageInputs.add(id);
    if (this.nativeImageInputs.size > 128) {
      const oldest = this.nativeImageInputs.values().next().value;
      if (oldest !== undefined) this.nativeImageInputs.delete(oldest);
    }
    return true;
  }
  /** Imports only host-authorized native payloads. Paths and native receipts stay in the host. */
  async importNativeImages(input: NativeImageInput, importer: NativeImageImporter): Promise<void> {
    await this.ready;
    this.assertAvailable();
    if (!this.reserveNativeInput(input.id)) return;
    const token = this.images.capture();
    let point: { x: number; y: number } | undefined;
    if (input.point) {
      const rect = this.element.getBoundingClientRect();
      if (
        !Number.isFinite(input.point.x) ||
        !Number.isFinite(input.point.y) ||
        input.point.x < rect.left ||
        input.point.x >= rect.right ||
        input.point.y < rect.top ||
        input.point.y >= rect.bottom ||
        rect.width <= 0 ||
        rect.height <= 0
      )
        throw new ImageHostError('文件拖入位置不在编辑区域');
      point = {
        x: (input.point.x - rect.left) / rect.width,
        y: (input.point.y - rect.top) / rect.height,
      };
    }
    const checkpoint = (await this.request('image-native-capture', { point })) as ImageCheckpoint;
    this.images.assert(token);
    this.assertAvailable();
    await this.commitNativeInput(importer, checkpoint, token);
  }
  async importNativeInput(input: NativeImageInput, importer: NativeImageImporter): Promise<void> {
    return this.importNativeImages(input, importer);
  }
  private async commitNativeInput(
    importer: NativeImageImporter,
    checkpoint: ImageCheckpoint,
    token: ImageGeneration,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request('image-check', checkpoint);
    this.images.assert(token);
    this.assertAvailable();
    const results = await this.images.importNative(
      importer,
      token.generation,
      {
        referenceRoot: checkpoint.referenceRoot,
        ...(checkpoint.storageFolder === undefined
          ? {}
          : { storageFolder: checkpoint.storageFolder }),
      },
      signal,
    );
    this.images.assert(token);
    this.assertAvailable();
    const state = (await this.request('image-insert-many', {
      checkpoint,
      images: results,
    })) as RuntimeState;
    this.accept(state);
    if (this.fault) throw this.fault;
  }
  async insertImage(blob: Blob, name = 'image.png'): Promise<void> {
    return this.insertImageInternal(blob, name);
  }
  private async insertImageInternal(
    blob: Blob,
    name: string,
    guard: () => void = () => {},
    signal?: AbortSignal,
  ): Promise<void> {
    await this.ready;
    guard();
    this.assertAvailable();
    const type = imageType(name, blob.type, blob.size);
    const token = this.images.capture();
    const checkpoint = (await this.request('image-capture')) as ImageCheckpoint;
    guard();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    guard();
    const result = await this.images.import(
      name,
      type,
      bytes,
      token.generation,
      checkpoint.referenceRoot,
      checkpoint.storageFolder,
      signal,
    );
    guard();
    this.images.assert(token);
    this.assertAvailable();
    const state = (await this.request('image-insert', {
      checkpoint,
      ...result,
      name,
    })) as RuntimeState;
    this.accept(state);
    if (this.fault) throw this.fault;
  }
  async execute(command: MarkLyraCommand): Promise<void> {
    if (command.type === 'setTheme') {
      await this.updateThemeStyles(undefined, command.theme);
      return;
    }
    return this.executeContentCommand(command);
  }
  private async executeContentCommand(
    command: Exclude<MarkLyraCommand, { type: 'setTheme' }>,
    guard: () => void = () => {},
  ): Promise<void> {
    const positionSource = command.type === 'sourcePosition' ? this.source : undefined;
    const positionRevision = this.documentRevision;
    await this.ready;
    guard();
    this.assertAvailable();
    if (command.type === 'sourcePosition') {
      await this.flush();
      guard();
      if (this.source !== positionSource || this.documentRevision !== positionRevision)
        throw new Error('定位期间正文已变化，请重新搜索');
      if (!this.mirror) throw new Error('Editor source mapping is unavailable');
      const sourceOffset = offsetAt(this.source, command.line, command.column);
      const canonicalOffset = this.mirror.sourceToCanonical(sourceOffset);
      const mapped = {
        type: 'sourcePosition' as const,
        ...positionAt(this.mirror.canonical, canonicalOffset),
      };
      const state = (await this.request('execute', {
        ...mapped,
        expectedPosition: { canonical: this.mirror.canonical, sequence: this.latestSequence },
      })) as RuntimeState;
      this.accept(state);
      if (this.fault) throw this.fault;
      return;
    }
    const state = (await this.request('execute', command)) as RuntimeState;
    this.accept(state);
    if (this.fault) throw this.fault;
  }
  async focus(): Promise<void> {
    await this.ready;
    this.assertAvailable();
    // Establish the outer browsing-context focus before selecting the current
    // input owner inside the isolated runtime. This does not grant user activation.
    this.element.focus({ preventScroll: true });
    await this.request('focus');
  }
  async markSaved(expectedSource = this.source): Promise<boolean> {
    await this.ready;
    this.assertAvailable();
    if (!this.mirror || expectedSource !== this.source || this.pendingChanges) return false;
    const result = (await this.request('mark-saved', {
      canonical: this.mirror.canonical,
      sequence: this.latestSequence,
    })) as { saved: boolean; state: RuntimeState };
    this.accept(result.state);
    return result.saved && this.source === expectedSource && !this.pendingChanges;
  }
  onChange(listener: (source: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.extensions.destroy();
    this.statisticsSourceCache = undefined;
    this.invalidateStatistics();
    this.contextMenu.invalidate();
    this.images.destroy();
    this.cancelExports();
    clearTimeout(this.readyTimer);
    window.removeEventListener('message', this.receive);
    this.element.remove();
    this.findPanelShadow?.remove();
    this.findPanelTrailingShadow?.remove();
    window.removeEventListener('resize', this.updateViewportClip);
    window.removeEventListener('scroll', this.updateViewportClip, true);
    const error = new Error('Editor has been destroyed');
    for (const waiter of this.compositionWaiters) waiter.reject(error);
    this.compositionWaiters.clear();
    this.readyReject(error);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.listeners.clear();
    this.menuObserver.destroy();
  }
  private cancelExports(): void {
    for (const renderer of this.exportRenderers) renderer.destroy();
    this.exportRenderers.clear();
    for (const renderer of this.imageReferenceRenderers) renderer.destroy();
    this.imageReferenceRenderers.clear();
  }
  private assertAvailable() {
    if (this.disposed) throw new Error('Editor has been destroyed');
    if (this.unconfirmedMarkdownToken !== undefined)
      throw new Error('Markdown策略结果尚未确认，请重试同步');
    if (this.composing) throw new Error('请先完成输入法候选');
    if (this.loading) throw new Error('编辑器正在切换文档');
  }
  private fail(error: Error) {
    if (this.disposed) return;
    this.fault = error;
    this.options.onError?.(error);
    this.readyReject(error);
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.operations.then(work);
    this.operations = run.catch(() => {});
    return run;
  }
  private imageContext(token = this.images.capture()): ImageContextMessage {
    return {
      generation: token.generation,
      enabled: this.images.enabled,
      canImport: this.images.canImport,
      actions: this.images.actions,
      automatic: this.images.automatic,
      readClipboard: Boolean(this.options.host?.clipboard?.readOnPaste),
      nativeDrop: Boolean(this.options.host?.images?.nativeDrop),
    };
  }
  private async loadInternal(
    source: string,
    expectedSource?: string,
    documentContext?: string | null,
    expectedRevision?: number,
  ) {
    this.assertAvailable();
    this.contextMenu.invalidate();
    this.invalidateStatistics();
    this.cancelExports();
    const previousContext = this.images.capture().context;
    const imageToken = this.images.transition(
      documentContext === undefined ? previousContext : documentContext,
    );
    let previousSnapshot: unknown;
    let previous: RuntimeState | undefined;
    let mayHaveReplaced = false;
    const owner = this.element.ownerDocument;
    let outsideFocus =
      owner.activeElement instanceof HTMLElement && owner.activeElement !== this.element
        ? owner.activeElement
        : null;
    const rememberOutsideFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== this.element)
        outsideFocus = event.target;
    };
    owner.addEventListener('focusin', rememberOutsideFocus);
    this.loading = true;
    try {
      if (this.mirror) {
        previous = (await this.request('flush')) as RuntimeState;
        this.accept(previous, true);
        if (this.fault) throw this.fault;
        if (
          (expectedSource !== undefined && this.source !== expectedSource) ||
          (expectedRevision !== undefined && this.documentRevision !== expectedRevision)
        )
          throw new Error('切换文档期间内容已有更改，已保留当前内容，请重试。');
        previousSnapshot = await this.request('snapshot');
      }
      mayHaveReplaced = true;
      const result = (await this.request('load', {
        source,
        images: this.imageContext(imageToken),
        ...(previous
          ? { expected: { canonical: previous.canonical, sequence: previous.sequence } }
          : {}),
      })) as { applied: boolean; state: RuntimeState };
      if (!result.applied) {
        mayHaveReplaced = false;
        this.accept(result.state, true);
        throw new Error('切换文档期间内容已有更改，已保留当前内容，请重试。');
      }
      const state = result.state;
      const mirror = new SourceMirror(source, state.canonical, {
        sourceBOM: this.sourceBOM,
        canonicalBOM: 'text',
        defaultLineEnding: this.activePreferences.preferCRLF ? '\r\n' : '\n',
      });
      this.mirror = mirror;
      this.checkpoint = state.tracking.checkpoint;
      this.checkpointStates = new Map([[this.checkpoint, mirror.stateId]]);
      this.runtimeProjectionEpochOffset = 0;
      this.source = source;
      this.documentRevision++;
      this.fault = null;
      this.assignState(state);
      this.options.onChange?.(source);
      for (const listener of this.listeners) listener(source);
    } catch (error) {
      if (this.disposed) throw error;
      const rollbackImages = this.images.transition(previousContext);
      if (previousSnapshot && mayHaveReplaced) {
        try {
          const restored = (await this.request('restore', {
            source: this.mirror?.canonical ?? this.source,
            snapshot: previousSnapshot,
            images: this.imageContext(rollbackImages),
          })) as RuntimeState;
          this.checkpoint = restored.tracking.checkpoint;
          this.checkpointStates.set(this.checkpoint, this.mirror?.stateId ?? 0);
          this.assignState(restored);
        } catch (rollback) {
          this.fault = new Error(`载入及恢复失败：${String(rollback)}`);
          this.options.onError?.(this.fault);
          throw this.fault;
        }
      }
      if (!(previousSnapshot && mayHaveReplaced))
        await this.request('image-context', this.imageContext(rollbackImages));
      if (owner.activeElement === this.element && outsideFocus?.isConnected) outsideFocus.focus();
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      owner.removeEventListener('focusin', rememberOutsideFocus);
      this.loading = false;
    }
  }
  private assignState(state: RuntimeState) {
    this.composing = state.composing;
    this.pendingChanges = state.sequence < this.latestSequence;
    this.latestSequence = Math.max(this.latestSequence, state.sequence);
    this.latestSelection = state.selection;
    const outlineChanged =
      !this.receivedOutline ||
      this.outline.length !== state.outline.length ||
      state.outline.some((entry, index) => {
        const old = this.outline[index];
        return !old || old.id !== entry.id || old.level !== entry.level || old.text !== entry.text;
      });
    if (outlineChanged) this.outline = state.outline;
    this.receivedOutline = true;
    this.options.onSelectionChange?.(state.selection);
    if (outlineChanged) this.options.onOutlineChange?.(state.outline);
    this.publishViewMode(state);
    this.menuObserver.publish(state.menu, state.menuSequence, this.viewStateOrders.get(state));
  }
  private publishViewMode(state: RuntimeState) {
    const order = this.viewStateOrders.get(state);
    if (this.disposed || typeof state.sourceMode !== 'boolean' || order === undefined) return;
    // Mode-only ordering must not relax or replace SourceMirror's acceptance
    // rules. A delayed statistics/read response cannot reverse a newer view.
    if (order < this.viewModeOrder) return;
    this.viewModeOrder = order;
    const mode: MarkLyraViewMode = state.sourceMode ? 'source' : 'wysiwyg';
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    const report = (error: unknown) => {
      if (this.disposed) return;
      try {
        const result: unknown = this.options.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
        void Promise.resolve(result).catch(() => {});
      } catch {
        // Observer diagnostics cannot fault the document or interrupt commands.
      }
    };
    try {
      const result: unknown = this.options.onViewModeChange?.(mode);
      void Promise.resolve(result).catch(report);
    } catch (error) {
      report(error);
    }
  }
  private rememberViewState(value: unknown, order: number) {
    if (!value || typeof value !== 'object') return;
    if (typeof Reflect.get(value, 'sourceMode') === 'boolean')
      this.viewStateOrders.set(value, order);
    for (const key of ['state', 'before']) {
      const state: unknown = Reflect.get(value, key);
      if (
        state &&
        typeof state === 'object' &&
        typeof Reflect.get(state, 'sourceMode') === 'boolean'
      )
        this.viewStateOrders.set(state, order);
    }
  }
  private accept(state: RuntimeState, duringLoad = false) {
    if ((this.loading && !duringLoad) || !this.mirror) return;
    try {
      if (state.tracking.checkpoint < this.checkpoint) return;
      const finalChange = state.tracking.changes.at(-1);
      const recoveryTarget =
        finalChange?.historyTarget === undefined
          ? undefined
          : this.checkpointStates.get(finalChange.historyTarget);
      if (this.fault && recoveryTarget !== undefined) {
        if (
          !finalChange ||
          finalChange.checkpoint !== state.tracking.checkpoint ||
          finalChange.normalization ||
          finalChange.editPatches ||
          finalChange.completePrefixes ||
          finalChange.externalSource !== undefined
        )
          throw new Error('无效的源码历史恢复回执');
        const remoteEpoch = state.tracking.projectionEpoch ?? 0;
        if (!Number.isSafeInteger(remoteEpoch) || remoteEpoch < 0)
          throw new Error('无效的运行时序列化坐标代');
        const projection = finalChange.canonicalProjection;
        if (projection && projection.baseProjectionEpoch !== (finalChange.baseProjectionEpoch ?? 0))
          throw new Error('历史恢复坐标代不一致');
        this.mirror.update(state.canonical, {
          kind: 'history',
          baseStateId: this.mirror.stateId,
          baseProjectionEpoch: this.mirror.projectionEpoch,
          targetStateId: recoveryTarget,
          ...(projection
            ? {
                canonicalProjection: {
                  ...projection,
                  baseProjectionEpoch: this.mirror.projectionEpoch,
                },
              }
            : {}),
        });
        this.runtimeProjectionEpochOffset = this.mirror.projectionEpoch - remoteEpoch;
        this.checkpoint = state.tracking.checkpoint;
        this.checkpointStates.set(this.checkpoint, this.mirror.stateId);
      }
      for (const change of state.tracking.changes) {
        if (change.checkpoint <= this.checkpoint) continue;
        if (change.baseCheckpoint !== this.checkpoint)
          throw new Error('源码检查点链缺失；已保留原稿');
        const remoteEpoch = change.baseProjectionEpoch ?? 0;
        if (
          !Number.isSafeInteger(remoteEpoch) ||
          remoteEpoch < 0 ||
          remoteEpoch + this.runtimeProjectionEpochOffset !== this.mirror.projectionEpoch
        )
          throw new Error('源码序列化坐标已变更；已保留原稿');
        if (
          change.canonicalProjection &&
          change.canonicalProjection.baseProjectionEpoch !== remoteEpoch
        )
          throw new Error('序列化回执坐标代不一致；已保留原稿');
        const projection = change.canonicalProjection
          ? {
              ...change.canonicalProjection,
              baseProjectionEpoch: this.mirror.projectionEpoch,
            }
          : undefined;
        let canonical = this.mirror.canonical;
        for (let index = change.patches.length - 1; index >= 0; index--) {
          const patch = change.patches[index];
          if (patch)
            canonical = canonical.slice(0, patch.from) + patch.insert + canonical.slice(patch.to);
        }
        const target =
          change.historyTarget === undefined
            ? undefined
            : this.checkpointStates.get(change.historyTarget);
        if (
          change.editPatches &&
          (!projection ||
            change.normalization ||
            change.historyTarget !== undefined ||
            change.externalSource !== undefined)
        )
          throw new Error('无效的编辑与序列化组合回执；已保留原稿');
        if (
          change.completePrefixes &&
          (change.normalization ||
            change.externalSource !== undefined ||
            change.historyTarget !== undefined)
        )
          throw new Error('无效的结构前缀回执；已保留原稿');
        if (change.normalization) {
          if (
            !projection ||
            change.historyTarget !== undefined ||
            change.externalSource !== undefined
          )
            throw new Error('无效的序列化策略回执；已保留原稿');
          this.mirror.rebaseCanonical(canonical, {
            ...projection,
            baseStateId: this.mirror.stateId,
          });
        } else if (change.externalSource !== undefined)
          this.mirror.adoptExternal(change.externalSource, canonical);
        else
          this.mirror.update(
            canonical,
            target === undefined
              ? {
                  kind: 'edit',
                  baseStateId: this.mirror.stateId,
                  baseProjectionEpoch: this.mirror.projectionEpoch,
                  baseCanonical: this.mirror.canonical,
                  patches: change.editPatches ?? change.patches,
                  ...(change.completePrefixes ? { completePrefixes: change.completePrefixes } : {}),
                  ...(change.editPatches && projection ? { canonicalProjection: projection } : {}),
                  ...(change.placementRanges ? { placementRanges: change.placementRanges } : {}),
                  ...(change.placementChecks ? { placementChecks: change.placementChecks } : {}),
                }
              : {
                  kind: 'history',
                  baseStateId: this.mirror.stateId,
                  baseProjectionEpoch: this.mirror.projectionEpoch,
                  targetStateId: target,
                  ...(projection ? { canonicalProjection: projection } : {}),
                },
          );
        this.checkpoint = change.checkpoint;
        this.checkpointStates.set(this.checkpoint, this.mirror.stateId);
      }
      if (this.mirror.canonical !== state.canonical)
        throw new Error('源码检查点与运行时内容不一致；已保留原稿');
      const next = this.mirror.source;
      void this.request('tracking-ack', this.checkpoint).catch(() => {});
      this.assignState(state);
      this.fault = null;
      if (next !== this.source) {
        this.source = next;
        this.documentRevision++;
        this.options.onChange?.(next);
        for (const listener of this.listeners) listener(next);
      }
    } catch (error) {
      this.fault =
        error instanceof Error && Reflect.get(error, 'code') === 'AMBIGUOUS_EDIT'
          ? new Error(
              '无法确定重复内容对应的原始源码位置，已保留原稿。请撤销本次修改，再使用源码模式编辑。',
            )
          : error instanceof Error
            ? error
            : new Error(String(error));
      // Successfully validated chain prefixes remain observable even if a later
      // checkpoint is rejected. flush still throws until a proven recovery state.
      const preserved = this.mirror.source;
      if (preserved !== this.source) {
        this.source = preserved;
        this.documentRevision++;
        this.options.onChange?.(preserved);
        for (const listener of this.listeners) listener(preserved);
      }
      this.options.onError?.(this.fault);
    }
  }
  private request(operation: string, payload?: unknown): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error('Editor has been destroyed'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`编辑器操作超时：${operation}`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      const message: Envelope = {
        protocol: PROTOCOL,
        channel: this.channel,
        kind: 'request',
        id,
        operation,
      };
      if (payload !== undefined) message.payload = payload;
      this.element.contentWindow?.postMessage(message, '*');
    });
  }
  private async imageRequest(message: Envelope): Promise<void> {
    const payload = message.payload as Partial<ImageResolutionMessage & ImageImportMessage> | null;
    if (!payload || typeof payload.id !== 'number' || typeof payload.generation !== 'number')
      return;
    const operation = message.kind === 'image-resolve' ? 'image-resolved' : 'image-imported';
    const reply = { id: payload.id, generation: payload.generation };
    try {
      let result: { url: string; source?: string } | null;
      if (message.kind === 'image-resolve') {
        if (
          typeof payload.source !== 'string' ||
          typeof payload.reference !== 'string' ||
          payload.source.length > 8192 ||
          payload.reference.length > 8192
        )
          throw new Error('图片引用无效');
        result = await this.images.resolve(payload.source, payload.reference, payload.generation);
      } else {
        if (
          typeof payload.name !== 'string' ||
          typeof payload.type !== 'string' ||
          typeof payload.referenceRoot !== 'string' ||
          (payload.storageFolder !== undefined && typeof payload.storageFolder !== 'string') ||
          !(payload.bytes instanceof Uint8Array)
        )
          throw new Error('图片导入请求无效');
        result = await this.images.import(
          payload.name,
          payload.type,
          payload.bytes,
          payload.generation,
          payload.referenceRoot,
          payload.storageFolder,
        );
      }
      if (!this.disposed) await this.request(operation, { ...reply, ...result });
    } catch (error) {
      if (this.disposed) return;
      const detail = error instanceof Error ? error.message : String(error);
      if (payload.generation === this.images.capture().generation)
        this.options.onError?.(new Error(detail));
      try {
        await this.request(operation, { ...reply, error: detail });
      } catch {
        /* The frame may have been destroyed. */
      }
    }
  }
  private async automaticImageRequest(value: ImageAutomaticMessage): Promise<void> {
    if (
      !this.images.automatic ||
      !value ||
      !Number.isSafeInteger(value.id) ||
      !Number.isSafeInteger(value.generation) ||
      !value.expected ||
      !Array.isArray(value.sources) ||
      !value.sources.length ||
      value.sources.length > 128
    )
      return;
    const token = this.images.capture();
    if (token.generation !== value.generation) return;
    const key = `${value.generation}:${value.id}`;
    if (this.imageAutomaticRequests.has(key)) return;
    const controller = new AbortController(),
      cancel = () => controller.abort();
    this.imageAutomaticRequests.set(key, controller);
    token.signal.addEventListener('abort', cancel, { once: true });
    try {
      const captured = await this.enqueue(async () => {
        this.images.assert(token);
        controller.signal.throwIfAborted();
        const state = (await this.request('image-automatic-check', {
          id: value.id,
          generation: value.generation,
        })) as RuntimeState;
        this.accept(state);
        if (this.fault) throw this.fault;
        if (
          state.canonical !== value.expected.canonical ||
          state.sequence !== value.expected.sequence ||
          state.tracking.checkpoint !== value.expected.checkpoint
        )
          throw new Error('自动图片操作的插入快照已改变');
        const source = await this.flush(),
          revision = this.documentRevision;
        const references = await this.proveCurrentImageReferences(source);
        if (
          value.sources.some(
            (item) =>
              !item ||
              typeof item.source !== 'string' ||
              typeof item.requestSource !== 'string' ||
              typeof item.reference !== 'string' ||
              !references.includes(item.source),
          )
        )
          throw new Error('自动图片操作未对应到真实图片引用');
        return { source, revision };
      });
      const replacements: ImageReferenceReplacement[] = [];
      for (const item of value.sources) {
        this.images.assert(token);
        controller.signal.throwIfAborted();
        const allowed = await this.images.shouldImport(
          item.requestSource,
          item.reference,
          token.generation,
          value.storage,
          controller.signal,
        );
        if (!allowed) continue;
        await this.request('image-automatic-check', { id: value.id, generation: value.generation });
        const network = /^(?:https?:|\/\/)/i.test(item.requestSource);
        const result = await this.images.action(
          network ? 'downloadToStorage' : 'copyToStorage',
          item.requestSource,
          item.reference,
          token.generation,
          controller.signal,
          value.storage,
        );
        this.images.assert(token);
        controller.signal.throwIfAborted();
        if (result && result.source !== item.source)
          replacements.push({ source: item.source, target: result.source });
      }
      if (replacements.length)
        await this.enqueue(async () => {
          this.images.assert(token);
          controller.signal.throwIfAborted();
          await this.request('image-automatic-check', {
            id: value.id,
            generation: value.generation,
          });
          await this.updateImageReferencesInternal(
            replacements,
            {
              expectedSource: captured.source,
              expectedRevision: captured.revision,
            },
            false,
            {
              token,
              signal: controller.signal,
              automatic: { id: value.id, generation: value.generation },
            },
          );
        });
    } catch (error) {
      if (!controller.signal.aborted && !token.signal.aborted)
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      token.signal.removeEventListener('abort', cancel);
      this.imageAutomaticRequests.delete(key);
      if (!this.disposed && this.images.capture().generation === value.generation)
        await this.request('image-automatic-release', { id: value.id }).catch(() => {});
    }
  }
  private async clipboardRequest(message: Envelope): Promise<void> {
    const payload = message.payload as {
      id?: unknown;
      generation?: unknown;
      checkpoint?: ImageCheckpoint;
    } | null;
    if (!payload || typeof payload.id !== 'number' || typeof payload.generation !== 'number')
      return;
    const reply = { id: payload.id, generation: payload.generation };
    try {
      this.assertAvailable();
      this.images.assert(payload.generation);
      const token = this.images.capture();
      const adapter = this.options.host?.clipboard;
      if (!adapter) throw new Error('宿主未提供剪贴板读取能力');
      const raw = await adapter.read(token.signal);
      const native = nativeClipboardImages(raw);
      let content: import('./context-menu/contracts.js').ClipboardContent;
      if (native && this.reserveNativeInput(native.id)) {
        if (!payload.checkpoint || payload.checkpoint.generation !== token.generation)
          throw new ImageHostError('原生剪贴板选区缺失');
        await this.request('image-check', payload.checkpoint);
        this.images.assert(token);
        const imageReferences = await this.images.importNative(native.import, token.generation, {
          referenceRoot: payload.checkpoint.referenceRoot,
          ...(payload.checkpoint.storageFolder === undefined
            ? {}
            : { storageFolder: payload.checkpoint.storageFolder }),
        });
        content = { text: '', imageReferences };
      } else content = clipboardContent(raw);
      this.images.assert(token);
      this.assertAvailable();
      await this.request('clipboard-read-result', { ...reply, content });
    } catch (error) {
      if (this.disposed) return;
      try {
        await this.request('clipboard-read-result', { ...reply, error: String(error) });
      } catch {
        /* A document switch already cancelled the frame request. */
      }
    }
  }
  private receive = (event: MessageEvent) => {
    if (
      this.disposed ||
      event.source !== this.element.contentWindow ||
      !isEnvelope(event.data, this.channel)
    )
      return;
    const message = event.data;
    if (message.kind === 'image-automatic') {
      void this.automaticImageRequest(message.payload as ImageAutomaticMessage);
      return;
    }
    if (message.kind === 'image-automatic-cancel') {
      const value = message.payload as { generation: number; id: number };
      this.imageAutomaticRequests.get(`${value.generation}:${value.id}`)?.abort();
      return;
    }
    if (message.kind === 'find-panel-layout') {
      const bounds = message.payload as {
        top?: unknown;
        bottom?: unknown;
        shadow?: unknown;
      } | null;
      if (bounds === null) this.findPanelBounds = null;
      else if (
        bounds &&
        typeof bounds.top === 'number' &&
        Number.isFinite(bounds.top) &&
        bounds.top >= 0 &&
        typeof bounds.bottom === 'number' &&
        Number.isFinite(bounds.bottom) &&
        bounds.bottom > bounds.top &&
        bounds.bottom <= 16384 &&
        typeof bounds.shadow === 'string' &&
        bounds.shadow.length <= 2048 &&
        CSS.supports('box-shadow', bounds.shadow)
      )
        this.findPanelBounds = { top: bounds.top, bottom: bounds.bottom, shadow: bounds.shadow };
      else return;
      this.updateViewportClip();
      return;
    }
    if (message.kind === 'outline-popover' && typeof message.payload === 'boolean') {
      this.outlinePopoverOpen = message.payload;
      this.options.onOutlinePopoverChange?.(message.payload);
      return;
    }
    if (message.kind === 'scroll-away-from-top' && typeof message.payload === 'boolean') {
      this.options.onScrollAwayFromTopChange?.(message.payload);
      return;
    }
    if (message.kind === 'link-hint-preference' && typeof message.payload === 'boolean') {
      this.options.onLinkHintPreferenceChange?.(message.payload);
      return;
    }
    if (message.kind === 'outline-pin') {
      this.options.onOutlinePin?.();
      return;
    }
    if (
      message.kind === 'current-heading' &&
      (message.payload === null || typeof message.payload === 'string')
    ) {
      this.currentHeading = message.payload;
      this.options.onCurrentHeadingChange?.(message.payload);
      return;
    }
    if (message.kind === 'statistics-invalidated') {
      this.invalidateStatistics();
      return;
    }
    if (message.kind === 'context-menu') {
      try {
        this.contextMenu.show(message.payload);
      } catch (error) {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (message.kind === 'context-menu-cancel' && typeof message.payload === 'string') {
      this.contextMenu.cancel(message.payload);
      return;
    }
    if (message.kind === 'image-resolve' || message.kind === 'image-import') {
      void this.imageRequest(message);
      return;
    }
    if (message.kind === 'clipboard-read') {
      void this.clipboardRequest(message);
      return;
    }
    if (message.kind === 'response' && typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else {
        this.rememberViewState(message.payload, message.id);
        pending.resolve(message.payload);
      }
      return;
    }
    if (message.kind === 'theme-appearance') {
      try {
        this.options.onThemeAppearanceChange?.(themeAppearance(message.payload));
      } catch (error) {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (message.kind === 'ready') {
      clearTimeout(this.readyTimer);
      const configuration: RuntimeConfiguration = {
        nativeMenus: false,
        platform: 'browser',
        locale: 'en',
        theme: 'marklyra-light',
        ...this.options.configuration,
        sourceBOM: this.sourceBOM,
        contextMenu: this.contextMenu.capabilities,
      };
      void this.request('configure', configuration)
        .then(() => this.request('preferences', this.activePreferences))
        .then(() => this.request('markdown-preferences-initialize', this.activeMarkdownPreferences))
        .then(() => this.request('theme-styles', { styles: this.activeStyles }))
        .then(() => this.loadInternal(this.source))
        .then(
          () => this.readyResolve(),
          (error) => this.fail(error instanceof Error ? error : new Error(String(error))),
        );
    }
    if (message.kind === 'changed') {
      this.rememberViewState(message.payload, this.nextId);
      this.accept(message.payload as RuntimeState);
    }
    if (message.kind === 'menu-state') {
      const packet = message.payload as { menu?: unknown; sequence?: unknown } | null;
      if (packet) this.menuObserver.publish(packet.menu, packet.sequence, this.nextId);
    }
    if (message.kind === 'dirty' && typeof message.payload === 'number') {
      this.invalidateStatistics();
      this.contextMenu.documentChanged();
      this.pendingChanges = true;
      this.latestSequence = Math.max(this.latestSequence, message.payload);
      this.documentRevision++;
    }
    if (message.kind === 'composition') {
      this.invalidateStatistics();
      this.composing = message.payload === true;
      if (this.composing) this.contextMenu.invalidate();
      else {
        for (const waiter of this.compositionWaiters) waiter.resolve();
        this.compositionWaiters.clear();
      }
      this.menuObserver.notify();
    }
    if (message.kind === 'selection') {
      this.invalidateStatistics();
      this.latestSelection = message.payload as RuntimeSelection;
      this.options.onSelectionChange?.(this.latestSelection);
    }
    if (message.kind === 'host-action')
      this.options.host?.onAction?.(message.payload as HostAction);
    if (message.kind === 'unsupported-host-call' && typeof message.payload === 'string')
      this.options.host?.onUnsupportedCapability?.(message.payload);
    if (message.kind === 'runtime-error')
      this.options.onError?.(new Error(String(message.payload)));
  };
}

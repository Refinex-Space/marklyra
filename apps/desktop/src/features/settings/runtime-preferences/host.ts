import { isExportPreferenceKey } from './export-preferences.js';
import {
  type FilePreferences,
  filePreferencesOptions,
  filePreferencesSnapshot,
} from './file-preferences.js';
import { isMarkdownPreferenceKey } from './markdown-preferences.js';
import {
  type InitialPreferencesOptions,
  initialPreferencesOptions,
  isRecord,
  type PreferenceAction,
  type PreferenceKey,
  type PreferenceValue,
  preferenceChange,
  preferencesProtocol,
  preferenceThemeFiles,
  runtimePreferencesUrl,
} from './policy.js';
import { startupPreferenceAction, startupPreferencesSnapshot } from './startup-preferences.js';

export interface RuntimePreferencesOptions {
  runtimeUrl: string;
  platform?: 'macos' | 'windows' | 'browser';
  initialOptions: InitialPreferencesOptions;
  presentation?:
    | { sidebarWidth: number; dark: boolean; sidebarBackground?: string | undefined }
    | undefined;
  onPut: (key: PreferenceKey, value: PreferenceValue) => Promise<void | FilePreferences>;
  onAction?: (name: PreferenceAction, data: unknown) => Promise<unknown>;
  onClose: () => void;
  onAiPage?: (active: boolean) => void;
  onError: (error: Error) => void;
}

/** Parent side only; runtime resources never receive IPC or a filesystem adapter. */
export class RuntimePreferencesHost {
  readonly element: HTMLIFrameElement;
  private readonly channel = crypto.randomUUID();
  private readonly origin: string;
  private readonly targetOrigin: string;
  private readonly window: Window;
  private initialized = false;
  private closeRequested = false;
  private instance: string | null = null;
  private pendingRequests = 0;
  private lastRequest = 0;
  private disposed = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly initial: Record<string, unknown>;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    container: HTMLElement,
    private readonly options: RuntimePreferencesOptions,
  ) {
    const window = container.ownerDocument.defaultView;
    if (!window) throw new Error('Preferences require a browser window');
    this.window = window;
    this.initial = initialPreferencesOptions(options.initialOptions);
    const url = runtimePreferencesUrl(
      options.runtimeUrl,
      container.ownerDocument.baseURI,
      window.location.origin,
    );
    this.origin = url.origin;
    this.targetOrigin = this.origin === 'null' ? '*' : this.origin;
    url.searchParams.set('channel', this.channel);
    url.searchParams.set('parentOrigin', window.location.origin);
    // One legacy page personality on every host: the cocoa layout and control set is the
    // product design. `hostOs` carries only the genuine OS differences (key names, quit policy).
    url.searchParams.set('os', 'mac');
    url.searchParams.set('hostOs', options.platform === 'windows' ? 'win' : 'mac');
    if (options.presentation) url.searchParams.set('layout', 'page');
    this.element = container.ownerDocument.createElement('iframe');
    this.element.title = 'MarkLyra 偏好设置';
    this.element.className = 'runtime-preferences-frame';
    this.element.style.cssText = 'width:100%;height:100%;display:block;border:0;';
    if (options.presentation) this.element.style.visibility = 'hidden';
    this.element.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    this.element.setAttribute('referrerpolicy', 'no-referrer');
    this.element.src = url.href;
    this.window.addEventListener('message', this.receive);
    this.timer = setTimeout(() => {
      if (!this.disposed && !this.initialized) options.onError(new Error('偏好设置初始化超时。'));
    }, 15_000);
    container.append(this.element);
  }

  private send(kind: string, payload: unknown, instance = this.instance) {
    if (!this.disposed && instance)
      this.element.contentWindow?.postMessage(
        { protocol: preferencesProtocol, channel: this.channel, instance, kind, payload },
        this.targetOrigin,
      );
  }

  /** Request the child's ordered close, including its not-yet-ACKed draft queue. */
  requestClose(): void {
    if (this.disposed) return;
    this.closeRequested = true;
    if (this.initialized) {
      this.closeRequested = false;
      this.send('close-request', null);
    } else {
      // An unopened/failed frame has no editable controls. Retain any previous
      // document's pending native write, then allow the enclosing page to close.
      void this.queue
        .then(async () => {
          if (this.disposed || !this.closeRequested || this.initialized) return;
          this.closeRequested = false;
          await this.options.onClose();
        })
        .catch((error: unknown) =>
          this.options.onError(error instanceof Error ? error : new Error(String(error))),
        );
    }
  }

  setPresentation(value: RuntimePreferencesOptions['presentation']): void {
    this.options.presentation = value;
    if (this.initialized && value) this.send('presentation', value);
  }

  private receive = (event: MessageEvent<unknown>) => {
    if (
      this.disposed ||
      event.source !== this.element.contentWindow ||
      (this.origin !== 'null' && event.origin !== this.origin) ||
      !isRecord(event.data) ||
      event.data.protocol !== preferencesProtocol ||
      event.data.channel !== this.channel
    )
      return;
    const { kind, payload, instance } = event.data;
    if (kind === 'ready') {
      if (
        typeof instance !== 'string' ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(instance)
      )
        return;
      if (this.instance === instance) return;
      this.instance = instance;
      this.initialized = false;
      this.lastRequest = 0;
      if (this.pendingRequests) this.send('waiting', null, instance);
      // A reloaded document must start from the confirmed result of the old page,
      // never from a stale baseline while a Native write is already in progress.
      void this.queue.then(() => {
        if (!this.disposed && this.instance === instance)
          this.send(
            'initialize',
            { options: this.initial, presentation: this.options.presentation },
            instance,
          );
      });
      return;
    }
    if (typeof instance !== 'string' || instance !== this.instance) return;
    if (kind === 'initialized') {
      this.initialized = true;
      this.element.style.visibility = 'visible';
      this.setPresentation(this.options.presentation);
      clearTimeout(this.timer);
      if (this.closeRequested) this.requestClose();
      return;
    }
    if (kind === 'ai-page' && typeof payload === 'boolean') {
      this.options.onAiPage?.(payload);
      return;
    }
    if (kind === 'error') {
      this.options.onError(
        new Error(typeof payload === 'string' ? payload : '偏好设置页面发生错误。'),
      );
      return;
    }
    if (kind !== 'request' || !this.initialized || !isRecord(payload)) return;
    const request = payload;
    if (
      !Number.isSafeInteger(request.id) ||
      Number(request.id) <= this.lastRequest ||
      Number(request.id) > 1_000_000
    )
      return;
    this.lastRequest = Number(request.id);
    const id = request.id;
    this.pendingRequests++;
    this.queue = this.queue
      .then(async () => {
        if (this.disposed || this.instance !== instance) return;
        try {
          let result: unknown;
          if (request.operation === 'put') {
            const change = preferenceChange(
              request.key,
              request.value,
              preferenceThemeFiles(this.initial.allThemes),
            );
            if (
              isMarkdownPreferenceKey(change.key) &&
              this.initial.marklyraMarkdownActions !== true
            )
              throw new Error('Markdown缩进应用能力尚未就绪。');
            if (isExportPreferenceKey(change.key) && this.initial.marklyraExportActions !== true)
              throw new Error('导出设置应用能力尚未就绪。');
            if (
              (change.key === 'disabledFileTypes' || change.key === 'removeCustomFileType') &&
              this.initial.marklyraFileTypeActions !== true
            )
              throw Error('文件类型设置尚未就绪。');
            const updated = await this.options.onPut(change.key, change.value);
            if (updated !== undefined) {
              result = filePreferencesSnapshot(updated);
              Object.assign(this.initial, filePreferencesOptions(result as FilePreferences));
            }
            if (updated === undefined) this.initial[change.key] = change.value;
            if (change.key === 'wordsPerMinute') this.initial.customWordsPerMinute = true;
            if (change.key === 'customWordsPerMinute' && change.value === false)
              this.initial.wordsPerMinute = 382;
          } else if (request.operation === 'export-tool-action') {
            if (
              this.initial.marklyraExportActions !== true ||
              request.name !== 'choose-pandoc' ||
              !this.options.onAction
            )
              throw new Error('Pandoc选择不可用。');
            result = await this.options.onAction('choose-pandoc', null);
            if (result !== null) {
              if (!isRecord(result) || typeof result.pandocPath !== 'string')
                throw new Error('Pandoc选择回执无效。');
              this.initial.pandocPath = result.pandocPath;
            }
          } else if (request.operation === 'theme-action') {
            if (
              this.initial.marklyraThemeActions !== true ||
              !this.options.onAction ||
              !['open-theme-folder', 'theme-gallery'].includes(String(request.name))
            )
              throw new Error('主题操作不可用。');
            await this.options.onAction(request.name as PreferenceAction, null);
          } else if (request.operation === 'file-action') {
            if (
              this.initial.marklyraFileActions !== true ||
              !this.options.onAction ||
              request.name !== 'clear-recent-history'
            )
              throw new Error('文件设置操作不可用。');
            await this.options.onAction('clear-recent-history', null);
          } else if (request.operation === 'startup-action') {
            if (this.initial.marklyraStartupActions !== true || !this.options.onAction)
              throw new Error('启动设置操作不可用。');
            const value = await this.options.onAction(
              'startup',
              startupPreferenceAction(request.action),
            );
            const snapshot = value === null ? null : startupPreferencesSnapshot(value);
            result = snapshot;
            if (snapshot) {
              this.initial.restoreWhenLaunch = snapshot.restoreWhenLaunch;
              this.initial.pinFolder = snapshot.pinFolder;
            }
          } else if (request.operation === 'close') {
            await this.options.onAction?.('close', null);
            await this.options.onClose();
          } else throw new Error('此偏好设置操作暂不支持。');
          this.send(
            'reply',
            {
              id,
              ok: true,
              ...(['put', 'startup-action', 'export-tool-action'].includes(
                String(request.operation),
              ) && result !== undefined
                ? { result }
                : {}),
            },
            instance,
          );
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          this.send('reply', { id, ok: false, error: failure.message }, instance);
        }
      })
      .finally(() => {
        this.pendingRequests--;
      });
  };

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.window.removeEventListener('message', this.receive);
    this.element.remove();
  }
}

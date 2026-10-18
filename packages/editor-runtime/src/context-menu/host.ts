import type { RuntimeState } from '../protocol.js';
import { browserClipboard, browserContextMenu } from './browser.js';
import {
  type ClipboardAdapter,
  type ClipboardContent,
  type ContextAction,
  type ContextMenuAdapter,
  clipboardContent,
  contextMenuRequest,
  externalLink,
  offeredContextActions,
} from './contracts.js';
import type { ContextExecutionResult, ImageContextEffect } from './execution.js';

export interface ContextMenuHostOptions {
  contextMenu?: ContextMenuAdapter;
  clipboard?: ClipboardAdapter;
  openExternal?: (url: string, signal: AbortSignal) => Promise<void>;
}
interface Session {
  requestId: string;
  display: AbortController;
  operation: AbortController;
  chosen: boolean;
}
/** Host implementations may ignore AbortSignal (including browser permission
 * prompts). Release the SDK queue anyway; never apply their late result. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason ?? new Error('Menu operation cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    promise.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    );
  });
}
export class HostContextMenu {
  private active: Session | undefined;
  private readonly menu: ContextMenuAdapter;
  private readonly clipboard: ClipboardAdapter;
  constructor(
    private readonly options: {
      frame: HTMLIFrameElement;
      host?: ContextMenuHostOptions | undefined;
      request: (operation: string, payload?: unknown) => Promise<unknown>;
      accept: (state: RuntimeState) => void;
      run: <T>(work: () => Promise<T>) => Promise<T>;
      assertAvailable: () => void;
      report: (error: Error) => void;
      readClipboard?: (
        signal: AbortSignal,
        requestId: string,
        action: ContextAction,
      ) => Promise<ClipboardContent | null>;
      imageAction?: (effect: ImageContextEffect, signal: AbortSignal) => Promise<void>;
    },
  ) {
    this.menu = options.host?.contextMenu ?? browserContextMenu(options.frame.ownerDocument);
    this.clipboard = options.host?.clipboard ?? browserClipboard(options.frame.ownerDocument);
  }
  get capabilities() {
    return {
      clipboardRead: Boolean(
        this.options.host?.clipboard ||
          this.options.frame.ownerDocument.defaultView?.navigator.clipboard,
      ),
      clipboardWrite: Boolean(
        this.options.host?.clipboard ||
          this.options.frame.ownerDocument.defaultView?.navigator.clipboard,
      ),
      openExternal: Boolean(this.options.host?.openExternal),
    };
  }
  invalidate(): void {
    const active = this.active;
    this.active = undefined;
    active?.display.abort();
    active?.operation.abort();
  }
  cancel(requestId: string): void {
    if (this.active?.requestId === requestId) this.invalidate();
  }
  show(value: unknown): void {
    this.invalidate();
    const request = contextMenuRequest(value);
    const rect = this.options.frame.getBoundingClientRect();
    request.point.x += rect.left;
    request.point.y += rect.top;
    const active: Session = {
      requestId: request.requestId,
      display: new AbortController(),
      operation: new AbortController(),
      chosen: false,
    };
    this.active = active;
    const offered = offeredContextActions(request.items);
    const choose = (action: ContextAction | null) => {
      if (this.active !== active || active.chosen || active.operation.signal.aborted) return;
      if (action !== null && !offered.has(action)) {
        this.options.report(new Error('菜单动作未获当前选区授权'));
        return;
      }
      active.chosen = true;
      active.display.abort();
      if (action === null) {
        this.invalidate();
        void this.options
          .request('context-menu-cancel', { requestId: request.requestId })
          .catch(() => {});
        return;
      }
      void this.options
        .run(() => this.execute(active, action))
        .catch((error: unknown) => {
          if (!active.operation.signal.aborted)
            this.options.report(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          if (this.active === active) this.invalidate();
        });
    };
    try {
      Promise.resolve(this.menu.show(request, choose, active.display.signal)).catch(
        (error: unknown) => {
          if (this.active !== active || active.display.signal.aborted) return;
          choose(null);
          this.options.report(error instanceof Error ? error : new Error(String(error)));
        },
      );
    } catch (error) {
      choose(null);
      this.options.report(error instanceof Error ? error : new Error(String(error)));
    }
  }
  documentChanged(): void {
    this.invalidate();
  }
  private async execute(active: Session, actionId: ContextAction): Promise<void> {
    const signal = active.operation.signal;
    signal.throwIfAborted();
    this.options.assertAvailable();
    const clipboard =
      actionId === 'edit.paste' || actionId === 'edit.pastePlain'
        ? this.options.readClipboard
          ? await abortable(this.options.readClipboard(signal, active.requestId, actionId), signal)
          : clipboardContent(await abortable(this.clipboard.read(signal), signal))
        : undefined;
    signal.throwIfAborted();
    if (clipboard === null) return;
    const result = (await this.options.request('context-menu-execute', {
      requestId: active.requestId,
      actionId,
      ...(clipboard ? { clipboard } : {}),
    })) as ContextExecutionResult & { state: RuntimeState };
    this.options.accept(result.state);
    if (!result.effect) return;
    signal.throwIfAborted();
    if (result.effect.type === 'imageAction') {
      if (!this.options.imageAction) throw new Error('宿主尚未提供图片操作能力');
      await abortable(this.options.imageAction(result.effect, signal), signal);
      return;
    }
    if (result.effect.type === 'openLink') {
      const open = this.options.host?.openExternal;
      if (!open) throw new Error('宿主未提供外部链接打开能力');
      await abortable(open(externalLink(result.effect.url), signal), signal);
      return;
    }
    await abortable(this.clipboard.write(clipboardContent(result.effect.content), signal), signal);
    signal.throwIfAborted();
    if (result.effect.cutToken) {
      const committed = (await this.options.request('context-menu-cut', {
        token: result.effect.cutToken,
      })) as { state: RuntimeState };
      this.options.accept(committed.state);
    }
  }
}

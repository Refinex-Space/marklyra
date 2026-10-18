import type { LegacyGlobals } from './legacy-types.js';

interface OutlinePopoverHost {
  runtime: LegacyGlobals;
  composing(): boolean;
  onChange(open: boolean): void;
  onPin(): void;
  onError?(error: Error): void;
}

/** Owns only the host boundary around the original page outline UI.
 * No Markdown read, transaction, selection reconstruction, or renderer copy. */
export class RuntimeOutlinePopover {
  private popup: HTMLElement | null = null;
  private open = false;
  private destroyed = false;
  private readonly observer = new MutationObserver(() => this.publish());
  private readonly pinDown = (event: Event) => {
    if (this.isPin(event.target)) event.preventDefault();
  };
  private readonly pinClick = (event: Event) => {
    if (!this.isPin(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      if (this.host.composing()) throw new Error('请先完成输入法候选');
      this.close();
      this.host.onPin();
    } catch (error) {
      if (this.host.onError)
        this.host.onError(error instanceof Error ? error : new Error(String(error)));
      else throw error;
    }
  };

  constructor(private readonly host: OutlinePopoverHost) {}

  install(): void {
    if (this.destroyed) throw new Error('大纲浮层已销毁');
    if (this.popup) return;
    this.popup = document.getElementById('toc-dropmenu');
    if (!this.popup) throw new Error('原始大纲浮层不可用');
    this.popup.addEventListener('pointerdown', this.pinDown, { capture: true });
    this.popup.addEventListener('mousedown', this.pinDown, { capture: true });
    this.popup.addEventListener('click', this.pinClick, { capture: true });
    this.observer.observe(this.popup, { attributes: true, attributeFilter: ['class'] });
    this.publish();
  }

  toggle(): boolean {
    this.outline().toggleOutline();
    return this.publish();
  }

  close(): void {
    if (this.destroyed || !this.popup) return;
    if (this.popup.classList.contains('open')) this.outline().hideOutline();
    this.publish();
  }

  destroy(): void {
    if (this.destroyed) return;
    try {
      this.close();
    } finally {
      this.observer.disconnect();
      this.popup?.removeEventListener('pointerdown', this.pinDown, true);
      this.popup?.removeEventListener('mousedown', this.pinDown, true);
      this.popup?.removeEventListener('click', this.pinClick, true);
      this.popup = null;
      this.destroyed = true;
    }
  }

  private outline() {
    if (this.destroyed) throw new Error('大纲浮层已销毁');
    if (!this.popup) throw new Error('大纲浮层尚未安装');
    const outline = this.host.runtime.editor?.library.outline;
    if (!outline) throw new Error('原始大纲尚未初始化');
    return outline;
  }

  private publish(): boolean {
    const open = Boolean(this.popup?.classList.contains('open'));
    this.popup?.setAttribute('aria-hidden', String(!open));
    if (open !== this.open) {
      this.open = open;
      this.host.onChange(open);
    }
    return open;
  }

  private isPin(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('#toc-dropmenu #pin-outline-btn'));
  }
}

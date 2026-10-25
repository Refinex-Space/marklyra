import type { LegacyGlobals } from './legacy-types.js';
import { refreshOutlineModel } from './outline.js';

interface Dependencies {
  runtime: LegacyGlobals;
  available(): boolean;
  onCurrent(id: string | null): void;
}
/** Reuses the runtime visible-heading algorithm against its own hidden outline
 * DOM. Scroll reads never serialize Markdown or reconstruct an editing selection. */
export class RuntimeOutlineNavigation {
  private enabled = false;
  private dirty = true;
  private current: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly abort = new AbortController();
  private readonly layout = new ResizeObserver(() => this.schedule());
  constructor(private readonly deps: Dependencies) {}
  install(): void {
    const content = document.querySelector('content');
    content?.addEventListener('scroll', () => this.schedule(), {
      passive: true,
      signal: this.abort.signal,
    });
    window.addEventListener('resize', () => this.schedule(), { signal: this.abort.signal });
    const area = this.deps.runtime.editor?.writingArea;
    if (area) this.layout.observe(area);
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const sidebar = document.getElementById('marklyra-sidebar');
    sidebar?.classList.toggle('open', enabled);
    sidebar?.classList.toggle('active-tab-outline', enabled);
    document.body.classList.toggle('pin-outline', enabled);
    this.dirty = true;
    if (enabled) this.update();
    else this.publish(null);
  }
  changed(): void {
    this.dirty = true;
    this.schedule();
  }
  reset(): void {
    this.dirty = true;
    this.publish(null);
  }
  schedule(): void {
    if (!this.enabled || this.abort.signal.aborted) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.update();
      },
      this.deps.runtime.File?.inBusyMode ? 200 : 100,
    );
  }
  private update(): void {
    if (!this.enabled || !this.deps.available()) return;
    const editor = this.deps.runtime.editor;
    if (!editor || editor.sourceView.inSourceMode) {
      this.publish(null);
      return;
    }
    if (this.dirty) {
      refreshOutlineModel(this.deps.runtime);
      editor.library.outline.renderOutline();
      this.dirty = false;
    }
    editor.library.outline.highlightVisibleHeader();
    // The original marks both the current heading and its collapsed ancestor.
    // DOM order leaves the actual descendant last; the host maps its own folds.
    const active = document.querySelectorAll('#outline-content .outline-active[data-ref]');
    this.publish(active.item(active.length - 1)?.getAttribute('data-ref') ?? null);
  }
  private publish(id: string | null): void {
    if (id === this.current) return;
    this.current = id;
    this.deps.onCurrent(id);
  }
  destroy(): void {
    this.abort.abort();
    this.layout.disconnect();
    if (this.timer) clearTimeout(this.timer);
  }
}

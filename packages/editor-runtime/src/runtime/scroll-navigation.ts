import type { LegacyGlobals } from './legacy-types.js';

/** Read only scroll geometry; publish only when the navigation state changes. */
export class RuntimeScrollNavigation {
  private current: boolean | undefined;
  private frame = 0;
  private readonly abort = new AbortController();
  constructor(
    private readonly deps: {
      runtime: LegacyGlobals;
      available(): boolean;
      onChange(awayFromTop: boolean): void;
    },
  ) {}

  install(): void {
    document.addEventListener(
      'scroll',
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.matches('content, #typora-source .CodeMirror-scroll')
        )
          this.schedule();
      },
      { capture: true, passive: true, signal: this.abort.signal },
    );
    window.addEventListener('resize', () => this.schedule(), { signal: this.abort.signal });
    this.schedule();
  }

  schedule(): void {
    if (this.frame || this.abort.signal.aborted) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const source = this.deps.runtime.editor?.sourceView.inSourceMode;
      const port = document.querySelector<HTMLElement>(
        source ? '#typora-source .CodeMirror-scroll' : 'content',
      );
      this.publish(
        Boolean(
          this.deps.available() && port && port.scrollTop > Math.max(240, port.clientHeight / 2),
        ),
      );
    });
  }

  reset(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.publish(false);
  }

  private publish(value: boolean): void {
    if (value === this.current) return;
    this.current = value;
    this.deps.onChange(value);
  }

  destroy(): void {
    this.abort.abort();
    cancelAnimationFrame(this.frame);
  }
}

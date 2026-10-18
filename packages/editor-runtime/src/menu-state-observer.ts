import { type MarkLyraMenuState, marklyraMenuState } from './menu-state.js';

/** Presentation delivery has its own ordering and cannot fault the source mirror. */
export class MenuStateObserver {
  private sequence = -1;
  private order = -1;
  private current: MarkLyraMenuState | null = null;
  private signature = '';
  private disposed = false;
  private readonly listeners = new Set<(state: MarkLyraMenuState) => void>();

  constructor(private readonly report: (error: unknown) => void) {}

  get value(): MarkLyraMenuState | null {
    return this.current;
  }

  subscribe(listener: (state: MarkLyraMenuState) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(value: unknown, sequence: unknown, order: number | undefined): void {
    if (
      this.disposed ||
      typeof sequence !== 'number' ||
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      sequence <= this.sequence ||
      order === undefined ||
      order < this.order
    )
      return;
    try {
      const state = marklyraMenuState(value);
      const signature = JSON.stringify(state);
      this.sequence = sequence;
      this.order = order;
      if (signature === this.signature) return;
      this.signature = signature;
      this.current = Object.freeze({
        ...state,
        inlineStyles: Object.freeze([...state.inlineStyles]),
        blockStyles: Object.freeze([...state.blockStyles]),
      });
      this.notify();
    } catch (error) {
      this.reportSafely(error);
    }
  }

  /** Composition changes eligibility even if the original style facts are identical. */
  notify(): void {
    if (this.disposed || !this.current) return;
    for (const listener of [...this.listeners]) {
      try {
        listener(this.current);
      } catch (error) {
        this.reportSafely(error);
      }
    }
  }

  destroy(): void {
    this.disposed = true;
    this.current = null;
    this.listeners.clear();
  }

  private reportSafely(error: unknown): void {
    try {
      this.report(error);
    } catch {
      /* Diagnostics cannot interrupt editing. */
    }
  }
}

import type { RuntimeState, RuntimeStatisticsPacket } from '../protocol.js';
import type { LegacyGlobals } from './legacy-types.js';

interface Dependencies {
  runtime: LegacyGlobals;
  state(): RuntimeState;
  available(): boolean;
  invalidated(): void;
}
/** Calls installed read-only methods; no commercial counting algorithm is copied here. */
export class RuntimeStatistics {
  private epoch = 0;
  private counted:
    | { canonical: string; sequence: number; epoch: number; words: number }
    | undefined;
  private observer: MutationObserver | undefined;
  private disposed = false;
  constructor(private readonly deps: Dependencies) {}
  install(): void {
    const root = this.deps.runtime.editor?.writingArea;
    if (!root) return;
    this.observer = new MutationObserver((records) => this.changed(records.length));
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['mdtype', 'lang'],
    });
  }
  private changed(count: number): void {
    if (!count || this.disposed) return;
    this.epoch++;
    this.deps.invalidated();
  }
  private drain(): void {
    this.changed(this.observer?.takeRecords().length ?? 0);
  }
  current(sequence: number, epoch: number, actualSequence: number): boolean {
    this.drain();
    return (
      !this.disposed && this.deps.available() && sequence === actualSequence && epoch === this.epoch
    );
  }
  private async readyRendering(): Promise<void> {
    const start = Date.now();
    let stableSince = Date.now();
    let last = this.epoch;
    while (true) {
      if (this.disposed || !this.deps.available()) throw new Error('统计已取消');
      this.drain();
      if (last !== this.epoch) {
        last = this.epoch;
        stableSince = Date.now();
      }
      const root = this.deps.runtime.editor?.writingArea;
      if (!root) throw new Error('统计运行时尚未就绪');
      const pendingMath = Array.from(root.querySelectorAll('.md-math-block,.md-inline-math')).some(
        (node) => !node.querySelector('svg,.MathJax_Error,.mjx-error'),
      );
      // Large-document reset can commit #write in a later timer task.
      if (root.childElementCount && !pendingMath && Date.now() - stableSince >= 100) return;
      if (Date.now() - start > 15000) throw new Error('统计渲染未完成，请重试');
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }
  async read(isolated: boolean): Promise<RuntimeStatisticsPacket> {
    if (!this.deps.available()) throw new Error('请先完成当前编辑操作');
    const editor = this.deps.runtime.editor;
    if (
      isolated ||
      (editor && !editor.sourceView.inSourceMode && !editor.writingArea.childElementCount)
    )
      await this.readyRendering();
    const state = this.deps.state();
    this.drain();
    const counter = this.deps.runtime.editor?.wordCount;
    if (!counter) throw new Error('原统计模块不可用');
    // Shadow the WORD discriminator only for this synchronous read. No setter,
    // preference write, timer or instance mutation is performed.
    const query = Object.create(counter) as typeof counter;
    query.delimiter = 0;
    let words = 0;
    if (!state.sourceMode) {
      const prior = this.counted;
      words =
        prior &&
        prior.canonical === state.canonical &&
        prior.sequence === state.sequence &&
        prior.epoch === this.epoch
          ? prior.words
          : query.getWordCount();
      this.counted = {
        canonical: state.canonical,
        sequence: state.sequence,
        epoch: this.epoch,
        words,
      };
    }
    const characters = query.getCharCountInSelection();
    const selection = characters ? { words: query.getWordCountInSelection(), characters } : null;
    return { state, renderEpoch: this.epoch, words, selection };
  }
  destroy(): void {
    this.disposed = true;
    this.observer?.disconnect();
    this.counted = undefined;
  }
}

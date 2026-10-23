import type { LegacyEditor, LegacyGlobals, LegacyNode } from './legacy-types.js';
import type { RenderTicket } from './render-tickets.js';

type CM = NonNullable<LegacyEditor['sourceView']['cm']>;
interface Candidate {
  block: HTMLElement;
  editor: LegacyEditor;
  file: NonNullable<LegacyGlobals['File']>;
  map: LegacyEditor['nodeMap'];
  math: NonNullable<LegacyEditor['mathBlock']>;
  node: LegacyNode;
  source: string;
  language: unknown;
  crlf: boolean;
  generation: number;
  cm?: CM;
  doc?: CM['doc'];
  cmSource?: string;
}
const selector = '[mdtype="fences"].md-fences-math[cid]';

/** The native first pass can create a missing panel after computing its SVG,
 * leaving that new panel empty. Complete only that exact current fence through
 * its original updateDiagram path, whose asynchronous commit uses render tickets. */
export class RuntimeInitialMathPreviews {
  private readonly pending = new Map<HTMLElement, Candidate>();
  private readonly attempted = new WeakSet<HTMLElement>();
  private starting: { candidate: Candidate; preview: HTMLElement; settled: boolean } | undefined;
  private restore: (() => void) | undefined;
  private dead = false;
  constructor(
    private readonly runtime: LegacyGlobals,
    private readonly generation: () => number,
    private readonly available: () => boolean,
  ) {}
  install(): void {
    const editor = this.runtime.editor,
      math = editor?.mathBlock,
      original = math?.renderUnder;
    if (this.dead || this.restore || !editor || !math || !original || !math.updateDiagram) return;
    const controller = this;
    const wrapped: typeof original = function (
      this: NonNullable<LegacyEditor['mathBlock']>,
      ...args
    ) {
      const candidates =
        this === math && controller.runtime.editor === editor ? controller.capture(args[0]) : [];
      return Reflect.apply(original, this, args).then((result) => {
        for (const candidate of candidates)
          if (controller.current(candidate)) controller.pending.set(candidate.block, candidate);
        controller.flush();
        return result;
      });
    };
    math.renderUnder = wrapped;
    // Offscreen fences get their CM lazily. Never create one just to render a preview.
    const add = editor.fences.addCodeBlock;
    const added: typeof add = add
      ? function (this: LegacyEditor['fences'], ...args) {
          const result = Reflect.apply(add, this, args);
          if (this === editor.fences) controller.flush();
          return result;
        }
      : undefined;
    if (added) editor.fences.addCodeBlock = added;
    this.restore = () => {
      if (math.renderUnder === wrapped) math.renderUnder = original;
      if (added && add && editor.fences.addCodeBlock === added) editor.fences.addCodeBlock = add;
    };
  }
  private capture(scope?: ParentNode): Candidate[] {
    const editor = this.runtime.editor,
      file = this.runtime.File,
      math = editor?.mathBlock;
    if (this.dead || !editor || !file || !math || file.option.gitlabMath !== true) return [];
    return [...editor.writingArea.querySelectorAll<HTMLElement>(selector)].flatMap((block) => {
      if (scope && scope !== block && !(scope as Node).contains(block)) return [];
      const node = editor.getNode(block.getAttribute('cid') ?? ''),
        source = node?.get('text');
      if (
        !node ||
        node.get('type') !== 'fences' ||
        typeof source !== 'string' ||
        source.includes('\r')
      )
        return [];
      const candidate: Candidate = {
        block,
        editor,
        file,
        math,
        map: editor.nodeMap,
        node,
        source,
        language: node.get('lang'),
        crlf: Boolean(file.useCRLF),
        generation: this.generation(),
      };
      if (editor.fences.queue?.[node.cid] && !this.bindCM(candidate)) return [];
      return [candidate];
    });
  }
  private current(candidate: Candidate): boolean {
    const { editor, file, math, block, node } = candidate;
    return (
      !this.dead &&
      this.runtime.editor === editor &&
      this.runtime.File === file &&
      editor.nodeMap === candidate.map &&
      editor.mathBlock === math &&
      this.generation() === candidate.generation &&
      !editor.sourceView.inSourceMode &&
      file.option.gitlabMath === true &&
      Boolean(file.useCRLF) === candidate.crlf &&
      block.isConnected &&
      editor.writingArea.contains(block) &&
      block.matches(selector) &&
      block.getAttribute('cid') === node.cid &&
      editor.getNode(node.cid) === node &&
      node.get('type') === 'fences' &&
      node.get('lang') === candidate.language &&
      node.get('text') === candidate.source
    );
  }
  private bindCM(candidate: Candidate): boolean {
    const cm = candidate.editor.fences.queue?.[candidate.node.cid] as CM | undefined;
    if (
      !cm ||
      !cm.doc ||
      typeof cm.getValue !== 'function' ||
      typeof cm.getWrapperElement !== 'function'
    )
      return false;
    const value = cm.getValue();
    if (
      value !== candidate.source &&
      (!candidate.crlf || value !== candidate.source.replace(/\n/g, '\r\n'))
    )
      return false;
    if (!candidate.cm) {
      candidate.cm = cm;
      candidate.doc = cm.doc;
      candidate.cmSource = value;
    }
    const wrapper = cm.getWrapperElement();
    return (
      candidate.cm === cm &&
      candidate.doc === cm.doc &&
      candidate.cmSource === value &&
      Reflect.get(cm, 'cid') === candidate.node.cid &&
      wrapper instanceof HTMLElement &&
      wrapper.isConnected &&
      candidate.block.contains(wrapper)
    );
  }
  flush(): void {
    if (
      this.dead ||
      !this.available() ||
      this.runtime.editor?.isIME ||
      this.runtime.File?._onInitParse
    )
      return;
    for (const [block, candidate] of this.pending) {
      if (!this.current(candidate)) {
        this.pending.delete(block);
        continue;
      }
      if (!candidate.editor.fences.queue?.[candidate.node.cid]) continue;
      if (!this.bindCM(candidate)) {
        this.pending.delete(block);
        continue;
      }
      if (!candidate.math.isMathJaxReady?.()) continue;
      this.pending.delete(block);
      const preview = block.querySelector<HTMLElement>('.md-fences-adv-panel-preview');
      if (
        !preview ||
        !preview.isConnected ||
        preview.closest('[cid]') !== block ||
        preview.childNodes.length ||
        block.querySelector('.md-fences-adv-panel-error')?.textContent?.trim() ||
        this.attempted.has(preview)
      )
        continue;
      this.attempted.add(preview);
      const attempt = { candidate, preview, settled: false };
      this.starting = attempt;
      try {
        candidate.math.updateDiagram?.(candidate.node.cid);
      } finally {
        if (this.starting === attempt) this.starting = undefined;
      }
    }
  }
  /** Observe only our own native request; the original ticket still exclusively
   * decides whether its result may commit. An IME/load cancellation can resume
   * on that lifecycle's stable event, without retrying superseded renders. */
  observeTicket(preview: unknown, cm: unknown, ticket: RenderTicket): RenderTicket {
    const attempt = this.starting;
    if (!attempt || preview !== attempt.preview || cm !== attempt.candidate.cm) return ticket;
    return {
      current: () => {
        const accepted = ticket.current();
        if (!attempt.settled) {
          attempt.settled = true;
          const candidate = attempt.candidate;
          if (
            !accepted &&
            this.current(candidate) &&
            this.bindCM(candidate) &&
            (!this.available() || candidate.editor.isIME)
          ) {
            this.attempted.delete(attempt.preview);
            this.pending.set(candidate.block, candidate);
          }
        }
        return accepted;
      },
    };
  }
  destroy(): void {
    this.dead = true;
    this.pending.clear();
    this.starting = undefined;
    this.restore?.();
    this.restore = undefined;
  }
}

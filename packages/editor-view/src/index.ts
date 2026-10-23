import {
  commandTransaction,
  type EditorCommand,
  EditorSession,
  type EditorState,
  type Selection,
} from '@marklyra/editor-core';
import { blockAt, type MarkdownDocument, parseMarkdown } from '@marklyra/editor-markdown';
import {
  domPoint,
  expandedMarkers,
  type Projection,
  projectBlock,
  sourcePoint,
} from './projection.js';

export type { EditorCommand, EditorState, Selection } from '@marklyra/editor-core';
export interface EditorOptions {
  markdown?: string;
  ariaLabel?: string;
  onChange?: (markdown: string) => void;
  onSelectionChange?: (selection: Selection) => void;
}
export interface EditorExtension {
  readonly id: string;
  readonly commands: Readonly<Record<string, (editor: EditorView) => void>>;
}
interface Composition {
  committed?: string;
  element: HTMLElement;
  before: string;
  source: string;
  from: number;
  revision: number;
  selection: Selection;
  segments: { from: number; to: number; visualFrom: number; visualTo: number }[];
}
/** DOM-owned view. React and native host APIs never participate in input transactions. */
export class EditorView {
  readonly session: EditorSession;
  readonly element: HTMLDivElement;
  private document: MarkdownDocument;
  private projections: Projection[] = [];
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private destroyed = false;
  private rendering = false;
  private composition: Composition | null = null;
  private readonly extensions = new Map<string, EditorExtension>();
  private lastSource: string;
  private lastSelection: Selection;
  private pendingNative: Composition | null = null;
  constructor(
    container: HTMLElement,
    private readonly options: EditorOptions = {},
  ) {
    this.session = new EditorSession(options.markdown ?? '');
    this.lastSource = this.session.state.source;
    this.lastSelection = this.session.state.selection;
    this.document = parseMarkdown(this.lastSource);
    this.element = container.ownerDocument.createElement('div');
    this.element.className = 'tr-editor';
    this.element.contentEditable = 'true';
    this.element.spellcheck = false;
    this.element.setAttribute('role', 'textbox');
    this.element.setAttribute('aria-multiline', 'true');
    this.element.setAttribute('aria-label', options.ariaLabel ?? 'Markdown 编辑器');
    container.append(this.element);
    this.unsubscribe = this.session.subscribe((state) => this.onState(state));
    const signal = this.abort.signal;
    this.element.addEventListener('beforeinput', this.beforeInput, { signal });
    this.element.addEventListener('input', this.input, { signal });
    this.element.addEventListener('keydown', this.keydown, { signal });
    this.element.addEventListener('compositionstart', this.compositionStart, { signal });
    this.element.addEventListener('compositionend', this.compositionEnd, { signal });
    this.element.addEventListener('paste', this.paste, { signal });
    this.element.addEventListener('drop', this.drop, { signal });
    this.element.addEventListener('copy', this.copy, { signal });
    this.element.addEventListener('cut', this.cut, { signal });
    this.element.ownerDocument.addEventListener('selectionchange', this.selectionChange, {
      signal,
    });
    this.render(false);
  }
  get isComposing(): boolean {
    return this.composition !== null;
  }
  getMarkdown(): string {
    return this.session.state.source;
  }
  load(markdown: string): void {
    this.assertAvailable();
    this.session.load(markdown);
  }
  getSelection(): Selection {
    return { ...this.session.state.selection };
  }
  setSelection(selection: Selection): void {
    this.assertAvailable();
    this.session.setSelection(selection);
    this.render(true);
  }
  focus(): void {
    this.assertAlive();
    this.element.focus();
    this.restoreSelection();
  }
  execute(command: EditorCommand | string): void {
    this.assertAvailable();
    if (typeof command === 'string') {
      for (const extension of this.extensions.values()) {
        const run = extension.commands[command];
        if (run) {
          run(this);
          return;
        }
      }
      throw new Error(`Unknown editor command: ${command}`);
    }
    this.session.execute(command);
    this.focus();
  }
  onChange(listener: (markdown: string) => void): () => void {
    let previous = this.getMarkdown();
    return this.session.subscribe((state) => {
      if (state.source !== previous) {
        previous = state.source;
        listener(state.source);
      }
    });
  }
  registerExtension(extension: EditorExtension): () => void {
    this.assertAlive();
    if (this.extensions.has(extension.id)) throw new Error(`Duplicate extension: ${extension.id}`);
    for (const name of Object.keys(extension.commands))
      for (const existing of this.extensions.values())
        if (name in existing.commands) throw new Error(`Duplicate command: ${name}`);
    this.extensions.set(extension.id, extension);
    return () => this.extensions.delete(extension.id);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.unsubscribe();
    this.extensions.clear();
    this.element.remove();
  }
  private assertAlive(): void {
    if (this.destroyed) throw new Error('Editor has been destroyed');
  }
  private assertAvailable(): void {
    this.assertAlive();
    if (this.composition) throw new Error('Wait for composition to finish');
  }
  private onState(state: EditorState): void {
    if (this.composition) return;
    const changed = state.source !== this.lastSource;
    if (changed) {
      this.document = parseMarkdown(state.source);
      this.lastSource = state.source;
    }
    this.render(this.element.ownerDocument.activeElement === this.element);
    if (changed) this.options.onChange?.(state.source);
    if (
      state.selection.anchor !== this.lastSelection.anchor ||
      state.selection.head !== this.lastSelection.head
    ) {
      this.lastSelection = state.selection;
      this.options.onSelectionChange?.({ ...state.selection });
    }
  }
  private render(restore: boolean): void {
    if (this.destroyed || this.composition) return;
    this.rendering = true;
    const state = this.session.state;
    const active = blockAt(this.document, state.selection.head);
    const anchor = blockAt(this.document, state.selection.anchor);
    const old = this.projections;
    const key = (raw: string, kind: string, active: boolean, markers: string) =>
      `${kind}:${active}:${markers}:${raw}`;
    const reusable = new Map<string, Projection[]>();
    const used = new Set<Projection>();
    for (const projection of [...old].reverse()) {
      const signature = key(
        projection.block.raw,
        projection.block.kind,
        projection.active,
        projection.markerKey,
      );
      const group = reusable.get(signature) ?? [];
      group.push(projection);
      reusable.set(signature, group);
    }
    this.projections = this.document.blocks.map((block, index) => {
      const isActive = block === active || block === anchor;
      const expanded = expandedMarkers(block, state.selection);
      const markerKey = [...expanded].join(',');
      let previous = old[index];
      const signature = key(block.raw, block.kind, isActive, markerKey);
      if (
        !previous ||
        used.has(previous) ||
        key(previous.block.raw, previous.block.kind, previous.active, previous.markerKey) !==
          signature
      ) {
        const candidates = reusable.get(signature);
        do {
          previous = candidates?.pop();
        } while (previous && used.has(previous));
      }
      if (
        previous &&
        previous.block.raw === block.raw &&
        previous.block.kind === block.kind &&
        previous.active === isActive &&
        previous.markerKey === markerKey
      ) {
        previous.block = block;
        used.add(previous);
        return previous;
      }
      return projectBlock(this.element.ownerDocument, state.source, block, isActive, expanded);
    });
    const retained = new Set<Node>(this.projections.map((p) => p.element));
    for (const child of [...this.element.childNodes]) if (!retained.has(child)) child.remove();
    for (let i = 0; i < this.projections.length; i++) {
      const element = this.projections[i]?.element;
      if (!element) continue;
      const current = this.element.children[i];
      if (current !== element) this.element.insertBefore(element, current ?? null);
    }
    if (restore) this.restoreSelection();
    this.rendering = false;
  }
  private restoreSelection(): void {
    const { anchor, head } = this.session.state.selection;
    const find = (position: number) =>
      this.projections.find((p) => position >= p.block.from && position < p.block.to) ??
      this.projections.at(-1);
    const a = find(anchor),
      h = find(head);
    if (!a || !h) return;
    const [an, ao] = domPoint(a, anchor),
      [hn, ho] = domPoint(h, head);
    this.element.ownerDocument.getSelection()?.setBaseAndExtent(an, ao, hn, ho);
  }
  private readSelection(): Selection | null {
    const selection = this.element.ownerDocument.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) return null;
    const point = (node: Node, offset: number): number | null => {
      if (node === this.element) {
        const p = this.projections[offset];
        return p?.block.from ?? this.session.state.source.length;
      }
      const p = this.projections.find((item) => item.element.contains(node));
      return p ? sourcePoint(p, node, offset) : null;
    };
    const anchor = point(selection.anchorNode, selection.anchorOffset),
      head = point(selection.focusNode, selection.focusOffset);
    return anchor === null || head === null ? null : { anchor, head };
  }
  private selectionChange = (): void => {
    if (this.rendering || this.composition || this.destroyed) return;
    const next = this.readSelection(),
      old = this.session.state.selection;
    if (next && (next.anchor !== old.anchor || next.head !== old.head))
      this.session.setSelection(next);
  };
  private captureNative(): Composition | null {
    const block = blockAt(this.document, this.session.state.selection.head);
    const projection = this.projections.find((p) => p.block === block);
    if (!projection) return null;
    // Native WebKit may replace the composing block itself with a root Text node.
    // Capture the stable editing host, not a block that the IME can detach.
    const element = this.element;
    const capturedProjections = this.projections;
    let visual = 0;
    const segments = capturedProjections.flatMap((projection) =>
      projection.segments.map((segment) => {
        const entry = {
          from: projection.block.from + segment.from,
          to: projection.block.from + segment.to,
          visualFrom: visual,
          visualTo: visual + segment.node.length,
        };
        visual = entry.visualTo;
        return entry;
      }),
    );
    return {
      selection: { ...this.session.state.selection },
      segments,
      element,
      before: element.textContent ?? '',
      source: this.session.state.source,
      from: 0,
      revision: this.session.state.revision,
    };
  }
  private beforeInput = (event: InputEvent): void => {
    if (this.composition || event.isComposing) return;
    this.selectionChange();
    this.pendingNative = null;
    const commands: Record<string, EditorCommand> = {
      insertParagraph: { type: 'insertParagraph' },
      insertLineBreak: { type: 'insertLineBreak' },
      deleteContentBackward: { type: 'deleteBackward' },
      deleteContentForward: { type: 'deleteForward' },
      historyUndo: { type: 'undo' },
      historyRedo: { type: 'redo' },
      formatBold: { type: 'toggleMark', marker: '**' },
      formatItalic: { type: 'toggleMark', marker: '*' },
    };
    const command =
      event.inputType === 'insertText' || event.inputType === 'insertReplacementText'
        ? { type: 'insertText' as const, text: event.data ?? '' }
        : commands[event.inputType];
    if (command && event.cancelable) {
      event.preventDefault();
      this.session.execute(command);
      return;
    }
    // Uncancelable browser edits are reconciled from the active source-visible block.
    this.pendingNative = this.captureNative();
    if (!command && event.cancelable) event.preventDefault();
  };
  private input = (): void => {
    if (this.composition) return;
    if (this.pendingNative) {
      const pending = this.pendingNative;
      this.pendingNative = null;
      this.reconcile(pending);
    }
  };
  private compositionStart = (): void => {
    this.selectionChange();
    this.composition = this.captureNative();
    this.pendingNative = null;
  };
  private compositionEnd = (event: CompositionEvent): void => {
    const captured = this.composition;
    if (!captured) return;
    captured.committed = event.data;
    // WKWebView can apply its final candidate after the compositionend microtask checkpoint.
    // Keep the native DOM untouched until the next task, including trailing beforeinput/input.
    setTimeout(() => {
      if (this.destroyed || this.composition !== captured) return;
      this.composition = null;
      this.reconcile(captured);
    }, 0);
  };
  private reconcile(captured: Composition): void {
    // A source selection may consist entirely of block separators absent from
    // DOM.textContent. A committed candidate replaces that exact source range.
    if (captured.selection.anchor !== captured.selection.head && captured.committed) {
      const from = Math.min(captured.selection.anchor, captured.selection.head);
      const to = Math.max(captured.selection.anchor, captured.selection.head);
      const head = from + captured.committed.length;
      this.projections = [];
      this.session.apply({
        baseRevision: captured.revision,
        patches: [{ from, to, insert: captured.committed }],
        selection: { anchor: head, head },
        group: 'composition',
      });
      this.render(true);
      return;
    }
    const after = captured.element.textContent ?? '';
    let from = 0;
    while (
      from < captured.before.length &&
      from < after.length &&
      captured.before[from] === after[from]
    )
      from++;
    let endBefore = captured.before.length,
      endAfter = after.length;
    while (
      endBefore > from &&
      endAfter > from &&
      captured.before[endBefore - 1] === after[endAfter - 1]
    ) {
      endBefore--;
      endAfter--;
    }
    if (from === endBefore && from === endAfter) {
      this.projections = [];
      this.render(true);
      return;
    }
    // Avoid a minimal diff starting inside a surrogate pair or CRLF.
    if (
      from > 0 &&
      (/[\uD800-\uDBFF]/.test(captured.before[from - 1] ?? '') ||
        (captured.before[from - 1] === '\r' && captured.before[from] === '\n'))
    ) {
      from--;
    }
    if (
      endBefore < captured.before.length &&
      /[\uDC00-\uDFFF]/.test(captured.before[endBefore] ?? '')
    ) {
      endBefore++;
      endAfter++;
    }
    const mapped = (offset: number, bias: 'left' | 'right'): number => {
      const exact = captured.segments.filter(
        (segment) => offset >= segment.visualFrom && offset <= segment.visualTo,
      );
      const segment = bias === 'left' ? exact[0] : exact.at(-1);
      return segment ? segment.from + offset - segment.visualFrom : captured.from;
    };
    let patchFrom = mapped(from, 'right');
    let patchTo = mapped(endBefore, 'left');
    if (from === endBefore) {
      const sourceHead = captured.selection.head;
      const segment = captured.segments.find((s) => sourceHead >= s.from && sourceHead <= s.to);
      const visualHead = segment
        ? segment.visualFrom + sourceHead - segment.from
        : (captured.segments.find((s) => s.from > sourceHead)?.visualFrom ??
          captured.segments.at(-1)?.visualTo ??
          0);
      if (visualHead === from) patchFrom = sourceHead;
      patchTo = patchFrom;
    }
    const insert = after.slice(from, endAfter),
      head = patchFrom + insert.length;
    this.projections = [];
    this.session.apply({
      baseRevision: captured.revision,
      patches: [{ from: patchFrom, to: patchTo, insert }],
      selection: { anchor: head, head },
      group: 'composition',
    });
    this.render(true);
  }
  private keydown = (event: KeyboardEvent): void => {
    if (this.composition || event.isComposing || event.keyCode === 229) return;
    const mod = event.metaKey || event.ctrlKey;
    let command: EditorCommand | undefined;
    if (mod && event.key.toLowerCase() === 'z')
      command = { type: event.shiftKey ? 'redo' : 'undo' };
    else if (mod && event.key.toLowerCase() === 'y') command = { type: 'redo' };
    else if (mod && event.key.toLowerCase() === 'b') command = { type: 'toggleMark', marker: '**' };
    else if (mod && event.key.toLowerCase() === 'i') command = { type: 'toggleMark', marker: '*' };
    else if (event.key === 'Tab') command = { type: event.shiftKey ? 'outdent' : 'indent' };
    if (command) {
      event.preventDefault();
      this.selectionChange();
      this.session.execute(command);
    }
  };
  private paste = (event: ClipboardEvent): void => {
    if (this.composition) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    event.preventDefault();
    this.selectionChange();
    const transaction = commandTransaction(this.session.state, { type: 'insertText', text });
    // A clipboard action owns its undo step, even when its text has no newline.
    if (transaction) this.session.apply({ ...transaction, group: 'paste' });
  };
  private copy = (event: ClipboardEvent): void => {
    const selection = this.readSelection() ?? this.getSelection();
    if (selection.anchor === selection.head) return;
    event.clipboardData?.setData(
      'text/plain',
      this.getMarkdown().slice(
        Math.min(selection.anchor, selection.head),
        Math.max(selection.anchor, selection.head),
      ),
    );
    event.preventDefault();
  };
  private cut = (event: ClipboardEvent): void => {
    if (this.composition) return;
    this.copy(event);
    if (event.defaultPrevented) {
      this.selectionChange();
      this.session.execute({ type: 'insertText', text: '' });
    }
  };
  private drop = (event: DragEvent): void => {
    // File/HTML drops need a Host Adapter and are intentionally not accepted yet.
    event.preventDefault();
  };
}

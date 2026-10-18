import type { ImageAutomaticMessage } from '../images/contracts.js';
import { imageDestinations } from '../images/references.js';
import type { RuntimeState } from '../protocol.js';
import type { LegacyEditor, LegacyGlobals } from './legacy-types.js';

interface Storage {
  referenceRoot: string;
  storageFolder?: string;
  sourceMode: boolean;
}
interface Dependencies {
  runtime: LegacyGlobals;
  state(): RuntimeState;
  available(): boolean;
  reference(source: string): string;
  storage(): Storage;
  send(kind: string, payload: unknown): void;
}
interface Armed {
  canonical: string;
  counts: Map<string, number>;
  editor: LegacyEditor;
  hint?: string;
}
interface Binding {
  editor: LegacyEditor;
  expected: ImageAutomaticMessage['expected'];
  selection: string;
}
function counts(source: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of imageDestinations(source))
    result.set(item.source, (result.get(item.source) ?? 0) + (item.uses ?? 1));
  return result;
}
/** Observe the completed original insertion, never resume its unguarded file-copy
 * promise. Authorization/IO stays in the host; only a proven SDK patch may follow. */
export class RuntimeAutomaticImages {
  private generation = 0;
  private enabled = false;
  private serial = 0;
  private armed: Armed | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private suppress = 0;
  private bindings = new Map<number, Binding>();
  private readonly installed = new WeakSet<object>();
  private readonly abort = new AbortController();
  constructor(private readonly deps: Dependencies) {
    document.addEventListener(
      'paste',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('#write,#typora-source') && !event.clipboardData?.files.length)
          this.arm();
      },
      { capture: true, signal: this.abort.signal },
    );
    for (const name of ['keydown', 'mousedown', 'compositionstart'])
      document.addEventListener(name, () => this.cancel(), {
        capture: true,
        signal: this.abort.signal,
      });
    document.addEventListener('input', () => this.cancelBindings(), {
      capture: true,
      signal: this.abort.signal,
    });
  }
  configure(generation: number, enabled: boolean): void {
    this.cancel();
    this.generation = generation;
    this.enabled = enabled;
  }
  install(): void {
    const editor = this.deps.runtime.editor;
    if (!editor || this.installed.has(editor)) return;
    this.installed.add(editor);
    const paste = editor.UserOp.pasteHandler;
    editor.UserOp.pasteHandler = (...args) => {
      this.arm();
      const result = Reflect.apply(paste, editor.UserOp, args);
      this.changed();
      return result;
    };
    const insert = editor.imgEdit.insertImageFromURL;
    editor.imgEdit.insertImageFromURL = (...args) => {
      this.arm(args[0]);
      const result = Reflect.apply(insert, editor.imgEdit, args);
      this.changed();
      return result;
    };
  }
  managed<T>(operation: () => T): T {
    this.cancel();
    this.suppress++;
    try {
      return operation();
    } finally {
      this.suppress--;
    }
  }
  private arm(hint?: string): void {
    if (!this.enabled || this.suppress || !this.deps.available()) return;
    const editor = this.deps.runtime.editor;
    if (!editor || this.deps.runtime.File?.isLocked) return;
    try {
      const state = this.deps.state();
      const priorHint =
        this.armed?.editor === editor && this.armed.canonical === state.canonical
          ? this.armed.hint
          : undefined;
      const actualHint = hint ?? priorHint;
      this.cancel();
      this.armed = {
        canonical: state.canonical,
        counts: counts(state.canonical),
        editor,
        ...(actualHint === undefined ? {} : { hint: actualHint }),
      };
      this.expiry = setTimeout(() => this.clearArmed(), 500);
      this.changed();
    } catch {
      this.clearArmed();
    }
  }
  changed(): void {
    if (!this.armed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.complete();
    }, 0);
  }
  private complete(): void {
    const armed = this.armed;
    if (!armed || !this.deps.available() || armed.editor !== this.deps.runtime.editor) return;
    try {
      const state = this.deps.state();
      if (state.canonical === armed.canonical) return;
      this.clearArmed();
      const added = [...counts(state.canonical)]
        .filter(
          ([source, count]) => count > 0 && !armed.counts.has(source) && !/^data:/i.test(source),
        )
        .map(([source]) => source);
      if (!added.length || added.length > 128) return;
      const selection = this.selection(state);
      if (!selection) return;
      const id = ++this.serial;
      const expected = {
        canonical: state.canonical,
        sequence: state.sequence,
        checkpoint: state.tracking.checkpoint,
      };
      this.bindings.set(id, { editor: armed.editor, expected, selection });
      this.deps.send('image-automatic', {
        id,
        generation: this.generation,
        expected,
        sources: added.map((source) => {
          const requestSource = added.length === 1 && armed.hint ? armed.hint : source;
          return { source, requestSource, reference: this.deps.reference(requestSource) };
        }),
        storage: this.deps.storage(),
      } satisfies ImageAutomaticMessage);
    } catch {
      this.clearArmed();
    }
  }
  private selection(state: RuntimeState): string | undefined {
    const editor = this.deps.runtime.editor;
    if (!editor) return;
    if (state.sourceMode) {
      const cm = editor.sourceView.cm;
      if (!cm || !cm.getWrapperElement().contains(document.activeElement)) return;
      return JSON.stringify({
        source: true,
        ranges: cm.listSelections(),
        anchor: cm.getCursor('anchor'),
        head: cm.getCursor('head'),
      });
    }
    const selection = document.getSelection(),
      range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (
      !selection?.anchorNode ||
      !selection.focusNode ||
      !editor.writingArea.contains(selection.anchorNode) ||
      !editor.writingArea.contains(selection.focusNode)
    )
      return;
    return JSON.stringify({
      bookmark: state.selection.bookmark,
      text: state.selection.text,
      backward: Boolean(
        range &&
          !selection.isCollapsed &&
          (selection.anchorNode !== range.startContainer ||
            selection.anchorOffset !== range.startOffset),
      ),
    });
  }
  check(id: number, generation: number): RuntimeState {
    const binding = this.bindings.get(id);
    if (
      !binding ||
      generation !== this.generation ||
      binding.editor !== this.deps.runtime.editor ||
      !this.deps.available()
    )
      throw Error('自动图片操作已取消：文档或输入上下文已改变');
    const state = this.deps.state();
    if (
      state.canonical !== binding.expected.canonical ||
      state.sequence !== binding.expected.sequence ||
      state.tracking.checkpoint !== binding.expected.checkpoint ||
      this.selection(state) !== binding.selection
    )
      throw Error('自动图片操作已取消：正文或选区已有更改');
    return state;
  }
  release(id: number): void {
    this.bindings.delete(id);
  }
  private clearArmed(): void {
    this.armed = undefined;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private cancelBindings(): void {
    for (const id of this.bindings.keys())
      this.deps.send('image-automatic-cancel', { id, generation: this.generation });
    this.bindings.clear();
  }
  cancel(): void {
    this.clearArmed();
    this.cancelBindings();
  }
  destroy(): void {
    this.cancel();
    this.abort.abort();
  }
}

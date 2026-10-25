import type { CursorBookmark } from '../protocol.js';
import type { LegacyEditor, LegacyGlobals } from './legacy-types.js';

interface CodeMirrorFocus {
  focus(): void;
}
interface MirrorElement extends HTMLElement {
  CodeMirror?: CodeMirrorFocus;
}
interface CursorStamp {
  generation: number;
  interaction: number;
  ownership: number;
  input: { element: WeakRef<Element>; area: WeakRef<HTMLElement> } | undefined;
}
/** Returns input ownership to the existing editor without manufacturing a selection. */
export class RuntimeFocus {
  private deferred:
    | {
        editor: LegacyEditor;
        generation: number;
        bookmark: CursorBookmark;
        restore(value: CursorBookmark): unknown;
      }
    | undefined;
  private explicit = 0;
  private interaction = 0;
  private ownership = 0;
  private disposed = false;
  private installed = false;
  private readonly cursors = new WeakMap<CursorBookmark, CursorStamp>();
  private restoreReader: (() => void) | undefined;
  private clearInputHandoff: (() => void) | undefined;
  private remembered:
    | { element: MirrorElement; mirror: CodeMirrorFocus; generation: number }
    | undefined;
  constructor(
    private readonly runtime: LegacyGlobals,
    private readonly generation: () => number,
    private readonly ownsInput = () => {
      const area = runtime.editor?.writingArea;
      const document = area?.ownerDocument;
      return Boolean(document?.hasFocus() && area?.contains(document.activeElement));
    },
    private readonly available = () => !runtime.editor?.isIME && !runtime.File?._onInitParse,
  ) {}

  install(): void {
    if (this.installed) return;
    const selection = this.runtime.editor?.selection;
    if (!selection || typeof selection.buildUndo !== 'function')
      throw new Error('Missing original selection reader');
    const original = selection.buildUndo;
    const descriptor = Object.getOwnPropertyDescriptor(selection, 'buildUndo');
    const owner = this;
    const wrapped = function (this: typeof selection, ...args: unknown[]) {
      const stamp: CursorStamp = {
        generation: owner.generation(),
        interaction: owner.interaction,
        ownership: owner.ownership,
        input: owner.inputOwner(),
      };
      const result = Reflect.apply(original, this, args) as CursorBookmark | null;
      if (!owner.disposed && result && typeof result === 'object') owner.cursors.set(result, stamp);
      return result;
    };
    Object.defineProperty(selection, 'buildUndo', {
      configurable: true,
      writable: true,
      enumerable: descriptor?.enumerable ?? true,
      value: wrapped,
    });
    this.restoreReader = () => {
      if (selection.buildUndo !== wrapped) return;
      if (descriptor) Object.defineProperty(selection, 'buildUndo', descriptor);
      else Reflect.deleteProperty(selection, 'buildUndo');
    };
    this.installed = true;
  }

  private inputOwner(): CursorStamp['input'] {
    // History may retain a bookmark long after its view nodes were replaced.
    if (typeof WeakRef !== 'function') return;
    const area = this.runtime.editor?.writingArea,
      document = area?.ownerDocument,
      element = document?.activeElement;
    if (element && element !== area && area?.contains(element) && this.ownsInput())
      return { element: new WeakRef(element), area: new WeakRef(area) };
  }

  private detachedInput(stamp: CursorStamp, editor: LegacyEditor): boolean {
    // An owned nested editable can be removed by this very brush, leaving BODY
    // active in WebKit. Only that observed node's removal retains permission.
    const input = stamp.input,
      element = input?.element.deref(),
      area = input?.area.deref(),
      document = editor.writingArea.ownerDocument;
    return Boolean(
      input &&
        element &&
        area &&
        stamp.ownership === this.ownership &&
        area === editor.writingArea &&
        area.isConnected &&
        !element.isConnected &&
        element.ownerDocument === document &&
        document.hasFocus() &&
        (document.activeElement === document.body ||
          document.activeElement === document.documentElement),
    );
  }

  /** Only the hash-verified delayed brush call sites use this hook. */
  restoreBrushCursor(
    editor: LegacyEditor,
    bookmark: CursorBookmark,
    restore: (value: CursorBookmark) => unknown = (value) => editor.undo.exeCommand(value),
  ): unknown {
    if (this.disposed || editor !== this.runtime.editor) return false;
    let retainedInput = false;
    if (bookmark?.type === 'cursor' && this.installed) {
      const stamp = this.cursors.get(bookmark);
      if (
        !stamp ||
        stamp.generation !== this.generation() ||
        stamp.interaction !== this.interaction
      )
        return false;
      if (editor.sourceView.inSourceMode) return false;
      retainedInput = this.detachedInput(stamp, editor);
    }
    if (
      bookmark?.type !== 'cursor' ||
      editor.sourceView.inSourceMode ||
      (this.available() && (this.explicit || this.ownsInput() || retainedInput))
    ) {
      if (bookmark?.type === 'cursor') this.deferred = undefined;
      return restore(bookmark);
    }
    // Keep the remapped logical cursor while the parser and its history complete.
    // Cursor bookmarks are JSON data; never retain the mutable original history object.
    this.deferred = {
      editor,
      generation: this.generation(),
      bookmark: this.copy(bookmark),
      restore,
    };
    return false;
  }

  bookmark(): CursorBookmark | undefined {
    const pending = this.current();
    return pending ? this.copy(pending.bookmark) : undefined;
  }

  private copy(bookmark: CursorBookmark): CursorBookmark {
    return JSON.parse(JSON.stringify(bookmark)) as CursorBookmark;
  }

  private current() {
    const pending = this.deferred;
    if (
      pending &&
      (pending.generation !== this.generation() ||
        pending.editor !== this.runtime.editor ||
        pending.editor.sourceView.inSourceMode)
    )
      this.deferred = undefined;
    return this.deferred;
  }

  private restore(): boolean {
    if (!this.available()) return false;
    const pending = this.current();
    this.deferred = undefined;
    if (!pending) return false;
    this.explicit++;
    try {
      pending.restore(this.copy(pending.bookmark));
    } finally {
      this.explicit--;
    }
    return true;
  }

  command<T>(work: () => T, restore = true): T {
    if (this.disposed || !this.available()) throw new Error('请先完成当前编辑操作');
    this.interaction++;
    this.explicit++;
    try {
      if (restore) this.restore();
      const result = work();
      if (!restore) this.deferred = undefined;
      return result;
    } finally {
      this.explicit--;
    }
  }

  /** A new in-editor input target wins over a deferred background cursor. */
  interact(target: EventTarget | null): void {
    if (!(target instanceof Element)) return;
    // A click on child chrome/BODY revokes detached-node permission without
    // changing the existing explicit-focus/deferred-cursor contract.
    this.ownership++;
    if (target.closest('#write,#marklyra-source')) {
      this.interaction++;
      this.deferred = undefined;
    }
  }

  resume(): void {
    if (!this.disposed && this.ownsInput()) this.restore();
  }

  destroy(): void {
    this.disposed = true;
    this.clearInputHandoff?.();
    this.deferred = undefined;
    this.remembered = undefined;
    this.restoreReader?.();
    this.restoreReader = undefined;
  }
  observe(target: EventTarget | null): void {
    if (!(target instanceof Element)) return;
    const area = this.runtime.editor?.writingArea;
    const document = area?.ownerDocument;
    if (target !== document?.body && target !== document?.documentElement) this.ownership++;
    if (!area?.contains(target)) return;
    const element = target.closest<MirrorElement>('.CodeMirror');
    const mirror = element?.CodeMirror;
    this.remembered =
      element && mirror && typeof mirror.focus === 'function'
        ? { element, mirror, generation: this.generation() }
        : undefined;
  }
  focus(): void {
    this.clearInputHandoff?.();
    if (this.disposed) throw new Error('Editor has been destroyed');
    if (!this.available()) throw new Error('请先完成当前编辑操作');
    const editor = this.runtime.editor;
    if (!editor) throw new Error('编辑器尚未初始化');
    if (this.restore() && this.ownsInput()) return;
    if (editor.sourceView.inSourceMode) {
      if (!editor.sourceView.cm) throw new Error('源码编辑器尚未初始化');
      editor.sourceView.cm.focus();
      return;
    }
    const prior = this.remembered;
    if (
      prior &&
      prior.generation === this.generation() &&
      prior.element.isConnected &&
      editor.writingArea.contains(prior.element) &&
      prior.element.CodeMirror === prior.mirror
    ) {
      prior.mirror.focus();
      return;
    }
    this.remembered = undefined;
    editor.writingArea.focus();
    this.armInputHandoff(editor);
  }

  /** WebKit can ignore a cold programmatic contenteditable focus. Complete only
   * this explicit handoff in the first real editing key's user-gesture scope;
   * its original default action performs the input on the existing selection. */
  private armInputHandoff(editor: LegacyEditor): void {
    const area = editor.writingArea;
    const owner = area.ownerDocument;
    const view = owner?.defaultView;
    if (!owner || !view || this.ownsInput() || editor.sourceView.inSourceMode) return;
    if (owner.activeElement !== owner.body && owner.activeElement !== owner.documentElement) return;
    const selection = owner.getSelection();
    if (
      !selection?.rangeCount ||
      !area.contains(selection.anchorNode) ||
      !area.contains(selection.focusNode)
    )
      return;
    const stamp = {
      generation: this.generation(),
      interaction: this.interaction,
      anchor: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focus: selection.focusNode,
      focusOffset: selection.focusOffset,
    };
    const clear = () => {
      owner.removeEventListener('keydown', key, true);
      owner.removeEventListener('focusin', focus, true);
      owner.removeEventListener('pointerdown', clear, true);
      owner.removeEventListener('compositionstart', clear, true);
      view.removeEventListener('blur', clear);
      if (this.clearInputHandoff === clear) this.clearInputHandoff = undefined;
    };
    const focus = (event: FocusEvent) => {
      if (event.target !== owner.body && event.target !== owner.documentElement) clear();
    };
    const key = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.defaultPrevented) return;
      if (event.isComposing || event.keyCode === 229 || !this.available()) {
        clear();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return;
      if (
        event.key.length !== 1 &&
        !/^(Enter|Backspace|Delete|Arrow(Left|Right|Up|Down)|Home|End)$/.test(event.key)
      )
        return;
      const current = owner.getSelection();
      const valid =
        !this.disposed &&
        this.runtime.editor === editor &&
        this.generation() === stamp.generation &&
        this.interaction === stamp.interaction &&
        !editor.sourceView.inSourceMode &&
        owner.hasFocus() &&
        area.isConnected &&
        (owner.activeElement === owner.body || owner.activeElement === owner.documentElement) &&
        current?.rangeCount &&
        current.anchorNode === stamp.anchor &&
        current.anchorOffset === stamp.anchorOffset &&
        current.focusNode === stamp.focus &&
        current.focusOffset === stamp.focusOffset &&
        area.contains(current.anchorNode) &&
        area.contains(current.focusNode);
      clear();
      if (valid) area.focus();
    };
    this.clearInputHandoff = clear;
    owner.addEventListener('keydown', key, true);
    owner.addEventListener('focusin', focus, true);
    owner.addEventListener('pointerdown', clear, true);
    owner.addEventListener('compositionstart', clear, true);
    view.addEventListener('blur', clear);
  }
}

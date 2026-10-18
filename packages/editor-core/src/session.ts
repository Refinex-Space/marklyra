import { commandTransaction } from './commands.js';
import {
  applyTransaction,
  assertSelection,
  assertWellFormedText,
  createState,
} from './transaction.js';
import type {
  EditorCommand,
  EditorState,
  HistoryStats,
  Patch,
  Selection,
  Transaction,
} from './types.js';

interface HistoryEntry {
  forward: readonly Patch[];
  inverse: readonly Patch[];
  readonly beforeSelection: Selection;
  afterSelection: Selection;
  readonly epoch: number;
  readonly typing: boolean;
  time: number;
}

function inversePatches(source: string, patches: readonly Patch[]): Patch[] {
  const inverse: Patch[] = [];
  let shift = 0;
  for (const patch of patches) {
    const from = patch.from + shift;
    const current = {
      from,
      to: from + patch.insert.length,
      insert: source.slice(patch.from, patch.to),
    };
    const previous = inverse.at(-1);
    // Adjacent deletions map to the same insertion point in the new source.
    // Coalesce those inverse ranges so undo is still one unambiguous transaction.
    if (previous && previous.to === current.from) {
      inverse[inverse.length - 1] = {
        from: previous.from,
        to: current.to,
        insert: previous.insert + current.insert,
      };
    } else {
      inverse.push(current);
    }
    shift += patch.insert.length - (patch.to - patch.from);
  }
  return inverse;
}

function sameSelection(left: Selection, right: Selection): boolean {
  return left.anchor === right.anchor && left.head === right.head;
}

function isTyping(before: EditorState, after: EditorState, transaction: Transaction): boolean {
  const patch = transaction.patches[0];
  return (
    transaction.group === 'typing' &&
    transaction.patches.length === 1 &&
    patch !== undefined &&
    before.selection.anchor === before.selection.head &&
    patch.from === before.selection.head &&
    patch.from === patch.to &&
    patch.insert.length > 0 &&
    !/[\r\n]/.test(patch.insert) &&
    after.selection.anchor === patch.from + patch.insert.length &&
    after.selection.head === after.selection.anchor
  );
}

export class EditorSession {
  #state: EditorState;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #listeners = new Set<(state: EditorState) => void>();
  #epoch = 0;

  constructor(source = '') {
    assertWellFormedText(source);
    this.#state = createState(source, { anchor: 0, head: 0 }, 0);
  }

  get state(): EditorState {
    return this.#state;
  }

  get historyStats(): HistoryStats {
    let storedTextCodeUnits = 0;
    for (const entries of [this.#undo, this.#redo]) {
      for (const entry of entries) {
        for (const patch of entry.forward) storedTextCodeUnits += patch.insert.length;
        for (const patch of entry.inverse) storedTextCodeUnits += patch.insert.length;
      }
    }
    return Object.freeze({
      undoDepth: this.#undo.length,
      redoDepth: this.#redo.length,
      storedTextCodeUnits,
    });
  }

  load(source: string): void {
    assertWellFormedText(source);
    this.#undo = [];
    this.#redo = [];
    this.#epoch += 1;
    this.#state = createState(source, { anchor: 0, head: 0 }, this.#state.revision + 1);
    this.#notify();
  }

  setSelection(selection: Selection): void {
    assertSelection(this.#state.source, selection);
    if (sameSelection(this.#state.selection, selection)) return;
    this.#epoch += 1;
    this.#state = createState(this.#state.source, selection, this.#state.revision);
    this.#notify();
  }

  apply(transaction: Transaction): void {
    const before = this.#state;
    const after = applyTransaction(before, transaction);
    if (before.source === after.source) {
      this.setSelection(after.selection);
      return;
    }
    const time = transaction.time ?? Date.now();
    const typing = isTyping(before, after, transaction);
    const previous = this.#undo.at(-1);
    const merge =
      typing &&
      previous?.typing &&
      previous.epoch === this.#epoch &&
      sameSelection(previous.afterSelection, before.selection) &&
      time >= previous.time &&
      time - previous.time <= 1_000;
    if (merge && previous) {
      const prior = previous.forward[0];
      const current = transaction.patches[0];
      if (!prior || !current) throw new Error('Invalid typing history invariant');
      const insert = prior.insert + current.insert;
      previous.forward = [{ from: prior.from, to: prior.to, insert }];
      previous.inverse = [{ from: prior.from, to: prior.from + insert.length, insert: '' }];
      previous.afterSelection = after.selection;
      previous.time = time;
    } else {
      this.#undo.push({
        forward: transaction.patches.map((patch) => ({ ...patch })),
        inverse: inversePatches(before.source, transaction.patches),
        beforeSelection: before.selection,
        afterSelection: after.selection,
        epoch: this.#epoch,
        typing,
        time,
      });
    }
    this.#redo = [];
    this.#state = after;
    this.#notify();
  }

  undo(): boolean {
    const entry = this.#undo.at(-1);
    if (!entry) return false;
    const after = applyTransaction(this.#state, {
      baseRevision: this.#state.revision,
      patches: entry.inverse,
      selection: entry.beforeSelection,
    });
    this.#undo.pop();
    this.#redo.push(entry);
    this.#epoch += 1;
    this.#state = after;
    this.#notify();
    return true;
  }

  redo(): boolean {
    const entry = this.#redo.at(-1);
    if (!entry) return false;
    const after = applyTransaction(this.#state, {
      baseRevision: this.#state.revision,
      patches: entry.forward,
      selection: entry.afterSelection,
    });
    this.#redo.pop();
    this.#undo.push(entry);
    this.#epoch += 1;
    this.#state = after;
    this.#notify();
    return true;
  }

  execute(command: EditorCommand): void {
    if (command.type === 'undo') {
      this.undo();
      return;
    }
    if (command.type === 'redo') {
      this.redo();
      return;
    }
    const transaction = commandTransaction(this.#state, command);
    if (transaction) this.apply(transaction);
  }

  subscribe(listener: (state: EditorState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    const state = this.#state;
    for (const listener of [...this.#listeners]) listener(state);
  }
}

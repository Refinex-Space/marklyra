/** All positions are UTF-16 offsets into the exact Markdown source. */
export interface Selection {
  readonly anchor: number;
  readonly head: number;
}

/** Coordinates refer to the document before the entire transaction. */
export interface Patch {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface EditorState {
  readonly source: string;
  readonly selection: Selection;
  readonly revision: number;
}

/** Retained change-text size, not an estimate of engine heap or object overhead. */
export interface HistoryStats {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly storedTextCodeUnits: number;
}

export interface Transaction {
  readonly baseRevision: number;
  readonly patches: readonly Patch[];
  /** Explicit selection refers to the document after every patch. */
  readonly selection?: Selection;
  readonly group?: string;
  readonly time?: number;
}

export type EditorCommand =
  | { readonly type: 'insertText'; readonly text: string }
  | { readonly type: 'deleteBackward' }
  | { readonly type: 'deleteForward' }
  | { readonly type: 'insertParagraph' }
  | { readonly type: 'insertLineBreak' }
  | { readonly type: 'indent' }
  | { readonly type: 'outdent' }
  | { readonly type: 'toggleMark'; readonly marker: string }
  | { readonly type: 'heading'; readonly level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

export type PositionAffinity = 'left' | 'right';

export class TransactionError extends Error {
  override readonly name = 'TransactionError';
}

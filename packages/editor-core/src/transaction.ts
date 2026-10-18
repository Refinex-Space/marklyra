import type { EditorState, Patch, PositionAffinity, Selection, Transaction } from './types.js';
import { TransactionError } from './types.js';

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export function assertWellFormedText(source: string): void {
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (isHighSurrogate(code)) {
      if (!isLowSurrogate(source.charCodeAt(index + 1))) {
        throw new TransactionError('Text contains an unpaired high surrogate');
      }
      index += 1;
    } else if (isLowSurrogate(code)) {
      throw new TransactionError('Text contains an unpaired low surrogate');
    }
  }
}

export function assertPosition(source: string, position: number): void {
  if (!Number.isSafeInteger(position) || position < 0 || position > source.length) {
    throw new TransactionError(`Position ${position} is outside the source`);
  }
  if (
    isHighSurrogate(source.charCodeAt(position - 1)) &&
    isLowSurrogate(source.charCodeAt(position))
  ) {
    throw new TransactionError(`Position ${position} splits a surrogate pair`);
  }
}

export function assertSelection(source: string, selection: Selection): void {
  assertPosition(source, selection.anchor);
  assertPosition(source, selection.head);
}

/** Map an old position through ordered, non-overlapping old-coordinate patches. */
export function mapPosition(
  position: number,
  patches: readonly Patch[],
  affinity: PositionAffinity = 'right',
): number {
  let shift = 0;
  for (const patch of patches) {
    if (position < patch.from) break;
    if (position > patch.to || (position === patch.to && patch.from !== patch.to)) {
      shift += patch.insert.length - (patch.to - patch.from);
      continue;
    }
    return patch.from + shift + (affinity === 'right' ? patch.insert.length : 0);
  }
  return position + shift;
}

/** Preserve selection direction; non-collapsed boundaries expand outward. */
export function mapSelection(selection: Selection, patches: readonly Patch[]): Selection {
  const forward = selection.anchor <= selection.head;
  return {
    anchor: mapPosition(
      selection.anchor,
      patches,
      selection.anchor === selection.head || !forward ? 'right' : 'left',
    ),
    head: mapPosition(selection.head, patches, forward ? 'right' : 'left'),
  };
}

export function createState(source: string, selection: Selection, revision: number): EditorState {
  return Object.freeze({ source, selection: Object.freeze({ ...selection }), revision });
}

/** Validate fully before constructing the next state; caller-owned patches are not mutated. */
export function applyTransaction(state: EditorState, transaction: Transaction): EditorState {
  if (transaction.baseRevision !== state.revision) {
    throw new TransactionError(
      `Stale revision ${transaction.baseRevision}; current revision is ${state.revision}`,
    );
  }
  if (transaction.time !== undefined && !Number.isFinite(transaction.time)) {
    throw new TransactionError('Transaction time must be finite');
  }
  let previous: Patch | undefined;
  const fragments: string[] = [];
  let cursor = 0;
  for (const patch of transaction.patches) {
    assertPosition(state.source, patch.from);
    assertPosition(state.source, patch.to);
    if (patch.to < patch.from) throw new TransactionError('Patch range is reversed');
    if (previous && (patch.from < previous.to || patch.from === previous.from)) {
      throw new TransactionError(
        'Patches must be ordered and non-overlapping, with distinct start positions',
      );
    }
    assertWellFormedText(patch.insert);
    fragments.push(state.source.slice(cursor, patch.from), patch.insert);
    cursor = patch.to;
    previous = patch;
  }
  fragments.push(state.source.slice(cursor));
  const source = fragments.join('');
  const selection = transaction.selection ?? mapSelection(state.selection, transaction.patches);
  assertSelection(source, selection);
  return createState(source, selection, state.revision + (source === state.source ? 0 : 1));
}

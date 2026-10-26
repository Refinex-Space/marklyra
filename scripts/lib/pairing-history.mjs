/** Groups history snapshots around the surroundPair command.
 * A second snapshot that changes neither model nor cursor is not a second user action.
 * Non-empty commands and the previous command's objects are never rewritten. */
export function wrapPairingHistory(original) {
  const same = (left, right) => {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (!Array.isArray(left) && Object.prototype.toString.call(left) !== '[object Object]')
      return false;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
  };
  const snapshot = (command) => {
    if (
      !command ||
      !Array.isArray(command.undo) ||
      !Array.isArray(command.redo) ||
      command.undo.length !== 2 ||
      command.redo.length !== 2 ||
      ![undefined, null, false].includes(command.incomplete) ||
      Object.keys(command).some(
        (key) => !['undo', 'redo', 'source', 'date', 'incomplete'].includes(key),
      )
    )
      return null;
    const [cursorBefore, before] = command.undo,
      [after, cursorAfter] = command.redo;
    if (
      cursorBefore?.type !== 'cursor' ||
      cursorAfter?.type !== 'cursor' ||
      before?.type !== 'replace' ||
      after?.type !== 'replace' ||
      typeof before.id !== 'string' ||
      before.id !== after.id ||
      before.json?.id !== before.id ||
      after.json?.id !== before.id ||
      !before.json?.content ||
      !after.json?.content ||
      cursorBefore.id !== before.id ||
      cursorAfter.id !== before.id
    )
      return null;
    return { id: before.id, before: before.json, after: after.json, cursorBefore, cursorAfter };
  };
  return function (...args) {
    const undo = args[0]?.undo;
    const initialStack = Array.isArray(undo?.commandStack) ? undo.commandStack : null;
    const existing = initialStack ? new Set(initialStack) : null;
    const result = original.apply(this, args);
    if (
      result !== true ||
      !existing ||
      undo.commandStack !== initialStack ||
      !Number.isInteger(undo.index) ||
      undo.index !== initialStack.length - 1 ||
      typeof undo.setIndex !== 'function'
    )
      return result;
    try {
      const added = initialStack.filter((command) => !existing.has(command));
      if (
        added.length !== 2 ||
        initialStack.at(-2) !== added[0] ||
        initialStack.at(-1) !== added[1]
      )
        return result;
      const previous = snapshot(added[0]),
        last = snapshot(added[1]);
      if (
        !previous ||
        !last ||
        previous.id !== last.id ||
        same(previous.before, previous.after) ||
        !same(last.before, last.after) ||
        !same(last.cursorBefore, last.cursorAfter) ||
        !same(previous.after, last.before) ||
        !same(previous.cursorAfter, last.cursorBefore)
      )
        return result;
      const expectedSource = `${last.id}#2`;
      const sourceMatches =
        added[0].source === expectedSource ||
        (added[0].source === null && added[0].date === null && added[0].incomplete === null);
      if (added[1].source !== expectedSource || !sourceMatches) return result;
      const indexDescriptor = Object.getOwnPropertyDescriptor(undo, 'index');
      if (!indexDescriptor?.writable || !Object.hasOwn(indexDescriptor, 'value')) return result;
      const previousIndex = undo.index;
      initialStack.pop();
      try {
        undo.setIndex(initialStack.length - 1);
      } catch {
        initialStack.push(added[1]);
        if (undo.index !== previousIndex) undo.index = previousIndex;
      }
    } catch {
      // An unfamiliar snapshot shape cannot justify deleting history.
    }
    return result;
  };
}

import { withNodeLookupBatch } from './node-lookup.js';

interface NativeImageRefresh {
  readonly selection: { buildUndo(...args: unknown[]): unknown };
  readonly brush: { brushNode(id: string): unknown };
}

/** Reject values whose JSON copy would omit data, invoke code, or change meaning. */
function bookmarkJSON(value: unknown): string | undefined {
  const active = new Set<object>();
  let entries = 0;
  const validate = (item: unknown, depth: number): boolean => {
    if (++entries > 10_000 || depth > 16) return false;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (
      typeof item !== 'object' ||
      active.has(item) ||
      'toJSON' in item ||
      Symbol.toStringTag in item
    )
      return false;
    const keys = Reflect.ownKeys(item);
    if (keys.some((key) => typeof key !== 'string')) return false;
    active.add(item);
    try {
      if (Array.isArray(item)) {
        if (keys.length !== item.length + 1) return false;
        for (let at = 0; at < item.length; at++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(at));
          if (!descriptor || !('value' in descriptor) || !validate(descriptor.value, depth + 1))
            return false;
        }
        return true;
      }
      if (Object.prototype.toString.call(item) !== '[object Object]') return false;
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (
          !descriptor?.enumerable ||
          !('value' in descriptor) ||
          !validate(descriptor.value, depth + 1)
        )
          return false;
      }
      return true;
    } finally {
      active.delete(item);
    }
  };
  try {
    if (!validate(value, 0)) return undefined;
    const json = JSON.stringify(value);
    if (json.length > 64 * 1024) return undefined;
    const copy: unknown = JSON.parse(json);
    if (copy !== null && (typeof copy !== 'object' || Reflect.get(copy, 'type') !== 'cursor'))
      return undefined;
    return json;
  } catch {
    return undefined;
  }
}

/**
 * Only for a synchronous host image-decoration batch that preserves Markdown.
 * The shipped brushNode's first statement captures its unchanged logical caret.
 * Capture that baseline once; all other native selection operations still run.
 */
export function refreshImageBlocks(editor: NativeImageRefresh, ids: Iterable<string>): void {
  const blocks = [...ids];
  if (!blocks.length) return;
  withNodeLookupBatch(editor, blocks, () => refreshBlocks(editor, blocks));
}

function refreshBlocks(editor: NativeImageRefresh, blocks: readonly string[]): void {
  const selection = editor.selection;
  const nativeBuildUndo = selection.buildUndo;
  const json = bookmarkJSON(nativeBuildUndo.call(selection));
  if (json === undefined) {
    for (const id of blocks) editor.brush.brushNode(id);
    return;
  }
  for (const id of blocks) {
    const own = Object.getOwnPropertyDescriptor(selection, 'buildUndo');
    if (
      selection.buildUndo !== nativeBuildUndo ||
      (own && (!('value' in own) || own.writable === false))
    ) {
      editor.brush.brushNode(id);
      continue;
    }
    let used = false;
    let delegating = 0;
    function buildUndo(this: unknown, ...args: unknown[]): unknown {
      const first = !used;
      used = true;
      if (first && delegating === 0 && this === selection && args.length === 0) {
        // A native brush may alter this value. Never share it with another node.
        return JSON.parse(json as string) as unknown;
      }
      delegating++;
      try {
        return Reflect.apply(nativeBuildUndo, this, args);
      } finally {
        delegating--;
      }
    }
    if (!Reflect.set(selection, 'buildUndo', buildUndo)) {
      editor.brush.brushNode(id);
      continue;
    }
    try {
      editor.brush.brushNode(id);
    } finally {
      // Preserve a deliberate replacement installed by native code during work.
      if (selection.buildUndo === buildUndo) {
        if (own) Object.defineProperty(selection, 'buildUndo', own);
        else Reflect.deleteProperty(selection, 'buildUndo');
      }
    }
  }
}

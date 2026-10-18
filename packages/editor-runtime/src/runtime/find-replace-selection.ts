import { findReplaceSourceMatch } from './find-replace-source.js';

interface Hit {
  isCm?: object;
  start: number;
  end: number;
}

/** Correct a context-sensitive regex insert only within the original CM
 * replaceSelection call. The original transaction/history remain the writer. */
export function installFindSelectionReplacement(
  panel: object,
  replacement: string,
): (() => void) | undefined {
  const status: unknown = Reflect.get(panel, 'searchStatus');
  if (!status || typeof status !== 'object' || !Reflect.get(status, 'useRegexp')) return;
  const selected: unknown = Reflect.get(status, 'curSelection'),
    hits: unknown = Reflect.get(status, 'hits'),
    regexp: unknown = Reflect.get(status, 'regexp');
  if (
    !selected ||
    typeof selected !== 'object' ||
    !Array.isArray(hits) ||
    !hits.includes(selected) ||
    !(regexp instanceof RegExp)
  )
    return;
  const cm: unknown = Reflect.get(selected, 'isCm');
  if (!cm || typeof cm !== 'object') return;
  const doc: unknown = Reflect.get(cm, 'doc'),
    read: unknown = Reflect.get(cm, 'getValue'),
    cursor: unknown = Reflect.get(cm, 'getCursor'),
    index: unknown = Reflect.get(cm, 'indexFromPos');
  if (
    !doc ||
    typeof doc !== 'object' ||
    typeof read !== 'function' ||
    typeof cursor !== 'function' ||
    typeof index !== 'function'
  )
    return;
  const replace: unknown = Reflect.get(doc, 'replaceSelection'),
    separator: unknown = Reflect.get(doc, 'lineSeparator');
  if (typeof replace !== 'function' || typeof separator !== 'function') return;
  const base: unknown = Reflect.apply(read, cm, []),
    start: unknown = Reflect.get(selected, 'start'),
    end: unknown = Reflect.get(selected, 'end');
  if (typeof base !== 'string' || typeof start !== 'number' || typeof end !== 'number') return;
  const insert = findReplaceSourceMatch(
    base,
    { start, end },
    regexp,
    replacement,
    Reflect.apply(separator, doc, []),
  );
  if (
    insert === undefined ||
    insert === base.slice(start, end).replace(new RegExp(regexp.source, regexp.flags), replacement)
  )
    return;
  const descriptor = Object.getOwnPropertyDescriptor(doc, 'replaceSelection');
  const wrapped = function (this: object, ...args: unknown[]) {
    const anchor = Reflect.apply(index, cm, [Reflect.apply(cursor, cm, ['anchor'])]);
    const head = Reflect.apply(index, cm, [Reflect.apply(cursor, cm, ['head'])]);
    if (
      Reflect.apply(read, cm, []) === base &&
      Math.min(anchor, head) === start &&
      Math.max(anchor, head) === end &&
      typeof args[0] === 'string'
    )
      args[0] = insert;
    return Reflect.apply(replace, this, args);
  };
  Reflect.set(doc, 'replaceSelection', wrapped);
  return () => {
    if (Reflect.get(doc, 'replaceSelection') !== wrapped) return;
    if (descriptor) Object.defineProperty(doc, 'replaceSelection', descriptor);
    else Reflect.deleteProperty(doc, 'replaceSelection');
  };
}
interface CodeMirror {
  getValue(): string;
  posFromIndex(index: number): unknown;
  doc: { setSelection(anchor: unknown, head: unknown): void };
}

/** Original CM replacement expands captures before writing, but shifts later
 * hits using the literal replacement field length. Repair only actual retained
 * hit identities after a proven single-range CM change. */
export function captureFindSelectionCorrection(panel: object): (() => void) | undefined {
  const status: unknown = Reflect.get(panel, 'searchStatus');
  if (!status || typeof status !== 'object') return;
  const selected: unknown = Reflect.get(status, 'curSelection');
  const hits: unknown = Reflect.get(status, 'hits');
  if (!selected || typeof selected !== 'object' || !Array.isArray(hits)) return;
  if (!hits.includes(selected)) return;
  const cm: unknown = Reflect.get(selected, 'isCm');
  if (!cm || typeof cm !== 'object' || typeof Reflect.get(cm, 'getValue') !== 'function') return;
  const start: unknown = Reflect.get(selected, 'start'),
    end: unknown = Reflect.get(selected, 'end');
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end)
  )
    return;
  const mirror = cm as CodeMirror;
  const base = mirror.getValue();
  if (start < 0 || end <= start || end > base.length) return;
  const future = hits
    .filter((hit: unknown): hit is Hit =>
      Boolean(
        hit &&
          typeof hit === 'object' &&
          Reflect.get(hit, 'isCm') === cm &&
          Number.isSafeInteger(Reflect.get(hit, 'start')) &&
          Number.isSafeInteger(Reflect.get(hit, 'end')) &&
          Reflect.get(hit, 'start') >= end &&
          Reflect.get(hit, 'end') > Reflect.get(hit, 'start') &&
          Reflect.get(hit, 'end') <= base.length,
      ),
    )
    .map((hit) => ({ hit, start: hit.start, end: hit.end }));
  if (!future.length) return;
  return () => {
    const next = mirror.getValue();
    if (
      next === base ||
      next.length < start + base.length - end ||
      !next.startsWith(base.slice(0, start)) ||
      !next.endsWith(base.slice(end))
    )
      return;
    const live: unknown = Reflect.get(panel, 'searchStatus');
    if (live !== status) return;
    const remaining: unknown = Reflect.get(status, 'hits');
    if (!Array.isArray(remaining)) return;
    let changed = false;
    for (const before of future) {
      if (!remaining.includes(before.hit)) continue;
      const from = before.start + next.length - base.length;
      const to = before.end + next.length - base.length;
      if (before.hit.start !== from || before.hit.end !== to) {
        before.hit.start = from;
        before.hit.end = to;
        changed = true;
      }
    }
    const current: unknown = Reflect.get(status, 'curSelection');
    if (
      changed &&
      current &&
      typeof current === 'object' &&
      Reflect.get(current, 'isCm') === cm &&
      future.some(({ hit }) => hit === current) &&
      typeof mirror.posFromIndex === 'function' &&
      typeof mirror.doc?.setSelection === 'function'
    )
      mirror.doc.setSelection(
        mirror.posFromIndex(Reflect.get(current, 'start')),
        mirror.posFromIndex(Reflect.get(current, 'end')),
      );
  };
}

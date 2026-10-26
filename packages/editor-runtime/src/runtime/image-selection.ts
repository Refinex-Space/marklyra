interface Position {
  line: number;
  ch: number;
}
interface CodeMirrorSelection {
  getDoc(): object;
  getCursor(which: 'anchor' | 'head'): Position;
  listSelections(): { anchor: Position; head: Position }[];
  setSelections(ranges: { anchor: Position; head: Position }[], primary: number): void;
}

/** The exeCommand method swaps fenced CodeMirror anchor/head. A host image-only
 * repaint must preserve the actual focused CM's directed ranges, independently
 * of that native bookmark format. Never restore into a replaced document. */
export function preserveImageCodeSelection(
  area: HTMLElement,
  currentSource?: () => object | undefined,
): (() => void) | undefined {
  const document = area.ownerDocument;
  if (!document.hasFocus()) return;
  const element = document.activeElement?.closest<HTMLElement>('.CodeMirror');
  if (!element) return;
  const value: unknown = Reflect.get(element, 'CodeMirror');
  if (!value || typeof value !== 'object') return;
  const sourceMode = currentSource?.() === value;
  const owned = () =>
    sourceMode
      ? currentSource?.() === value &&
        Boolean(document.getElementById('marklyra-source')?.contains(element))
      : area.contains(element);
  if (!owned()) return;
  for (const method of ['getDoc', 'getCursor', 'listSelections', 'setSelections'])
    if (typeof Reflect.get(value, method) !== 'function') return;
  const cm = value as CodeMirrorSelection;
  const doc = cm.getDoc();
  const copy = (position: Position): Position => ({ line: position.line, ch: position.ch });
  const ranges = cm.listSelections().map((range) => ({
    anchor: copy(range.anchor),
    head: copy(range.head),
  }));
  const anchor = cm.getCursor('anchor'),
    head = cm.getCursor('head');
  const primary = ranges.findIndex(
    (range) =>
      range.anchor.line === anchor.line &&
      range.anchor.ch === anchor.ch &&
      range.head.line === head.line &&
      range.head.ch === head.ch,
  );
  if (primary < 0) return;
  return () => {
    if (
      element.isConnected &&
      owned() &&
      Reflect.get(element, 'CodeMirror') === cm &&
      cm.getDoc() === doc
    )
      cm.setSelections(ranges, primary);
  };
}

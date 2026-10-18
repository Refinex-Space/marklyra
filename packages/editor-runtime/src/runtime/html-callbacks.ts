import type { LegacyGlobals } from './legacy-types.js';

/** Bind only the runtime HTML Enter callback to its actual editing document.
 * A reload can retain editor/map/currentCm while retiring the old node and DOM. */
export function guardHTMLCallback(
  runtime: LegacyGlobals,
  generation: () => number,
  available: () => boolean,
  callback: () => unknown,
): () => unknown {
  const editor = runtime.editor,
    file = runtime.File,
    epoch = generation(),
    cm = editor?.htmlBlock?.currentCm;
  if (
    !editor ||
    !file ||
    !cm ||
    !available() ||
    file.isLocked ||
    editor.sourceView.inSourceMode ||
    editor.isIME
  )
    return () => undefined;
  const id: unknown = Reflect.get(cm, 'cid'),
    doc: unknown = Reflect.get(cm, 'doc'),
    getWrapper: unknown = Reflect.get(cm, 'getWrapperElement');
  if (typeof id !== 'string' || !doc || typeof getWrapper !== 'function') return () => undefined;
  const wrapper: unknown = Reflect.apply(getWrapper, cm, []);
  if (!(wrapper instanceof HTMLElement)) return () => undefined;
  const block = wrapper.closest<HTMLElement>('.md-htmlblock[mdtype="html_block"][cid]'),
    node = editor.getNode(id);
  if (
    !block ||
    !node ||
    node.get('type') !== 'html_block' ||
    block.getAttribute('cid') !== id ||
    !wrapper.isConnected ||
    !block.isConnected ||
    !editor.writingArea.contains(block)
  )
    return () => undefined;
  return () => {
    if (
      !available() ||
      generation() !== epoch ||
      runtime.editor !== editor ||
      runtime.File !== file ||
      file.isLocked ||
      editor.htmlBlock?.currentCm !== cm ||
      Reflect.get(cm, 'doc') !== doc ||
      Reflect.apply(getWrapper, cm, []) !== wrapper ||
      editor.getNode(id) !== node ||
      editor.sourceView.inSourceMode ||
      editor.isIME ||
      !wrapper.isConnected ||
      !block.isConnected ||
      wrapper.closest('.md-htmlblock[mdtype="html_block"][cid]') !== block ||
      block.getAttribute('cid') !== id ||
      !editor.writingArea.contains(block)
    )
      return;
    return callback();
  };
}

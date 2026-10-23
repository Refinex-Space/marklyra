import type { LegacyEditor } from './legacy-types.js';

/** Passive notifications must not make original File.sync trigger change on
 * a still-edited language field. Explicit flush/save keeps the native commit. */
export function pendingCodeLanguage(editor: LegacyEditor | undefined): boolean {
  const area = editor?.writingArea,
    active = area?.ownerDocument.activeElement;
  if (!editor || !area || !active || editor.sourceView.inSourceMode || !area.contains(active))
    return false;
  // Computing editability can resolve document styles; reject other targets first.
  if (
    !(active instanceof HTMLElement) ||
    !active.matches('.ty-cm-lang-input[contenteditable]') ||
    !active.isContentEditable
  )
    return false;
  const block = active.closest('[mdtype="fences"][cid]'),
    cid = block?.getAttribute('cid');
  return Boolean(block?.isConnected && cid && editor.getNode(cid)?.get('type') === 'fences');
}

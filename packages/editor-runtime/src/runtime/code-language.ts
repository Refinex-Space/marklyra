import type { LegacyEditor } from './legacy-types.js';

export function codeLanguageField(
  editor: LegacyEditor | undefined,
  target: Element | null | undefined,
): HTMLElement | undefined {
  const field = target?.closest('.ty-cm-lang-input[contenteditable]');
  if (
    !editor ||
    editor.sourceView.inSourceMode ||
    !(field instanceof HTMLElement) ||
    !editor.writingArea.contains(field) ||
    !field.isContentEditable
  )
    return;
  const cid = field.closest('[mdtype="fences"][cid]')?.getAttribute('cid');
  if (field.isConnected && cid && editor.getNode(cid)?.get('type') === 'fences') return field;
}

/** Use the field's native editing transaction; the existing blur/Enter handler
 * commits its language change to document history. Never parse clipboard HTML. */
export function pasteCodeLanguage(field: HTMLElement, text: string): boolean {
  const document = field.ownerDocument,
    selection = document.getSelection();
  if (
    document.activeElement !== field ||
    !selection?.anchorNode ||
    !selection.focusNode ||
    !field.contains(selection.anchorNode) ||
    !field.contains(selection.focusNode)
  )
    return false;
  // Match a single-line text field without inserting line-break DOM into the tooltip.
  const value = text.replace(/[\r\n]/g, '');
  return !value || document.execCommand('insertText', false, value);
}

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

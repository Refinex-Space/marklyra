import { readStructuralSource } from './block-indent-source.js';
import type { PlainInputContext } from './input-range.js';
import type { LegacyGlobals, LegacyNode } from './legacy-types.js';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
function emptyParagraph(element: Element, cid: string): boolean {
  if (
    element.tagName !== 'P' ||
    element.getAttribute('cid') !== cid ||
    element.querySelector(
      '[contenteditable="false"], img, input, textarea, .CodeMirror, [md-inline]:not([md-inline="plain"])',
    )
  )
    return false;
  const raw: unknown = Reflect.get(element, 'rawText');
  return (
    typeof raw === 'function' &&
    Reflect.apply(raw, element, [false]) === '' &&
    Reflect.apply(raw, element, [true]) === ''
  );
}
/** The shipped Redo can both replace a complete list and insert the same empty
 * item again. The native model has one item, but its DOM has two identical cids.
 * Remove only the unselected empty copy proved by that exact live history entry.
 * No model, source, selection or history object is changed. */
export function repairStructuralHistoryDOM(
  runtime: LegacyGlobals,
  context: PlainInputContext,
  entry: object,
): boolean {
  const editor = runtime.editor,
    file = runtime.File;
  if (
    !editor ||
    editor !== context.editor ||
    !file ||
    file.isLocked ||
    editor.isIME ||
    editor.sourceView.inSourceMode ||
    editor.undo.commandStack[editor.undo.index] !== entry
  )
    return false;
  const doc = editor.writingArea.ownerDocument,
    selection = doc.getSelection();
  if (
    !doc.hasFocus() ||
    !editor.writingArea.contains(doc.activeElement) ||
    doc.activeElement?.closest('input,textarea,.CodeMirror') ||
    !selection?.isCollapsed ||
    selection.rangeCount !== 1 ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !editor.writingArea.contains(selection.anchorNode)
  )
    return false;
  const commands: unknown = Reflect.get(entry, 'redo');
  if (!Array.isArray(commands)) return false;
  try {
    for (let index = 0; index < commands.length; index++) {
      const command: unknown = commands[index];
      if (
        !object(command) ||
        command.type !== 'insert' ||
        !Array.isArray(command.json) ||
        command.json.length !== 1
      )
        continue;
      const item: unknown = command.json[0];
      if (
        !object(item) ||
        typeof item.id !== 'string' ||
        !object(item.content) ||
        item.content.type !== 'list_item' ||
        !object(item.relation) ||
        typeof item.relation.parent_id !== 'string' ||
        !Array.isArray(item.children) ||
        item.children.length !== 1
      )
        continue;
      const parentId = item.relation.parent_id;
      const paragraph: unknown = item.children[0];
      if (
        !object(paragraph) ||
        typeof paragraph.id !== 'string' ||
        !object(paragraph.content) ||
        paragraph.content.type !== 'paragraph' ||
        paragraph.content.text !== '' ||
        !object(paragraph.relation) ||
        paragraph.relation.parent_id !== item.id ||
        !Array.isArray(paragraph.children) ||
        paragraph.children.length
      )
        continue;
      const repeated = commands.slice(0, index).some((previous: unknown) => {
        if (
          !object(previous) ||
          previous.type !== 'replace' ||
          previous.id !== parentId ||
          !object(previous.json) ||
          previous.json.id !== previous.id ||
          !object(previous.json.content) ||
          previous.json.content.type !== 'list' ||
          !Array.isArray(previous.json.children)
        )
          return false;
        return previous.json.children.some(
          (child: unknown) => JSON.stringify(child) === JSON.stringify(item),
        );
      });
      if (!repeated) continue;
      const structure = readStructuralSource(
        runtime,
        context.canonical,
        context.ending,
        context.blocks,
        true,
      );
      if (!structure) return false;
      const model = editor.getNode(item.id),
        leaf = structure.leaves.find((l) => l.node.cid === paragraph.id);
      const owner = leaf?.contexts.at(-1),
        parent = owner?.parent;
      if (
        !model ||
        !leaf ||
        leaf.type !== 'paragraph' ||
        leaf.body.join('\n') !== '' ||
        owner?.type !== 'list' ||
        owner.node !== model ||
        parent?.cid !== item.relation.parent_id ||
        model.getFirstChild() !== leaf.node ||
        leaf.node.get('after')
      )
        continue;
      const copies = [...editor.writingArea.querySelectorAll('li[cid]')].filter(
        (el) => el.getAttribute('cid') === item.id,
      );
      if (copies.length !== 2) continue;
      const keep = copies.find(
        (el) => el.contains(selection.anchorNode) && el.contains(selection.focusNode),
      );
      const extra = copies.find((el) => el !== keep),
        list = keep?.parentElement;
      if (
        !keep ||
        !extra ||
        !list ||
        list !== extra.parentElement ||
        !list.matches('ul[cid],ol[cid]') ||
        list.getAttribute('cid') !== parent.cid ||
        !(keep.nextElementSibling === extra || extra.nextElementSibling === keep) ||
        keep.children.length !== 1 ||
        extra.children.length !== 1 ||
        !keep.firstElementChild ||
        !extra.firstElementChild ||
        !emptyParagraph(keep.firstElementChild, paragraph.id) ||
        !emptyParagraph(extra.firstElementChild, paragraph.id)
      )
        continue;
      const ids: string[] = [],
        seen = new Set<LegacyNode>();
      for (let node = parent.getFirstChild(); node; node = node.get('after')) {
        if (seen.has(node) || node.get('parent') !== parent || node.get('type') !== 'list_item')
          return false;
        seen.add(node);
        ids.push(node.cid);
      }
      const actual = [...list.children].filter((el) => el !== extra);
      if (
        ids.length !== actual.length ||
        actual.some((el, i) => el.tagName !== 'LI' || el.getAttribute('cid') !== ids[i])
      )
        continue;
      extra.remove();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

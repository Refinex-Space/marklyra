import { assertPosition } from '@marklyra/editor-core';
import type { CursorBookmark } from '../protocol.js';
import { readStructuralSource } from './block-indent-source.js';
import {
  captureSourceDOMPoint,
  restoreSourceDOMPoint,
  type SourceDOMPoint,
} from './inline-input.js';
import { type PlainInputContext, plainTextPatch } from './input-range.js';
import type { LegacyGlobals } from './legacy-types.js';

type SelectionContext = PlainInputContext & { runtime?: LegacyGlobals };

interface Endpoint {
  cid: string;
  text: string;
  offset: number;
  point: SourceDOMPoint;
}
export interface HistorySelection {
  anchor: Endpoint;
  head: Endpoint;
  bookmark: CursorBookmark;
}
export interface PendingHistorySelection extends HistorySelection {
  priorEntry: object | undefined;
}
function raw(node: Node, controls = false): string | undefined {
  const method: unknown = Reflect.get(node, 'rawText');
  if (typeof method !== 'function') return;
  const result: unknown = Reflect.apply(method, node, [controls]);
  return typeof result === 'string' ? result : undefined;
}
/** This read-only proof does not authorize a Markdown edit or widen the inline
 * grammar. It checks only an existing DOM endpoint against this model/serializer. */
function body(context: SelectionContext, cid: string, expected?: string) {
  const model = context.editor.getNode(cid),
    block = context.blocks.find((item) => item.id === cid),
    paragraph = [...context.editor.writingArea.querySelectorAll<HTMLElement>('p[cid]')].find(
      (element) => element.getAttribute('cid') === cid,
    );
  if (
    !model ||
    !paragraph ||
    model.get('type') !== 'paragraph' ||
    paragraph.getAttribute('contenteditable') === 'false' ||
    paragraph.querySelector('[contenteditable="false"]')
  )
    return;
  const text = model.get('text'),
    ahead = model.get('ahead');
  if (
    typeof text !== 'string' ||
    (expected !== undefined && text !== expected) ||
    (ahead !== undefined && typeof ahead !== 'number') ||
    paragraph.textContent !== text ||
    raw(paragraph) !== text ||
    raw(paragraph, true) !== text
  )
    return;
  if (paragraph.parentElement !== context.editor.writingArea) {
    // The existing complete native serializer/model proof supplies nested leaf
    // ownership; raw paragraph text alone is insufficient for a list endpoint.
    const runtime = context.runtime;
    const leaf =
      runtime?.editor === context.editor
        ? readStructuralSource(
            runtime,
            context.canonical,
            context.ending,
            context.blocks,
            true,
          )?.leaves.find((candidate) => candidate.node === model)
        : undefined;
    return leaf?.type === 'paragraph' && leaf.body.join('\n') === text
      ? { paragraph, text }
      : undefined;
  }
  if (!block) return;
  const proof = plainTextPatch({
    canonical: context.canonical,
    block,
    model: text,
    raw: text,
    rawWithoutControls: text,
    mark: model.toMark(),
    ahead: ahead ?? 0,
    ending: context.ending,
    startPrefix: '',
    endPrefix: text,
    insert: '',
  });
  return proof ? { paragraph, text } : undefined;
}
function prefix(paragraph: HTMLElement, node: Node, offset: number): string | undefined {
  const range = paragraph.ownerDocument.createRange();
  try {
    range.selectNodeContents(paragraph);
    range.setEnd(node, offset);
    const before = range.cloneContents();
    range.selectNodeContents(paragraph);
    range.setStart(node, offset);
    const after = range.cloneContents(),
      text = before.textContent ?? '';
    if (
      raw(before) !== text ||
      raw(before, true) !== text ||
      raw(after) !== after.textContent ||
      raw(after, true) !== after.textContent ||
      text + after.textContent !== paragraph.textContent
    )
      return;
    return text;
  } catch {
    return;
  }
}
function endpoint(context: SelectionContext, node: Node, offset: number): Endpoint | undefined {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement,
    paragraph = element?.closest<HTMLElement>('p[cid]'),
    cid = paragraph?.getAttribute('cid');
  if (!paragraph || !cid) return;
  const verified = body(context, cid),
    text = prefix(paragraph, node, offset),
    point = captureSourceDOMPoint(paragraph, node, offset);
  if (
    !verified ||
    verified.paragraph !== paragraph ||
    text === undefined ||
    !point ||
    !verified.text.startsWith(text)
  )
    return;
  try {
    assertPosition(verified.text, text.length);
  } catch {
    return;
  }
  return { cid, text: verified.text, offset: text.length, point };
}
/** Capture only a real local input selection. Unknown source syntax may retain
 * its direction on Undo, but still receives no source patch from this module. */
export function captureHistorySelection(
  context: SelectionContext,
  event: KeyboardEvent | InputEvent,
): PendingHistorySelection | undefined {
  const { editor } = context,
    document = editor.writingArea.ownerDocument;
  if (
    !event.isTrusted ||
    event.isComposing ||
    editor.isIME ||
    editor.sourceView.inSourceMode ||
    !document.hasFocus()
  )
    return;
  const selection = document.getSelection();
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    selection.rangeCount !== 1 ||
    selection.isCollapsed
  )
    return;
  const anchor = endpoint(context, selection.anchorNode, selection.anchorOffset),
    head = endpoint(context, selection.focusNode, selection.focusOffset);
  if (!anchor || !head) return;
  const range = selection.getRangeAt(0),
    start = endpoint(context, range.startContainer, range.startOffset),
    end = endpoint(context, range.endContainer, range.endOffset),
    bookmark = editor.selection.buildUndo();
  if (
    !start ||
    !end ||
    !bookmark ||
    bookmark.type !== 'cursor' ||
    bookmark.start !== start.offset ||
    bookmark.end !== end.offset ||
    (start.cid === end.cid
      ? bookmark.id !== start.cid
      : bookmark.startId !== start.cid || bookmark.endId !== end.cid)
  )
    return;
  return {
    anchor,
    head,
    bookmark: structuredClone(bookmark),
    priorEntry: editor.undo.commandStack[editor.undo.index],
  };
}
export function bindHistorySelection(
  pending: PendingHistorySelection,
  entry: object,
): HistorySelection | undefined {
  if (entry === pending.priorEntry) return;
  const commands: unknown = Reflect.get(entry, 'undo');
  if (!Array.isArray(commands)) return;
  const cursors = commands.filter(
    (command: unknown) =>
      command && typeof command === 'object' && Reflect.get(command, 'type') === 'cursor',
  );
  if (cursors.length !== 1 || JSON.stringify(cursors[0]) !== JSON.stringify(pending.bookmark))
    return;
  for (const endpoint of [pending.anchor, pending.head]) {
    const json = firstReplacedParagraph(commands, endpoint.cid);
    const content: unknown =
      json && typeof json === 'object' ? Reflect.get(json, 'content') : undefined;
    if (
      !json ||
      typeof json !== 'object' ||
      Reflect.get(json, 'id') !== endpoint.cid ||
      !content ||
      typeof content !== 'object' ||
      Reflect.get(content, 'type') !== 'paragraph' ||
      Reflect.get(content, 'text') !== endpoint.text
    )
      return;
  }
  return { anchor: pending.anchor, head: pending.head, bookmark: pending.bookmark };
}
/** Read the first actual replacement containing the endpoint, including native
 * container snapshots. Never skip a mismatched earlier state for a later match. */
function firstReplacedParagraph(commands: readonly unknown[], cid: string): object | undefined {
  for (const command of commands) {
    if (!command || typeof command !== 'object' || Reflect.get(command, 'type') !== 'replace')
      continue;
    const root: unknown = Reflect.get(command, 'json');
    if (!root || typeof root !== 'object' || Reflect.get(root, 'id') !== Reflect.get(command, 'id'))
      return;
    const seen = new Set<object>();
    let result: object | undefined;
    const walk = (node: unknown, parent?: string, depth = 0): boolean => {
      if (!node || typeof node !== 'object' || seen.has(node) || depth > 128 || seen.size > 16384)
        return false;
      seen.add(node);
      const id: unknown = Reflect.get(node, 'id'),
        content: unknown = Reflect.get(node, 'content');
      if (typeof id !== 'string' || !content || typeof content !== 'object') return false;
      if (parent !== undefined) {
        const relation: unknown = Reflect.get(node, 'relation');
        if (
          !relation ||
          typeof relation !== 'object' ||
          Reflect.get(relation, 'parent_id') !== parent
        )
          return false;
      }
      if (id === cid) {
        if (result) return false;
        result = node;
      }
      const children: unknown = Reflect.get(node, 'children');
      if (children === undefined) return true;
      if (!Array.isArray(children)) return false;
      if (
        children.length &&
        !['list', 'list_item', 'blockquote'].includes(String(Reflect.get(content, 'type')))
      )
        return false;
      return children.every((child: unknown) => walk(child, id, depth + 1));
    };
    if (!walk(root)) return;
    if (result) return result;
  }
  return;
}
/** Called after the same entry's Undo, never from a timer. Re-prove
 * both current model bodies and semantic DOM paths before restoring endpoints. */
export function restoreHistorySelection(
  context: SelectionContext,
  metadata: HistorySelection,
  commands: unknown,
): boolean {
  if (
    !bindHistorySelection({ ...metadata, priorEntry: undefined }, { undo: commands }) ||
    context.editor.isIME ||
    context.editor.sourceView.inSourceMode ||
    !context.editor.writingArea.ownerDocument.hasFocus()
  )
    return false;
  const point = (endpoint: Endpoint): [Node, number] | undefined => {
    const verified = body(context, endpoint.cid, endpoint.text);
    if (!verified) return;
    return restoreSourceDOMPoint(
      verified.paragraph,
      endpoint.point,
      endpoint.text.slice(0, endpoint.offset),
      (node, offset) => prefix(verified.paragraph, node, offset),
    );
  };
  const anchor = point(metadata.anchor),
    head = point(metadata.head),
    selection = context.editor.writingArea.ownerDocument.getSelection();
  if (!anchor || !head || !selection) return false;
  selection.setBaseAndExtent(...anchor, ...head);
  // Finalize the view for its restored target while this same Undo
  // still owns the selection. Pending brush work then sees the already-expanded
  // nodes. Re-prove semantic endpoints after refresh; never schedule a replay.
  context.editor.refresh();
  const finalAnchor = point(metadata.anchor),
    finalHead = point(metadata.head);
  if (!finalAnchor || !finalHead) return false;
  selection.setBaseAndExtent(...finalAnchor, ...finalHead);
  return true;
}

import { assertPosition, assertWellFormedText, type Patch } from '@marklyra/editor-core';
import {
  captureSourceDOMPoint,
  restoreSourceDOMPoint,
  type SourceDOMPoint,
  sourceInlineTree,
} from './inline-input.js';
import type { LegacyEditor, LegacyNode } from './legacy-types.js';

export interface PlainBlockRange {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}
export interface PlainInputContext {
  readonly canonical: string;
  readonly blocks: readonly PlainBlockRange[];
  readonly editor: LegacyEditor;
  readonly ending: '\n' | '\r\n';
}
export interface PlainSelection {
  readonly cid: string;
  readonly anchor: number;
  readonly head: number;
  readonly anchorPoint?: SourceDOMPoint | undefined;
  readonly headPoint?: SourceDOMPoint | undefined;
}
export interface PlainInputCandidate {
  readonly base: string;
  readonly next: string;
  readonly patches: readonly Patch[];
  readonly cid: string;
  readonly inputType: string;
  readonly backward: boolean;
  readonly priorSelection: PlainSelection | undefined;
  readonly model: string;
  readonly priorEntry: object | undefined;
  readonly priorRedo: object | undefined;
}
export interface PlainTextEvidence {
  readonly canonical: string;
  readonly block: PlainBlockRange;
  readonly model: string;
  readonly raw: string;
  readonly rawWithoutControls: string;
  readonly mark: string;
  readonly ahead: number;
  readonly ending: '\n' | '\r\n';
  readonly startPrefix: string;
  readonly endPrefix: string;
  readonly insert: string;
}

/** This proof is intentionally limited to the paragraph serializer's
 * source-equivalent body. It never searches for the first repeated text occurrence. */
export function plainTextPatch(evidence: PlainTextEvidence): Patch | undefined {
  const {
    canonical,
    block,
    model,
    raw,
    rawWithoutControls,
    mark,
    ahead,
    ending,
    startPrefix,
    endPrefix,
    insert,
  } = evidence;
  if (
    !Number.isSafeInteger(ahead) ||
    ahead < 0 ||
    ahead > canonical.length ||
    model.includes('\r') ||
    model !== raw ||
    model !== rawWithoutControls
  )
    return;
  if (
    canonical.slice(block.from, block.to) !== block.text ||
    !Number.isSafeInteger(block.from) ||
    block.from < 0 ||
    block.to > canonical.length
  )
    return;
  const prefix = ending.repeat(ahead),
    body = model.replace(/\n/g, ending);
  const expected = prefix + body;
  if (
    !mark.startsWith(expected) ||
    mark.slice(expected.length).split(ending).join('') !== '' ||
    !block.text.startsWith(mark) ||
    block.text.slice(mark.length).split(ending).join('') !== ''
  )
    return;
  if (
    !model.startsWith(startPrefix) ||
    !model.startsWith(endPrefix) ||
    !endPrefix.startsWith(startPrefix)
  )
    return;
  try {
    assertPosition(model, startPrefix.length);
    assertPosition(model, endPrefix.length);
    assertWellFormedText(insert);
  } catch {
    return;
  }
  const from = block.from + prefix.length + startPrefix.replace(/\n/g, ending).length;
  const to = block.from + prefix.length + endPrefix.replace(/\n/g, ending).length;
  return { from, to, insert: insert.replace(/\r\n|\r/g, '\n').replace(/\n/g, ending) };
}

function rawText(node: Node, controls = false): string | undefined {
  const method: unknown = Reflect.get(node, 'rawText');
  if (typeof method !== 'function') return;
  const value: unknown = Reflect.apply(method, node, [controls]);
  return typeof value === 'string' ? value : undefined;
}
function plainParagraph(node: Node, area: HTMLElement): HTMLElement | undefined {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const paragraph = element?.closest<HTMLElement>('p[cid][mdtype="paragraph"]');
  if (
    !paragraph ||
    paragraph.parentElement !== area ||
    paragraph.getAttribute('contenteditable') === 'false'
  )
    return;
  const plain = [...paragraph.querySelectorAll('*')].every((child) => {
    const type = child.getAttribute('md-inline');
    if (
      [...child.classList].some((name) => !['md-plain', 'md-softbreak', 'md-expand'].includes(name))
    )
      return false;
    if (
      child.tagName !== 'SPAN' ||
      (type !== 'plain' && type !== 'softbreak') ||
      child.children.length ||
      child.getAttribute('contenteditable') === 'false'
    )
      return false;
    if (type === 'softbreak' && child.textContent !== '\n' && child.textContent !== '\u00a0')
      return false;
    return true;
  });
  if (plain) return paragraph;
  if (
    sourceInlineTree(paragraph) &&
    paragraph.textContent === rawText(paragraph) &&
    paragraph.textContent === rawText(paragraph, true)
  )
    return paragraph;
  return;
}
function hasInline(paragraph: HTMLElement): boolean {
  return (
    paragraph.querySelector(
      '[md-inline=strong],[md-inline=em],[md-inline=del],[md-inline=code],[md-inline=link],[md-inline=escape],[md-inline=html_entity],[md-inline=linebreak]',
    ) !== null
  );
}
function prefixAt(paragraph: HTMLElement, node: Node, offset: number): string | undefined {
  const range = paragraph.ownerDocument.createRange();
  try {
    range.selectNodeContents(paragraph);
    range.setEnd(node, offset);
    const fragment = range.cloneContents(),
      prefix = rawText(fragment);
    if (hasInline(paragraph)) {
      if (prefix !== fragment.textContent || prefix !== rawText(fragment, true)) return;
      range.selectNodeContents(paragraph);
      range.setStart(node, offset);
      const suffix = range.cloneContents();
      if (
        suffix.textContent !== rawText(suffix) ||
        suffix.textContent !== rawText(suffix, true) ||
        prefix + suffix.textContent !== paragraph.textContent
      )
        return;
    }
    return prefix;
  } catch {
    return;
  }
}
function modelText(model: LegacyNode, key: 'text' | 'type' | 'ahead'): unknown {
  return model.get(key);
}

/** Capture only. Editing, DOM rendering, selection and IME remain owned
 * by the engine; the candidate must still match its actual next text. */
export function capturePlainInput(
  context: PlainInputContext,
  event: KeyboardEvent | InputEvent,
): PlainInputCandidate | undefined {
  const { editor } = context;
  // The engine assigns window.Node with its model constructor. Use
  // DOM ownership/containment instead of that global for event target validation.
  const target = event.target as Node | null;
  if (
    !target ||
    target.ownerDocument !== editor.writingArea.ownerDocument ||
    !editor.writingArea.contains(target)
  )
    return;
  if (editor.sourceView.inSourceMode || editor.isIME || event.isComposing || !event.isTrusted)
    return;
  const keyboard = event.type === 'keydown';
  let inputType: string,
    insert = '';
  if (keyboard) {
    const key = event as KeyboardEvent;
    if (
      key.metaKey ||
      key.ctrlKey ||
      key.altKey ||
      key.shiftKey ||
      !['Backspace', 'Delete'].includes(key.key)
    )
      return;
    inputType = key.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward';
  } else {
    const input = event as InputEvent;
    inputType = input.inputType;
    if (
      ![
        'deleteContentBackward',
        'deleteContentForward',
        'insertText',
        'insertReplacementText',
      ].includes(inputType)
    )
      return;
    if (inputType.startsWith('insert')) {
      if (typeof input.data !== 'string') return;
      insert = input.data;
    }
  }
  const selection = editor.writingArea.ownerDocument.getSelection();
  if (selection?.rangeCount !== 1) return;
  let range: Range | StaticRange = selection.getRangeAt(0);
  if (!keyboard) {
    if (typeof (event as InputEvent).getTargetRanges !== 'function') return;
    const targets = (event as InputEvent).getTargetRanges();
    if (targets.length !== 1) return;
    const target = targets[0];
    if (!target) return;
    range = target;
  }
  // Selected-key deletion is proven; collapsed-key grapheme deletion is not guessed.
  if (keyboard && range.collapsed) return;
  if (!keyboard && inputType.startsWith('delete') && range.collapsed) return;
  return captureRangeReplacement(context, range, selection, insert, inputType);
}

/** Called only after the host action's one-shot capability/CAS checks. No input
 * event is forged. The same full proof and actual-next check remain mandatory. */
export function captureAuthorizedReplacement(
  context: PlainInputContext,
  insert: string,
  inputType: 'insertText' | 'deleteContentBackward',
): PlainInputCandidate | undefined {
  const editor = context.editor;
  if (editor.isIME || editor.sourceView.inSourceMode) return;
  const selection = editor.writingArea.ownerDocument.getSelection();
  if (selection?.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  if (inputType === 'deleteContentBackward' && range.collapsed) return;
  return captureRangeReplacement(context, range, selection, insert, inputType);
}
function captureRangeReplacement(
  context: PlainInputContext,
  range: Range | StaticRange,
  selection: Selection,
  insert: string,
  inputType: string,
): PlainInputCandidate | undefined {
  const editor = context.editor;
  const paragraph = plainParagraph(range.startContainer, editor.writingArea);
  if (!paragraph || plainParagraph(range.endContainer, editor.writingArea) !== paragraph) return;
  const cid = paragraph.getAttribute('cid');
  if (!cid) return;
  const model = editor.getNode(cid),
    block = context.blocks.find((block) => block.id === cid);
  if (!model || !block || modelText(model, 'type') !== 'paragraph') return;
  const text = modelText(model, 'text'),
    ahead = modelText(model, 'ahead');
  if (typeof text !== 'string' || (ahead !== undefined && typeof ahead !== 'number')) return;
  const raw = rawText(paragraph),
    clean = rawText(paragraph, true);
  const startPrefix = prefixAt(paragraph, range.startContainer, range.startOffset),
    endPrefix = prefixAt(paragraph, range.endContainer, range.endOffset);
  if (
    raw === undefined ||
    clean === undefined ||
    startPrefix === undefined ||
    endPrefix === undefined
  )
    return;
  const patch = plainTextPatch({
    canonical: context.canonical,
    block,
    model: text,
    raw,
    rawWithoutControls: clean,
    mark: model.toMark(),
    ahead: ahead ?? 0,
    ending: context.ending,
    startPrefix,
    endPrefix,
    insert,
  });
  if (!patch || (patch.from === patch.to && !patch.insert)) return;
  let priorSelection: PlainSelection | undefined;
  if (
    selection.anchorNode &&
    selection.focusNode &&
    plainParagraph(selection.anchorNode, editor.writingArea) === paragraph &&
    plainParagraph(selection.focusNode, editor.writingArea) === paragraph
  ) {
    const anchor = prefixAt(paragraph, selection.anchorNode, selection.anchorOffset),
      head = prefixAt(paragraph, selection.focusNode, selection.focusOffset);
    if (
      anchor !== undefined &&
      head !== undefined &&
      text.startsWith(anchor) &&
      text.startsWith(head)
    ) {
      try {
        assertPosition(text, anchor.length);
        assertPosition(text, head.length);
        priorSelection = {
          cid,
          anchor: anchor.length,
          head: head.length,
          ...(hasInline(paragraph)
            ? {
                anchorPoint: captureSourceDOMPoint(
                  paragraph,
                  selection.anchorNode,
                  selection.anchorOffset,
                ),
                headPoint: captureSourceDOMPoint(
                  paragraph,
                  selection.focusNode,
                  selection.focusOffset,
                ),
              }
            : {}),
        };
      } catch {
        /* No directed metadata without valid positions. */
      }
    }
  }
  return {
    model: text,
    priorSelection,
    base: context.canonical,
    next: context.canonical.slice(0, patch.from) + patch.insert + context.canonical.slice(patch.to),
    patches: [patch],
    cid,
    inputType,
    priorEntry: editor.undo.commandStack[editor.undo.index],
    priorRedo: editor.undo.commandStack[editor.undo.index]?.redo,
    backward: priorSelection !== undefined && priorSelection.anchor > priorSelection.head,
  };
}

/** Repair only the proven operation's recorded redo caret. The command
 * already changed the document and owns Undo; no synthetic transaction is added. */
export function repairPlainRedoCursor(
  context: PlainInputContext,
  candidate: PlainInputCandidate,
): boolean {
  const { editor } = context;
  if (editor.isIME || editor.sourceView.inSourceMode || context.canonical !== candidate.next)
    return false;
  const entry = editor.undo.commandStack[editor.undo.index];
  if (
    !entry ||
    editor.undo.index !== editor.undo.commandStack.length - 1 ||
    (entry === candidate.priorEntry && entry.redo === candidate.priorRedo) ||
    !Array.isArray(entry.redo)
  )
    return false;
  const selection = editor.writingArea.ownerDocument.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !selection.focusNode) return false;
  const paragraph = plainParagraph(selection.anchorNode, editor.writingArea);
  if (
    !paragraph ||
    plainParagraph(selection.focusNode, editor.writingArea) !== paragraph ||
    paragraph.getAttribute('cid') !== candidate.cid
  )
    return false;
  const model = editor.getNode(candidate.cid),
    block = context.blocks.find((block) => block.id === candidate.cid);
  if (!model || !block || modelText(model, 'type') !== 'paragraph') return false;
  const text = modelText(model, 'text'),
    ahead = modelText(model, 'ahead');
  if (typeof text !== 'string' || (ahead !== undefined && typeof ahead !== 'number')) return false;
  const raw = rawText(paragraph),
    clean = rawText(paragraph, true);
  const anchor = prefixAt(paragraph, selection.anchorNode, selection.anchorOffset),
    head = prefixAt(paragraph, selection.focusNode, selection.focusOffset);
  if (raw === undefined || clean === undefined || anchor === undefined || head !== anchor)
    return false;
  const proof = plainTextPatch({
    canonical: context.canonical,
    block,
    model: text,
    raw,
    rawWithoutControls: clean,
    mark: model.toMark(),
    ahead: ahead ?? 0,
    ending: context.ending,
    startPrefix: anchor,
    endPrefix: head,
    insert: '',
  });
  if (!proof) return false;
  const cursor = lastProvenRedoCursor(entry.redo, candidate.cid, text);
  if (!cursor) return false;
  cursor.start = anchor.length;
  cursor.end = anchor.length;
  return true;
}

/** Replacements can record delete and insert as two same-cid pairs.
 * Preserve every intermediate operation; only the final proven cursor is mutable. */
export function lastProvenRedoCursor(
  value: unknown,
  cid: string,
  text: string,
): { start: number; end: number } | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length % 2 !== 0) return;
  let last: { start: number; end: number } | undefined;
  for (let index = 0; index < value.length; index += 2) {
    const replace = value[index] as HistoryOperation | null | undefined,
      cursor = value[index + 1] as HistoryOperation | null | undefined;
    if (
      !replace ||
      !cursor ||
      replace.type !== 'replace' ||
      replace.id !== cid ||
      replace.json?.id !== cid ||
      typeof replace.json.content?.text !== 'string' ||
      cursor.type !== 'cursor' ||
      cursor.id !== cid ||
      typeof cursor.start !== 'number' ||
      typeof cursor.end !== 'number' ||
      !Number.isSafeInteger(cursor.start) ||
      !Number.isSafeInteger(cursor.end) ||
      cursor.start < 0 ||
      cursor.end < cursor.start
    )
      return;
    if (index === value.length - 2) {
      if (
        replace.json.content.text !== text ||
        !Object.getOwnPropertyDescriptor(cursor, 'start')?.writable ||
        !Object.getOwnPropertyDescriptor(cursor, 'end')?.writable
      )
        return;
      last = cursor as { start: number; end: number };
    }
  }
  return last;
}

type HistoryOperation = {
  type?: unknown;
  id?: unknown;
  json?: { id?: unknown; content?: { text?: unknown } };
  start?: unknown;
  end?: unknown;
};
/** Capture an initial reversed or proven inline endpoint selection for a new real history entry.
 * A later coalesced operation must never overwrite that group's starting point. */
export function plainUndoSelection(
  candidate: PlainInputCandidate,
  entry: object,
): PlainSelection | undefined {
  const selection = candidate.priorSelection;
  if (
    entry === candidate.priorEntry ||
    !selection ||
    (selection.anchor <= selection.head && (!selection.anchorPoint || !selection.headPoint))
  )
    return;
  const value: unknown = Reflect.get(entry, 'undo');
  if (!Array.isArray(value)) return;
  const operations = value as HistoryOperation[];
  if (
    !operations.some(
      (op) =>
        op.type === 'replace' &&
        op.id === candidate.cid &&
        op.json?.id === candidate.cid &&
        op.json.content?.text === candidate.model,
    )
  )
    return;
  const cursors = operations.filter((op) => op.type === 'cursor' && op.id === candidate.cid);
  if (
    cursors.length !== 1 ||
    cursors[0]?.start !== Math.min(selection.anchor, selection.head) ||
    cursors[0]?.end !== Math.max(selection.anchor, selection.head)
  )
    return;
  return { ...selection };
}

/** Called exclusively after actual Undo. Coordinates are re-proven against the
 * command's replacement body and the current plain DOM/serializer. */
export function restorePlainUndoSelection(
  context: PlainInputContext,
  metadata: PlainSelection,
  commands: unknown,
): boolean {
  if (!Array.isArray(commands)) return false;
  const operations = commands as HistoryOperation[];
  const replacement = operations.find(
    (op) => op.type === 'replace' && op.id === metadata.cid && op.json?.id === metadata.cid,
  );
  const expected = replacement?.json?.content?.text;
  return typeof expected === 'string' && restorePlainSelectionText(context, metadata, expected);
}

function restorePlainSelectionText(
  context: PlainInputContext,
  metadata: PlainSelection,
  expected: string,
  bounds?: { bodyFrom: number; bodyTo: number },
): boolean {
  const { editor } = context;
  if (editor.isIME || editor.sourceView.inSourceMode) return false;
  const block = context.blocks.find((block) => block.id === metadata.cid),
    model = editor.getNode(metadata.cid);
  const paragraph = Array.from(editor.writingArea.querySelectorAll<HTMLElement>('p[cid]')).find(
    (p) => p.getAttribute('cid') === metadata.cid,
  );
  if (
    !block ||
    !model ||
    !paragraph ||
    plainParagraph(paragraph, editor.writingArea) !== paragraph ||
    modelText(model, 'type') !== 'paragraph' ||
    modelText(model, 'text') !== expected
  )
    return false;
  const ahead = modelText(model, 'ahead'),
    raw = rawText(paragraph),
    clean = rawText(paragraph, true);
  if (
    (ahead !== undefined && typeof ahead !== 'number') ||
    raw === undefined ||
    clean === undefined
  )
    return false;
  const point = (offset: number, saved?: SourceDOMPoint): [Node, number] | undefined => {
    try {
      assertPosition(expected, offset);
    } catch {
      return;
    }
    if (saved)
      return restoreSourceDOMPoint(paragraph, saved, expected.slice(0, offset), (node, local) =>
        prefixAt(paragraph, node, local),
      );
    const walker = paragraph.ownerDocument.createTreeWalker(paragraph, 4);
    let node = walker.nextNode(),
      at = 0;
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (offset >= at && offset <= at + length) {
        const local = offset - at;
        return prefixAt(paragraph, node, local) === expected.slice(0, offset)
          ? [node, local]
          : undefined;
      }
      at += length;
      node = walker.nextNode();
    }
    return;
  };
  const anchor = point(metadata.anchor, metadata.anchorPoint),
    head = point(metadata.head, metadata.headPoint);
  if (!anchor || !head) return false;
  const proof = plainTextPatch({
    canonical: context.canonical,
    block,
    model: expected,
    raw,
    rawWithoutControls: clean,
    mark: model.toMark(),
    ahead: ahead ?? 0,
    ending: context.ending,
    startPrefix: expected.slice(0, Math.min(metadata.anchor, metadata.head)),
    endPrefix: expected.slice(0, Math.max(metadata.anchor, metadata.head)),
    insert: '',
  });
  if (!proof) return false;
  if (bounds) {
    const body = plainTextPatch({
      canonical: context.canonical,
      block,
      model: expected,
      raw,
      rawWithoutControls: clean,
      mark: model.toMark(),
      ahead: ahead ?? 0,
      ending: context.ending,
      startPrefix: '',
      endPrefix: expected,
      insert: '',
    });
    if (!body || body.from !== bounds.bodyFrom || body.to !== bounds.bodyTo) return false;
  }
  const selection = paragraph.ownerDocument.getSelection();
  if (!selection) return false;
  selection.setBaseAndExtent(...anchor, ...head);
  return true;
}

export interface ActivePlainSelection extends PlainSelection {
  readonly bodyFrom: number;
  readonly bodyTo: number;
  readonly focused: boolean;
  readonly checkpoint: number;
}
/** Read-only view snapshot. Offsets refer to the same existing canonical snapshot;
 * no second copy of document text or synthetic history operation is stored. */
export function captureActivePlainSelection(
  context: PlainInputContext,
  checkpoint: number,
): ActivePlainSelection | undefined {
  const { editor } = context;
  if (editor.isIME || editor.sourceView.inSourceMode) return;
  const document = editor.writingArea.ownerDocument,
    selection = document.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || selection.rangeCount !== 1) return;
  const paragraph = plainParagraph(selection.anchorNode, editor.writingArea);
  if (!paragraph || plainParagraph(selection.focusNode, editor.writingArea) !== paragraph) return;
  const cid = paragraph.getAttribute('cid');
  if (!cid) return;
  const model = editor.getNode(cid),
    block = context.blocks.find((block) => block.id === cid);
  if (!model || !block || modelText(model, 'type') !== 'paragraph') return;
  const text = modelText(model, 'text'),
    ahead = modelText(model, 'ahead');
  if (typeof text !== 'string' || (ahead !== undefined && typeof ahead !== 'number')) return;
  const raw = rawText(paragraph),
    clean = rawText(paragraph, true),
    anchor = prefixAt(paragraph, selection.anchorNode, selection.anchorOffset),
    head = prefixAt(paragraph, selection.focusNode, selection.focusOffset);
  if (
    raw === undefined ||
    clean === undefined ||
    anchor === undefined ||
    head === undefined ||
    !text.startsWith(anchor) ||
    !text.startsWith(head)
  )
    return;
  try {
    assertPosition(text, anchor.length);
    assertPosition(text, head.length);
  } catch {
    return;
  }
  const body = plainTextPatch({
    canonical: context.canonical,
    block,
    model: text,
    raw,
    rawWithoutControls: clean,
    mark: model.toMark(),
    ahead: ahead ?? 0,
    ending: context.ending,
    startPrefix: '',
    endPrefix: text,
    insert: '',
  });
  if (!body) return;
  return {
    cid,
    anchor: anchor.length,
    head: head.length,
    ...(hasInline(paragraph)
      ? {
          anchorPoint: captureSourceDOMPoint(
            paragraph,
            selection.anchorNode,
            selection.anchorOffset,
          ),
          headPoint: captureSourceDOMPoint(paragraph, selection.focusNode, selection.focusOffset),
        }
      : {}),
    bodyFrom: body.from,
    bodyTo: body.to,
    focused: document.hasFocus(),
    checkpoint,
  };
}
export function restoreActivePlainSelection(
  context: PlainInputContext,
  metadata: ActivePlainSelection,
  normalizeToText = false,
): boolean {
  if (!metadata.focused || !context.editor.writingArea.ownerDocument.hasFocus()) return false;
  try {
    assertPosition(context.canonical, metadata.bodyFrom);
    assertPosition(context.canonical, metadata.bodyTo);
  } catch {
    return false;
  }
  if (metadata.bodyTo < metadata.bodyFrom) return false;
  const expected = context.canonical
    .slice(metadata.bodyFrom, metadata.bodyTo)
    .replace(/\r\n/g, '\n');
  return restorePlainSelectionText(
    context,
    normalizeToText ? { ...metadata, anchorPoint: undefined, headPoint: undefined } : metadata,
    expected,
    metadata,
  );
}

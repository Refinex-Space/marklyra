import { assertPosition } from '@marklyra/editor-core';
import type { StructuralDocumentSource, StructuralSourceLeaf } from './block-indent-source.js';
import type { PlainBlockRange } from './input-range.js';
import type { LegacyGlobals } from './legacy-types.js';
import { readMarkdownPolicy } from './policy-options.js';
import type { StructuralBreakReceipt } from './structural-break-source.js';

function sameLeaf(before: StructuralSourceLeaf, after: StructuralSourceLeaf): boolean {
  return (
    before.node === after.node &&
    before.root === after.root &&
    before.type === after.type &&
    before.body.length === after.body.length &&
    before.body.every((line, index) => line === after.body[index]) &&
    before.contexts.length === after.contexts.length &&
    before.contexts.every((context, index) => {
      const next = after.contexts[index];
      return (
        next &&
        context.node === next.node &&
        context.parent === next.parent &&
        context.type === next.type &&
        context.style === next.style &&
        context.checked === next.checked
      );
    })
  );
}

/** Enter moves a suffix to a fresh root. Authorize only the insertion at the
 * captured source caret, never a guessed delete/reinsert of that suffix. */
export function rootBreakReceipt(
  before: StructuralDocumentSource,
  after: StructuralDocumentSource,
  index: number,
  point: number,
  soft: boolean,
): StructuralBreakReceipt | undefined {
  const old = before.leaves[index],
    first = after.leaves[index],
    second = after.leaves[index + 1];
  if (
    !old ||
    !first ||
    !['paragraph', 'heading'].includes(old.type) ||
    old.root !== old.node ||
    old.contexts.length ||
    first.node !== old.node ||
    first.root !== first.node ||
    first.type !== old.type ||
    first.contexts.length ||
    after.leaves.length !== before.leaves.length + (soft ? 0 : 1) ||
    !Number.isSafeInteger(point) ||
    point < (old.lines[0]?.from ?? Infinity) ||
    point > (old.lines.at(-1)?.to ?? -1)
  )
    return;
  if (
    !soft &&
    (!second ||
      second.node === old.node ||
      second.root !== second.node ||
      second.type !== old.type ||
      second.contexts.length ||
      before.leaves.some((leaf) => leaf.node === second.node))
  )
    return;
  for (let at = 0; at < before.leaves.length; at++) {
    if (at === index) continue;
    const original = before.leaves[at],
      current = after.leaves[at + (!soft && at > index ? 1 : 0)];
    if (!original || !current || !sameLeaf(original, current)) return;
  }
  try {
    assertPosition(before.canonical, point);
  } catch {
    return;
  }
  const syntax = (insert: string) =>
    insert.includes('\n') && /^[\r\n \t#*_~`[\]()<>+=.!-]+$/u.test(insert);
  const directLength = after.canonical.length - before.canonical.length,
    direct = after.canonical.slice(point, point + directLength);
  if (
    directLength > 0 &&
    directLength <= 65_536 &&
    syntax(direct) &&
    before.canonical.slice(0, point) + direct + before.canonical.slice(point) === after.canonical
  )
    return {
      base: before.canonical,
      patches: [{ from: point, to: point, insert: direct }],
      editCanonical: after.canonical,
      canonical: after.canonical,
      normalizationPatches: [],
    };
  const oldRange = old.rootRange,
    firstRange = first.rootRange,
    lastRange = (soft ? first : second)?.rootRange;
  if (
    !oldRange ||
    !firstRange ||
    !lastRange ||
    oldRange.from !== firstRange.from ||
    point < oldRange.from ||
    point > oldRange.to ||
    before.canonical.slice(oldRange.to) !== after.canonical.slice(lastRange.to)
  )
    return;
  const oldContent = before.canonical.slice(oldRange.from, oldRange.to).replace(/[\r\n]+$/u, ''),
    newContent = after.canonical.slice(firstRange.from, lastRange.to).replace(/[\r\n]+$/u, ''),
    contentEnd = oldRange.from + oldContent.length,
    newContentEnd = firstRange.from + newContent.length,
    suffix = before.canonical.slice(point, contentEnd),
    insertEnd = newContentEnd - suffix.length;
  if (point > contentEnd || insertEnd <= point || insertEnd - point > 65_536) return;
  const insert = after.canonical.slice(point, insertEnd);
  // Native Enter may close/reopen inline delimiters or repeat heading syntax.
  // Text content, URLs and arbitrary markup are not authorized by this receipt.
  if (!syntax(insert)) return;
  if (
    before.canonical.slice(0, point) + insert + suffix !==
    after.canonical.slice(0, newContentEnd)
  )
    return;
  const editCanonical = before.canonical.slice(0, point) + insert + before.canonical.slice(point),
    oldGap = before.canonical.slice(contentEnd, oldRange.to),
    newGap = after.canonical.slice(newContentEnd, lastRange.to),
    normalizationPatches =
      oldGap === newGap
        ? []
        : [{ from: contentEnd + insert.length, to: oldRange.to + insert.length, insert: newGap }];
  // The suffix's final serializer padding can change next to math/HTML blocks.
  // Keep its existing raw bytes; only the canonical layout receives this change.
  if (
    editCanonical.slice(0, contentEnd + insert.length) +
      newGap +
      editCanonical.slice(oldRange.to + insert.length) !==
    after.canonical
  )
    return;
  return {
    base: before.canonical,
    patches: [{ from: point, to: point, insert }],
    editCanonical,
    canonical: after.canonical,
    normalizationPatches,
  };
}

function rawText(node: Node, controls = false): string | undefined {
  const read: unknown = Reflect.get(node, 'rawText');
  if (typeof read !== 'function') return;
  const value: unknown = Reflect.apply(read, node, [controls]);
  return typeof value === 'string' ? value : undefined;
}

/** Consume the ranges from this exact native serialization read. Root order and
 * live identity are checked without adopting detached parser scratch nodes. */
function rootDocument(
  runtime: LegacyGlobals,
  canonical: string,
  blocks: readonly PlainBlockRange[] | undefined,
): StructuralDocumentSource | undefined {
  const editor = runtime.editor,
    capability: unknown = Reflect.get(runtime, '__MARKLYRA_NATIVE_SERIALIZATION__');
  if (
    !editor ||
    !blocks?.length ||
    !capability ||
    typeof capability !== 'object' ||
    !Object.isFrozen(capability) ||
    Reflect.get(capability, 'version') !== 1 ||
    Reflect.get(capability, 'moduleSha256') !==
      'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb'
  )
    return;
  const prototype: unknown = Reflect.get(capability, 'nodePrototype');
  if (
    !prototype ||
    typeof prototype !== 'object' ||
    Reflect.get(prototype, 'toMark') !== Reflect.get(capability, 'nodeToMark')
  )
    return;
  const leaves: StructuralSourceLeaf[] = [],
    seen = new Set<string>(),
    ending = runtime.File?.useCRLF ? '\r\n' : '\n';
  let node = editor.nodeMap.blocks.sortedFirst()?.getFirstBrother(),
    offset = 0;
  for (const block of blocks) {
    if (
      !node ||
      seen.has(node.cid) ||
      seen.size >= 200_000 ||
      node.cid !== block.id ||
      editor.getNode(block.id) !== node ||
      Object.getPrototypeOf(node) !== prototype ||
      node.get('parent') ||
      block.from !== offset ||
      block.to !== block.from + block.text.length ||
      canonical.slice(block.from, block.to) !== block.text
    )
      return;
    const type = node.get('type');
    if (typeof type !== 'string') return;
    seen.add(node.cid);
    const body = block.text.split(ending),
      lines = body.map((text) => {
        const from = offset;
        offset += text.length + ending.length;
        return { from, to: from + text.length, prefix: '', body: text };
      });
    leaves.push({
      node,
      root: node,
      type,
      body,
      contexts: [],
      lines,
      rootRange: { from: block.from, to: block.to },
    });
    offset = block.to;
    node = node.get('after');
  }
  if (node || offset !== canonical.length) return;
  return { canonical, leaves };
}

/** A trusted collapsed Enter in a source-equivalent root paragraph/heading.
 * Full DOM/model text and both range fragments establish the source position. */
export function captureRootBreak(
  runtime: LegacyGlobals,
  canonical: string,
  blocks: readonly PlainBlockRange[],
  soft: boolean,
  event: KeyboardEvent | InputEvent,
):
  | ((next: string, blocks?: readonly PlainBlockRange[]) => StructuralBreakReceipt | undefined)
  | undefined {
  const editor = runtime.editor,
    file = runtime.File;
  if (
    !editor ||
    !file ||
    !event.isTrusted ||
    event.isComposing ||
    editor.isIME ||
    editor.sourceView.inSourceMode ||
    file.isLocked
  )
    return;
  const area = editor.writingArea,
    document = area.ownerDocument,
    selection = document.getSelection(),
    anchor = selection?.anchorNode;
  if (
    !selection?.isCollapsed ||
    selection.rangeCount !== 1 ||
    !anchor ||
    !area.contains(anchor) ||
    document.activeElement?.closest('.CodeMirror,input,textarea')
  )
    return;
  const element = (
    anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement
  )?.closest<HTMLElement>('[cid]');
  if (
    !element ||
    element.parentElement !== area ||
    !element.matches('p[mdtype="paragraph"],h1,h2,h3,h4,h5,h6') ||
    element.querySelector('input,textarea,script,.CodeMirror,[contenteditable="false"]')
  )
    return;
  const node = editor.getNode(element.getAttribute('cid') ?? ''),
    text = node?.get('text');
  if (
    !node ||
    typeof text !== 'string' ||
    !text ||
    text.includes('\r') ||
    text !== element.textContent ||
    text !== rawText(element) ||
    text !== rawText(element, true)
  )
    return;
  const ending = file.useCRLF ? '\r\n' : '\n',
    policy = JSON.stringify(readMarkdownPolicy(runtime)),
    map = editor.nodeMap,
    options = file.option;
  try {
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);
    range.setEnd(anchor, selection.anchorOffset);
    const prefix = range.cloneContents();
    range.selectNodeContents(element);
    range.setStart(anchor, selection.anchorOffset);
    const suffix = range.cloneContents(),
      start = rawText(prefix),
      end = rawText(suffix);
    if (
      start === undefined ||
      end === undefined ||
      start !== prefix.textContent ||
      start !== rawText(prefix, true) ||
      end !== suffix.textContent ||
      end !== rawText(suffix, true) ||
      start + end !== text
    )
      return;
    assertPosition(text, start.length);
    const before = rootDocument(runtime, canonical, blocks),
      index = before?.leaves.findIndex((leaf) => leaf.node === node),
      leaf = index === undefined ? undefined : before?.leaves[index];
    if (!before || index === undefined || index < 0 || !leaf) return;
    const pattern: unknown = Reflect.apply(node.get, node, ['pattern']);
    const template = leaf.type === 'paragraph' ? '{0}' : pattern;
    if (typeof template !== 'string' || template.split('{0}').length !== 2) return;
    const ahead = node.get('ahead') ?? 0;
    if (!Number.isSafeInteger(ahead) || typeof ahead !== 'number' || ahead < 0) return;
    const expected =
        ending.repeat(ahead) + template.replace('{0}', () => text).replace(/\n/g, ending),
      mark = blocks[index]?.text;
    if (!mark?.startsWith(expected) || !/^[\r\n]*$/u.test(mark.slice(expected.length))) return;
    const line = leaf.lines[0];
    if (!line) return;
    const point =
      line.from +
      ahead * ending.length +
      (template.slice(0, template.indexOf('{0}')) + start).replace(/\n/g, ending).length;
    return (next, nextBlocks) => {
      if (
        runtime.editor !== editor ||
        runtime.File !== file ||
        editor.nodeMap !== map ||
        file.option !== options ||
        editor.isIME ||
        editor.sourceView.inSourceMode ||
        file.isLocked ||
        (file.useCRLF ? '\r\n' : '\n') !== ending ||
        JSON.stringify(readMarkdownPolicy(runtime)) !== policy
      )
        return;
      try {
        const after = rootDocument(runtime, next, nextBlocks);
        return after ? rootBreakReceipt(before, after, index, point, soft) : undefined;
      } catch {
        return;
      }
    };
  } catch {
    return;
  }
}

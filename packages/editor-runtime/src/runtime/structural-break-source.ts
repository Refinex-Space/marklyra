import { assertPosition, type Patch, type SourceMirrorCompletePrefix } from '@marklyra/editor-core';
import {
  indentPrefixChanges,
  readStructuralSource,
  type StructuralDocumentSource,
  type StructuralSourceLeaf,
} from './block-indent-source.js';
import type { PlainBlockRange } from './input-range.js';
import type { LegacyGlobals } from './legacy-types.js';
import { readMarkdownPolicy } from './policy-options.js';

export interface StructuralBreakReceipt {
  readonly base: string;
  readonly patches: readonly Patch[];
  readonly editCanonical: string;
  readonly canonical: string;
  readonly normalizationPatches: readonly Patch[];
  readonly completePrefixes?: readonly SourceMirrorCompletePrefix[];
}
const apply = (source: string, patches: readonly Patch[]): string => {
  let next = source;
  for (const patch of [...patches].reverse())
    next = next.slice(0, patch.from) + patch.insert + next.slice(patch.to);
  return next;
};
const samePath = (a: StructuralSourceLeaf, b: StructuralSourceLeaf): boolean =>
  a.root === b.root &&
  a.contexts.length === b.contexts.length &&
  a.contexts.every((c, i) => {
    const n = b.contexts[i];
    return (
      n &&
      c.node === n.node &&
      c.parent === n.parent &&
      c.style === n.style &&
      c.checked === n.checked
    );
  });
const unchanged = (a: StructuralSourceLeaf, b: StructuralSourceLeaf): boolean =>
  a.node === b.node &&
  a.type === b.type &&
  samePath(a, b) &&
  a.body.length === b.body.length &&
  a.body.every((line, i) => line === b.body[i]);

export function structuralBreakReceipt(
  before: StructuralDocumentSource,
  after: StructuralDocumentSource,
  index: number,
  offset: number,
  soft: boolean,
): StructuralBreakReceipt | undefined {
  const old = before.leaves[index],
    first = after.leaves[index],
    second = soft ? first : after.leaves[index + 1];
  if (
    !old ||
    old.type !== 'paragraph' ||
    first?.type !== 'paragraph' ||
    !first ||
    !second ||
    old.node !== first.node ||
    !samePath(old, first) ||
    after.leaves.length !== before.leaves.length + (soft ? 0 : 1)
  )
    return;
  const text = old.body.join('\n');
  try {
    assertPosition(text, offset);
  } catch {
    return;
  }
  const prefix = text.slice(0, offset),
    suffix = text.slice(offset);
  const splitLine = prefix.split('\n').length - 1;
  const column = prefix.slice(prefix.lastIndexOf('\n') + 1).length;
  // Original paragraph Enter consumes the existing soft newline at the split.
  // Admit that exact observed case only, preserving its serialized quote prefix.
  const consumedSoftLine =
    !soft && suffix.startsWith('\n') && second.body.join('\n') === suffix.slice(1);
  if (soft) {
    if (
      first.body.join('\n') !== prefix + '\n' + suffix ||
      first.lines.length !== old.lines.length + 1
    )
      return;
  } else {
    if (
      first.type !== 'paragraph' ||
      second.type !== 'paragraph' ||
      first.body.join('\n') !== prefix ||
      second.body.join('\n') !== (consumedSoftLine ? suffix.slice(1) : suffix) ||
      second.root !== old.root ||
      before.leaves.some((leaf) => leaf.node === second.node) ||
      old.contexts.length !== second.contexts.length
    )
      return;
    for (let i = 0; i < old.contexts.length; i++) {
      const a = old.contexts[i],
        b = second.contexts[i];
      if (!a || !b || a.type !== b.type || a.style !== b.style || a.parent !== b.parent) return;
      if (
        a.node !== b.node &&
        (i !== old.contexts.length - 1 ||
          a.type !== 'list' ||
          (a.style === 'tasklist' && Boolean(b.checked)))
      )
        return;
    }
  }
  const a = old.lines[splitLine],
    b = soft ? first.lines[splitLine] : first.lines.at(-1),
    c = soft ? first.lines[splitLine + 1] : second.lines[0];
  if (!a || !b || !c) return;
  const point = a.from + a.prefix.length + column;
  let insert = after.canonical.slice(b.to, c.from + c.prefix.length);
  if (consumedSoftLine) {
    const retained = old.lines[splitLine + 1];
    if (!retained || column !== a.body.length) return;
    const gap = before.canonical.slice(point, retained.from + retained.prefix.length);
    if (!insert.endsWith(gap)) return;
    insert = insert.slice(0, -gap.length);
  }
  if (
    !insert ||
    insert.length > 65_536 ||
    !insert.includes('\n') ||
    ![...insert].every((character) => '\r\n \t>0123456789.)+*-[]xX'.includes(character))
  )
    return;
  const patches: Patch[] = [{ from: point, to: point, insert }],
    normalization: Patch[] = [];
  for (let i = 0; i < before.leaves.length; i++) {
    const original = before.leaves[i],
      current = after.leaves[i + (!soft && i > index ? 1 : 0)];
    if (!original || !current || (i !== index && !unchanged(original, current))) return;
    for (let line = 0; line < original.lines.length; line++) {
      const from = original.lines[line];
      const to =
        i !== index || line <= splitLine
          ? current.lines[line]
          : soft
            ? first.lines[line + 1]
            : second.lines[line - splitLine - (consumedSoftLine ? 1 : 0)];
      if (!from || !to) return;
      const changes = indentPrefixChanges(from.prefix, to.prefix, from.from);
      if (!changes) return;
      for (const change of changes) {
        const oldNumber = /^(\d+)([.)][ \t]+)$/u.exec(
          before.canonical.slice(change.patch.from, change.patch.to),
        );
        const newNumber = /^(\d+)([.)][ \t]+)$/u.exec(change.patch.insert);
        if (
          change.role !== 'list-marker' ||
          !oldNumber ||
          !newNumber ||
          oldNumber[2] !== newNumber[2]
        )
          return;
        normalization.push(change.patch);
      }
    }
  }
  normalization.sort((a, b) => a.from - b.from);
  const shifted = normalization.map((patch) => ({
    ...patch,
    from: patch.from + (patch.from >= point ? insert.length : 0),
    to: patch.to + (patch.to > point ? insert.length : 0),
  }));
  const editCanonical = apply(before.canonical, patches);
  if (apply(editCanonical, shifted) !== after.canonical) return;
  return {
    base: before.canonical,
    patches,
    editCanonical,
    canonical: after.canonical,
    normalizationPatches: shifted,
  };
}

/** One original Enter/Shift+Enter on an exact plain paragraph in a
 * proved list/quote. It never authorizes arbitrary block replacement. */
export function captureStructuralBreak(
  runtime: LegacyGlobals,
  canonical: string,
  blocks: readonly PlainBlockRange[],
  soft: boolean,
): ((next: string) => StructuralBreakReceipt | undefined) | undefined {
  const editor = runtime.editor,
    file = runtime.File;
  if (!editor || !file || editor.isIME || editor.sourceView.inSourceMode || file.isLocked) return;
  const area = editor.writingArea,
    doc = area.ownerDocument,
    selection = doc.getSelection();
  if (
    !selection?.isCollapsed ||
    selection.rangeCount !== 1 ||
    !selection.anchorNode ||
    !area.contains(selection.anchorNode) ||
    doc.activeElement?.closest('.CodeMirror,input,textarea')
  )
    return;
  const paragraph = (
    selection.anchorNode.nodeType === 1
      ? (selection.anchorNode as Element)
      : selection.anchorNode.parentElement
  )?.closest<HTMLElement>('p[cid]');
  if (
    !paragraph ||
    paragraph.parentElement === area ||
    paragraph.querySelector('[md-inline]:not([md-inline="plain"]):not([md-inline="softbreak"])')
  )
    return;
  const node = editor.getNode(paragraph.getAttribute('cid') ?? ''),
    text = node?.get('text');
  if (!node || typeof text !== 'string' || !text || paragraph.textContent !== text) return;
  let offset: number;
  try {
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(paragraph);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    offset = range.cloneContents().textContent?.length ?? 0;
    assertPosition(text, offset);
  } catch {
    return;
  }
  const ending = file.useCRLF ? '\r\n' : '\n',
    policy = JSON.stringify(readMarkdownPolicy(runtime)),
    map = editor.nodeMap,
    option = file.option;
  try {
    const before = readStructuralSource(runtime, canonical, ending, blocks, true);
    const index = before?.leaves.findIndex(
      (leaf) => leaf.node === node && leaf.type === 'paragraph' && leaf.contexts.length > 0,
    );
    if (
      !before ||
      index === undefined ||
      index < 0 ||
      before.leaves[index]?.body.join('\n') !== text
    )
      return;
    return (next) => {
      if (
        runtime.editor !== editor ||
        runtime.File !== file ||
        editor.nodeMap !== map ||
        file.option !== option ||
        editor.isIME ||
        editor.sourceView.inSourceMode ||
        file.isLocked ||
        (file.useCRLF ? '\r\n' : '\n') !== ending ||
        JSON.stringify(readMarkdownPolicy(runtime)) !== policy
      )
        return;
      try {
        const after = readStructuralSource(runtime, next, ending, undefined, true);
        return after ? structuralBreakReceipt(before, after, index, offset, soft) : undefined;
      } catch {
        return;
      }
    };
  } catch {
    return;
  }
}

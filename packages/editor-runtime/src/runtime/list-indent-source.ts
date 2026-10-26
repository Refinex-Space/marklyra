import type { Patch } from '@marklyra/editor-core';
import type { PlainBlockRange } from './input-range.js';
import type { LegacyEditor, LegacyNode } from './legacy-types.js';

export type ListIndentAction = 'indent' | 'outdent';
export interface ListIndentReceipt {
  readonly base: string;
  /** The actual indentation edit, in the previous canonical coordinates. */
  readonly patches: readonly Patch[];
  readonly editCanonical: string;
  readonly canonical: string;
  /** Proven container padding, in editCanonical coordinates; never a raw edit. */
  readonly normalizationPatches: readonly Patch[];
}
interface Item {
  readonly node: LegacyNode;
  readonly paragraph: LegacyNode;
  readonly text: string;
  readonly line: string;
  readonly from: number;
}
const get = (node: LegacyNode, key: string): unknown => Reflect.apply(node.get, node, [key]);
function children(node: LegacyNode, type: string): LegacyNode[] | undefined {
  const output: LegacyNode[] = [],
    seen = new Set<LegacyNode>();
  for (let child = node.getFirstChild(); child; child = child.get('after')) {
    if (
      seen.has(child) ||
      seen.size >= 10_000 ||
      get(child, 'parent') !== node ||
      child.get('type') !== type
    )
      return;
    seen.add(child);
    output.push(child);
  }
  return output;
}
function onlyParagraph(item: LegacyNode): LegacyNode | undefined {
  const paragraph = item.getFirstChild();
  if (
    paragraph?.get('type') !== 'paragraph' ||
    get(paragraph, 'parent') !== item ||
    paragraph.get('after') ||
    paragraph.getFirstChild()
  )
    return;
  return paragraph;
}
function elementNode(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}
/** A deliberately narrow structural receipt: indent the final, single-paragraph
 * item of a flat top-level list under its previous sibling. Source positions
 * follow complete model order, so duplicate text never selects an occurrence.
 * Nested, loose, multi-paragraph and cross-item edits stay unproved. */
export function captureListIndent(
  editor: LegacyEditor,
  canonical: string,
  blocks: readonly PlainBlockRange[],
  action: ListIndentAction,
  ending: '\n' | '\r\n',
): ((next: string) => ListIndentReceipt | undefined) | undefined {
  if (action !== 'indent' || editor.sourceView.inSourceMode) return;
  const document = editor.writingArea.ownerDocument,
    selection = document.getSelection();
  if (
    selection?.rangeCount !== 1 ||
    !selection.isCollapsed ||
    !selection.anchorNode ||
    !selection.focusNode
  )
    return;
  const paragraphElement = elementNode(selection.anchorNode)?.closest<HTMLElement>(
    'p[mdtype="paragraph"][cid]',
  );
  if (
    !paragraphElement?.contains(selection.focusNode) ||
    !editor.writingArea.contains(paragraphElement)
  )
    return;
  const itemElement = paragraphElement.parentElement,
    rootElement = itemElement?.parentElement;
  if (
    !itemElement?.matches('li[mdtype="list_item"][cid]') ||
    !rootElement?.matches('[mdtype="list"][cid]') ||
    rootElement.parentElement !== editor.writingArea
  )
    return;
  const rootId = rootElement.getAttribute('cid'),
    targetId = itemElement.getAttribute('cid');
  const root = rootId ? editor.getNode(rootId) : undefined;
  if (root?.get('type') !== 'list' || root.get('parent') || root.get('tail') !== 1) return;
  const nodes = children(root, 'list_item');
  if (!nodes || nodes.length < 2 || rootElement.children.length !== nodes.length) return;
  const selected = nodes.at(-1),
    previous = nodes.at(-2);
  if (!selected || !previous || selected.cid !== targetId || selected.get('after')) return;
  const block = blocks.find((entry) => entry.id === rootId);
  if (
    !block ||
    !Number.isSafeInteger(block.from) ||
    block.from < 0 ||
    !Number.isSafeInteger(block.to) ||
    block.to > canonical.length ||
    canonical.slice(block.from, block.to) !== block.text
  )
    return;
  const mark = root.toMark();
  // The only admitted suffix is the source inter-root separator. Final-block
  // wrappers and unusual ahead/tail layouts need their own explicit receipt.
  if (block.text !== mark + ending || !root.get('after')) return;
  const lines = mark.split(ending),
    items: Item[] = [];
  if (lines.length !== nodes.length + 1 || lines.at(-1) !== '') return;
  let offset = block.from;
  for (let index = 0; index < nodes.length; index++) {
    const item = nodes[index],
      line = lines[index],
      dom = rootElement.children[index];
    if (!item || line === undefined || !dom || dom.getAttribute('cid') !== item.cid) return;
    const paragraph = onlyParagraph(item),
      text = paragraph?.get('text');
    if (
      !paragraph ||
      typeof text !== 'string' ||
      !text ||
      /[\r\n\u200b\uE027]/u.test(text) ||
      !line.endsWith(text)
    )
      return;
    const prefix = line.slice(0, line.length - text.length);
    if (
      !/^(?:[-+*]|\d+[.)]) (?:\[[ xX]\] )?$/u.test(prefix) ||
      (paragraphElement.getAttribute('cid') === paragraph.cid && item !== selected)
    )
      return;
    if (item === selected && paragraphElement.getAttribute('cid') !== paragraph.cid) return;
    items.push({ node: item, paragraph, text, line, from: offset });
    offset += line.length + ending.length;
  }
  const target = items.at(-1),
    prior = items.at(-2);
  if (!target || !prior) return;
  const afterRoot = root.get('after');
  return (next) => {
    if (
      editor.sourceView.inSourceMode ||
      document !== editor.writingArea.ownerDocument ||
      editor.getNode(root.cid) !== root ||
      root.get('after') !== afterRoot ||
      root.get('tail') !== 1 ||
      root.get('parent') ||
      !editor.writingArea.contains(rootElement)
    )
      return;
    const survivors = children(root, 'list_item');
    if (
      !survivors ||
      survivors.length !== nodes.length - 1 ||
      survivors.some((node, index) => node !== nodes[index])
    )
      return;
    const nested = prior.paragraph.get('after');
    if (
      nested?.get('type') !== 'list' ||
      nested.get('parent') !== previous ||
      nested.get('after') ||
      nested.get('tail') !== 1 ||
      nested.getFirstChild() !== selected ||
      selected.get('after') ||
      selected.get('parent') !== nested ||
      selected.getFirstChild() !== target.paragraph ||
      target.paragraph.get('after')
    )
      return;
    for (const item of items) {
      if (
        editor.getNode(item.node.cid) !== item.node ||
        editor.getNode(item.paragraph.cid) !== item.paragraph ||
        item.paragraph.get('text') !== item.text ||
        item.paragraph.getFirstChild() ||
        item.node.getFirstChild() !== item.paragraph ||
        item.paragraph.get('parent') !== item.node ||
        (item !== prior && item.paragraph.get('after'))
      )
        return;
    }
    const actualMark = root.toMark(),
      actualLines = actualMark.split(ending);
    if (
      (actualLines.length !== lines.length && actualLines.length !== lines.length + 1) ||
      actualLines.slice(items.length).some((line) => line !== '') ||
      actualLines.slice(0, items.length - 1).some((line, index) => line !== lines[index])
    )
      return;
    const changedLine = actualLines[items.length - 1];
    if (!changedLine?.endsWith(target.line)) return;
    const indent = changedLine.slice(0, changedLine.length - target.line.length);
    if (!/^(?: {2,5}|\t)$/u.test(indent)) return;
    const patch = { from: target.from, to: target.from, insert: indent };
    const editCanonical = canonical.slice(0, patch.from) + indent + canonical.slice(patch.to);
    const normalizationAt = block.to + indent.length;
    const padding = actualLines.length === lines.length ? '' : ending;
    if (
      canonical.slice(0, block.from) + actualMark + ending + canonical.slice(block.to) !== next ||
      editCanonical.slice(0, normalizationAt) + padding + editCanonical.slice(normalizationAt) !==
        next
    )
      return;
    return {
      base: canonical,
      patches: [patch],
      editCanonical,
      canonical: next,
      normalizationPatches: padding
        ? [{ from: normalizationAt, to: normalizationAt, insert: padding }]
        : [],
    };
  };
}

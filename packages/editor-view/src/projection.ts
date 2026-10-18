import type { Selection } from '@marklyra/editor-core';
import type { Block, Inline } from '@marklyra/editor-markdown';
export interface Segment {
  readonly node: Text;
  readonly from: number;
  readonly to: number;
}
export interface Projection {
  element: HTMLElement;
  block: Block;
  active: boolean;
  markerKey: string;
  segments: Segment[];
}
const tags = {
  strong: 'strong',
  emphasis: 'em',
  strike: 's',
  code: 'code',
  link: 'a',
  text: 'span',
} as const;
export function visibleEnd(block: Block): number {
  return block.to - (block.raw.match(/(?:\r\n|\r|\n)$/)?.[0].length ?? 0);
}
export function expandedMarkers(block: Block, selection: Selection): Set<number> {
  const start = Math.min(selection.anchor, selection.head),
    end = Math.max(selection.anchor, selection.head);
  const expanded = new Set<number>();
  const visit = (node: Inline): void => {
    if (node.kind !== 'text' && start <= node.to && end >= node.from)
      expanded.add(node.from - block.from);
    for (const child of node.children) visit(child);
  };
  for (const node of block.inlines) visit(node);
  return expanded;
}
export function projectBlock(
  doc: Document,
  source: string,
  block: Block,
  active: boolean,
  expanded: ReadonlySet<number>,
): Projection {
  const tag =
    block.kind === 'heading'
      ? `h${block.level}`
      : block.kind === 'quote'
        ? 'blockquote'
        : block.kind === 'code' || block.kind === 'frontmatter'
          ? 'pre'
          : 'div';
  const element = doc.createElement(tag);
  element.className = `tr-block tr-${block.kind}`;
  element.dataset.block = '';
  element.dataset.active = String(active);
  const projection: Projection = {
    element,
    block,
    active,
    markerKey: [...expanded].join(','),
    segments: [],
  };
  const text = (parent: Node, from: number, to: number, marker = false) => {
    if (to <= from) return;
    const node = doc.createTextNode(source.slice(from, to));
    projection.segments.push({ node, from: from - block.from, to: to - block.from });
    if (marker) {
      const span = doc.createElement('span');
      span.className = 'tr-marker';
      span.append(node);
      parent.appendChild(span);
    } else parent.appendChild(node);
  };
  const inline = (parent: Node, node: Inline) => {
    if (node.kind === 'text') {
      text(parent, node.from, node.to);
      return;
    }
    const showMarkers = expanded.has(node.from - block.from);
    if (showMarkers) text(parent, node.from, node.contentFrom, true);
    const span = doc.createElement(tags[node.kind]);
    // Links remain inert inside the editor: selection never navigates or opens a URL.
    if (node.destination) span.title = node.destination;
    if (node.children.length)
      node.children.forEach((child) => {
        inline(span, child);
      });
    else text(span, node.contentFrom, node.contentTo);
    parent.appendChild(span);
    if (showMarkers) text(parent, node.contentTo, node.to, true);
  };
  const start = block.from + (source[block.from] === '\uFEFF' ? 1 : 0);
  if (block.kind === 'frontmatter' || block.kind === 'rule')
    text(element, start, visibleEnd(block));
  else {
    if (active) text(element, start, block.contentFrom, true);
    if (block.inlines.length)
      block.inlines.forEach((node) => {
        inline(element, node);
      });
    else text(element, block.contentFrom, block.contentTo);
    if (active) text(element, block.contentTo, visibleEnd(block), true);
  }
  if (!active && block.kind === 'list-item') {
    const prefix = source.slice(start, block.contentFrom);
    element.dataset.bullet = /\[[ xX]\]/.test(prefix)
      ? /\[[xX]\]/.test(prefix)
        ? '☑'
        : '☐'
      : (prefix.match(/\d+[.)]/)?.[0] ?? '•');
    element.style.paddingInlineStart = `${Math.min(block.level + 2, 24)}ch`;
  }
  if (!element.childNodes.length) element.appendChild(doc.createElement('br'));
  return projection;
}
export function sourcePoint(projection: Projection, node: Node, offset: number): number {
  const direct = projection.segments.find((segment) => segment.node === node);
  if (direct)
    return projection.block.from + direct.from + Math.min(offset, direct.to - direct.from);
  // Element-container offsets refer to child boundaries, never source characters.
  const children = node.childNodes;
  const next = children[offset];
  if (next) {
    const segment = projection.segments.find(
      (item) => next === item.node || next.contains(item.node),
    );
    if (segment) return projection.block.from + segment.from;
  }
  const previous = children[Math.max(0, offset - 1)];
  if (previous) {
    const segment = [...projection.segments]
      .reverse()
      .find((item) => previous === item.node || previous.contains(item.node));
    if (segment) return projection.block.from + segment.to;
  }
  return offset === 0 ? projection.block.contentFrom : projection.block.contentTo;
}
export function domPoint(projection: Projection, position: number): [Node, number] {
  const relative = position - projection.block.from;
  for (const segment of projection.segments) {
    if (relative >= segment.from && relative <= segment.to)
      return [segment.node, relative - segment.from];
  }
  // A hidden delimiter maps to the closest visible endpoint. Activation reveals it first.
  let best: [Node, number] = [projection.element, 0],
    distance = Number.POSITIVE_INFINITY;
  for (const segment of projection.segments) {
    for (const [source, offset] of [
      [segment.from, 0],
      [segment.to, segment.node.length],
    ]) {
      if (source !== undefined && offset !== undefined && Math.abs(relative - source) < distance) {
        distance = Math.abs(relative - source);
        best = [segment.node, offset];
      }
    }
  }
  return best;
}

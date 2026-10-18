import type { OutlineEntry } from '@marklyra/editor-runtime';

export interface OutlineNode extends OutlineEntry {
  children: OutlineNode[];
}

/** Return UTF-16 bounds for a literal, case-insensitive outline filter. */
export function outlineMatch(text: string, query: string): { from: number; to: number } | null {
  if (!query.trim()) return null;
  const match = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').exec(text);
  return match ? { from: match.index, to: match.index + match[0].length } : null;
}

/** Heading levels may skip numbers; their nearest preceding lower level owns them. */
export function outlineTree(entries: readonly OutlineEntry[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const ancestors: OutlineNode[] = [];
  for (const entry of entries) {
    const node: OutlineNode = { ...entry, children: [] };
    while (ancestors.length && (ancestors.at(-1)?.level ?? 0) >= node.level) ancestors.pop();
    const parent = ancestors.at(-1);
    (parent?.children ?? roots).push(node);
    ancestors.push(node);
  }
  return roots;
}

export function visibleOutline(nodes: readonly OutlineNode[], collapsed: ReadonlySet<string>) {
  const result: OutlineNode[] = [];
  const visit = (items: readonly OutlineNode[]) => {
    for (const item of items) {
      result.push(item);
      if (!collapsed.has(item.id)) visit(item.children);
    }
  };
  visit(nodes);
  return result;
}

/** A collapsed ancestor represents its active descendant, as in the original outline. */
export function visibleCurrentHeading(
  nodes: readonly OutlineNode[],
  collapsed: ReadonlySet<string>,
  id: string | null,
): string | null {
  if (!id) return null;
  const contains = (node: OutlineNode): boolean => node.id === id || node.children.some(contains);
  for (const node of nodes) {
    if (!contains(node)) continue;
    if (node.id === id || collapsed.has(node.id)) return node.id;
    return visibleCurrentHeading(node.children, collapsed, id);
  }
  return null;
}

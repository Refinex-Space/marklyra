import type { LayoutNode } from './model.js';

export interface LayoutGroup extends LayoutNode {
  members: LayoutNode[];
  groupSize: number;
}
/** Bounds force-simulation allocation independently of the visible graph size.
 * Groups are layout scaffolding only; they never become document nodes or relationships.
 */
export function coarseLayout(
  nodes: LayoutNode[],
  edges: { source: string; target: string }[],
  maximum = 256,
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adjacent = new Map<string, string[]>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!adjacent.has(edge.source)) adjacent.set(edge.source, []);
    if (!adjacent.has(edge.target)) adjacent.set(edge.target, []);
    adjacent.get(edge.source)?.push(edge.target);
    adjacent.get(edge.target)?.push(edge.source);
  }
  const membership = new Map<string, string>(),
    groups: LayoutGroup[] = [];
  const capacity = Math.max(1, Math.ceil(nodes.length / maximum));
  let cursor = 0;
  while (membership.size < nodes.length) {
    const id = `layout:${groups.length}`,
      members: LayoutNode[] = [],
      queue: string[] = [];
    let head = 0;
    while (members.length < capacity && membership.size < nodes.length) {
      let next = queue[head];
      if (next !== undefined) head++;
      if (next === undefined) {
        while (cursor < nodes.length && membership.has(nodes[cursor]?.id ?? '')) cursor++;
        next = nodes[cursor++]?.id;
      }
      if (next === undefined) break;
      if (membership.has(next)) continue;
      const node = byId.get(next);
      if (!node) continue;
      members.push(node);
      membership.set(next, id);
      for (const neighbor of adjacent.get(next) ?? [])
        if (!membership.has(neighbor)) queue.push(neighbor);
    }
    const anchors = members.filter((n) => n.pinned),
      basis = anchors.length ? anchors : members,
      spatial = basis.every((n) => n.z !== undefined);
    groups.push({
      id,
      members,
      groupSize: members.length,
      pinned: anchors.length > 0,
      x: basis.reduce((sum, n) => sum + n.x, 0) / basis.length,
      y: basis.reduce((sum, n) => sum + n.y, 0) / basis.length,
      ...(spatial ? { z: basis.reduce((sum, n) => sum + (n.z ?? 0), 0) / basis.length } : {}),
    });
  }
  const pairs = new Map<string, { source: string; target: string }>();
  for (const edge of edges) {
    const a = membership.get(edge.source),
      b = membership.get(edge.target);
    if (a && b && a !== b) {
      const [source, target] = [a, b].sort();
      if (source && target) pairs.set(`${source}/${target}`, { source, target });
    }
  }
  return { groups, edges: [...pairs.values()] };
}

/** `spatial` spreads members over a sphere around a group that carries `z`; otherwise over a disc. */
export function expandGroups(groups: LayoutGroup[], spatial = false) {
  for (const group of groups)
    group.members.forEach((node, i) => {
      if (node.pinned) return;
      const angle = i * 2.399963229728653;
      if (spatial && group.z !== undefined) {
        const height = 1 - (2 * (i + 0.5)) / group.members.length,
          ring = Math.sqrt(Math.max(0, 1 - height * height)),
          radius = 14 * Math.cbrt(i + 0.5);
        node.x = group.x + Math.cos(angle) * ring * radius;
        node.y = group.y + Math.sin(angle) * ring * radius;
        node.z = group.z + height * radius;
        return;
      }
      const radius = 12 * Math.sqrt(i + 0.5);
      node.x = group.x + Math.cos(angle) * radius;
      node.y = group.y + Math.sin(angle) * radius;
    });
}

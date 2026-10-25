import { displayPath } from '../../services/display-path.js';
export interface GraphNode {
  id: string;
  path: string | null;
  title: string;
  tags: string[];
  incoming: number;
  outgoing: number;
  state: 'ready' | 'stale' | 'missing' | 'ambiguous';
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  anchorMissing: boolean;
}
export interface GraphSnapshot {
  generation: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNotes: number;
  totalEdges: number;
  unresolved: number;
  truncated: boolean;
  folders: string[];
  tags: string[];
}
export interface GraphQuery {
  focus: string | null;
  depth: number;
  filter: string;
  folder: string;
  tag: string;
  showMissing: boolean;
  showOrphans: boolean;
  limit: number;
}
export const defaultQuery: GraphQuery = {
  focus: null,
  depth: 1,
  filter: '',
  folder: '',
  tag: '',
  showMissing: true,
  showOrphans: true,
  limit: 2000,
};
export interface Position {
  x: number;
  y: number;
  pinned: boolean;
}
export interface GraphView {
  version: 1;
  query: GraphQuery;
  positions: Record<string, Position>;
  camera: { x: number; y: number; ratio: number } | null;
  particles: boolean;
}
export interface IndexStatus {
  generation: number;
  working: boolean;
  complete: boolean;
  scanned: number;
  parsed: number;
  unchanged: number;
  unreadable: number;
  skipped: number;
  resolved: number;
  elapsedMs: number;
  watcher: boolean;
  error: string | null;
  sqliteVersion: string;
}
export interface GraphReference {
  source: string;
  target: string | null;
  destination: string;
  status: string;
  fragment: string;
  anchorMissing: boolean;
  candidates: string[];
  sourceFingerprint: string;
  wiki: boolean;
  line: number;
  column: number;
  matchLength: number;
  expectedText: string;
  preview: string;
}
export interface ReferencePage {
  items: GraphReference[];
  total: number;
  offset: number;
}
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  pinned: boolean;
}
export type LayoutRequest =
  | {
      type: 'layout';
      epoch: number;
      nodes: LayoutNode[];
      edges: { source: string; target: string }[];
      reduced: boolean;
      settled: boolean;
    }
  | {
      type: 'drag';
      epoch: number;
      serial: number;
      id: string;
      x: number;
      y: number;
      end: boolean;
      pinned: boolean;
    }
  | { type: 'stop' }
  | { type: 'motion'; reduced: boolean };
export interface LayoutResult {
  epoch: number;
  serial: number;
  ids: string[];
  positions: Float32Array;
  done: boolean;
}

export function seedPosition(id: string, index: number): Position {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  const angle = ((hash >>> 0) / 0x100000000) * Math.PI * 2;
  const radius = 20 + Math.sqrt(index + 1) * 12;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, pinned: false };
}
export function validView(value: unknown): value is GraphView {
  if (!value || typeof value !== 'object') return false;
  const v = value as GraphView;
  const finite = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1e8;
  if (
    v.version !== 1 ||
    !v.query ||
    !v.positions ||
    Array.isArray(v.positions) ||
    typeof v.particles !== 'boolean'
  )
    return false;
  if (
    !Number.isInteger(v.query.depth) ||
    !Number.isInteger(v.query.limit) ||
    v.query.depth < 1 ||
    v.query.depth > 2 ||
    v.query.limit < 1 ||
    v.query.limit > 5000
  )
    return false;
  if (
    typeof v.query.filter !== 'string' ||
    v.query.filter.length > 256 ||
    typeof v.query.folder !== 'string' ||
    v.query.folder.length > 4096 ||
    typeof v.query.tag !== 'string' ||
    v.query.tag.length > 512
  )
    return false;
  if (
    typeof v.query.showMissing !== 'boolean' ||
    typeof v.query.showOrphans !== 'boolean' ||
    (v.query.focus !== null && (typeof v.query.focus !== 'string' || v.query.focus.length > 4096))
  )
    return false;
  if (
    Object.keys(v.positions).length > 5000 ||
    Object.entries(v.positions).some(
      ([id, p]) =>
        id.length > 4096 || !p || !finite(p.x) || !finite(p.y) || typeof p.pinned !== 'boolean',
    )
  )
    return false;
  return (
    v.camera === null ||
    (!!v.camera &&
      finite(v.camera.x) &&
      finite(v.camera.y) &&
      finite(v.camera.ratio) &&
      v.camera.ratio >= 0.035 &&
      v.camera.ratio <= 20)
  );
}

export function relativeGraphPath(path: string | null, root: string): string | null {
  if (!path) return null;
  // This is a presentation hint only. The native index and document service recheck scope.
  const normalize = (value: string) => displayPath(value).replace(/\\/g, '/').replace(/\/$/, '');
  const full = normalize(path),
    base = normalize(root),
    windows = /^[a-z]:\//i.test(base) || base.startsWith('//');
  const inside = windows
    ? full.toLowerCase().startsWith(`${base.toLowerCase()}/`)
    : full.startsWith(`${base}/`);
  return inside ? full.slice(base.length + 1) : null;
}

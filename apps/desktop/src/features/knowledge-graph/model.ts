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
  /** Present only for positions produced by the 3D layout. */
  z?: number;
  pinned: boolean;
}
export type GraphMode = '2d' | '3d';
/** Orbit camera: rotation in radians, `ratio` is the zoom (1 fits the whole graph), x/y/z the look-at point. */
export interface Camera3D {
  yaw: number;
  pitch: number;
  ratio: number;
  x: number;
  y: number;
  z: number;
}
export interface GraphView {
  /** Version 1 predates the 3D view; its missing fields read as the defaults below. */
  version: 1 | 2;
  query: GraphQuery;
  positions: Record<string, Position>;
  camera: { x: number; y: number; ratio: number } | null;
  particles: boolean;
  mode?: GraphMode;
  camera3d?: Camera3D | null;
  autoRotate?: boolean;
  folderColors?: boolean;
}
export const maxPitch = 1.5;
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
  z?: number;
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
export type Layout3Request =
  | {
      type: 'layout';
      epoch: number;
      nodes: (LayoutNode & { z: number })[];
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
      z: number;
      end: boolean;
      pinned: boolean;
    }
  | { type: 'stop' }
  | { type: 'motion'; reduced: boolean };
/** Same as `LayoutResult`, with three coordinates per node. */
export type Layout3Result = LayoutResult;

export function seedPosition(id: string, index: number): Position {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  const angle = ((hash >>> 0) / 0x100000000) * Math.PI * 2;
  const radius = 20 + Math.sqrt(index + 1) * 12;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, pinned: false };
}
function hash32(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  return hash >>> 0;
}
/** Deterministic spread over a sphere whose radius grows with the node count. */
export function seedPosition3(id: string, index: number): Position & { z: number } {
  const hash = hash32(id);
  let mixed = Math.imul(hash ^ (hash >>> 15), 2246822519);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 3266489917);
  mixed = (mixed ^ (mixed >>> 16)) >>> 0;
  const angle = (hash / 0x100000000) * Math.PI * 2,
    cosine = 1 - 2 * (mixed / 0x100000000),
    sine = Math.sqrt(Math.max(0, 1 - cosine * cosine)),
    radius = 24 + Math.cbrt(index + 1) * 26;
  return {
    x: Math.cos(angle) * sine * radius,
    y: Math.sin(angle) * sine * radius,
    z: cosine * radius,
    pinned: false,
  };
}
export function validView(value: unknown): value is GraphView {
  if (!value || typeof value !== 'object') return false;
  const v = value as GraphView;
  const finite = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1e8;
  if (
    (v.version !== 1 && v.version !== 2) ||
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
        id.length > 4096 ||
        !p ||
        !finite(p.x) ||
        !finite(p.y) ||
        (p.z !== undefined && !finite(p.z)) ||
        typeof p.pinned !== 'boolean',
    )
  )
    return false;
  if (
    (v.mode !== undefined && v.mode !== '2d' && v.mode !== '3d') ||
    (v.autoRotate !== undefined && typeof v.autoRotate !== 'boolean') ||
    (v.folderColors !== undefined && typeof v.folderColors !== 'boolean')
  )
    return false;
  const c = v.camera3d;
  if (
    c !== undefined &&
    c !== null &&
    !(
      typeof c === 'object' &&
      finite(c.yaw) &&
      finite(c.pitch) &&
      Math.abs(c.pitch) <= maxPitch + 1e-6 &&
      finite(c.x) &&
      finite(c.y) &&
      finite(c.z) &&
      Number.isFinite(c.ratio) &&
      c.ratio >= 0.035 &&
      c.ratio <= 20
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

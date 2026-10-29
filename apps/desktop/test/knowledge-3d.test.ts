import { describe, expect, it } from 'vitest';
import {
  basis,
  clampPitch,
  fitDistance,
  intersectPlane,
  pixelRay,
  project,
  type Rig,
  unitsPerPixel,
  viewProjection,
  wrapYaw,
} from '../src/features/knowledge-graph/camera3d.js';
import { coarseLayout, expandGroups } from '../src/features/knowledge-graph/coarse-layout.js';
import {
  defaultQuery,
  maxPitch,
  seedPosition3,
  validView,
} from '../src/features/knowledge-graph/model.js';

const rig = (patch: Partial<Rig> = {}): Rig => ({
  yaw: 0,
  pitch: 0,
  distance: 500,
  target: [0, 0, 0],
  ...patch,
});
const width = 800,
  height = 600;
function matrixFor(value: Rig) {
  return viewProjection(value, width / height, 5, 5000);
}

describe('3D camera', () => {
  it('projects the look-at point to the centre and keeps depth equal to the distance', () => {
    const p = project(matrixFor(rig()), 0, 0, 0, width, height);
    expect(p.inside).toBe(true);
    expect(p.x).toBeCloseTo(width / 2, 3);
    expect(p.y).toBeCloseTo(height / 2, 3);
    expect(p.depth).toBeCloseTo(500, 3);
  });
  it('keeps world +x to the right and +y up on screen at the default orientation', () => {
    const m = matrixFor(rig());
    const right = project(m, 50, 0, 0, width, height);
    const up = project(m, 0, 50, 0, width, height);
    expect(right.x).toBeGreaterThan(width / 2);
    expect(up.y).toBeLessThan(height / 2);
  });
  it('makes nearer points larger on screen and rejects points behind the eye', () => {
    const m = matrixFor(rig());
    const near = project(m, 50, 0, 200, width, height);
    const far = project(m, 50, 0, -200, width, height);
    expect(near.x - width / 2).toBeGreaterThan(far.x - width / 2);
    expect(near.depth).toBeLessThan(far.depth);
    expect(project(m, 0, 0, 900, width, height).inside).toBe(false);
  });
  it('orbits around the target: yaw swings the eye sideways, pitch lifts it', () => {
    const left = basis(rig({ yaw: Math.PI / 2 }));
    expect(left.eye[0]).toBeCloseTo(500, 3);
    expect(Math.abs(left.eye[2])).toBeLessThan(1e-6);
    const high = basis(rig({ pitch: 0.5 }));
    expect(high.eye[1]).toBeGreaterThan(200);
    expect(high.forward[1]).toBeLessThan(0);
  });
  it('unprojects a pixel onto the plane through a point and round-trips through project', () => {
    const value = rig({ yaw: 0.7, pitch: 0.4 }),
      m = matrixFor(value),
      anchor: [number, number, number] = [30, -20, 15];
    const screen = project(m, ...anchor, width, height);
    const ray = pixelRay(value, width, height, screen.x, screen.y);
    const hit = intersectPlane(ray, anchor, basis(value).forward);
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(anchor[0], 3);
    expect(hit?.[1]).toBeCloseTo(anchor[1], 3);
    expect(hit?.[2]).toBeCloseTo(anchor[2], 3);
  });
  it('has no intersection with a plane the ray runs parallel to', () => {
    const ray = pixelRay(rig(), width, height, width / 2, height / 2);
    expect(intersectPlane(ray, [0, 0, 0], [1, 0, 0])).toBeNull();
  });
  it('clamps pitch away from the poles and wraps yaw into one turn', () => {
    expect(clampPitch(9)).toBe(maxPitch);
    expect(clampPitch(-9)).toBe(-maxPitch);
    expect(wrapYaw(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(wrapYaw(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 9);
    expect(wrapYaw(0.25)).toBeCloseTo(0.25, 9);
  });
  it('fits a bounding sphere inside the viewport on both axes', () => {
    for (const aspect of [0.5, 1, 2]) {
      const distance = fitDistance(300, aspect);
      const value = rig({ distance }),
        m = viewProjection(value, aspect, 1, 10000);
      const edge = project(m, 300, 0, 0, 1000 * aspect, 1000),
        top = project(m, 0, 300, 0, 1000 * aspect, 1000);
      expect(edge.x).toBeLessThanOrEqual(1000 * aspect);
      expect(edge.x).toBeGreaterThanOrEqual(0);
      expect(top.y).toBeGreaterThanOrEqual(0);
    }
    expect(unitsPerPixel(500, 600)).toBeGreaterThan(0);
  });
});

describe('3D positions and views', () => {
  it('seeds deterministic points on a sphere that grows with the node count', () => {
    const a = seedPosition3('Notes/a.md', 3),
      again = seedPosition3('Notes/a.md', 3);
    expect(a).toEqual(again);
    const radius = Math.hypot(a.x, a.y, a.z);
    expect(radius).toBeCloseTo(24 + Math.cbrt(4) * 26, 6);
    const far = seedPosition3('x', 4999);
    expect(Math.hypot(far.x, far.y, far.z)).toBeGreaterThan(radius);
    const z = Array.from({ length: 200 }, (_, i) => seedPosition3(`n${i}`, 10).z);
    expect(Math.max(...z)).toBeGreaterThan(0);
    expect(Math.min(...z)).toBeLessThan(0);
  });
  const view = {
    version: 2,
    query: defaultQuery,
    positions: { 'a.md': { x: 1, y: 2, z: 3, pinned: false } },
    camera: null,
    camera3d: { yaw: 0.5, pitch: 0.3, ratio: 1, x: 0, y: 0, z: 0 },
    mode: '3d',
    autoRotate: false,
    folderColors: true,
    particles: false,
  };
  it('accepts a complete version 2 view and a version 1 view without the new fields', () => {
    expect(validView(view)).toBe(true);
    const legacy = {
      version: 1,
      query: defaultQuery,
      positions: { 'a.md': { x: 1, y: 2, pinned: false } },
      camera: { x: 0.5, y: 0.5, ratio: 1 },
      particles: false,
    };
    expect(validView(legacy)).toBe(true);
  });
  it('rejects invalid 3D geometry, modes and unknown versions', () => {
    expect(validView({ ...view, version: 3 })).toBe(false);
    expect(validView({ ...view, mode: '4d' })).toBe(false);
    expect(validView({ ...view, autoRotate: 'yes' })).toBe(false);
    expect(validView({ ...view, folderColors: 1 })).toBe(false);
    expect(
      validView({ ...view, positions: { 'a.md': { x: 1, y: 2, z: Infinity, pinned: false } } }),
    ).toBe(false);
    expect(validView({ ...view, camera3d: { ...view.camera3d, pitch: 3 } })).toBe(false);
    expect(validView({ ...view, camera3d: { ...view.camera3d, ratio: 1e-300 } })).toBe(false);
    expect(validView({ ...view, camera3d: { ...view.camera3d, yaw: Number.NaN } })).toBe(false);
    expect(validView({ ...view, camera3d: null })).toBe(true);
  });
});

describe('3D bounded layout', () => {
  it('groups carry a centre in 3D and expansion fills a volume without touching pinned nodes', () => {
    const nodes = Array.from({ length: 1500 }, (_, i) => ({
      id: `n${i}`,
      ...seedPosition3(`n${i}`, i),
      pinned: i === 27,
    }));
    const pinned = { ...nodes[27] };
    const { groups } = coarseLayout(nodes, []);
    expect(groups.length).toBeLessThanOrEqual(256);
    expect(groups.every((g) => g.z !== undefined)).toBe(true);
    expandGroups(groups, true);
    expect(nodes.every((n) => [n.x, n.y, n.z].every(Number.isFinite))).toBe(true);
    expect(nodes[27]).toEqual(pinned);
    const members = groups.find((g) => g.members.length > 4)?.members ?? [];
    const zs = members.map((n) => n.z as number);
    expect(zs.length).toBeGreaterThan(4);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1);
  });
  it('keeps the flat expansion when the nodes have no depth', () => {
    const nodes = Array.from({ length: 1200 }, (_, i) => ({
      id: `n${i}`,
      x: i,
      y: -i,
      pinned: false,
    }));
    const { groups } = coarseLayout(nodes, []);
    expect(groups.every((g) => g.z === undefined)).toBe(true);
    expandGroups(groups, true);
    expect(nodes.every((n) => (n as { z?: number }).z === undefined)).toBe(true);
  });
});

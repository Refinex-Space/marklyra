import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  type Simulation3D,
  type SimulationNodeDatum3D,
} from 'd3-force-3d';
import { coarseLayout, expandGroups } from './coarse-layout.js';
import type { Layout3Request, Layout3Result } from './model.js';

interface Node extends SimulationNodeDatum3D {
  id: string;
  x: number;
  y: number;
  z: number;
  pinned: boolean;
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  groupSize?: number;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Layout3Request>) => void) | null;
  postMessage: (value: Layout3Result, transfer: Transferable[]) => void;
};
let all = new Map<string, Node>();
let edges: { source: string; target: string }[] = [];
let simulation: Simulation3D<Node> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let epoch = 0,
  serial = 0,
  remaining = 0;
let active: Node[] = [];
let reduced = false;
let completeCoarse: (() => void) | null = null;
function stop() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  simulation?.stop();
}
function publish(done: boolean) {
  const positions = new Float32Array(active.length * 3);
  active.forEach((node, index) => {
    positions[index * 3] = node.x;
    positions[index * 3 + 1] = node.y;
    positions[index * 3 + 2] = node.z;
  });
  scope.postMessage({ epoch, serial, ids: active.map((n) => n.id), positions, done }, [
    positions.buffer,
  ]);
}
function step() {
  timer = undefined;
  if (!simulation) return;
  const started = performance.now();
  do {
    simulation.tick();
    remaining--;
  } while (remaining > 0 && performance.now() - started < 6 && simulation.alpha() > 0.004);
  const done = remaining <= 0 || simulation.alpha() <= 0.004;
  if (done && completeCoarse) {
    completeCoarse();
    completeCoarse = null;
  }
  if ((!reduced && !completeCoarse) || done) publish(done);
  if (!done) timer = setTimeout(step, 24);
  else simulation.stop();
}
function run(nodes: Node[], local: boolean, layoutEdges = edges) {
  stop();
  completeCoarse = null;
  active = nodes;
  const coarse = !!nodes[0]?.groupSize;
  remaining = local ? 45 : 180;
  const ids = new Set(nodes.map((n) => n.id));
  const links = layoutEdges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e }));
  // A sphere holds the same nodes with shorter links than a disc, so the 2D tuning is relaxed here.
  simulation = forceSimulation<Node>(nodes, 3)
    .stop()
    .alpha(local ? 0.16 : 0.7)
    .alphaDecay(0.05)
    .velocityDecay(0.55)
    .force(
      'links',
      forceLink<Node>(links)
        .id((n) => n.id)
        .distance(coarse ? 140 : 46)
        .strength(0.3),
    )
    .force(
      'charge',
      forceManyBody<Node>()
        .strength(coarse ? -500 : -55)
        .theta(0.9)
        .distanceMax(450),
    )
    .force(
      'collide',
      forceCollide<Node>((n) => (n.groupSize ? Math.cbrt(n.groupSize) * 16 + 8 : 9)).iterations(1),
    )
    .force('x', forceX<Node>((n) => (local ? n.anchorX : 0)).strength(local ? 0.08 : 0.02))
    .force('y', forceY<Node>((n) => (local ? n.anchorY : 0)).strength(local ? 0.08 : 0.02))
    .force('z', forceZ<Node>((n) => (local ? n.anchorZ : 0)).strength(local ? 0.08 : 0.02));
  timer = setTimeout(step, 0);
}
scope.onmessage = ({ data }) => {
  if (data.type === 'motion') {
    reduced = data.reduced;
    return;
  }
  if (data.type === 'stop') {
    stop();
    return;
  }
  if (data.type === 'layout') {
    stop();
    epoch = data.epoch;
    serial = 0;
    reduced = data.reduced;
    edges = data.edges;
    all = new Map(
      data.nodes.map((n) => [
        n.id,
        {
          ...n,
          anchorX: n.x,
          anchorY: n.y,
          anchorZ: n.z,
          fx: n.pinned ? n.x : null,
          fy: n.pinned ? n.y : null,
          fz: n.pinned ? n.z : null,
        },
      ]),
    );
    if (data.settled) {
      active = [...all.values()];
      publish(true);
    } else if (all.size > 1000) {
      const coarse = coarseLayout([...all.values()], edges);
      const groups = coarse.groups.map((g) => {
        const z = g.z ?? 0;
        return Object.assign(g, {
          z,
          anchorX: g.x,
          anchorY: g.y,
          anchorZ: z,
          fx: g.pinned ? g.x : null,
          fy: g.pinned ? g.y : null,
          fz: g.pinned ? z : null,
        });
      });
      run(groups as unknown as Node[], false, coarse.edges);
      completeCoarse = () => {
        expandGroups(groups, true);
        active = [...all.values()];
      };
    } else run([...all.values()], false);
    return;
  }
  if (data.epoch !== epoch) return;
  const node = all.get(data.id);
  if (!node) return;
  const newDrag = data.serial !== serial;
  serial = data.serial;
  node.x = data.x;
  node.y = data.y;
  node.z = data.z;
  node.vx = 0;
  node.vy = 0;
  node.vz = 0;
  node.fx = data.x;
  node.fy = data.y;
  node.fz = data.z;
  if (newDrag) {
    const ids = new Set([node.id]);
    for (const edge of edges) {
      if (ids.size >= 150) break;
      if (edge.source === node.id) ids.add(edge.target);
      if (edge.target === node.id) ids.add(edge.source);
    }
    const neighbors = [...ids].flatMap((id) => {
      const n = all.get(id);
      return n ? [n] : [];
    });
    for (const n of neighbors) {
      n.anchorX = n.x;
      n.anchorY = n.y;
      n.anchorZ = n.z;
    }
    run(neighbors, true);
  } else if (timer === undefined) {
    remaining = 30;
    simulation?.alpha(0.12);
    timer = setTimeout(step, 0);
  }
  if (data.end) {
    node.pinned = data.pinned;
    node.fx = data.pinned ? data.x : null;
    node.fy = data.pinned ? data.y : null;
    node.fz = data.pinned ? data.z : null;
    node.anchorX = data.x;
    node.anchorY = data.y;
    node.anchorZ = data.z;
    simulation?.alpha(0.1);
    remaining = 25;
  }
};

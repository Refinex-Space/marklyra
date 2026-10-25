import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import { coarseLayout, expandGroups } from './coarse-layout.js';
import type { LayoutRequest, LayoutResult } from './model.js';

interface Node extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  pinned: boolean;
  anchorX: number;
  anchorY: number;
  groupSize?: number;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
  postMessage: (value: LayoutResult, transfer: Transferable[]) => void;
};
let all = new Map<string, Node>();
let edges: { source: string; target: string }[] = [];
let simulation: Simulation<Node, undefined> | null = null;
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
  const positions = new Float32Array(active.length * 2);
  active.forEach((node, index) => {
    positions[index * 2] = node.x;
    positions[index * 2 + 1] = node.y;
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
  remaining = local ? 45 : 150;
  const ids = new Set(nodes.map((n) => n.id));
  const links = layoutEdges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e }));
  simulation = forceSimulation(nodes)
    .stop()
    .alpha(local ? 0.16 : 0.65)
    .alphaDecay(0.055)
    .velocityDecay(0.55)
    .force(
      'links',
      forceLink<Node, { source: string; target: string }>(links)
        .id((n) => n.id)
        .distance(nodes[0]?.groupSize ? 140 : 52)
        .strength(0.25),
    )
    .force(
      'charge',
      forceManyBody<Node>()
        .strength(nodes[0]?.groupSize ? -500 : -65)
        .theta(0.9)
        .distanceMax(450),
    )
    .force(
      'collide',
      forceCollide<Node>((n) => (n.groupSize ? Math.sqrt(n.groupSize) * 12 + 8 : 10)).iterations(1),
    )
    .force('x', forceX<Node>((n) => (local ? n.anchorX : 0)).strength(local ? 0.08 : 0.015))
    .force('y', forceY<Node>((n) => (local ? n.anchorY : 0)).strength(local ? 0.08 : 0.015));
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
        { ...n, anchorX: n.x, anchorY: n.y, fx: n.pinned ? n.x : null, fy: n.pinned ? n.y : null },
      ]),
    );
    if (data.settled) {
      active = [...all.values()];
      publish(true);
    } else if (all.size > 1000) {
      const coarse = coarseLayout([...all.values()], edges);
      const groups = coarse.groups.map((g) =>
        Object.assign(g, {
          anchorX: g.x,
          anchorY: g.y,
          fx: g.pinned ? g.x : null,
          fy: g.pinned ? g.y : null,
        }),
      );
      run(groups, false, coarse.edges);
      completeCoarse = () => {
        expandGroups(groups);
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
  node.vx = 0;
  node.vy = 0;
  node.fx = data.x;
  node.fy = data.y;
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
    node.anchorX = data.x;
    node.anchorY = data.y;
    simulation?.alpha(0.1);
    remaining = 25;
  }
};

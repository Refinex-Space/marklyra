import {
  type GraphNode,
  type GraphSnapshot,
  type GraphView,
  type LayoutRequest,
  type LayoutResult,
  type Position,
  seedPosition,
} from './model.js';

export interface GraphPalette {
  background: string;
  text: string;
  node: string;
  edge: string;
  focus: string;
  missing: string;
  faded: string;
}
export const lightPalette: GraphPalette = {
  background: '#ffffff',
  text: '#373737',
  node: '#64748b',
  edge: '#7e8997',
  focus: '#3974ab',
  missing: '#a36a14',
  faded: '#c4cad2',
};
export const darkPalette: GraphPalette = {
  background: '#0d1117',
  text: '#e3e5e7',
  node: '#a7b4c5',
  edge: '#5e6a79',
  focus: '#91bced',
  missing: '#d7ac63',
  faded: '#424b57',
};
export const graphResources = { renderers: 0, workers: 0 };
interface Point {
  x: number;
  y: number;
}
interface Node extends Position {
  item: GraphNode;
  radius: number;
  sx: number;
  sy: number;
  r: number;
  visible: boolean;
  tone: number;
}
type Camera = NonNullable<GraphView['camera']>;
interface Callbacks {
  select: (id: string | null) => void;
  open: (id: string) => void;
  changed: () => void;
  error: (message: string) => void;
  context?: (id: string, point: Point) => void;
  place?: (point: Point) => boolean;
}
/** One opaque canvas. Geometry changes in place; React never participates in the frame loop. */
export class GraphRenderer {
  readonly metrics = { renders: 0, batches: 0, layoutRunning: false, drawMs: 0, pathBuilds: 0 };
  readonly pointerTarget: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private nodes = new Map<string, Node>();
  private edges: { source: Node; target: Node }[] = [];
  private adjacency = new Map<string, Set<string>>();
  private labelOrder: Node[] = [];
  private labels = new Map<string, { text: string; width: number }>();
  private worker: Worker | null = null;
  private observer: ResizeObserver;
  private frame = 0;
  private geometry = 0;
  private edgePathKey = '';
  private nodePathKey = '';
  private moving = new Set<string>();
  private dynamicEdges: { source: Node; target: Node }[] = [];
  private edgePaths = [new Path2D(), new Path2D()];
  private nodePaths = Array.from({ length: 5 }, () => new Path2D());
  private ringPath = new Path2D();
  private occupied = new Set<number>();
  private disposed = false;
  private deferredLayout: Extract<LayoutRequest, { type: 'layout' }> | null = null;
  private paused = false;
  private epoch = 0;
  private serial = 0;
  private selected: string | null = null;
  private hover: string | null = null;
  private palette: GraphPalette;
  private saved: Record<string, Position> = Object.create(null);
  private cameraState: Camera = { x: 0.5, y: 0.5, ratio: 1 };
  private bounds = { x: 0, y: 0, span: 100 };
  private width = 1;
  private height = 1;
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reduced = this.motionPreference.matches;
  private firstLayout = true;
  private topology = '';
  private particles = false;
  private pulse: { source: string; started: number } | null = null;
  private transition: { from: Camera; to: Camera; started: number; duration: number } | null = null;
  private drag: {
    id: string | null;
    pointer: number;
    start: Point;
    offset: Point;
    camera: Camera;
    moved: boolean;
  } | null = null;
  private suppressClickUntil = 0;
  constructor(
    private container: HTMLElement,
    private callbacks: Callbacks,
    palette = lightPalette,
  ) {
    this.palette = palette;
    this.pointerTarget = document.createElement('canvas');
    this.pointerTarget.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    this.pointerTarget.setAttribute('aria-hidden', 'true');
    const context = this.pointerTarget.getContext('2d', { alpha: false });
    if (!context) throw new Error('当前宿主无法创建图谱画布，关系列表仍可使用');
    this.context = context;
    container.append(this.pointerTarget);
    graphResources.renderers++;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.pointerTarget.addEventListener('pointerdown', this.down);
    this.pointerTarget.addEventListener('pointermove', this.move);
    this.pointerTarget.addEventListener('pointerup', this.up);
    this.pointerTarget.addEventListener('pointercancel', this.cancel);
    this.pointerTarget.addEventListener('lostpointercapture', this.cancel);
    this.pointerTarget.addEventListener('pointerleave', this.leave);
    this.pointerTarget.addEventListener('dblclick', this.doubleClick);
    this.pointerTarget.addEventListener('contextmenu', this.contextMenu);
    this.pointerTarget.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('blur', this.cancel);
    document.addEventListener('visibilitychange', this.visibility);
    this.motionPreference.addEventListener('change', this.motionChanged);
    void document.fonts.ready.then(() => {
      if (!this.disposed) {
        this.labels.clear();
        this.schedule();
      }
    });
  }
  private resize() {
    if (this.disposed || !this.container.clientWidth || !this.container.clientHeight) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.schedule();
  }
  private scale() {
    const dimension = Math.min(this.width, this.height);
    const padding = Math.min(64, dimension * 0.15);
    return Math.max(1, dimension - 2 * padding) / (this.bounds.span * this.cameraState.ratio);
  }
  private screen(point: Point): Point {
    const scale = this.scale();
    return {
      x:
        this.width / 2 +
        (point.x - this.bounds.x - (this.cameraState.x - 0.5) * this.bounds.span) * scale,
      y:
        this.height / 2 -
        (point.y - this.bounds.y - (this.cameraState.y - 0.5) * this.bounds.span) * scale,
    };
  }
  private world(point: Point): Point {
    const scale = this.scale();
    return {
      x:
        (point.x - this.width / 2) / scale +
        this.bounds.x +
        (this.cameraState.x - 0.5) * this.bounds.span,
      y:
        -(point.y - this.height / 2) / scale +
        this.bounds.y +
        (this.cameraState.y - 0.5) * this.bounds.span,
    };
  }
  private eventPoint(event: MouseEvent): Point {
    const rect = this.pointerTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private hit(point: Point) {
    let best: string | null = null,
      distance = Infinity;
    for (const n of this.labelOrder) {
      const id = n.item.id;
      if (!n.visible) continue;
      const dx = n.sx - point.x,
        dy = n.sy - point.y,
        d = dx * dx + dy * dy;
      if (d <= Math.max(11, n.r + 3) ** 2 && d < distance) {
        distance = d;
        best = id;
      }
    }
    return best;
  }
  private down = (event: PointerEvent) => {
    if (event.button !== 0 || this.drag) return;
    this.transition = null;
    const point = this.eventPoint(event),
      id = this.hit(point),
      world = this.world(point),
      node = id ? this.nodes.get(id) : undefined;
    this.drag = {
      id,
      pointer: event.pointerId,
      start: point,
      offset: { x: (node?.x ?? world.x) - world.x, y: (node?.y ?? world.y) - world.y },
      camera: { ...this.cameraState },
      moved: false,
    };
    this.serial++;
    if (event.isTrusted) this.pointerTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  private move = (event: PointerEvent) => {
    const point = this.eventPoint(event),
      drag = this.drag;
    if (!drag) {
      const hit = this.hit(point);
      if (hit !== this.hover) {
        this.hover = hit;
        this.pointerTarget.style.cursor = hit ? 'grab' : '';
        this.schedule();
      }
      return;
    }
    if (event.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 4) return;
    drag.moved = true;
    this.pointerTarget.style.cursor = 'grabbing';
    event.preventDefault();
    if (drag.id) {
      const p = this.world(point);
      this.moveNode(drag.id, p.x + drag.offset.x, p.y + drag.offset.y, false);
    } else {
      const scale = this.scale();
      this.cameraState = {
        ...drag.camera,
        x: drag.camera.x - (point.x - drag.start.x) / scale / this.bounds.span,
        y: drag.camera.y + (point.y - drag.start.y) / scale / this.bounds.span,
      };
      this.schedule();
    }
  };
  private up = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    this.drag = null;
    if (this.pointerTarget.hasPointerCapture(event.pointerId))
      this.pointerTarget.releasePointerCapture(event.pointerId);
    this.pointerTarget.style.cursor = drag.id ? 'grab' : '';
    if (drag.moved) {
      this.suppressClickUntil = performance.now() + 150;
      if (drag.id) {
        const n = this.nodes.get(drag.id);
        if (n) this.sendDrag(drag.id, n, true);
      }
      this.callbacks.changed();
    } else if (!this.callbacks.place?.(this.world(this.eventPoint(event))))
      this.callbacks.select(drag.id);
  };
  private cancel = () => {
    const drag = this.drag;
    this.drag = null;
    if (drag?.id) {
      const n = this.nodes.get(drag.id);
      if (n) this.sendDrag(drag.id, n, true);
    }
    this.pointerTarget.style.cursor = '';
  };
  private leave = () => {
    if (!this.drag) {
      this.hover = null;
      this.schedule();
    }
  };
  private doubleClick = (event: MouseEvent) => {
    if (performance.now() < this.suppressClickUntil) return;
    const id = this.hit(this.eventPoint(event));
    if (id) this.callbacks.open(id);
  };
  private contextMenu = (event: MouseEvent) => {
    const id = this.hit(this.eventPoint(event));
    if (id) {
      event.preventDefault();
      this.callbacks.select(id);
      this.callbacks.context?.(id, { x: event.clientX, y: event.clientY });
    }
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.transition = null;
    const point = this.eventPoint(event),
      before = this.world(point);
    this.cameraState.ratio = Math.max(
      0.035,
      Math.min(
        20,
        this.cameraState.ratio * Math.exp(Math.max(-160, Math.min(160, event.deltaY)) * 0.002),
      ),
    );
    const after = this.world(point);
    this.cameraState.x += (before.x - after.x) / this.bounds.span;
    this.cameraState.y += (before.y - after.y) / this.bounds.span;
    this.schedule();
    this.callbacks.changed();
  };
  private visibility = () => {
    if (document.hidden) this.pause();
    else {
      this.paused = false;
      const deferred = this.deferredLayout;
      this.deferredLayout = null;
      if (deferred) this.send(deferred);
      this.schedule();
    }
  };
  private motionChanged = () => {
    this.reduced = this.motionPreference.matches;
    if (this.reduced) {
      this.pulse = null;
      if (this.transition) this.transition.duration = 0;
    }
    if (this.deferredLayout) this.deferredLayout.reduced = this.reduced;
    this.worker?.postMessage({ type: 'motion', reduced: this.reduced } satisfies LayoutRequest);
    this.schedule();
  };
  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    graphResources.workers++;
    worker.onmessage = ({ data }: MessageEvent<LayoutResult>) => {
      if (this.disposed || this.paused || data.epoch !== this.epoch || data.serial < this.serial)
        return;
      this.metrics.batches++;
      this.metrics.layoutRunning = !data.done;
      let outside = false;
      data.ids.forEach((id, i) => {
        const n = this.nodes.get(id),
          x = data.positions[i * 2],
          y = data.positions[i * 2 + 1];
        if (n && id !== this.drag?.id && Number.isFinite(x) && Number.isFinite(y)) {
          n.x = x as number;
          n.y = y as number;
          if (!this.moving.has(id)) outside = true;
        }
      });
      if (outside) this.geometry++;
      if (data.done && !this.drag && this.moving.size) {
        this.moving.clear();
        this.dynamicEdges = [];
        this.geometry++;
      }
      if (data.done) {
        if (this.firstLayout) {
          this.firstLayout = false;
          this.fit();
        }
        this.callbacks.changed();
      }
      this.schedule();
    };
    worker.onerror = () => {
      this.stopWorker();
      this.callbacks.error('布局计算失败，已保留当前图谱，可继续查看关系或重新打开');
    };
    return worker;
  }
  private send(value: LayoutRequest) {
    if (document.hidden) {
      if (value.type === 'layout') this.deferredLayout = value;
      this.metrics.layoutRunning = false;
      return;
    }
    this.paused = false;
    const fresh = !this.worker,
      worker = this.ensureWorker();
    if (fresh && value.type === 'drag')
      worker.postMessage({
        type: 'layout',
        epoch: this.epoch,
        nodes: [...this.nodes].map(([id, n]) => ({ id, x: n.x, y: n.y, pinned: n.pinned })),
        edges: this.edges.map((e) => ({ source: e.source.item.id, target: e.target.item.id })),
        reduced: this.reduced,
        settled: true,
      } satisfies LayoutRequest);
    worker.postMessage(value);
  }
  private sendDrag(id: string, n: Node, end: boolean) {
    this.send({
      type: 'drag',
      epoch: this.epoch,
      serial: this.serial,
      id,
      x: n.x,
      y: n.y,
      end,
      pinned: n.pinned,
    });
  }
  setData(snapshot: GraphSnapshot, fit = false) {
    if (fit) this.firstLayout = true;
    this.hover = null;
    const topology =
        snapshot.nodes.map((n) => n.id).join('\0') +
        '\n' +
        snapshot.edges.map((e) => e.id).join('\0'),
      changed = topology !== this.topology;
    this.topology = topology;
    let fresh = 0;
    const nodes = new Map<string, Node>();
    for (const [id, n] of this.nodes) this.saved[id] = { x: n.x, y: n.y, pinned: n.pinned };
    const cached = Object.keys(this.saved);
    let excess = cached.length - 5000;
    for (const id of cached) {
      if (excess <= 0) break;
      if (!this.saved[id]?.pinned) {
        delete this.saved[id];
        excess--;
      }
    }
    snapshot.nodes.forEach((item, i) => {
      const previous = this.nodes.get(item.id) ?? this.saved[item.id];
      if (!previous) fresh++;
      const position = previous ?? seedPosition(item.id, i);
      nodes.set(item.id, {
        ...position,
        item,
        radius: Math.min(8, 4 + Math.log2(1 + item.incoming)),
        sx: 0,
        sy: 0,
        r: 0,
        visible: false,
        tone: 0,
      });
    });
    this.nodes = nodes;
    this.geometry++;
    this.moving.clear();
    this.dynamicEdges = [];
    this.adjacency.clear();
    this.edges = [];
    for (const edge of snapshot.edges) {
      const source = nodes.get(edge.source),
        target = nodes.get(edge.target);
      if (!source || !target) continue;
      this.edges.push({ source, target });
      if (!this.adjacency.has(edge.source)) this.adjacency.set(edge.source, new Set());
      if (!this.adjacency.has(edge.target)) this.adjacency.set(edge.target, new Set());
      this.adjacency.get(edge.source)?.add(edge.target);
      this.adjacency.get(edge.target)?.add(edge.source);
    }
    this.labelOrder = [...nodes.values()].sort((a, b) => b.item.incoming - a.item.incoming);
    this.labels.clear();
    if (this.firstLayout) this.fit();
    else if (this.bounds.span === 100 && nodes.size) {
      const camera = { ...this.cameraState };
      this.fit();
      this.cameraState = camera;
    }
    if (changed && !nodes.size) {
      this.epoch++;
      this.deferredLayout = null;
      this.worker?.postMessage({ type: 'stop' } satisfies LayoutRequest);
      this.metrics.layoutRunning = false;
    } else if (changed && nodes.size) {
      this.epoch++;
      this.serial = 0;
      this.metrics.layoutRunning = fresh > 0;
      this.send({
        type: 'layout',
        epoch: this.epoch,
        nodes: [...nodes].map(([id, n]) => ({ id, x: n.x, y: n.y, pinned: n.pinned })),
        edges: snapshot.edges.map((e) => ({ source: e.source, target: e.target })),
        reduced: this.reduced,
        settled: fresh === 0,
      });
    } else if (this.firstLayout) {
      this.firstLayout = false;
      this.fit();
    }
    this.schedule();
  }
  position(id: string): Position {
    const n = this.nodes.get(id);
    if (!n) throw new Error('图谱节点已不存在');
    return { x: n.x, y: n.y, pinned: n.pinned };
  }
  screenPosition(id: string): Point {
    return this.screen(this.position(id));
  }
  camera(value: Partial<Camera>) {
    this.transition = null;
    this.cameraState = { ...this.cameraState, ...value };
    this.schedule();
  }
  select(id: string | null) {
    this.selected = id;
    if (id && this.particles && !this.reduced)
      this.pulse = { source: id, started: performance.now() };
    this.schedule();
  }
  private beginMoving(id: string) {
    this.moving = new Set([id]);
    for (const edge of this.edges) {
      if (this.moving.size >= 150) break;
      if (edge.source.item.id === id) this.moving.add(edge.target.item.id);
      if (edge.target.item.id === id) this.moving.add(edge.source.item.id);
    }
    this.dynamicEdges = this.edges.filter(
      (e) => this.moving.has(e.source.item.id) || this.moving.has(e.target.item.id),
    );
    this.geometry++;
  }
  moveNode(id: string, x: number, y: number, end = true) {
    const n = this.nodes.get(id);
    if (!n || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!this.drag) this.serial++;
    if (!this.moving.has(id)) this.beginMoving(id);
    n.x = x;
    n.y = y;
    this.sendDrag(id, n, end);
    this.schedule();
    if (end) this.callbacks.changed();
  }
  pin(id: string) {
    const n = this.nodes.get(id);
    if (n) {
      if (!n.pinned) {
        const pinned = new Set(
          Object.entries(this.saved)
            .filter(([, p]) => p.pinned)
            .map(([id]) => id),
        );
        for (const [id, current] of this.nodes) {
          if (current.pinned) pinned.add(id);
          else pinned.delete(id);
        }
        if (pinned.size >= 5000) {
          this.callbacks.error('最多固定 5,000 个节点，请先取消其他节点的固定');
          return;
        }
      }
      n.pinned = !n.pinned;
      this.moveNode(id, n.x, n.y);
    }
  }
  private animate(to: Camera, duration = 160) {
    this.transition = {
      from: { ...this.cameraState },
      to,
      started: performance.now(),
      duration: this.reduced ? 0 : duration,
    };
    this.schedule();
  }
  center(id: string) {
    const n = this.nodes.get(id);
    if (n)
      this.animate({
        x: 0.5 + (n.x - this.bounds.x) / this.bounds.span,
        y: 0.5 + (n.y - this.bounds.y) / this.bounds.span,
        ratio: Math.min(0.6, this.cameraState.ratio),
      });
  }
  fit() {
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;
    for (const n of this.nodes.values()) {
      xMin = Math.min(xMin, n.x);
      xMax = Math.max(xMax, n.x);
      yMin = Math.min(yMin, n.y);
      yMax = Math.max(yMax, n.y);
    }
    if (this.nodes.size)
      this.bounds = {
        x: (xMin + xMax) / 2,
        y: (yMin + yMax) / 2,
        span: Math.max(100, xMax - xMin, yMax - yMin) * 1.12,
      };
    this.cameraState = { x: 0.5, y: 0.5, ratio: 1 };
    this.transition = null;
    this.schedule();
  }
  zoom(factor: number) {
    this.animate(
      {
        ...this.cameraState,
        ratio: Math.max(0.035, Math.min(20, this.cameraState.ratio * factor)),
      },
      120,
    );
  }
  pan(x: number, y: number) {
    this.camera({
      x: this.cameraState.x + x * this.cameraState.ratio,
      y: this.cameraState.y - y * this.cameraState.ratio,
    });
    this.callbacks.changed();
  }
  theme(palette: GraphPalette) {
    this.palette = palette;
    this.schedule();
  }
  restore(view: GraphView) {
    this.worker?.postMessage({ type: 'stop' } satisfies LayoutRequest);
    this.epoch++;
    this.metrics.layoutRunning = false;
    this.saved = Object.assign(Object.create(null), view.positions);
    this.particles = view.particles;
    for (const [id, node] of this.nodes) {
      const position = this.saved[id];
      if (position) {
        node.x = position.x;
        node.y = position.y;
        node.pinned = position.pinned;
      } else node.pinned = false;
    }
    this.moving.clear();
    this.dynamicEdges = [];
    this.geometry++;
    this.topology = '';
    this.bounds.span = 100;
    this.firstLayout = !view.camera;
    this.cameraState = view.camera ? { ...view.camera } : { x: 0.5, y: 0.5, ratio: 1 };
    this.schedule();
  }
  setParticles(value: boolean) {
    this.particles = value;
    if (!value) this.pulse = null;
    this.schedule();
  }
  capture(): Pick<GraphView, 'positions' | 'camera'> {
    const all: Record<string, Position> = Object.assign(Object.create(null), this.saved);
    for (const [id, n] of this.nodes) all[id] = { x: n.x, y: n.y, pinned: n.pinned };
    const entries = Object.entries(all)
      .sort(
        ([a, x], [b, y]) =>
          Number(y.pinned) - Number(x.pinned) ||
          Number(this.nodes.has(b)) - Number(this.nodes.has(a)),
      )
      .slice(0, 5000);
    return { positions: Object.fromEntries(entries), camera: { ...this.cameraState } };
  }
  private schedule() {
    if (!this.disposed && !this.paused && !this.frame)
      this.frame = requestAnimationFrame(this.draw);
  }
  private draw = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.paused) return;
    const started = performance.now();
    if (this.transition) {
      const t = this.transition,
        d = t.duration === 0 ? 1 : Math.min(1, (now - t.started) / t.duration),
        ease = 1 - (1 - d) ** 3;
      this.cameraState = {
        x: t.from.x + (t.to.x - t.from.x) * ease,
        y: t.from.y + (t.to.y - t.from.y) * ease,
        ratio: t.from.ratio + (t.to.ratio - t.from.ratio) * ease,
      };
      if (d === 1) {
        this.transition = null;
        this.callbacks.changed();
      }
    }
    const ratio = Math.min(devicePixelRatio || 1, 2),
      pixelWidth = Math.round(this.width * ratio),
      pixelHeight = Math.round(this.height * ratio);
    if (this.pointerTarget.width !== pixelWidth || this.pointerTarget.height !== pixelHeight) {
      this.pointerTarget.width = pixelWidth;
      this.pointerTarget.height = pixelHeight;
    }
    const ctx = this.context,
      dpr = this.pointerTarget.width / this.width,
      palette = this.palette,
      focus = this.hover ?? this.selected,
      neighbors = focus ? this.adjacency.get(focus) : null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, this.width, this.height);
    const scale = this.scale(),
      centerX = this.bounds.x + (this.cameraState.x - 0.5) * this.bounds.span,
      centerY = this.bounds.y + (this.cameraState.y - 0.5) * this.bounds.span;
    for (const n of this.labelOrder) {
      const id = n.item.id;
      n.sx = this.width / 2 + (n.x - centerX) * scale;
      n.sy = this.height / 2 - (n.y - centerY) * scale;
      n.r = Math.max(2.5, Math.min(14, n.radius / Math.sqrt(this.cameraState.ratio)));
      n.visible = n.sx >= -20 && n.sy >= -20 && n.sx <= this.width + 20 && n.sy <= this.height + 20;
      n.tone =
        n.item.state !== 'ready'
          ? id === focus
            ? 4
            : 2
          : id === focus
            ? 3
            : focus && !neighbors?.has(id)
              ? 1
              : 0;
    }
    const key = `${this.geometry}:${focus}:${this.selected}`;
    if (key !== this.edgePathKey) {
      this.edgePathKey = key;
      this.metrics.pathBuilds++;
      this.edgePaths = [new Path2D(), new Path2D()];
      for (const { source: a, target: b } of this.edges) {
        if (this.moving.has(a.item.id) || this.moving.has(b.item.id)) continue;
        const path = this.edgePaths[focus && (a.item.id === focus || b.item.id === focus) ? 1 : 0];
        path?.moveTo(a.x, a.y);
        path?.lineTo(b.x, b.y);
      }
    }
    const nodeKey = `${key}:${this.cameraState.ratio}:${this.bounds.span}`;
    if (nodeKey !== this.nodePathKey) {
      this.nodePathKey = nodeKey;
      this.nodePaths = Array.from({ length: 5 }, () => new Path2D());
      this.ringPath = new Path2D();
      for (const n of this.labelOrder) {
        if (this.moving.has(n.item.id)) continue;
        const path = this.nodePaths[n.tone];
        path?.moveTo(n.x + n.r / scale, n.y);
        path?.arc(n.x, n.y, n.r / scale, 0, Math.PI * 2);
        if (n.item.id === this.selected || n.pinned) {
          const r = (n.r + 3) / scale;
          this.ringPath.moveTo(n.x + r, n.y);
          this.ringPath.arc(n.x, n.y, r, 0, Math.PI * 2);
        }
      }
    }
    ctx.setTransform(
      dpr * scale,
      0,
      0,
      -dpr * scale,
      dpr * (this.width / 2 - centerX * scale),
      dpr * (this.height / 2 + centerY * scale),
    );
    ctx.strokeStyle = focus ? palette.faded : palette.edge;
    ctx.lineWidth = 1 / scale;
    if (this.edgePaths[0]) ctx.stroke(this.edgePaths[0]);
    ctx.strokeStyle = palette.focus;
    ctx.lineWidth = 1.5 / scale;
    if (this.edgePaths[1]) ctx.stroke(this.edgePaths[1]);
    const colors = [palette.node, palette.faded, palette.missing, palette.focus, palette.focus];
    for (let tone = 0; tone < 5; tone++) {
      const path = this.nodePaths[tone];
      if (!path) continue;
      ctx.fillStyle = colors[tone] ?? palette.node;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.5 / scale;
      if (tone === 2 || tone === 4) ctx.stroke(path);
      else ctx.fill(path);
    }
    ctx.strokeStyle = palette.focus;
    ctx.lineWidth = 1 / scale;
    ctx.stroke(this.ringPath);
    for (const highlight of [false, true]) {
      ctx.beginPath();
      for (const { source: a, target: b } of this.dynamicEdges) {
        if ((!!focus && (a.item.id === focus || b.item.id === focus)) !== highlight) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = highlight ? palette.focus : focus ? palette.faded : palette.edge;
      ctx.lineWidth = (highlight ? 1.5 : 1) / scale;
      ctx.stroke();
    }
    for (const id of this.moving) {
      const n = this.nodes.get(id);
      if (!n?.visible) continue;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r / scale, 0, Math.PI * 2);
      ctx.fillStyle = colors[n.tone] ?? palette.node;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.5 / scale;
      if (n.tone === 2 || n.tone === 4) ctx.stroke();
      else ctx.fill();
      if (id === this.selected || n.pinned) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, (n.r + 3) / scale, 0, Math.PI * 2);
        ctx.strokeStyle = palette.focus;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (focus) {
      ctx.beginPath();
      let arrows = 0;
      for (const { source: a, target: b } of this.edges) {
        if (arrows >= 200) break;
        if ((a.item.id !== focus && b.item.id !== focus) || !b.visible) continue;
        const dx = b.sx - a.sx,
          dy = b.sy - a.sy,
          length = Math.hypot(dx, dy);
        if (length < b.r + 12) continue;
        const ux = dx / length,
          uy = dy / length,
          x = b.sx - ux * (b.r + 3),
          y = b.sy - uy * (b.r + 3);
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * 5 - uy * 2.5, y - uy * 5 + ux * 2.5);
        ctx.lineTo(x - ux * 5 + uy * 2.5, y - uy * 5 - ux * 2.5);
        ctx.closePath();
        arrows++;
      }
      ctx.fillStyle = palette.focus;
      ctx.fill();
    }
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.text;
    const occupied = this.occupied;
    occupied.clear();
    let labelCount = 0;
    const drawLabel = (n: Node, priority: boolean) => {
      if (
        !n.visible ||
        (!priority &&
          (labelCount >= 160 ||
            (focus && !neighbors?.has(n.item.id)) ||
            (this.cameraState.ratio > 1.5 && n.item.incoming < 4)))
      )
        return;
      let label = this.labels.get(n.item.id);
      if (!label) {
        const chars = Array.from(n.item.title),
          text = chars.length > 20 ? `${chars.slice(0, 19).join('')}…` : n.item.title;
        label = { text, width: ctx.measureText(text).width };
        this.labels.set(n.item.id, label);
      }
      const x = n.sx + n.r + 5,
        y = n.sy,
        left = Math.floor(x / 36),
        right = Math.floor((x + label.width) / 36),
        top = Math.floor((y - 8) / 18),
        bottom = Math.floor((y + 8) / 18);
      if (!priority)
        for (let col = left; col <= right; col++)
          for (let row = top; row <= bottom; row++) if (occupied.has(row * 65536 + col)) return;
      for (let col = left; col <= right; col++)
        for (let row = top; row <= bottom; row++) occupied.add(row * 65536 + col);
      if (priority) {
        ctx.fillStyle = palette.background;
        ctx.fillRect(x - 2, y - 9, label.width + 4, 18);
        ctx.fillStyle = palette.text;
      }
      ctx.fillText(label.text, x, y);
      labelCount++;
    };
    if (focus) {
      const n = this.nodes.get(focus);
      if (n) drawLabel(n, true);
    }
    if (this.selected && this.selected !== focus) {
      const n = this.nodes.get(this.selected);
      if (n) drawLabel(n, true);
    }
    for (const n of this.labelOrder)
      if (n.item.id !== focus && n.item.id !== this.selected) drawLabel(n, false);
    if (this.pulse) {
      const pulse = this.pulse,
        t = (now - pulse.started) / 450,
        a = this.nodes.get(pulse.source);
      if (t >= 1 || !a) this.pulse = null;
      else {
        ctx.fillStyle = palette.focus;
        let count = 0;
        for (const { source, target: b } of this.edges) {
          if (source !== a || count++ >= 8) continue;
          ctx.beginPath();
          ctx.arc(a.sx + (b.sx - a.sx) * t, a.sy + (b.sy - a.sy) * t, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    this.metrics.renders++;
    this.metrics.drawMs = performance.now() - started;
    if (this.transition || this.pulse) this.schedule();
  };
  private stopWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      graphResources.workers--;
    }
    this.metrics.layoutRunning = false;
  }
  pause() {
    this.cancel();
    if (this.metrics.layoutRunning) {
      this.deferredLayout = {
        type: 'layout',
        epoch: ++this.epoch,
        nodes: [...this.nodes].map(([id, n]) => ({ id, x: n.x, y: n.y, pinned: n.pinned })),
        edges: this.edges.map((e) => ({ source: e.source.item.id, target: e.target.item.id })),
        reduced: this.reduced,
        settled: false,
      };
    }
    this.paused = true;
    this.worker?.postMessage({ type: 'stop' } satisfies LayoutRequest);
    this.metrics.layoutRunning = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.transition = null;
    this.pulse = null;
  }
  destroy() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.stopWorker();
    this.observer.disconnect();
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('visibilitychange', this.visibility);
    this.motionPreference.removeEventListener('change', this.motionChanged);
    this.pointerTarget.remove();
    this.pointerTarget.width = 1;
    this.pointerTarget.height = 1;
    this.deferredLayout = null;
    this.nodes.clear();
    this.edges = [];
    this.labelOrder = [];
    this.labels.clear();
    this.edgePaths = [];
    this.nodePaths = [];
    this.ringPath = new Path2D();
    graphResources.renderers--;
  }
}

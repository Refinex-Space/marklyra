import {
  basis,
  clampPitch,
  clipRange,
  fitDistance,
  intersectPlane,
  type Projected,
  pixelRay,
  project,
  type Rig,
  unitsPerPixel,
  type Vec3,
  viewProjection,
  wrapYaw,
} from './camera3d.js';
import {
  bindProgram,
  createEdgeProgram,
  createNodeProgram,
  folderSlots,
  hslToRgb,
  luminance,
  type Program,
  parseColor,
  uniform,
} from './gl3d.js';
import {
  type Camera3D,
  type GraphNode,
  type GraphSnapshot,
  type GraphView,
  type Layout3Request,
  type Layout3Result,
  maxPitch,
  type Position,
  seedPosition3,
} from './model.js';
import { type GraphPalette, lightPalette } from './palette.js';
import { graphResources } from './resources.js';
import type {
  GraphCallbacks,
  GraphLook,
  GraphMetrics,
  GraphScene,
  Point,
  WorldPoint,
} from './scene.js';

export { darkPalette, type GraphPalette, lightPalette } from './palette.js';

interface Node3 {
  item: GraphNode;
  index: number;
  x: number;
  y: number;
  z: number;
  pinned: boolean;
  /** Base radius in pixels at the focal distance. */
  radius: number;
  /** Folder tint slot, or -1 for documents without a sub-folder. */
  slot: number;
  /** 0 normal, 1 faded, 2 missing, 3 focus, 4 missing and focused. */
  tone: number;
  sx: number;
  sy: number;
  depth: number;
  r: number;
  visible: boolean;
  fade: number;
}
interface HoverHighlight {
  from: number;
  to: number;
  alpha: number;
  started: number;
}
/** A title measured once and rasterised once into the label atlas; drawing it afterwards is one blit. */
interface Label {
  text: string;
  width: number;
  /** Device-pixel rectangle in the atlas, or null until drawn (and again after the atlas resets). */
  slot: { x: number; y: number; w: number; h: number } | null;
}
interface Edge3 {
  source: Node3;
  target: Node3;
}
type Camera = Camera3D;
const defaultCamera: Camera = { yaw: 0.55, pitch: 0.3, ratio: 1, x: 0, y: 0, z: 0 };
const minRatio = 0.035,
  maxRatio = 20;
const font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const attributeStride = 4;
const atlasSize = 2048;

function clampRatio(value: number) {
  return Math.max(minRatio, Math.min(maxRatio, value));
}
function shortestYaw(from: number, to: number) {
  return from + wrapYaw(to - from);
}

/** WebGL2 scene: shaded sphere sprites and depth-fogged edges, with a 2D layer for text and highlights. */
export class GraphRenderer3D implements GraphScene {
  readonly metrics: GraphMetrics = {
    renders: 0,
    batches: 0,
    layoutRunning: false,
    drawMs: 0,
    pathBuilds: 0,
  };
  readonly pointerTarget: HTMLCanvasElement;
  private glCanvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private overlay: CanvasRenderingContext2D;
  private nodeProgram: Program;
  private edgeProgram: Program;
  private nodeVao: WebGLVertexArrayObject | null;
  private edgeVao: WebGLVertexArrayObject | null;
  private positionBuffer: WebGLBuffer | null;
  private attributeBuffer: WebGLBuffer | null;
  private indexBuffer: WebGLBuffer | null;
  private bufferCapacity = 0;
  private indexCapacity = 0;
  private positions = new Float32Array(0);
  private attributes = new Float32Array(0);
  private indices = new Uint32Array(0);
  private positionsDirty = true;
  private attributesDirty = true;
  private indicesDirty = true;
  private antialiased: boolean;
  private nodes = new Map<string, Node3>();
  private list: Node3[] = [];
  private edges: Edge3[] = [];
  private incident = new Map<Node3, Node3[]>();
  private adjacency = new Map<string, Set<string>>();
  private labelOrder: Node3[] = [];
  private labels = new Map<string, Label>();
  private labelDpr = 0;
  private atlas: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    x: number;
    y: number;
  } | null = null;
  private occupied = new Set<number>();
  private worker: Worker | null = null;
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private disposed = false;
  private paused = false;
  private deferredLayout: Extract<Layout3Request, { type: 'layout' }> | null = null;
  private epoch = 0;
  private serial = 0;
  private selected: string | null = null;
  private hover: string | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverHighlights = new Map<string, HoverHighlight>();
  private palette: GraphPalette;
  private colors = {
    node: [0, 0, 0] as [number, number, number],
    faded: [0, 0, 0] as [number, number, number],
    missing: [0, 0, 0] as [number, number, number],
    focus: [0, 0, 0] as [number, number, number],
    edge: [0, 0, 0] as [number, number, number],
    background: [1, 1, 1] as [number, number, number],
    folders: new Float32Array(folderSlots * 3),
    dark: false,
  };
  private saved: Record<string, Position> = Object.create(null);
  private cam: Camera = { ...defaultCamera };
  private bounds = { x: 0, y: 0, z: 0, radius: 100 };
  private width = 1;
  private height = 1;
  private matrix = new Float32Array(16);
  private near = 1;
  private far = 1000;
  private distance = 1;
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reduced = this.motionPreference.matches;
  private firstLayout = true;
  private relayout = false;
  private topology = '';
  private particles = false;
  private look: GraphLook = { folderColors: true, autoRotate: false };
  private pulse: { source: string; started: number } | null = null;
  private transition: { from: Camera; to: Camera; started: number; duration: number } | null = null;
  private spin = { yaw: 0, pitch: 0 };
  private zoomPending: { log: number; point: Point } | null = null;
  private drag: {
    id: string | null;
    pointer: number;
    start: Point;
    last: Point;
    offset: Vec3;
    mode: 'orbit' | 'pan' | 'node';
    moved: boolean;
    samples: { t: number; dx: number; dy: number }[];
  } | null = null;
  private suppressClickUntil = 0;
  private projected: Projected = { x: 0, y: 0, depth: 0, inside: false };

  constructor(
    private container: HTMLElement,
    private callbacks: GraphCallbacks,
    palette = lightPalette,
  ) {
    this.palette = palette;
    const glCanvas = document.createElement('canvas');
    glCanvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%';
    glCanvas.setAttribute('aria-hidden', 'true');
    const gl = glCanvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'default',
    });
    if (!gl) throw new Error('当前宿主不支持 WebGL2，已使用 2D 图谱');
    this.glCanvas = glCanvas;
    this.gl = gl;
    this.antialiased = (gl.getParameter(gl.SAMPLES) as number) > 0;
    const overlay = document.createElement('canvas');
    overlay.style.cssText =
      'position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none';
    overlay.setAttribute('aria-hidden', 'true');
    const context = overlay.getContext('2d');
    if (!context) throw new Error('当前宿主无法创建图谱画布，关系列表仍可使用');
    this.overlay = context;
    this.pointerTarget = overlay;
    try {
      this.nodeProgram = createNodeProgram(gl);
      this.edgeProgram = createEdgeProgram(gl);
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    }
    this.positionBuffer = gl.createBuffer();
    this.attributeBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    this.nodeVao = gl.createVertexArray();
    this.edgeVao = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.attributeBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, attributeStride, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(this.edgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
    container.append(glCanvas, overlay);
    graphResources.renderers++;
    this.theme(palette);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    glCanvas.addEventListener('webglcontextlost', this.contextLost);
    overlay.addEventListener('pointerdown', this.down);
    overlay.addEventListener('pointermove', this.move);
    overlay.addEventListener('pointerup', this.up);
    overlay.addEventListener('pointercancel', this.cancel);
    overlay.addEventListener('lostpointercapture', this.cancel);
    overlay.addEventListener('pointerleave', this.leave);
    overlay.addEventListener('dblclick', this.doubleClick);
    overlay.addEventListener('contextmenu', this.contextMenu);
    overlay.addEventListener('wheel', this.wheel, { passive: false });
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

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.unavailable?.('GPU 绘图上下文已丢失，已切换到 2D 图谱');
  };
  private resize() {
    if (this.disposed || !this.container.clientWidth || !this.container.clientHeight) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.schedule();
  }
  private rig(): Rig {
    return {
      yaw: this.cam.yaw,
      pitch: this.cam.pitch,
      distance: this.baseDistance() * this.cam.ratio,
      target: [this.cam.x, this.cam.y, this.cam.z],
    };
  }
  private baseDistance() {
    return fitDistance(this.bounds.radius, this.width / this.height);
  }
  private eventPoint(event: MouseEvent): Point {
    const rect = this.pointerTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // ---- picking and pointer interaction -------------------------------------------------------
  private hit(point: Point) {
    let best: Node3 | null = null,
      bestDepth = Infinity;
    for (const n of this.list) {
      if (!n.visible) continue;
      const dx = n.sx - point.x,
        dy = n.sy - point.y,
        reach = Math.max(11, n.r + 3);
      if (dx * dx + dy * dy <= reach * reach && n.depth < bestDepth) {
        bestDepth = n.depth;
        best = n;
      }
    }
    return best?.item.id ?? null;
  }
  /** The document under a pixel as of the last frame: the one nearest the camera. */
  pick(point: Point) {
    return this.hit(point);
  }
  private clearHover() {
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    this.hover = null;
    this.hoverHighlights.clear();
    this.pointerTarget.style.cursor = '';
  }
  private updateHover(now: number) {
    let animating = false;
    for (const [id, h] of this.hoverHighlights) {
      const t = this.reduced ? 1 : Math.min(1, Math.max(0, (now - h.started) / 180));
      h.alpha = h.from + (h.to - h.from) * (t * t * (3 - 2 * t));
      if (t === 1 && h.to === 0) this.hoverHighlights.delete(id);
      else if (t < 1 && h.from !== h.to) animating = true;
    }
    return animating;
  }
  private highlightHover(id: string | null) {
    if (this.disposed || this.paused) return;
    if (id === this.selected) id = null;
    const now = performance.now();
    this.updateHover(now);
    for (const [key, h] of this.hoverHighlights) {
      const to = key === id ? 1 : 0;
      if (h.to !== to) Object.assign(h, { from: h.alpha, to, started: now });
    }
    if (id && !this.hoverHighlights.has(id)) {
      if (this.hoverHighlights.size >= 4) {
        const faintest = [...this.hoverHighlights].sort((a, b) => a[1].alpha - b[1].alpha)[0];
        if (faintest) this.hoverHighlights.delete(faintest[0]);
      }
      this.hoverHighlights.set(id, { from: 0, to: 1, alpha: 0, started: now });
    }
    if (this.hoverHighlights.size) this.schedule();
  }
  private setHover(id: string | null) {
    if (this.hover === id) return;
    this.hover = id;
    this.pointerTarget.style.cursor = id ? 'grab' : '';
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    if (id === null) this.highlightHover(null);
    else {
      this.hoverTimer = setTimeout(() => {
        this.hoverTimer = null;
        this.highlightHover(id);
      }, 60);
    }
  }
  /** Point on the plane through `through` that faces the camera, under the given pixel. */
  private planePoint(point: Point, through: Vec3): Vec3 | null {
    const rig = this.rig(),
      axes = basis(rig);
    return intersectPlane(
      pixelRay(rig, this.width, this.height, point.x, point.y),
      through,
      axes.forward,
    );
  }
  private down = (event: PointerEvent) => {
    if (this.drag || (event.button !== 0 && event.button !== 1)) return;
    this.setHover(null);
    this.transition = null;
    this.spin = { yaw: 0, pitch: 0 };
    const point = this.eventPoint(event),
      id = event.button === 0 ? this.hit(point) : null,
      node = id ? this.nodes.get(id) : undefined;
    let offset: Vec3 = [0, 0, 0];
    if (node) {
      const through: Vec3 = [node.x, node.y, node.z],
        grabbed = this.planePoint(point, through);
      if (grabbed) offset = [node.x - grabbed[0], node.y - grabbed[1], node.z - grabbed[2]];
    }
    this.drag = {
      id,
      pointer: event.pointerId,
      start: point,
      last: point,
      offset,
      mode: node ? 'node' : event.button === 1 || event.shiftKey || event.altKey ? 'pan' : 'orbit',
      moved: false,
      samples: [],
    };
    this.serial++;
    if (event.isTrusted) this.pointerTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  private move = (event: PointerEvent) => {
    const point = this.eventPoint(event),
      drag = this.drag;
    if (!drag) {
      this.setHover(this.hit(point));
      return;
    }
    if (event.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 4) return;
    drag.moved = true;
    this.pointerTarget.style.cursor = 'grabbing';
    event.preventDefault();
    const dx = point.x - drag.last.x,
      dy = point.y - drag.last.y;
    drag.last = point;
    if (drag.mode === 'node' && drag.id) {
      const node = this.nodes.get(drag.id);
      const through: Vec3 | null = node ? [node.x, node.y, node.z] : null,
        target = through && this.planePoint(point, through);
      if (target)
        this.moveNode(
          drag.id,
          target[0] + drag.offset[0],
          target[1] + drag.offset[1],
          target[2] + drag.offset[2],
          false,
        );
    } else if (drag.mode === 'pan') {
      const axes = basis(this.rig()),
        unit = unitsPerPixel(this.rig().distance, this.height);
      this.cam = {
        ...this.cam,
        x: this.cam.x + (-axes.right[0] * dx + axes.up[0] * dy) * unit,
        y: this.cam.y + (-axes.right[1] * dx + axes.up[1] * dy) * unit,
        z: this.cam.z + (-axes.right[2] * dx + axes.up[2] * dy) * unit,
      };
      this.schedule();
    } else {
      this.orbit(-dx * 0.0055, dy * 0.0055);
      const now = performance.now();
      drag.samples.push({ t: now, dx, dy });
      while (drag.samples.length > 6 || (drag.samples[0] && now - drag.samples[0].t > 120))
        drag.samples.shift();
    }
  };
  private orbit(yaw: number, pitch: number) {
    this.cam = {
      ...this.cam,
      yaw: wrapYaw(this.cam.yaw + yaw),
      pitch: clampPitch(this.cam.pitch + pitch),
    };
    this.schedule();
  }
  private up = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    this.drag = null;
    if (this.pointerTarget.hasPointerCapture(event.pointerId))
      this.pointerTarget.releasePointerCapture(event.pointerId);
    this.pointerTarget.style.cursor = drag.id ? 'grab' : '';
    if (drag.moved) {
      this.suppressClickUntil = performance.now() + 150;
      if (drag.mode === 'node' && drag.id) {
        const n = this.nodes.get(drag.id);
        if (n) this.sendDrag(drag.id, n, true);
      } else if (drag.mode === 'orbit' && !this.reduced) {
        const now = performance.now(),
          recent = drag.samples.filter((s) => now - s.t < 90);
        if (recent.length >= 2 && recent[0]) {
          const span = Math.max(16, now - recent[0].t) / 1000,
            dx = recent.reduce((sum, s) => sum + s.dx, 0),
            dy = recent.reduce((sum, s) => sum + s.dy, 0);
          this.spin = { yaw: (-dx * 0.0055) / span, pitch: (dy * 0.0055) / span };
          const speed = Math.hypot(this.spin.yaw, this.spin.pitch);
          if (speed > 4) {
            this.spin.yaw *= 4 / speed;
            this.spin.pitch *= 4 / speed;
          }
          this.schedule();
        }
      }
      this.callbacks.changed();
    } else {
      const placed = this.callbacks.place?.(this.worldAt(this.eventPoint(event)));
      if (!placed) this.callbacks.select(drag.id);
    }
  };
  /** Where a click lands in the world: on the focal plane, since a click carries no depth. */
  private worldAt(point: Point): WorldPoint {
    const { x, y, z } = this.cam,
      hit = this.planePoint(point, [x, y, z]);
    return hit ? { x: hit[0], y: hit[1], z: hit[2] } : { x, y, z };
  }
  private cancel = () => {
    this.setHover(null);
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode === 'node' && drag.id) {
      const n = this.nodes.get(drag.id);
      if (n) this.sendDrag(drag.id, n, true);
    }
    this.pointerTarget.style.cursor = '';
  };
  private leave = () => {
    if (!this.drag) this.setHover(null);
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
    this.spin = { yaw: 0, pitch: 0 };
    const unit = event.deltaMode === 1 ? 16 : 1,
      gain = event.ctrlKey ? 0.01 : 0.002,
      log = Math.max(-160, Math.min(160, event.deltaY * unit)) * gain;
    this.zoomBy(log, this.eventPoint(event));
  };
  /** Positive `log` zooms out. The point under the pointer stays put on the focal plane. */
  private zoomBy(log: number, point: Point) {
    if (this.reduced) {
      this.zoomAt(Math.exp(log), point);
      this.callbacks.changed();
      return;
    }
    this.zoomPending = { log: (this.zoomPending?.log ?? 0) + log, point };
    this.schedule();
  }
  private zoomAt(factor: number, point: Point) {
    const ratio = clampRatio(this.cam.ratio * factor),
      applied = ratio / this.cam.ratio,
      anchor = this.planePoint(point, [this.cam.x, this.cam.y, this.cam.z]);
    if (anchor && applied !== 1) {
      const pull = 1 - applied;
      this.cam = {
        ...this.cam,
        ratio,
        x: this.cam.x + (anchor[0] - this.cam.x) * pull,
        y: this.cam.y + (anchor[1] - this.cam.y) * pull,
        z: this.cam.z + (anchor[2] - this.cam.z) * pull,
      };
    } else this.cam = { ...this.cam, ratio };
  }
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
      this.spin = { yaw: 0, pitch: 0 };
      if (this.transition) this.transition.duration = 0;
    }
    if (this.deferredLayout) this.deferredLayout.reduced = this.reduced;
    this.worker?.postMessage({ type: 'motion', reduced: this.reduced } satisfies Layout3Request);
    this.schedule();
  };

  // ---- layout worker -------------------------------------------------------------------------
  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./layout3d.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;
    graphResources.workers++;
    worker.onmessage = ({ data }: MessageEvent<Layout3Result>) => {
      if (this.disposed || this.paused || data.epoch !== this.epoch || data.serial < this.serial)
        return;
      this.metrics.batches++;
      this.metrics.layoutRunning = !data.done;
      data.ids.forEach((id, i) => {
        const n = this.nodes.get(id),
          x = data.positions[i * 3],
          y = data.positions[i * 3 + 1],
          z = data.positions[i * 3 + 2];
        if (
          n &&
          id !== this.drag?.id &&
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Number.isFinite(z)
        ) {
          n.x = x as number;
          n.y = y as number;
          n.z = z as number;
        }
      });
      this.positionsDirty = true;
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
  private layoutNodes() {
    return this.list.map((n) => ({ id: n.item.id, x: n.x, y: n.y, z: n.z, pinned: n.pinned }));
  }
  private layoutEdges() {
    return this.edges.map((e) => ({ source: e.source.item.id, target: e.target.item.id }));
  }
  private send(value: Layout3Request) {
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
        nodes: this.layoutNodes(),
        edges: this.layoutEdges(),
        reduced: this.reduced,
        settled: true,
      } satisfies Layout3Request);
    worker.postMessage(value);
  }
  private sendDrag(id: string, n: Node3, end: boolean) {
    this.send({
      type: 'drag',
      epoch: this.epoch,
      serial: this.serial,
      id,
      x: n.x,
      y: n.y,
      z: n.z,
      end,
      pinned: n.pinned,
    });
  }

  // ---- data ----------------------------------------------------------------------------------
  /** Top-level folder below the longest directory shared by every document. */
  private assignFolders(nodes: Node3[]) {
    const split = (path: string) => path.replace(/\\/g, '/').split('/').filter(Boolean);
    const parts = nodes.map((n) => (n.item.path ? split(n.item.path) : null));
    let shared: string[] | null = null;
    for (const p of parts) {
      if (!p) continue;
      const directories = p.slice(0, -1);
      if (!shared) shared = directories;
      else {
        let k = 0;
        while (k < shared.length && k < directories.length && shared[k] === directories[k]) k++;
        shared = shared.slice(0, k);
      }
    }
    const depth = shared?.length ?? 0;
    nodes.forEach((n, i) => {
      const p = parts[i];
      const key = p && p.length - 1 > depth ? p[depth] : undefined;
      if (key === undefined) {
        n.slot = -1;
        return;
      }
      let hash = 2166136261;
      for (const character of key)
        hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
      n.slot = (hash >>> 0) % folderSlots;
    });
  }
  setData(snapshot: GraphSnapshot, fit = false) {
    if (fit) this.firstLayout = true;
    this.clearHover();
    const topology =
        snapshot.nodes.map((n) => n.id).join('\0') +
        '\n' +
        snapshot.edges.map((e) => e.id).join('\0'),
      changed = topology !== this.topology;
    this.topology = topology;
    let fresh = 0;
    for (const [id, n] of this.nodes) this.saved[id] = { x: n.x, y: n.y, z: n.z, pinned: n.pinned };
    const cached = Object.keys(this.saved);
    let excess = cached.length - 5000;
    for (const id of cached) {
      if (excess <= 0) break;
      if (!this.saved[id]?.pinned) {
        delete this.saved[id];
        excess--;
      }
    }
    const nodes = new Map<string, Node3>(),
      list: Node3[] = [];
    snapshot.nodes.forEach((item, i) => {
      const previous = this.nodes.get(item.id) ?? this.saved[item.id];
      let position: { x: number; y: number; z: number; pinned: boolean };
      if (previous && previous.z !== undefined && Number.isFinite(previous.z)) {
        position = { x: previous.x, y: previous.y, z: previous.z, pinned: previous.pinned };
        if (this.relayout) fresh++;
      } else {
        fresh++;
        const seed = seedPosition3(item.id, i);
        position = previous
          ? { x: previous.x, y: previous.y, z: seed.z * 0.35, pinned: previous.pinned }
          : seed;
      }
      const node: Node3 = {
        ...position,
        item,
        index: i,
        radius: Math.min(8, 4 + Math.log2(1 + item.incoming)),
        slot: -1,
        tone: 0,
        sx: 0,
        sy: 0,
        depth: 0,
        r: 0,
        visible: false,
        fade: 1,
      };
      nodes.set(item.id, node);
      list.push(node);
    });
    this.nodes = nodes;
    this.list = list;
    this.assignFolders(list);
    this.adjacency.clear();
    this.incident.clear();
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
      if (!this.incident.has(source)) this.incident.set(source, []);
      if (!this.incident.has(target)) this.incident.set(target, []);
      this.incident.get(source)?.push(target);
      this.incident.get(target)?.push(source);
    }
    this.labelOrder = [...list].sort((a, b) => b.item.incoming - a.item.incoming);
    this.labels.clear();
    this.allocate();
    this.rebuildIndices();
    this.retone();
    if (this.firstLayout) this.updateBounds(true);
    else if (this.bounds.radius === 100 && list.length) {
      const camera = { ...this.cam };
      this.updateBounds(true);
      this.cam = camera;
    }
    if (changed && !list.length) {
      this.epoch++;
      this.deferredLayout = null;
      this.worker?.postMessage({ type: 'stop' } satisfies Layout3Request);
      this.metrics.layoutRunning = false;
    } else if (changed && list.length) {
      this.epoch++;
      this.serial = 0;
      this.metrics.layoutRunning = fresh > 0;
      const settled = fresh === 0 && !this.relayout;
      this.relayout = false;
      this.send({
        type: 'layout',
        epoch: this.epoch,
        nodes: this.layoutNodes(),
        edges: this.layoutEdges(),
        reduced: this.reduced,
        settled,
      });
    } else if (this.firstLayout) {
      this.firstLayout = false;
      this.fit();
    }
    this.schedule();
  }
  private allocate() {
    const count = this.list.length;
    if (count > this.bufferCapacity || this.positions.length === 0) {
      this.bufferCapacity = Math.max(count, 64);
      this.positions = new Float32Array(this.bufferCapacity * 3);
      this.attributes = new Float32Array(this.bufferCapacity * attributeStride);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.attributeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.attributes.byteLength, gl.DYNAMIC_DRAW);
    }
    this.positionsDirty = true;
    this.attributesDirty = true;
  }
  private rebuildIndices() {
    const count = this.edges.length * 2;
    if (count > this.indices.length) this.indices = new Uint32Array(Math.max(count, 64));
    this.edges.forEach((edge, i) => {
      this.indices[i * 2] = edge.source.index;
      this.indices[i * 2 + 1] = edge.target.index;
    });
    this.indicesDirty = true;
    this.metrics.pathBuilds++;
  }
  /** Tones follow the selection; neighbours keep full contrast while the rest fades. */
  private retone() {
    const focus = this.selected,
      neighbors = focus ? this.adjacency.get(focus) : null;
    for (const n of this.list) {
      const id = n.item.id;
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
    this.attributesDirty = true;
  }
  private updateBounds(initial = false) {
    if (!this.list.length) return;
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity,
      zMin = Infinity,
      zMax = -Infinity;
    for (const n of this.list) {
      xMin = Math.min(xMin, n.x);
      xMax = Math.max(xMax, n.x);
      yMin = Math.min(yMin, n.y);
      yMax = Math.max(yMax, n.y);
      zMin = Math.min(zMin, n.z);
      zMax = Math.max(zMax, n.z);
    }
    const x = (xMin + xMax) / 2,
      y = (yMin + yMax) / 2,
      z = (zMin + zMax) / 2;
    let radius = 0;
    for (const n of this.list) radius = Math.max(radius, Math.hypot(n.x - x, n.y - y, n.z - z));
    this.bounds = { x, y, z, radius: Math.max(60, radius) };
    if (initial) this.cam = { ...this.cam, x, y, z, ratio: 1 };
  }
  position(id: string): Position {
    const n = this.nodes.get(id);
    if (!n) throw new Error('图谱节点已不存在');
    return { x: n.x, y: n.y, z: n.z, pinned: n.pinned };
  }
  screenPosition(id: string): Point {
    const n = this.nodes.get(id);
    if (!n) throw new Error('图谱节点已不存在');
    this.prepareMatrix();
    const p = project(this.matrix, n.x, n.y, n.z, this.width, this.height, this.projected);
    return { x: p.x, y: p.y };
  }
  select(id: string | null) {
    this.selected = id;
    if (id && this.particles && !this.reduced)
      this.pulse = { source: id, started: performance.now() };
    this.retone();
    this.schedule();
  }
  moveNode(id: string, x: number, y: number, z: number, end = true) {
    const n = this.nodes.get(id);
    if (!n || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (!this.drag) this.serial++;
    n.x = x;
    n.y = y;
    n.z = z;
    this.positionsDirty = true;
    this.sendDrag(id, n, end);
    this.schedule();
    if (end) this.callbacks.changed();
  }
  placeNode(id: string, point: WorldPoint) {
    const n = this.nodes.get(id);
    this.moveNode(id, point.x, point.y, point.z ?? n?.z ?? 0);
  }
  pin(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    if (!n.pinned) {
      const pinned = new Set(
        Object.entries(this.saved)
          .filter(([, p]) => p.pinned)
          .map(([key]) => key),
      );
      for (const [key, current] of this.nodes) {
        if (current.pinned) pinned.add(key);
        else pinned.delete(key);
      }
      if (pinned.size >= 5000) {
        this.callbacks.error('最多固定 5,000 个节点，请先取消其他节点的固定');
        return;
      }
    }
    n.pinned = !n.pinned;
    this.moveNode(id, n.x, n.y, n.z);
  }

  // ---- camera --------------------------------------------------------------------------------
  private animate(to: Camera, duration = 420) {
    this.spin = { yaw: 0, pitch: 0 };
    this.zoomPending = null;
    this.transition = {
      from: { ...this.cam },
      to: { ...to, yaw: shortestYaw(this.cam.yaw, to.yaw) },
      started: performance.now(),
      duration: this.reduced ? 0 : duration,
    };
    this.schedule();
  }
  center(id: string) {
    const n = this.nodes.get(id);
    if (n)
      this.animate({
        ...this.cam,
        x: n.x,
        y: n.y,
        z: n.z,
        ratio: Math.min(0.5, this.cam.ratio),
      });
  }
  fit() {
    const first = this.bounds.radius === 100;
    this.updateBounds();
    const target = { ...this.cam, x: this.bounds.x, y: this.bounds.y, z: this.bounds.z, ratio: 1 };
    if (first || !this.list.length) this.cam = target;
    else this.animate(target, 520);
    this.schedule();
  }
  zoom(factor: number) {
    this.zoomBy(Math.log(factor), { x: this.width / 2, y: this.height / 2 });
  }
  step(x: number, y: number) {
    this.spin = { yaw: 0, pitch: 0 };
    this.orbit(-x * 4, y * 4);
    this.callbacks.changed();
  }
  theme(palette: GraphPalette) {
    this.palette = palette;
    const fallback = (value: string, dark: boolean): [number, number, number] =>
      parseColor(value, dark ? [0.1, 0.1, 0.1] : [0.5, 0.5, 0.5]);
    const colors = this.colors;
    colors.background = parseColor(palette.background, [1, 1, 1]);
    colors.dark = luminance(colors.background) < 0.5;
    colors.node = fallback(palette.node, colors.dark);
    colors.faded = fallback(palette.faded, colors.dark);
    colors.missing = fallback(palette.missing, colors.dark);
    colors.focus = fallback(palette.focus, colors.dark);
    colors.edge = fallback(palette.edge, colors.dark);
    for (let slot = 0; slot < folderSlots; slot++) {
      const rgb = colors.dark
        ? hslToRgb(slot * 30 + 14, 0.5, 0.68)
        : hslToRgb(slot * 30 + 14, 0.46, 0.5);
      colors.folders.set(rgb, slot * 3);
    }
    this.labels.clear();
    this.resetAtlas();
    this.schedule();
  }
  private resetAtlas() {
    if (!this.atlas) return;
    this.atlas.context.setTransform(1, 0, 0, 1, 0, 0);
    this.atlas.context.clearRect(0, 0, atlasSize, atlasSize);
    this.atlas.x = 0;
    this.atlas.y = 0;
  }
  restore(view: GraphView, options: { relayout?: boolean } = {}) {
    this.clearHover();
    this.worker?.postMessage({ type: 'stop' } satisfies Layout3Request);
    this.epoch++;
    this.metrics.layoutRunning = false;
    this.saved = Object.assign(Object.create(null), view.positions);
    this.particles = view.particles;
    this.relayout = !!options.relayout;
    for (const [id, node] of this.nodes) {
      const position = this.saved[id];
      if (position) {
        node.x = position.x;
        node.y = position.y;
        if (position.z !== undefined) node.z = position.z;
        node.pinned = position.pinned;
      } else node.pinned = false;
    }
    this.positionsDirty = true;
    this.topology = '';
    this.bounds.radius = 100;
    const camera = view.camera3d;
    this.firstLayout = !camera;
    this.cam = camera ? { ...camera } : { ...defaultCamera };
    this.transition = null;
    this.spin = { yaw: 0, pitch: 0 };
    this.schedule();
  }
  setParticles(value: boolean) {
    this.particles = value;
    if (!value) this.pulse = null;
    this.schedule();
  }
  setLook(look: GraphLook) {
    if (look.folderColors !== this.look.folderColors) this.attributesDirty = true;
    this.look = { ...look };
    this.schedule();
  }
  capture(): Pick<GraphView, 'positions' | 'camera' | 'camera3d'> {
    const all: Record<string, Position> = Object.assign(Object.create(null), this.saved);
    for (const [id, n] of this.nodes) all[id] = { x: n.x, y: n.y, z: n.z, pinned: n.pinned };
    const entries = Object.entries(all)
      .sort(
        ([a, x], [b, y]) =>
          Number(y.pinned) - Number(x.pinned) ||
          Number(this.nodes.has(b)) - Number(this.nodes.has(a)),
      )
      .slice(0, 5000);
    return {
      positions: Object.fromEntries(entries),
      camera: null,
      camera3d: { ...this.cam, pitch: Math.max(-maxPitch, Math.min(maxPitch, this.cam.pitch)) },
    };
  }

  // ---- drawing -------------------------------------------------------------------------------
  private schedule() {
    if (!this.disposed && !this.paused && !this.frame)
      this.frame = requestAnimationFrame(this.draw);
  }
  /** Draws synchronously. Used by tests that read pixels back in the same task. */
  renderNow() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.render(performance.now());
  }
  private advance(now: number, dt: number) {
    let animating = false;
    if (this.transition) {
      const t = this.transition,
        d = t.duration === 0 ? 1 : Math.min(1, (now - t.started) / t.duration),
        ease = 1 - (1 - d) ** 3,
        mix = (a: number, b: number) => a + (b - a) * ease;
      this.cam = {
        yaw: wrapYaw(mix(t.from.yaw, t.to.yaw)),
        pitch: mix(t.from.pitch, t.to.pitch),
        ratio: Math.exp(mix(Math.log(t.from.ratio), Math.log(t.to.ratio))),
        x: mix(t.from.x, t.to.x),
        y: mix(t.from.y, t.to.y),
        z: mix(t.from.z, t.to.z),
      };
      if (d === 1) {
        this.transition = null;
        this.callbacks.changed();
      } else animating = true;
    }
    if (this.zoomPending) {
      const share = 1 - Math.exp(-dt * 16),
        step = this.zoomPending.log * share;
      this.zoomPending.log -= step;
      this.zoomAt(Math.exp(step), this.zoomPending.point);
      if (Math.abs(this.zoomPending.log) < 0.002) {
        this.zoomAt(Math.exp(this.zoomPending.log), this.zoomPending.point);
        this.zoomPending = null;
        this.callbacks.changed();
      } else animating = true;
    }
    if (this.spin.yaw !== 0 || this.spin.pitch !== 0) {
      this.orbit(this.spin.yaw * dt, this.spin.pitch * dt);
      const decay = Math.exp(-dt * 3.2);
      this.spin = { yaw: this.spin.yaw * decay, pitch: this.spin.pitch * decay };
      if (Math.hypot(this.spin.yaw, this.spin.pitch) < 0.02) {
        this.spin = { yaw: 0, pitch: 0 };
        this.callbacks.changed();
      } else animating = true;
    }
    if (this.look.autoRotate && !this.reduced && !this.drag && !this.transition) {
      this.cam = { ...this.cam, yaw: wrapYaw(this.cam.yaw + dt * 0.14) };
      animating = true;
    }
    return animating;
  }
  private draw = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.paused) return;
    const dt = this.lastTime ? Math.min(0.1, (now - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = now;
    const animating = this.updateHover(now) || this.advance(now, dt);
    this.render(now);
    if (animating || this.transition || this.pulse) this.schedule();
    else this.lastTime = 0;
  };
  private prepareMatrix() {
    const rig = this.rig();
    this.distance = rig.distance;
    const range = clipRange(rig.distance, this.bounds.radius);
    this.near = range.near;
    this.far = range.far;
    viewProjection(rig, this.width / this.height, this.near, this.far, this.matrix);
  }
  private render(now: number) {
    const started = performance.now();
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const dpr = Math.min(devicePixelRatio || 1, 2),
      pixelWidth = Math.max(1, Math.round(this.width * dpr)),
      pixelHeight = Math.max(1, Math.round(this.height * dpr));
    if (this.glCanvas.width !== pixelWidth || this.glCanvas.height !== pixelHeight) {
      this.glCanvas.width = pixelWidth;
      this.glCanvas.height = pixelHeight;
      this.overlay.canvas.width = pixelWidth;
      this.overlay.canvas.height = pixelHeight;
    }
    this.prepareMatrix();
    this.project();
    this.upload();
    this.drawScene(dpr, pixelWidth, pixelHeight);
    this.drawOverlay(dpr, now);
    this.metrics.renders++;
    this.metrics.drawMs = performance.now() - started;
  }
  private fogRange() {
    const radius = this.bounds.radius;
    return {
      near: Math.max(this.near, this.distance - radius * 0.35),
      far: this.distance + radius * 1.3,
    };
  }
  private sizeScale() {
    return Math.max(0.7, Math.min(2.2, 1 / Math.sqrt(this.cam.ratio)));
  }
  /** Screen position, radius and visibility of every node; mirrors the node vertex shader. */
  private project() {
    const sizeScale = this.sizeScale(),
      fog = this.fogRange(),
      p = this.projected;
    for (const n of this.list) {
      project(this.matrix, n.x, n.y, n.z, this.width, this.height, p);
      n.sx = p.x;
      n.sy = p.y;
      n.depth = p.depth;
      const perspective =
        Math.max(0.35, Math.min(2.4, this.distance / Math.max(p.depth, 1e-3))) ** 0.85;
      n.r = Math.max(2, Math.min(16, n.radius * sizeScale * perspective));
      n.visible =
        p.inside && p.x >= -20 && p.y >= -20 && p.x <= this.width + 20 && p.y <= this.height + 20;
      const t = Math.max(0, Math.min(1, (p.depth - fog.near) / Math.max(1e-3, fog.far - fog.near)));
      n.fade = 1 - t * t * (3 - 2 * t) * 0.75;
    }
  }
  private upload() {
    const gl = this.gl;
    if (this.positionsDirty) {
      for (const n of this.list) {
        this.positions[n.index * 3] = n.x;
        this.positions[n.index * 3 + 1] = n.y;
        this.positions[n.index * 3 + 2] = n.z;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions, 0, this.list.length * 3);
      this.positionsDirty = false;
    }
    if (this.attributesDirty) {
      const folders = this.look.folderColors;
      for (const n of this.list) {
        const o = n.index * attributeStride;
        this.attributes[o] = n.radius;
        this.attributes[o + 1] = n.tone;
        this.attributes[o + 2] = Math.min(1, Math.log2(1 + n.item.incoming) / 7);
        this.attributes[o + 3] = folders ? n.slot : -1;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.attributeBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.attributes, 0, this.list.length * attributeStride);
      this.attributesDirty = false;
    }
    if (this.indicesDirty) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      if (this.indices.length > this.indexCapacity) {
        this.indexCapacity = this.indices.length;
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.byteLength, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indices, 0, this.edges.length * 2);
      this.indicesDirty = false;
    }
  }
  private drawScene(dpr: number, pixelWidth: number, pixelHeight: number) {
    const gl = this.gl,
      c = this.colors,
      fog = this.fogRange(),
      focus = this.selected !== null;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(c.background[0], c.background[1], c.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.list.length) return;
    // Edges first, without depth, so a node always sits over the lines that reach it.
    if (this.edges.length) {
      const program = this.edgeProgram;
      bindProgram(gl, program);
      gl.uniformMatrix4fv(uniform(program, 'uVP'), false, this.matrix);
      const edgeColor = focus ? c.faded : c.edge,
        density = Math.max(0.14, Math.min(0.6, 0.62 - this.edges.length * 0.000026));
      gl.uniform3fv(uniform(program, 'uColor'), edgeColor);
      gl.uniform3fv(uniform(program, 'uBg'), c.background);
      gl.uniform1f(uniform(program, 'uAlpha'), focus ? density * 0.8 : density);
      gl.uniform1f(uniform(program, 'uFogNear'), fog.near);
      gl.uniform1f(uniform(program, 'uFogFar'), fog.far);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.edgeVao);
      gl.drawElements(gl.LINES, this.edges.length * 2, gl.UNSIGNED_INT, 0);
    }
    const program = this.nodeProgram;
    bindProgram(gl, program);
    gl.uniformMatrix4fv(uniform(program, 'uVP'), false, this.matrix);
    gl.uniform1f(uniform(program, 'uDistance'), this.distance);
    gl.uniform1f(uniform(program, 'uSizeScale'), this.sizeScale());
    gl.uniform1f(uniform(program, 'uDpr'), dpr);
    gl.uniform1f(uniform(program, 'uFogNear'), fog.near);
    gl.uniform1f(uniform(program, 'uFogFar'), fog.far);
    gl.uniform3fv(uniform(program, 'uNode'), c.node);
    gl.uniform3fv(uniform(program, 'uFaded'), c.faded);
    gl.uniform3fv(uniform(program, 'uMissing'), c.missing);
    gl.uniform3fv(uniform(program, 'uFocus'), c.focus);
    gl.uniform3fv(uniform(program, 'uBg'), c.background);
    gl.uniform3fv(uniform(program, 'uFolderColors'), c.folders);
    gl.uniform1f(uniform(program, 'uFolders'), this.look.folderColors ? 1 : 0);
    gl.uniform1f(uniform(program, 'uSolid'), 0);
    gl.bindVertexArray(this.nodeVao);
    // Soft glow behind the busiest documents; additive on dark backgrounds, tinted on light ones.
    gl.uniform1f(uniform(program, 'uHalo'), 1);
    gl.uniform1f(uniform(program, 'uHaloAlpha'), c.dark ? 0.34 : 0.2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, c.dark ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.list.length);
    gl.uniform1f(uniform(program, 'uHalo'), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    if (this.antialiased) {
      gl.disable(gl.BLEND);
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.drawArrays(gl.POINTS, 0, this.list.length);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
  private drawOverlay(dpr: number, now: number) {
    const ctx = this.overlay,
      palette = this.palette,
      focus = this.selected,
      neighbors = focus ? this.adjacency.get(focus) : null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineCap = 'round';
    const strokeEdges = (id: string, alpha: number) => {
      const node = this.nodes.get(id);
      if (!node) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let budget = 2000;
      for (const other of this.incident.get(node) ?? []) {
        if (budget-- <= 0) break;
        if (!node.visible && !other.visible) continue;
        ctx.moveTo(node.sx, node.sy);
        ctx.lineTo(other.sx, other.sy);
      }
      ctx.strokeStyle = palette.focus;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    if (focus) strokeEdges(focus, 0.85);
    for (const [id, h] of this.hoverHighlights)
      if (id !== focus && h.alpha > 0) strokeEdges(id, h.alpha * 0.7);
    ctx.globalAlpha = 1;
    // Rings for the selection and for pinned documents.
    ctx.beginPath();
    for (const n of this.list) {
      if (!n.visible || !(n.item.id === focus || n.pinned)) continue;
      ctx.moveTo(n.sx + n.r + 3, n.sy);
      ctx.arc(n.sx, n.sy, n.r + 3, 0, Math.PI * 2);
    }
    ctx.strokeStyle = palette.focus;
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const [id, h] of this.hoverHighlights) {
      const n = this.nodes.get(id);
      if (!n?.visible || id === focus || h.alpha <= 0) continue;
      ctx.globalAlpha = h.alpha * 0.9;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, n.r + 3, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.focus;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, n.r, 0, Math.PI * 2);
      ctx.fillStyle = palette.focus;
      if (n.item.state === 'ready') ctx.fill();
      else ctx.stroke();
    }
    ctx.globalAlpha = 1;
    let arrowBudget = 200;
    const drawArrows = (id: string) => {
      const node = this.nodes.get(id);
      if (!node) return;
      ctx.beginPath();
      for (const { source: a, target: b } of this.edges) {
        if (arrowBudget <= 0) break;
        if ((a !== node && b !== node) || !b.visible) continue;
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
        arrowBudget--;
      }
      ctx.fillStyle = palette.focus;
      ctx.fill();
    };
    if (focus) drawArrows(focus);
    for (const [id, h] of this.hoverHighlights) {
      if (id === focus || h.alpha <= 0 || !this.nodes.get(id)?.visible) continue;
      ctx.globalAlpha = h.alpha * 0.65;
      drawArrows(id);
    }
    ctx.globalAlpha = 1;
    this.drawLabels(ctx, neighbors ?? null);
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
  }
  /**
   * Text on a transparent canvas is slow in WebKit, and worse when the alpha changes per label, while a
   * canvas per label costs far too much memory there. Titles are therefore drawn once into rows of one
   * shared atlas; when it is full it is emptied and refilled by whatever is on screen next.
   */
  private labelSlot(label: Label) {
    if (label.slot) return label.slot;
    const dpr = this.labelDpr,
      w = Math.ceil((label.width + 4) * dpr),
      h = Math.ceil(18 * dpr);
    let atlas = this.atlas;
    if (!atlas) {
      const canvas = document.createElement('canvas');
      canvas.width = atlasSize;
      canvas.height = atlasSize;
      const context = canvas.getContext('2d');
      if (!context) return null;
      atlas = this.atlas = { canvas, context, x: 0, y: 0 };
    }
    if (atlas.x + w > atlasSize) {
      atlas.x = 0;
      atlas.y += h;
    }
    if (atlas.y + h > atlasSize) {
      atlas.context.clearRect(0, 0, atlasSize, atlasSize);
      atlas.x = 0;
      atlas.y = 0;
      for (const other of this.labels.values()) other.slot = null;
    }
    const context = atlas.context;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.font = font;
    context.textBaseline = 'middle';
    context.fillStyle = this.palette.text;
    context.fillText(label.text, (atlas.x + 2 * dpr) / dpr, (atlas.y + 9 * dpr) / dpr);
    label.slot = { x: atlas.x, y: atlas.y, w, h };
    atlas.x += w;
    return label.slot;
  }
  private drawLabels(ctx: CanvasRenderingContext2D, neighbors: Set<string> | null) {
    const palette = this.palette,
      focus = this.selected;
    ctx.font = font;
    // Sprites are tied to the pixel ratio and the text colour; bound their number as well.
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.labelDpr !== dpr) {
      this.labels.clear();
      this.resetAtlas();
      this.labelDpr = dpr;
    }
    const labelDpr = this.labelDpr;
    if (this.labels.size > 6000) this.labels.clear();
    const occupied = this.occupied;
    occupied.clear();
    let labelCount = 0;
    const hoverLabels = new Set(this.hoverHighlights.keys());
    // Choose the labels first, rasterise the missing ones in one go, then blit them all. Reading from
    // the atlas between writes would make the browser snapshot the whole atlas for every new title.
    const queue: { label: Label; x: number; y: number; alpha: number; backdrop: boolean }[] = [];
    const place = (n: Node3, priority: boolean, alpha: number) => {
      if (
        !n.visible ||
        (!priority &&
          (labelCount >= 160 ||
            n.fade < 0.4 ||
            (focus && !neighbors?.has(n.item.id)) ||
            (this.cam.ratio > 1.5 && n.item.incoming < 4)))
      )
        return;
      let label = this.labels.get(n.item.id);
      if (!label) {
        const chars = Array.from(n.item.title),
          text = chars.length > 20 ? `${chars.slice(0, 19).join('')}…` : n.item.title;
        label = { text, width: ctx.measureText(text).width, slot: null };
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
      queue.push({ label, x, y, alpha: priority ? alpha : n.fade, backdrop: priority });
      hoverLabels.delete(n.item.id);
      labelCount++;
    };
    if (focus) {
      const n = this.nodes.get(focus);
      if (n) place(n, true, 1);
    }
    for (const n of this.labelOrder) if (n.item.id !== focus) place(n, false, 1);
    for (const id of hoverLabels) {
      const n = this.nodes.get(id),
        h = this.hoverHighlights.get(id);
      if (n && h) place(n, true, h.alpha);
    }
    for (const entry of queue) this.labelSlot(entry.label);
    const atlas = this.atlas;
    if (atlas) {
      let alpha = 1;
      for (const { label, x, y, alpha: wanted, backdrop } of queue) {
        // An atlas reset in the middle of the write pass leaves older titles without a slot this frame.
        const slot = label.slot;
        if (!slot) continue;
        if (wanted !== alpha) ctx.globalAlpha = alpha = wanted;
        if (backdrop) {
          ctx.fillStyle = palette.background;
          ctx.fillRect(x - 2, y - 9, label.width + 4, 18);
        }
        ctx.drawImage(
          atlas.canvas,
          slot.x,
          slot.y,
          slot.w,
          slot.h,
          Math.round((x - 2) * labelDpr) / labelDpr,
          Math.round((y - 9) * labelDpr) / labelDpr,
          slot.w / labelDpr,
          slot.h / labelDpr,
        );
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- lifecycle -----------------------------------------------------------------------------
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
    this.clearHover();
    if (this.metrics.layoutRunning) {
      this.deferredLayout = {
        type: 'layout',
        epoch: ++this.epoch,
        nodes: this.layoutNodes(),
        edges: this.layoutEdges(),
        reduced: this.reduced,
        settled: false,
      };
    }
    this.paused = true;
    this.worker?.postMessage({ type: 'stop' } satisfies Layout3Request);
    this.metrics.layoutRunning = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
    this.transition = null;
    this.zoomPending = null;
    this.spin = { yaw: 0, pitch: 0 };
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
    this.glCanvas.removeEventListener('webglcontextlost', this.contextLost);
    const gl = this.gl;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.attributeBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.nodeVao);
    gl.deleteVertexArray(this.edgeVao);
    gl.deleteProgram(this.nodeProgram.program);
    gl.deleteProgram(this.edgeProgram.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.pointerTarget.remove();
    this.glCanvas.remove();
    this.pointerTarget.width = 1;
    this.pointerTarget.height = 1;
    this.glCanvas.width = 1;
    this.glCanvas.height = 1;
    this.deferredLayout = null;
    this.nodes.clear();
    this.list = [];
    this.edges = [];
    this.incident.clear();
    this.labelOrder = [];
    this.labels.clear();
    this.positions = new Float32Array(0);
    this.attributes = new Float32Array(0);
    this.indices = new Uint32Array(0);
    graphResources.renderers--;
  }
}

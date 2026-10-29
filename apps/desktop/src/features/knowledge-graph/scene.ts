import type { GraphSnapshot, GraphView, Position } from './model.js';
import type { GraphPalette } from './palette.js';

export interface Point {
  x: number;
  y: number;
}
/** A world position chosen by the pointer; `z` is set by the 3D scene. */
export interface WorldPoint extends Point {
  z?: number;
}
export interface GraphCallbacks {
  select: (id: string | null) => void;
  open: (id: string) => void;
  changed: () => void;
  error: (message: string) => void;
  context?: (id: string, point: Point) => void;
  place?: (point: WorldPoint) => boolean;
  /** The scene cannot keep running (for example the GPU context was lost). */
  unavailable?: (message: string) => void;
}
export interface GraphLook {
  folderColors: boolean;
  autoRotate: boolean;
}
export interface GraphMetrics {
  renders: number;
  batches: number;
  layoutRunning: boolean;
  drawMs: number;
  pathBuilds: number;
}
/** What the workbench needs from a graph scene, whether it draws in 2D or 3D. */
export interface GraphScene {
  readonly metrics: GraphMetrics;
  readonly pointerTarget: HTMLCanvasElement;
  setData(snapshot: GraphSnapshot, fit?: boolean): void;
  position(id: string): Position;
  screenPosition(id: string): Point;
  select(id: string | null): void;
  placeNode(id: string, point: WorldPoint): void;
  pin(id: string): void;
  center(id: string): void;
  fit(): void;
  zoom(factor: number): void;
  /** Keyboard and button step: pans the 2D scene and orbits the 3D scene. */
  step(x: number, y: number): void;
  theme(palette: GraphPalette): void;
  /** `relayout` keeps the stored coordinates as a starting point instead of treating them as final. */
  restore(view: GraphView, options?: { relayout?: boolean }): void;
  setParticles(value: boolean): void;
  setLook(look: GraphLook): void;
  capture(): Pick<GraphView, 'positions' | 'camera' | 'camera3d'>;
  pause(): void;
  destroy(): void;
}

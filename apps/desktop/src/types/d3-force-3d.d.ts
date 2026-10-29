/** The part of d3-force-3d this app uses. The package ships no type declarations. */
declare module 'd3-force-3d' {
  export interface SimulationNodeDatum3D {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }
  export interface Force3D<N extends SimulationNodeDatum3D> {
    (alpha: number): void;
    initialize?: (nodes: N[], ...args: unknown[]) => void;
  }
  export interface Simulation3D<N extends SimulationNodeDatum3D> {
    stop(): this;
    tick(iterations?: number): this;
    alpha(): number;
    alpha(value: number): this;
    alphaDecay(value: number): this;
    velocityDecay(value: number): this;
    force(name: string, force: Force3D<N> | null): this;
    nodes(): N[];
  }
  export interface LinkForce3D<N extends SimulationNodeDatum3D, L> extends Force3D<N> {
    id(accessor: (node: N) => string): this;
    distance(value: number | ((link: L) => number)): this;
    strength(value: number | ((link: L) => number)): this;
  }
  export interface ManyBodyForce3D<N extends SimulationNodeDatum3D> extends Force3D<N> {
    strength(value: number | ((node: N) => number)): this;
    theta(value: number): this;
    distanceMax(value: number): this;
  }
  export interface CollideForce3D<N extends SimulationNodeDatum3D> extends Force3D<N> {
    iterations(value: number): this;
  }
  export interface PositionForce3D<N extends SimulationNodeDatum3D> extends Force3D<N> {
    strength(value: number): this;
  }
  export function forceSimulation<N extends SimulationNodeDatum3D>(
    nodes?: N[],
    numDimensions?: 1 | 2 | 3,
  ): Simulation3D<N>;
  export function forceLink<
    N extends SimulationNodeDatum3D,
    L = { source: string; target: string },
  >(links?: L[]): LinkForce3D<N, L>;
  export function forceManyBody<N extends SimulationNodeDatum3D>(): ManyBodyForce3D<N>;
  export function forceCollide<N extends SimulationNodeDatum3D>(
    radius?: number | ((node: N) => number),
  ): CollideForce3D<N>;
  export function forceX<N extends SimulationNodeDatum3D>(
    x?: number | ((node: N) => number),
  ): PositionForce3D<N>;
  export function forceY<N extends SimulationNodeDatum3D>(
    y?: number | ((node: N) => number),
  ): PositionForce3D<N>;
  export function forceZ<N extends SimulationNodeDatum3D>(
    z?: number | ((node: N) => number),
  ): PositionForce3D<N>;
}

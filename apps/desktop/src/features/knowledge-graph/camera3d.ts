import { maxPitch } from './model.js';

export type Vec3 = [number, number, number];
export interface Rig {
  yaw: number;
  pitch: number;
  /** Distance from the eye to the look-at point. */
  distance: number;
  target: Vec3;
}
export interface Projected {
  x: number;
  y: number;
  /** Distance along the view direction; larger is farther away. */
  depth: number;
  /** False behind the eye or outside the near/far range. */
  inside: boolean;
}
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}
/** Vertical field of view in radians. */
export const fov = (45 * Math.PI) / 180;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

export function clampPitch(pitch: number) {
  return Math.max(-maxPitch, Math.min(maxPitch, pitch));
}
/** Keeps the angle in (-π, π] so saved views stay small and comparable. */
export function wrapYaw(yaw: number) {
  const turn = Math.PI * 2;
  const wrapped = ((((yaw + Math.PI) % turn) + turn) % turn) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
export function eye(rig: Rig): Vec3 {
  const cosine = Math.cos(rig.pitch);
  return [
    rig.target[0] + rig.distance * cosine * Math.sin(rig.yaw),
    rig.target[1] + rig.distance * Math.sin(rig.pitch),
    rig.target[2] + rig.distance * cosine * Math.cos(rig.yaw),
  ];
}
/** Orthonormal camera axes; `forward` points from the eye towards the target. */
export function basis(rig: Rig) {
  const position = eye(rig),
    forward = normalize(sub(rig.target, position)),
    right = normalize(cross(forward, [0, 1, 0])),
    up = cross(right, forward);
  return { eye: position, forward, right, up };
}
export function clipRange(distance: number, radius: number) {
  return { near: Math.max(distance * 0.02, 0.1), far: distance + radius * 3 + 10 };
}
/** Column-major view-projection matrix for WebGL. */
export function viewProjection(
  rig: Rig,
  aspect: number,
  near: number,
  far: number,
  out = new Float32Array(16),
) {
  const { eye: position, forward, right, up } = basis(rig);
  const f = 1 / Math.tan(fov / 2),
    range = near - far;
  const tx = -dot(right, position),
    ty = -dot(up, position),
    tz = dot(forward, position);
  // View rows: right, up, -forward. Projection: standard perspective.
  out[0] = (f / aspect) * right[0];
  out[1] = f * up[0];
  out[2] = ((far + near) / range) * -forward[0];
  out[3] = forward[0];
  out[4] = (f / aspect) * right[1];
  out[5] = f * up[1];
  out[6] = ((far + near) / range) * -forward[1];
  out[7] = forward[1];
  out[8] = (f / aspect) * right[2];
  out[9] = f * up[2];
  out[10] = ((far + near) / range) * -forward[2];
  out[11] = forward[2];
  out[12] = (f / aspect) * tx;
  out[13] = f * ty;
  out[14] = ((far + near) / range) * tz + (2 * far * near) / range;
  out[15] = -tz;
  return out;
}
export function project(
  matrix: Float32Array,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  into: Projected = { x: 0, y: 0, depth: 0, inside: false },
) {
  const m = (index: number) => matrix[index] as number;
  const w = m(3) * x + m(7) * y + m(11) * z + m(15);
  into.depth = w;
  if (w <= 1e-6) {
    into.inside = false;
    return into;
  }
  const cx = m(0) * x + m(4) * y + m(8) * z + m(12),
    cy = m(1) * x + m(5) * y + m(9) * z + m(13),
    cz = m(2) * x + m(6) * y + m(10) * z + m(14);
  into.x = (cx / w / 2 + 0.5) * width;
  into.y = (0.5 - cy / w / 2) * height;
  into.inside = cz / w <= 1;
  return into;
}
export function pixelRay(rig: Rig, width: number, height: number, px: number, py: number): Ray {
  const { eye: origin, forward, right, up } = basis(rig),
    half = Math.tan(fov / 2),
    ndcX = (px / width) * 2 - 1,
    ndcY = 1 - (py / height) * 2,
    aspect = width / height;
  return {
    origin,
    direction: normalize([
      forward[0] + right[0] * ndcX * half * aspect + up[0] * ndcY * half,
      forward[1] + right[1] * ndcX * half * aspect + up[1] * ndcY * half,
      forward[2] + right[2] * ndcX * half * aspect + up[2] * ndcY * half,
    ]),
  };
}
export function intersectPlane(ray: Ray, point: Vec3, normal: Vec3): Vec3 | null {
  const denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) < 1e-6) return null;
  const t = dot(sub(point, ray.origin), normal) / denominator;
  if (t < 0) return null;
  return [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];
}
/** World units covered by one screen pixel on the plane that contains the target. */
export function unitsPerPixel(distance: number, height: number) {
  return (2 * distance * Math.tan(fov / 2)) / Math.max(1, height);
}
/** Distance at which a sphere of `radius` fits the viewport with a margin. */
export function fitDistance(radius: number, aspect: number) {
  const vertical = Math.sin(fov / 2),
    horizontal = Math.sin(Math.atan(Math.tan(fov / 2) * Math.min(1, aspect)));
  return (Math.max(radius, 1) / Math.min(vertical, horizontal)) * 1.08;
}

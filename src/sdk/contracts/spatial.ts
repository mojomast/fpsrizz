/**
 * SDK 3 spatial vocabulary: a generic 3D transform, the previous-tick pose used for render interpolation, and the
 * Renderable component that `std/render-sync` turns into scene objects. Pure data and math; no Three.js, so
 * simulation plugins can use it. The planar shooter keeps its own `Transform` (x, z, yaw); see `planarToTransform3D`.
 */
import { defineComponent } from '../core.ts';
import type { EntityApi } from '../../kernel/host.ts';
import type { EntityId } from '../../kernel/ecs.ts';

export interface Vec3 { x: number; y: number; z: number }
/** Unit quaternion (x, y, z, w). */
export interface Quat { x: number; y: number; z: number; w: number }
export interface Pose { position: Vec3; rotation: Quat; scale: Vec3 }

/** Local pose (relative to `parent` when set). Right-handed, +Y up, -Z forward, like Three.js. */
export interface Transform3D extends Pose {
  /** Optional parent entity; the pose is then relative to the parent's world pose. Cycles are ignored. */
  parent?: EntityId;
}
export const Transform3D = defineComponent<Transform3D>('sdk/transform3d');

/** Local pose at the start of the current simulation tick, written by `std/transform`. Read-only for plugins. */
export const PrevTransform = defineComponent<Pose>('sdk/prev-transform');

export type RenderableShape = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'plane';
/**
 * What to draw for an entity with a Transform3D. Exactly one of `shape`, `model` or `prefab`.
 * Replace the component (or call markChanged) to rebuild the visual.
 */
export interface Renderable {
  shape?: RenderableShape;
  /** Shape extents in metres: box = full size; sphere/cylinder/capsule use x as diameter, y as height. Default 1. */
  size?: Vec3;
  /** sRGB hex colour (default 0xcccccc). */
  color?: number;
  /** glTF/GLB URL relative to the page, loaded through the asset service (SDK 3, P1.4). */
  model?: string;
  /** Id in the RenderablePrefabs registry (src/sdk/render.ts; factories registered by presentation plugins). */
  prefab?: string;
  /** Share one InstancedMesh with every renderable of the same shape/size/colour (shapes only). */
  instanced?: boolean;
  visible?: boolean;
}
export const Renderable = defineComponent<Renderable>('sdk/renderable');


// ---------------------------------------------------------------------------------------------------------------------
// Math (allocation-light, pure)
// ---------------------------------------------------------------------------------------------------------------------

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

/** Quaternion from Euler angles in YXZ order (yaw about +Y, then pitch about +X, then roll about +Z), radians. */
export function quatFromEuler(yaw: number, pitch = 0, roll = 0): Quat {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  // q = qYaw * qPitch * qRoll
  return {
    x: cy * sp * cr + sy * cp * sr,
    y: sy * cp * cr - cy * sp * sr,
    z: cy * cp * sr - sy * sp * cr,
    w: cy * cp * cr + sy * sp * sr,
  };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** Rotates a vector by a unit quaternion. */
export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

/** Shortest-path spherical interpolation between unit quaternions. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) return quatNormalize({ x: lerp(a.x, bx, t), y: lerp(a.y, by, t), z: lerp(a.z, bz, t), w: lerp(a.w, bw, t) });
  const theta = Math.acos(cos), sin = Math.sin(theta), wa = Math.sin((1 - t) * theta) / sin, wb = Math.sin(t * theta) / sin;
  return { x: a.x * wa + bx * wb, y: a.y * wa + by * wb, z: a.z * wa + bz * wb, w: a.w * wa + bw * wb };
}

export const interpolatePose = (prev: Pose, cur: Pose, alpha: number): Pose => ({
  position: lerpVec3(prev.position, cur.position, alpha),
  rotation: slerp(prev.rotation, cur.rotation, alpha),
  scale: lerpVec3(prev.scale, cur.scale, alpha),
});

/** parent ∘ child: the child's local pose expressed in the parent's space. */
export function composePose(parent: Pose, child: Pose): Pose {
  const scaled = { x: child.position.x * parent.scale.x, y: child.position.y * parent.scale.y, z: child.position.z * parent.scale.z };
  const p = rotateVec3(parent.rotation, scaled);
  return {
    position: { x: parent.position.x + p.x, y: parent.position.y + p.y, z: parent.position.z + p.z },
    rotation: quatNormalize(quatMultiply(parent.rotation, child.rotation)),
    scale: { x: parent.scale.x * child.scale.x, y: parent.scale.y * child.scale.y, z: parent.scale.z * child.scale.z },
  };
}

export const clonePose = (p: Pose): Pose => ({ position: { ...p.position }, rotation: { ...p.rotation }, scale: { ...p.scale } });

/** A Transform3D with defaults (origin, identity rotation, unit scale). */
export function transform3d(init: { position?: Partial<Vec3>; rotation?: Quat; yaw?: number; scale?: Partial<Vec3> | number; parent?: EntityId } = {}): Transform3D {
  const s = typeof init.scale === 'number' ? { x: init.scale, y: init.scale, z: init.scale } : { x: 1, y: 1, z: 1, ...init.scale };
  const t: Transform3D = { position: { x: 0, y: 0, z: 0, ...init.position }, rotation: init.rotation ?? (init.yaw !== undefined ? quatFromEuler(init.yaw) : quatIdentity()), scale: s };
  if (init.parent !== undefined) t.parent = init.parent;
  return t;
}

/**
 * World pose of an entity, resolving the parent chain. With `alpha` set, each link is interpolated between its
 * PrevTransform and Transform3D (render sync); without it, the current tick's pose is used (simulation).
 */
export function worldPose(world: Pick<EntityApi, 'get'>, e: EntityId, alpha?: number): Pose | undefined {
  const chain: Pose[] = [];
  const seen = new Set<EntityId>();
  let id: EntityId | undefined = e;
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const t: Transform3D | undefined = world.get(id, Transform3D);
    if (!t) break;
    const prev = alpha === undefined ? undefined : world.get(id, PrevTransform);
    chain.push(prev && alpha !== undefined ? interpolatePose(prev, t, alpha) : t);
    id = t.parent;
  }
  if (!chain.length) return undefined;
  let pose = chain[chain.length - 1]!;
  for (let i = chain.length - 2; i >= 0; i--) pose = composePose(pose, chain[i]!);
  return chain.length === 1 ? clonePose(pose) : pose;
}

/** Snaps the previous pose to the current one so the next frame does not interpolate across a teleport. */
export function snapTransform(world: Pick<EntityApi, 'get' | 'add'>, e: EntityId): void {
  const t = world.get(e, Transform3D);
  if (t) world.add(e, PrevTransform, clonePose(t));
}

/** Maps the planar shooter Transform (x, z, yaw, prev*) to SDK 3 poses; used by the shooter's transform bridge. */
export function planarToTransform3D(p: { x: number; z: number; yaw: number }, y = 0): Pose {
  return { position: { x: p.x, y, z: p.z }, rotation: quatFromEuler(p.yaw), scale: { x: 1, y: 1, z: 1 } };
}

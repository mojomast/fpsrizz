/**
 * Navmesh navigation for non-grid 3D worlds (P3.5), implemented by `std/navigation-recast` (Recast/Detour via
 * recast-navigation-js). Grid and graph worlds keep using `mechanics/navigation` (contracts/navigation.ts).
 *
 * The navmesh is built from triangle geometry: by default from the session's static box colliders (Transform3D +
 * PhysicsCollider, non-sensor, RigidBody fixed or absent), so scenes from P2.4 and glTF levels get one for free.
 * Entities with a NavAgent walk to `target` along the path; with a CharacterMove they steer the physics character,
 * otherwise their Transform3D is moved directly.
 */
import { defineComponent, defineEvent, defineService } from '../core.ts';
import type { EntityId } from '@bulkhead/kernel/ecs.ts';
import type { EntityApi } from '@bulkhead/kernel/host.ts';
import { PhysicsCollider, RigidBody } from './physics.ts';
import { rotateVec3, worldPose } from './spatial.ts';
import type { Pose, Vec3 } from './spatial.ts';

/** Indexed triangles: positions as x,y,z triples, indices into them (counter-clockwise seen from above is walkable). */
export interface NavGeometry { positions: number[]; indices: number[] }

export interface NavMeshOptions {
  /** Voxel size in metres on XZ (default 0.2). Smaller is more precise and slower. */
  cellSize?: number;
  /** Voxel height in metres (default 0.2). */
  cellHeight?: number;
  /** Agent radius in metres; walls are shrunk by it (default 0.4). */
  agentRadius?: number;
  /** Agent height in metres; lower ceilings are not walkable (default 1.8). */
  agentHeight?: number;
  /** Highest ledge the agent steps up, metres (default 0.4). */
  maxClimb?: number;
  /** Steepest walkable slope, degrees (default 45). */
  maxSlope?: number;
}

export interface NavMeshInfo {
  /** Source triangles fed to Recast. */
  triangles: number;
  /** Triangles of the resulting navmesh polygons (0 means nothing walkable). */
  navTriangles: number;
  bounds: { min: Vec3; max: Vec3 };
  buildMs: number;
  source: 'colliders' | 'geometry';
}

export interface NavMeshService {
  readonly engine: string;
  /** Current navmesh, or undefined before the first build. */
  info(): NavMeshInfo | undefined;
  /** (Re)builds from `geometry`, or from the static colliders when omitted. Throws if Recast fails. */
  build(geometry?: NavGeometry, opts?: NavMeshOptions): NavMeshInfo;
  /** Straight path (corner points, start and end included), or undefined when unreachable / off the mesh. */
  findPath(from: Vec3, to: Vec3): Vec3[] | undefined;
  /** Nearest point on the navmesh within `searchExtents` (default 2, 4, 2 metres half-size). */
  closestPoint(p: Vec3, searchExtents?: Vec3): Vec3 | undefined;
  /** The navmesh polygons as triangles in world space (debug drawing, tests). */
  debugTriangles(): Vec3[][];
}
export const NavMesh = defineService<NavMeshService>('sdk/navmesh');

/** Walk to `target` along the navmesh. Clear `target` to stop. */
export interface NavAgent {
  target?: Vec3;
  /** Metres per second (default 3). */
  speed?: number;
  /** Stop within this distance of the target (default 0.2). */
  arriveDistance?: number;
  /** Recompute the path when the target moved more than this (default 0.5 m). */
  repathDistance?: number;
}
export const NavAgent = defineComponent<NavAgent>('sdk/nav-agent');

/** Written by the navmesh plugin for every NavAgent. */
export interface NavAgentState {
  status: 'idle' | 'moving' | 'arrived' | 'unreachable';
  /** Remaining corners, next one first. */
  path: Vec3[];
  /** Target the current path was computed for. */
  pathTarget?: Vec3;
}
export const NavAgentState = defineComponent<NavAgentState>('sdk/nav-agent-state');

/** Emitted after every (re)build. */
export const NavMeshBuilt = defineEvent<NavMeshInfo>('sdk/navmesh-built');

const BOX_CORNERS: readonly [number, number, number][] = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]];
// Outward-facing, counter-clockwise when seen from outside (top face last so it is easy to find in tests).
const BOX_FACES: readonly number[] = [0, 1, 2, 0, 2, 3, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0, 4, 7, 6, 4, 6, 5];

/** Appends a posed box (full `size`, local `offset`) to `out` as 12 triangles. */
export function appendBox(out: NavGeometry, pose: Pose, size: Vec3, offset: Vec3 = { x: 0, y: 0, z: 0 }): void {
  const base = out.positions.length / 3;
  for (const [cx, cy, cz] of BOX_CORNERS) {
    const local = { x: (offset.x + cx * size.x / 2) * pose.scale.x, y: (offset.y + cy * size.y / 2) * pose.scale.y, z: (offset.z + cz * size.z / 2) * pose.scale.z };
    const r = rotateVec3(pose.rotation, local);
    out.positions.push(pose.position.x + r.x, pose.position.y + r.y, pose.position.z + r.z);
  }
  for (const i of BOX_FACES) out.indices.push(base + i);
}

/**
 * Static walkable/blocking geometry from colliders: boxes (cylinders and capsules as their bounding box) of entities
 * with Transform3D + PhysicsCollider that are not sensors and are fixed (or have no RigidBody). Dynamic bodies and
 * characters are left out, so crates and agents do not carve holes. `ids` are the candidates, typically
 * `ctx.world.query({ with: [Transform3D, PhysicsCollider] }).ids()` from a query created once in activate().
 */
export function navGeometryFromColliders(world: Pick<EntityApi, 'get'>, ids: Iterable<EntityId>): NavGeometry {
  const out: NavGeometry = { positions: [], indices: [] };
  for (const e of [...ids].sort((a, b) => a - b)) {
    const col = world.get(e, PhysicsCollider);
    if (!col) continue;
    if (col.sensor) continue;
    const rb = world.get(e, RigidBody);
    if (rb && rb.type !== 'fixed') continue;
    const pose = worldPose(world, e);
    if (!pose) continue;
    const s = { x: 1, y: 1, z: 1, ...col.size };
    const size = col.shape === 'ball' ? { x: s.x, y: s.x, z: s.x } : col.shape === 'box' ? s : { x: s.x, y: s.y, z: s.x };
    appendBox(out, pose, size, col.offset);
  }
  return out;
}

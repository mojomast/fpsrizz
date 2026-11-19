/**
 * glTF scenes as entity data (SDK 3, P1.4). A pure-TypeScript reader for .glb/.gltf JSON (no Three.js, so simulation
 * plugins and Node tests can use it) plus `spawnGltfScene`, which turns every node into an entity:
 *
 * - Transform3D from the node's TRS (or matrix), parented like the glTF hierarchy;
 * - Renderable `{ model: "<path>#<nodeIndex>" }` for mesh nodes (drawn by std/render-sync through std/assets);
 * - components from the node's `extras` - which is where Blender's glTF exporter writes Object custom properties
 *   (enable "Include > Custom Properties"). See docs/reference/assets.md for the property vocabulary.
 */
import { defineRegistry } from '../core.ts';
import type { SessionContext } from '../../kernel/host.ts';
import type { EntityId } from '../../kernel/ecs.ts';
import type { Json } from '../../kernel/validate.ts';
import { Assets } from './assets.ts';
import { composePose, quatIdentity, Renderable, Transform3D, vec3 } from './spatial.ts';
import type { Pose, Quat, Vec3 } from './spatial.ts';
import { PhysicsCollider, RigidBody } from './physics.ts';
import type { BodyType, ColliderShape } from './physics.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------------------------------------------------

export interface GltfNodeJson {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
  extras?: Record<string, Json>;
}
export interface GltfJson {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes?: { name?: string; nodes?: number[] }[];
  nodes?: GltfNodeJson[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number> }[]; extras?: Record<string, Json> }[];
  accessors?: { min?: number[]; max?: number[]; componentType?: number; normalized?: boolean }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}
export interface GltfDocument { json: GltfJson; bin?: Uint8Array }

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Parses a .glb container or .gltf JSON text. Only the JSON and the embedded BIN chunk are read. */
export function parseGltf(bytes: Uint8Array): GltfDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  if (bytes.byteLength >= 12 && view.getUint32(0, true) === GLB_MAGIC) {
    const version = view.getUint32(4, true);
    if (version !== 2) throw new Error(`unsupported GLB version ${version}`);
    const length = Math.min(view.getUint32(8, true), bytes.byteLength);
    let json: GltfJson | undefined;
    let bin: Uint8Array | undefined;
    for (let off = 12; off + 8 <= length;) {
      const len = view.getUint32(off, true);
      const type = view.getUint32(off + 4, true);
      const body = bytes.subarray(off + 8, off + 8 + len);
      if (type === CHUNK_JSON) json = JSON.parse(decoder.decode(body)) as GltfJson;
      else if (type === CHUNK_BIN && !bin) bin = body;
      off += 8 + len + ((4 - (len % 4)) % 4);
    }
    if (!json) throw new Error('GLB has no JSON chunk');
    return bin ? { json, bin } : { json };
  }
  const json = JSON.parse(decoder.decode(bytes)) as GltfJson;
  if (!json || typeof json !== 'object' || !json.asset) throw new Error('not a glTF document (missing "asset")');
  return { json };
}

export interface GltfNodeInfo {
  index: number;
  name: string;
  /** Parent node index, undefined for scene roots. */
  parent?: number;
  /** Local pose. */
  pose: Pose;
  mesh?: number;
  /** Local-space bounds of the node's mesh (from POSITION accessor min/max). */
  bounds?: { min: Vec3; max: Vec3 };
  extras: Record<string, Json>;
}

/** Decomposes a column-major 4x4 matrix into translation / rotation / scale. */
export function decomposeMatrix(m: readonly number[]): Pose {
  const col = (i: number): Vec3 => vec3(m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!);
  const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
  const c0 = col(0), c1 = col(1), c2 = col(2);
  let sx = len(c0);
  const sy = len(c1), sz = len(c2);
  const det = c0.x * (c1.y * c2.z - c1.z * c2.y) - c1.x * (c0.y * c2.z - c0.z * c2.y) + c2.x * (c0.y * c1.z - c0.z * c1.y);
  if (det < 0) sx = -sx;
  const r = [c0.x / sx, c0.y / sx, c0.z / sx, c1.x / sy, c1.y / sy, c1.z / sy, c2.x / sz, c2.y / sz, c2.z / sz];
  // r is column-major: r[col*3+row]
  const m00 = r[0]!, m10 = r[1]!, m20 = r[2]!, m01 = r[3]!, m11 = r[4]!, m21 = r[5]!, m02 = r[6]!, m12 = r[7]!, m22 = r[8]!;
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return { position: vec3(m[12]!, m[13]!, m[14]!), rotation: q, scale: vec3(sx, sy, sz) };
}

function localPose(n: GltfNodeJson): Pose {
  if (n.matrix && n.matrix.length === 16) return decomposeMatrix(n.matrix);
  const t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  return { position: vec3(t[0], t[1], t[2]), rotation: { x: r[0], y: r[1], z: r[2], w: r[3] }, scale: vec3(s[0], s[1], s[2]) };
}

const NORMALIZED_MAX: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

type Box = { min: Vec3; max: Vec3 };
function unionBox(a: Box | undefined, b: Box): Box {
  if (!a) return b;
  return { min: vec3(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y), Math.min(a.min.z, b.min.z)), max: vec3(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y), Math.max(a.max.z, b.max.z)) };
}
/** Axis-aligned box of `b` after applying `pose` (scale, rotate, translate). */
function transformBox(b: Box, pose: Pose): Box {
  let out: Box | undefined;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const p = composePose(pose, { position: vec3(x, y, z), rotation: quatIdentity(), scale: vec3(1, 1, 1) }).position;
    out = unionBox(out, { min: p, max: p });
  }
  return out!;
}

function meshBounds(json: GltfJson, mesh: number): { min: Vec3; max: Vec3 } | undefined {
  let min: Vec3 | undefined, max: Vec3 | undefined;
  for (const p of json.meshes?.[mesh]?.primitives ?? []) {
    const a = p.attributes.POSITION === undefined ? undefined : json.accessors?.[p.attributes.POSITION];
    if (!a?.min || !a.max) continue;
    // Quantised positions (KHR_mesh_quantization, as written by the Meshopt build step) store normalised integers.
    const k = a.normalized ? 1 / (NORMALIZED_MAX[a.componentType ?? 0] ?? 1) : 1;
    const lo = vec3(a.min[0]! * k, a.min[1]! * k, a.min[2]! * k), hi = vec3(a.max[0]! * k, a.max[1]! * k, a.max[2]! * k);
    min = min ? vec3(Math.min(min.x, lo.x), Math.min(min.y, lo.y), Math.min(min.z, lo.z)) : lo;
    max = max ? vec3(Math.max(max.x, hi.x), Math.max(max.y, hi.y), Math.max(max.z, hi.z)) : hi;
  }
  return min && max ? { min, max } : undefined;
}

/**
 * True for an anonymous, childless, extras-free mesh node whose parent is a node: optimisers (glTF-Transform
 * quantize) create these to carry a mesh when its original node has children. They are drawn and measured as part of
 * their parent and do not become entities.
 */
export function isMeshCarrier(json: GltfJson, index: number): boolean {
  const n = json.nodes?.[index];
  if (!n || n.name || n.mesh === undefined || (n.children?.length ?? 0) > 0 || (n.extras && Object.keys(n.extras).length)) return false;
  return (json.nodes ?? []).some((p) => p.children?.includes(index));
}

/**
 * Nodes of a scene (default: `json.scene`, else 0) in depth-first order, parents before children. Mesh carriers
 * (see isMeshCarrier) are folded into their parent.
 */
export function gltfNodes(doc: GltfDocument, scene = doc.json.scene ?? 0): GltfNodeInfo[] {
  const nodes = doc.json.nodes ?? [];
  const roots = doc.json.scenes?.[scene]?.nodes ?? (doc.json.scenes ? [] : nodes.map((_, i) => i));
  const out: GltfNodeInfo[] = [];
  const seen = new Set<number>();
  const visit = (i: number, parent: number | undefined): void => {
    const n = nodes[i];
    if (!n || seen.has(i) || (parent !== undefined && isMeshCarrier(doc.json, i))) return;
    seen.add(i);
    const info: GltfNodeInfo = { index: i, name: n.name ?? `node${i}`, pose: localPose(n), extras: n.extras && typeof n.extras === 'object' ? n.extras : {} };
    if (parent !== undefined) info.parent = parent;
    if (n.mesh !== undefined) {
      info.mesh = n.mesh;
      const b = meshBounds(doc.json, n.mesh);
      if (b) info.bounds = b;
    }
    // Optimisers (glTF-Transform quantize) move a mesh into an unnamed child node when its node has children; count
    // such anonymous mesh carriers as part of this node's bounds so colliders keep their size.
    for (const c of n.children ?? []) {
      const cn = nodes[c];
      if (!cn || cn.mesh === undefined || !isMeshCarrier(doc.json, c)) continue;
      const b = meshBounds(doc.json, cn.mesh);
      if (b) info.bounds = unionBox(info.bounds, transformBox(b, localPose(cn)));
    }
    out.push(info);
    for (const c of n.children ?? []) visit(c, i);
  };
  for (const r of roots) visit(r, undefined);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Extras -> components
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Maps one custom-property key (registry id = the property name) to components. Called after the built-in keys,
 * in the context of the plugin that spawns the scene.
 */
export interface GltfExtrasMapper {
  description: string;
  apply(ctx: SessionContext, entity: EntityId, value: Json, node: GltfNodeInfo): void;
}
export const GltfExtras = defineRegistry<GltfExtrasMapper>('gltf-extras');

export interface SpawnGltfOptions {
  /** Pose of the scene root entity (default identity). */
  at?: Pose;
  /** Parent entity of the scene root. */
  parent?: EntityId;
  /** Add Renderable components for mesh nodes (default true). Turn off for collision-only or data-only scenes. */
  renderables?: boolean;
  /** Already parsed document (skips the asset service). */
  document?: GltfDocument;
}

export interface SpawnedGltfScene {
  root: EntityId;
  /** Entity per node index (sparse for nodes outside the scene). */
  nodes: Map<number, EntityId>;
  /** First entity per node name. */
  byName: Map<string, EntityId>;
  /** Extras keys nothing understood (no built-in, no component id, no GltfExtras mapper). */
  unknownExtras: string[];
}

const BUILTIN = new Set(['body', 'collider', 'sensor', 'friction', 'restitution', 'density', 'lockRotations', 'gravityScale', 'renderable', 'prefab', 'components']);
const BODY_TYPES: readonly BodyType[] = ['dynamic', 'fixed', 'kinematic'];
const COLLIDERS: readonly ColliderShape[] = ['box', 'ball', 'capsule', 'cylinder'];

/** Blender stores nested data as strings; values that look like JSON objects/arrays are parsed. */
function jsonish(v: Json): Json {
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    try { return JSON.parse(v) as Json; } catch { return v; }
  }
  return v;
}
const truthy = (v: Json | undefined): boolean => v === true || v === 1 || v === 'true' || v === '1';
const num = (v: Json | undefined): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Collider sized from the node's mesh bounds and world scale (physics ignores Transform3D.scale). */
export function colliderFromBounds(shape: ColliderShape, bounds: { min: Vec3; max: Vec3 } | undefined, scale: Vec3): PhysicsCollider {
  const b = bounds ?? { min: vec3(-0.5, -0.5, -0.5), max: vec3(0.5, 0.5, 0.5) };
  const ext = vec3((b.max.x - b.min.x) * Math.abs(scale.x), (b.max.y - b.min.y) * Math.abs(scale.y), (b.max.z - b.min.z) * Math.abs(scale.z));
  const offset = vec3(((b.max.x + b.min.x) / 2) * scale.x, ((b.max.y + b.min.y) / 2) * scale.y, ((b.max.z + b.min.z) / 2) * scale.z);
  const d = Math.max(ext.x, ext.z);
  const size = shape === 'box' ? ext : shape === 'ball' ? vec3(Math.max(ext.x, ext.y, ext.z), 0, 0) : vec3(d, ext.y, d);
  const c: PhysicsCollider = { shape, size };
  if (Math.hypot(offset.x, offset.y, offset.z) > 1e-6) c.offset = offset;
  return c;
}

/**
 * Spawns a glTF scene as entities (see the module comment). Nodes with a `body` or `collider` property become ROOT
 * entities in world space (Rapier bodies cannot be parented; skipped when `opts.parent` is set); their children stay
 * parented to them.
 */
export async function spawnGltfScene(ctx: SessionContext, path: string, opts: SpawnGltfOptions = {}): Promise<SpawnedGltfScene> {
  const doc = opts.document ?? parseGltf(await ctx.services.get(Assets).bytes(ctx, path));
  const w = ctx.world;
  const root = w.create();
  const rootPose = opts.at ?? { position: vec3(), rotation: quatIdentity(), scale: vec3(1, 1, 1) };
  w.add(root, Transform3D, { ...rootPose, ...(opts.parent !== undefined ? { parent: opts.parent } : {}) });
  const nodes = new Map<number, EntityId>();
  const byName = new Map<string, EntityId>();
  const worldOf = new Map<number, Pose>();
  const unknown = new Set<string>();
  const parentWorld = (n: GltfNodeInfo): Pose => (n.parent === undefined ? rootPose : worldOf.get(n.parent)!);
  for (const n of gltfNodes(doc)) {
    const e = w.create();
    nodes.set(n.index, e);
    if (!byName.has(n.name)) byName.set(n.name, e);
    const world = composePose(parentWorld(n), n.pose);
    worldOf.set(n.index, world);
    const x = n.extras;
    const body = typeof x.body === 'string' && (BODY_TYPES as readonly string[]).includes(x.body) ? (x.body as BodyType) : undefined;
    const shape = typeof x.collider === 'string' && (COLLIDERS as readonly string[]).includes(x.collider) ? (x.collider as ColliderShape) : undefined;
    if ((body || shape) && opts.parent === undefined) w.add(e, Transform3D, { position: world.position, rotation: world.rotation, scale: world.scale });
    else w.add(e, Transform3D, { ...n.pose, parent: n.parent === undefined ? root : nodes.get(n.parent)! });
    // Visual
    const prefab = typeof x.prefab === 'string' ? x.prefab : undefined;
    const showModel = opts.renderables !== false && x.renderable !== false && x.renderable !== 0 && x.renderable !== 'false';
    if (prefab) w.add(e, Renderable, { prefab });
    else if ((n.mesh !== undefined || (doc.json.nodes?.[n.index]?.children ?? []).some((c) => isMeshCarrier(doc.json, c))) && showModel) w.add(e, Renderable, { model: `${path}#${n.index}` });
    // Physics shorthands
    if (body) {
      const rb: RigidBody = { type: body };
      if (truthy(x.lockRotations)) rb.lockRotations = true;
      const g = num(x.gravityScale);
      if (g !== undefined) rb.gravityScale = g;
      w.add(e, RigidBody, rb);
    }
    if (shape) {
      const c = colliderFromBounds(shape, n.bounds, world.scale);
      if (truthy(x.sensor)) c.sensor = true;
      const f = num(x.friction), r = num(x.restitution), d = num(x.density);
      if (f !== undefined) c.friction = f;
      if (r !== undefined) c.restitution = r;
      if (d !== undefined) c.density = d;
      w.add(e, PhysicsCollider, c);
      if (!body) w.add(e, RigidBody, { type: 'fixed' });
    }
    // Generic components: a `components` JSON map, or any key that is a component id ("namespace/name").
    const comps = jsonish(x.components ?? null);
    if (comps && typeof comps === 'object' && !Array.isArray(comps)) {
      for (const [id, data] of Object.entries(comps)) w.add(e, { id }, jsonish(data as Json));
    }
    for (const [key, value] of Object.entries(x)) {
      if (BUILTIN.has(key)) continue;
      const mapper = ctx.registries.get(GltfExtras, key);
      if (mapper) mapper.apply(ctx, e, jsonish(value), n);
      else if (key.includes('/')) w.add(e, { id: key }, jsonish(value));
      else unknown.add(key);
    }
  }
  return { root, nodes, byName, unknownExtras: [...unknown].sort() };
}

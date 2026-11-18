/**
 * ScenePrefabs and scenes (SDK 3, P2.4). A diff-friendly, agent-editable entity format modelled on Godot's .tscn:
 *
 *   prefab: { "extends": "game/crate", "components": { "renderable": { "shape": "box", "color": "#aa7744" }, "body": { "type": "dynamic" } } }
 *   scene:  { "nodes": [ { "prefab": "game/crate", "name": "crate-1", "transform": { "position": [2, 0.5, 0] },
 *                          "overrides": { "renderable": { "color": "#ff0000" } }, "children": [ ... ] } ] }
 *
 * Component keys are component ids ("game/coin") or the aliases in COMPONENT_ALIASES. Overrides deep-merge into the
 * prefab's components (objects merge, everything else replaces, `null` removes the component). Pure data and plain
 * functions: no Three.js, so simulation code and Node tests can use it. Tiled and LDtk importers produce SceneDefs
 * (level-import.ts); glTF nodes whose `prefab` extra names a data prefab get its components (gltf.ts).
 */
import { defineComponent, defineRegistry } from '../core.ts';
import type { RegistryReader, SessionContext } from '../../kernel/host.ts';
import type { EntityId } from '../../kernel/ecs.ts';
import { Reporter, isObject, vJson } from '../../kernel/validate.ts';
import type { Json } from '../../kernel/validate.ts';
import { Assets } from './assets.ts';
import { composePose, quatFromEuler, quatIdentity, quatNormalize, Transform3D, vec3 } from './spatial.ts';
import type { Pose } from './spatial.ts';

export type Vec3Json = [number, number, number];
/** `rotation` is Euler degrees [pitch(x), yaw(y), roll(z)] (YXZ order) or a quaternion [x, y, z, w]. */
export interface SceneTransform { position?: Vec3Json; rotation?: Vec3Json | [number, number, number, number]; scale?: Vec3Json | number }
export interface SceneNode {
  name?: string;
  prefab?: string;
  transform?: SceneTransform;
  /** Per-instance component patches (deep-merged; `null` removes a component). */
  overrides?: Record<string, Json>;
  /** Free-form designer data (Tiled/LDtk custom fields land here); readable through the SceneNodeInfo component. */
  props?: Record<string, Json>;
  children?: SceneNode[];
}
export interface PrefabDef {
  description?: string;
  extends?: string;
  /** Component id (or alias) → component data. `transform` holds a SceneTransform used as the default pose. */
  components: Record<string, Json>;
  children?: SceneNode[];
}
export interface SceneDef { description?: string; nodes: SceneNode[] }

export const ScenePrefabs = defineRegistry<PrefabDef>('scene-prefab');
export const Scenes = defineRegistry<SceneDef>('scene');
/** Added to every spawned scene entity: where it came from (used by the inspector and by tools). */
export interface SceneNodeInfo { name: string; prefab?: string; scene?: string; props?: Record<string, Json> }
export const SceneNodeInfo = defineComponent<SceneNodeInfo>('sdk/scene-node');

/** Short names accepted in prefab/override component maps. */
export const COMPONENT_ALIASES: Readonly<Record<string, string>> = {
  transform: 'sdk/transform3d', renderable: 'sdk/renderable', body: 'sdk/rigid-body', collider: 'sdk/physics-collider',
  character: 'sdk/character-controller',
};
export const componentId = (key: string): string => COMPONENT_ALIASES[key] ?? key;
const TRANSFORM = 'sdk/transform3d', RENDERABLE = 'sdk/renderable', BODY = 'sdk/rigid-body', COLLIDER = 'sdk/physics-collider';

/** Deep merge for overrides: objects merge key by key, `null` deletes, anything else replaces. Inputs are not mutated. */
export function mergeJson(base: Json | undefined, patch: Json): Json | undefined {
  if (patch === null) return undefined;
  if (isObject(base) && isObject(patch) && !Array.isArray(base) && !Array.isArray(patch)) {
    const out: Record<string, Json> = { ...(base as Record<string, Json>) };
    for (const [k, v] of Object.entries(patch as Record<string, Json>)) {
      const m = mergeJson(out[k], v);
      if (m === undefined) delete out[k]; else out[k] = m;
    }
    return out;
  }
  return structuredClone(patch);
}
const mergeComponents = (base: Record<string, Json>, patch: Record<string, Json> | undefined): Record<string, Json> => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    const id = componentId(k), m = mergeJson(out[id], v);
    if (m === undefined) delete out[id]; else out[id] = m;
  }
  return out;
};

export interface ResolvedPrefab { components: Record<string, Json>; children: SceneNode[]; chain: string[] }
export class SceneError extends Error {}

/** Flattens a prefab's `extends` chain (base first). Throws SceneError for unknown ids and cycles. */
export function resolvePrefab(lookup: (id: string) => PrefabDef | undefined, id: string): ResolvedPrefab {
  const chain: string[] = [];
  for (let cur: string | undefined = id; cur !== undefined; cur = lookup(cur)?.extends) {
    if (chain.includes(cur)) throw new SceneError(`prefab "${id}" extends itself (${[...chain, cur].join(' -> ')})`);
    if (!lookup(cur)) throw new SceneError(chain.length ? `prefab "${chain[chain.length - 1]}" extends unknown prefab "${cur}"` : `unknown prefab "${cur}"`);
    chain.push(cur);
  }
  let components: Record<string, Json> = {};
  const children: SceneNode[] = [];
  for (const pid of [...chain].reverse()) {
    const def = lookup(pid)!;
    components = mergeComponents(components, def.components);
    children.push(...(def.children ?? []));
  }
  return { components, children, chain };
}

// ---------------------------------------------------------------------------------------------------------------------
// Validation (used by the std/scene content kinds; never throws)
// ---------------------------------------------------------------------------------------------------------------------

const NAME = /^[\w .:#()/-]{1,80}$/;
const nums = (v: unknown, n: number[]): boolean => Array.isArray(v) && n.includes(v.length) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
function vTransform(v: unknown, r: Reporter): SceneTransform | undefined {
  if (!isObject(v)) return r.error('expected { position?, rotation?, scale? }');
  for (const k of Object.keys(v)) if (!['position', 'rotation', 'scale'].includes(k)) r.at(k).error('unknown transform field (use position, rotation, scale)');
  if (v.position !== undefined && !nums(v.position, [3])) r.at('position').error('expected [x, y, z]');
  if (v.rotation !== undefined && !nums(v.rotation, [3, 4])) r.at('rotation').error('expected Euler degrees [x, y, z] or a quaternion [x, y, z, w]');
  if (v.scale !== undefined && !(typeof v.scale === 'number' && v.scale > 0) && !nums(v.scale, [3])) r.at('scale').error('expected a positive number or [x, y, z]');
  return v as SceneTransform;
}
function vComponents(v: unknown, r: Reporter): Record<string, Json> | undefined {
  if (!isObject(v) || Array.isArray(v)) return r.error('expected an object of component id -> data');
  const out: Record<string, Json> = {};
  for (const [k, d] of Object.entries(v)) {
    const id = componentId(k);
    if (!id.includes('/')) { r.at(k).error(`unknown component "${k}": use a component id like "game/coin" or one of ${Object.keys(COMPONENT_ALIASES).join(', ')}`); continue; }
    if (id === TRANSFORM && d !== null) { vTransform(d, r.at(k)); out[id] = d as Json; continue; }
    const j = vJson(d, r.at(k));
    if (j !== undefined) out[id] = j;
  }
  return out;
}
export function validateSceneNode(v: unknown, r: Reporter, depth = 0): SceneNode | undefined {
  if (depth > 32) return r.error('scene nesting is deeper than 32 levels');
  if (!isObject(v) || Array.isArray(v)) return r.error('expected a scene node { prefab?, name?, transform?, overrides?, props?, children? }');
  for (const k of Object.keys(v)) if (!['name', 'prefab', 'transform', 'overrides', 'props', 'children'].includes(k)) r.at(k).error('unknown scene node field');
  if (v.name !== undefined && (typeof v.name !== 'string' || !NAME.test(v.name))) r.at('name').error('expected a short name (letters, digits, space, . : # ( ) / -)');
  if (v.prefab !== undefined && typeof v.prefab !== 'string') r.at('prefab').error('expected a prefab id');
  if (v.transform !== undefined) vTransform(v.transform, r.at('transform'));
  if (v.overrides !== undefined) vComponents(v.overrides, r.at('overrides'));
  if (v.props !== undefined && (!isObject(v.props) || Array.isArray(v.props))) r.at('props').error('expected an object');
  else if (v.props !== undefined) vJson(v.props, r.at('props'));
  if (v.children !== undefined) {
    if (!Array.isArray(v.children)) r.at('children').error('expected an array of scene nodes');
    else v.children.forEach((c, i) => validateSceneNode(c, r.at('children').at(i), depth + 1));
  }
  return v as SceneNode;
}
export function validatePrefab(v: unknown, r: Reporter): PrefabDef | undefined {
  if (!isObject(v) || Array.isArray(v)) return r.error('expected a prefab { extends?, description?, components, children? }');
  for (const k of Object.keys(v)) if (!['description', 'extends', 'components', 'children'].includes(k)) r.at(k).error('unknown prefab field');
  if (v.extends !== undefined && typeof v.extends !== 'string') r.at('extends').error('expected a prefab id');
  if (v.description !== undefined && typeof v.description !== 'string') r.at('description').error('expected a string');
  const components = vComponents(v.components ?? {}, r.at('components'));
  if (v.children !== undefined) {
    if (!Array.isArray(v.children)) r.at('children').error('expected an array of scene nodes');
    else v.children.forEach((c, i) => validateSceneNode(c, r.at('children').at(i), 1));
  }
  return components ? ({ ...(v as object), components } as PrefabDef) : undefined;
}
export function validateScene(v: unknown, r: Reporter): SceneDef | undefined {
  if (!isObject(v) || Array.isArray(v)) return r.error('expected a scene { description?, nodes }');
  for (const k of Object.keys(v)) if (!['$schema', 'description', 'nodes'].includes(k)) r.at(k).error('unknown scene field');
  if (!Array.isArray(v.nodes)) return r.at('nodes').error('expected an array of scene nodes');
  v.nodes.forEach((n, i) => validateSceneNode(n, r.at('nodes').at(i)));
  return { ...(v.description !== undefined ? { description: v.description as string } : {}), nodes: v.nodes as SceneNode[] };
}
/** Reports unknown prefab references and `extends` cycles across every registered prefab and scene. */
export function checkSceneReferences(registries: RegistryReader, report: (where: string) => Reporter): void {
  const lookup = (id: string): PrefabDef | undefined => registries.get(ScenePrefabs, id);
  const walk = (nodes: readonly SceneNode[] | undefined, r: Reporter): void => (nodes ?? []).forEach((n, i) => {
    const at = r.at(i);
    if (n.prefab !== undefined) { try { resolvePrefab(lookup, n.prefab); } catch (e) { at.at('prefab').error((e as Error).message); } }
    walk(n.children, at.at('children'));
  });
  for (const id of registries.ids(ScenePrefabs)) {
    const r = report(`prefab ${id}`);
    try { resolvePrefab(lookup, id); } catch (e) { r.at('extends').error((e as Error).message); }
    walk(lookup(id)!.children, r.at('children'));
  }
  for (const id of registries.ids(Scenes)) walk(registries.get(Scenes, id)!.nodes, report(`scene ${id}`).at('nodes'));
}

// ---------------------------------------------------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;
/** SceneTransform → Pose, starting from `base` fields that the transform leaves out. */
export function scenePose(t: SceneTransform | undefined, base?: Pose): Pose {
  const pose: Pose = base ? structuredClone(base) : { position: vec3(), rotation: quatIdentity(), scale: vec3(1, 1, 1) };
  if (t?.position) pose.position = vec3(...t.position);
  if (t?.rotation) {
    const q = t.rotation;
    pose.rotation = q.length === 4 ? quatNormalize({ x: q[0], y: q[1], z: q[2], w: q[3] }) : quatFromEuler(q[1] * DEG, q[0] * DEG, q[2] * DEG);
  }
  if (t?.scale !== undefined) pose.scale = typeof t.scale === 'number' ? vec3(t.scale, t.scale, t.scale) : vec3(...t.scale);
  return pose;
}
/** `"#rrggbb"` colours in JSON become numbers for Renderable. */
function componentData(id: string, data: Json): Json {
  if (id === RENDERABLE && isObject(data) && typeof (data as Record<string, Json>).color === 'string') {
    const hex = String((data as Record<string, Json>).color).replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) return { ...(data as Record<string, Json>), color: parseInt(hex, 16) };
  }
  return structuredClone(data);
}

export interface SpawnSceneOptions {
  /** Pose of the scene root entity (default identity). */
  at?: Pose;
  /** Parent of the scene root. Physics bodies are always spawned in world space (Rapier bodies cannot be parented). */
  parent?: EntityId;
  /** Label stored in SceneNodeInfo.scene (defaults to the scene id). */
  label?: string;
}
export interface SpawnedScene {
  root: EntityId;
  /** Every spawned entity, depth-first in file order (the root excluded). */
  entities: EntityId[];
  /** First entity per node name. Unnamed nodes are named after their prefab, then "node<index>". */
  byName: Map<string, EntityId>;
}

/** Adds a prefab's resolved components (except the transform) to an existing entity. Used by the glTF extras path. */
export function applyPrefabComponents(ctx: SessionContext, entity: EntityId, prefab: string, overrides?: Record<string, Json>): void {
  const resolved = resolvePrefab((id) => ctx.registries.get(ScenePrefabs, id), prefab);
  for (const [id, data] of Object.entries(mergeComponents(resolved.components, overrides))) if (id !== TRANSFORM) ctx.world.add(entity, { id }, componentData(id, data));
}

/** Spawns a registered scene (by id) or an inline SceneDef. Unknown prefabs throw SceneError (validate first). */
export function spawnScene(ctx: SessionContext, scene: string | SceneDef, opts: SpawnSceneOptions = {}): SpawnedScene {
  const def = typeof scene === 'string' ? ctx.registries.get(Scenes, scene) : scene;
  if (!def) throw new SceneError(`unknown scene "${String(scene)}"`);
  const label = opts.label ?? (typeof scene === 'string' ? scene : undefined);
  const w = ctx.world, lookup = (id: string): PrefabDef | undefined => ctx.registries.get(ScenePrefabs, id);
  const rootPose = opts.at ?? scenePose(undefined);
  const root = w.create();
  w.add(root, Transform3D, { ...structuredClone(rootPose), ...(opts.parent !== undefined ? { parent: opts.parent } : {}) });
  w.add(root, SceneNodeInfo, { name: label ?? 'scene', ...(label ? { scene: label } : {}) });
  const entities: EntityId[] = [];
  const byName = new Map<string, EntityId>();
  let counter = 0;
  const spawn = (node: SceneNode, parent: EntityId, parentWorld: Pose, depth: number): void => {
    if (depth > 64) throw new SceneError('scene nesting is deeper than 64 levels (recursive prefab children?)');
    const resolved = node.prefab ? resolvePrefab(lookup, node.prefab) : { components: {}, children: [], chain: [] };
    const comps = mergeComponents(resolved.components, node.overrides);
    const local = scenePose(node.transform, comps[TRANSFORM] ? scenePose(comps[TRANSFORM] as SceneTransform) : undefined);
    const world = composePose(parentWorld, local);
    const e = w.create();
    entities.push(e);
    const name = node.name ?? (node.prefab ? node.prefab.split('/').pop()! : `node${counter}`);
    counter++;
    if (!byName.has(name)) byName.set(name, e);
    const physical = comps[BODY] !== undefined || comps[COLLIDER] !== undefined;
    w.add(e, Transform3D, physical ? world : { ...local, parent });
    if (comps[COLLIDER] !== undefined && comps[BODY] === undefined) comps[BODY] = { type: 'fixed' };
    for (const [id, data] of Object.entries(comps)) if (id !== TRANSFORM) w.add(e, { id }, componentData(id, data));
    w.add(e, SceneNodeInfo, { name, ...(node.prefab ? { prefab: node.prefab } : {}), ...(label ? { scene: label } : {}), ...(node.props ? { props: structuredClone(node.props) } : {}) });
    for (const c of [...resolved.children, ...(node.children ?? [])]) spawn(c, e, world, depth + 1);
  };
  for (const n of def.nodes) spawn(n, root, rootPose, 0);
  return { root, entities, byName };
}

/** Loads a `*.scene.json` file through the asset service, validates it and spawns it. */
export async function spawnSceneFile(ctx: SessionContext, path: string, opts: SpawnSceneOptions = {}): Promise<SpawnedScene> {
  const issues: { source: string; path: string; message: string }[] = [];
  const def = validateScene(JSON.parse(await ctx.services.get(Assets).text(ctx, path)), new Reporter(issues, path));
  if (!def || issues.length) throw new SceneError(`${path}: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  return spawnScene(ctx, def, { label: path, ...opts });
}

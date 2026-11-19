/**
 * Shared game contracts: actor components, world description, prefabs, input, flow, UI, roles, view and theme
 * vocabulary every genre uses. Shooter-only contracts (combat, weapons, enemies, pickups, doors and the world
 * service) live in games/shooter/contracts/shooter.ts. The runtime kernel knows none of these names.
 */
import type { EntityId, Json, Reporter, SessionContext, ActivatableProvider } from '../core.ts';
import { defineComponent, defineEvent, defineRegistry, defineRole, defineService } from '../core.ts';
import type { AudioService, SoundDef } from './audio.ts';

export type Params = Readonly<Record<string, Json>>;

// ---------------------------------------------------------------------------------------------------------------------
// Components (plain serialisable data)
// ---------------------------------------------------------------------------------------------------------------------

/** Planar pose. Y is up and fixed per actor in v1. prev* is the pose at the previous tick (render interpolation). */
export interface Transform {
  x: number;
  z: number;
  /** Radians. 0 looks down -Z; positive turns left (counter-clockwise seen from above), like Three.js rotation.y. */
  yaw: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
}
export const Transform = defineComponent<Transform>('sdk/transform');

/** Simulation collision circle. Damage and blocking use this, never a sprite's visual bounds. */
export interface Collider {
  radius: number;
  /** "player", "enemy" or any custom team name. Attacks ignore their own team. */
  team: string;
  /** Solid colliders push each other apart. */
  solid: boolean;
}
export const Collider = defineComponent<Collider>('sdk/collider');

export interface Health {
  hp: number;
  max: number;
  dead: boolean;
}
export const Health = defineComponent<Health>('sdk/health');

/** What an actor wants to do this tick. Written by a controller (player) or AI; read by movement and combat. */
export interface Intent {
  /** Strafe (-1 left .. 1 right) and forward (-1 back .. 1 forward). */
  moveX: number;
  moveZ: number;
  fire: boolean;
  firePressed: boolean;
  use: boolean;
  /** Reload pressed this tick; optional for existing controllers. */
  reload?: boolean;
  /** 1-based weapon slot requested this tick, or 0. */
  weaponSlot: number;
  /** -1 / +1 to cycle weapons, or 0. */
  weaponCycle: number;
}
export const Intent = defineComponent<Intent>('sdk/intent');

/** Marks the player-controlled actor. */
export interface Player {
  kills: number;
  /** Simulation time of the last damage taken (HUD flash). */
  hurtAt: number;
  /** View kick, decays over time; cosmetic but deterministic. */
  speed: number;
}
export const Player = defineComponent<Player>('sdk/player');

export interface Inventory {
  /** Owned weapon ids. */
  weapons: string[];
  current: string | null;
  /** ammo type -> rounds */
  ammo: Record<string, number>;
  /** ammo type -> capacity */
  ammoMax: Record<string, number>;
  nextFireAt: number;
  lastFiredAt: number;
  switchedAt: number;
}
export const Inventory = defineComponent<Inventory>('sdk/inventory');

/**
 * Presentation hint written by simulation, consumed by whatever presentation plugin is active.
 * `key` names a theme visual ("enemy-grunt"), so swapping the art pack never touches gameplay.
 */
export interface Visual {
  key: string;
  /** Animation state name, e.g. "idle", "walk", "attack", "hurt", "dead". */
  state: string;
  /** Simulation time the state started. */
  stateAt: number;
  /** Height of the visual's anchor above the floor. */
  y: number;
  scale: number;
  /** CSS-style hex tint ("#ff8844") or "" for none. */
  tint: string;
  /** Actor renderer id; "" selects the presentation plugin's default billboard. */
  renderer: string;
}
export const Visual = defineComponent<Visual>('sdk/visual');
/** Optional player-body presentation used by overhead/third-person avatar presenters. */
export interface AvatarVisual {
  /** Theme visual key for the player body. */
  visual: string;
  /** World-space scale multiplier. */
  scale: number;
  /** Vertical offset above the floor. */
  y: number;
}
export const PlayerAvatar = defineComponent<AvatarVisual>('sdk/player-avatar');


// ---------------------------------------------------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------------------------------------------------

export interface SolidDesc {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Theme texture key. */
  surface: string;
}
export interface DoorDesc extends SolidDesc {
  cellX: number;
  cellZ: number;
  /** Axis the door slab runs along. */
  axis: 'x' | 'z';
  /** Doors that start locked only open through a switch (or code). */
  locked: boolean;
}
export interface SpawnDesc {
  id: string;
  prefab: string;
  x: number;
  z: number;
  yaw: number;
  tags: string[];
  params: Params;
}
export interface TriggerDesc {
  id: string;
  /** "switch": activated with Use when near and facing; "zone": fires when a player enters the radius. */
  kind: 'switch' | 'zone';
  x: number;
  z: number;
  radius: number;
  tags: string[];
  /** Door id opened when the trigger fires ("" for none). */
  opens: string;
  /** Switch only: wall face normal the panel is mounted on. */
  nx: number;
  nz: number;
  once: boolean;
}
export interface LightDesc {
  id: string;
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}
export interface CellDesc {
  solid: boolean;
  /** Theme texture keys ("" = none). */
  wall: string;
  floor: string;
  ceiling: string;
}

/** The single authoritative world definition. Rendering, collision, line of sight and navigation all derive from it. */
export interface WorldDescription {
  id: string;
  name: string;
  cellSize: number;
  /** Size in cells. */
  width: number;
  height: number;
  wallHeight: number;
  /** Row-major, length width*height. */
  cells: CellDesc[];
  solids: SolidDesc[];
  doors: DoorDesc[];
  spawns: SpawnDesc[];
  triggers: TriggerDesc[];
  lights: LightDesc[];
  playerStart: { x: number; z: number; yaw: number };
  ambient: { color: number; intensity: number };
  fog: { color: number; near: number; far: number };
}

/** A playable map, already translated by its format into the authoritative description. */
export interface MapDef {
  name: string;
  format: string;
  world: WorldDescription;
  /** Original author-facing JSON (kept for export). */
  source: Json;
}
export const Maps = defineRegistry<MapDef>('map');

/** Translates one authoring format into a WorldDescription. Report problems on `r`; return undefined on failure. */
export interface MapFormat {
  description: string;
  build(id: string, data: Json, r: Reporter): WorldDescription | undefined;
}
export const MapFormats = defineRegistry<MapFormat>('map-format');

// ---------------------------------------------------------------------------------------------------------------------
// Prefabs
// ---------------------------------------------------------------------------------------------------------------------

export interface SpawnAt {
  x: number;
  z: number;
  yaw: number;
}
export type SpawnFn = (at: SpawnAt, params: Params) => EntityId;
/** Entity factory. `start` runs once per session in the context of the plugin that registered the prefab. */
export interface Prefab {
  description: string;
  start(ctx: SessionContext): SpawnFn;
}
export const Prefabs = defineRegistry<Prefab>('prefab');

/** Spawns a registered prefab. The new entity is owned by the plugin that registered the prefab. */
export function spawnPrefab(ctx: SessionContext, prefabId: string, at: SpawnAt, params: Params = {}): EntityId {
  return ctx.instantiate(Prefabs, prefabId, (def, owner) => def.start(owner))(at, params);
}

// ---------------------------------------------------------------------------------------------------------------------
// Host-provided platform services (available in every session; fakes exist for headless tests)
// ---------------------------------------------------------------------------------------------------------------------

export interface InputActionDef {
  label: string;
  /**
   * KeyboardEvent.code values, "Mouse0".."Mouse2", "WheelUp", "WheelDown", and (SDK 3) gamepad / touch virtual keys
   * such as "GamepadA" or "TouchA" (see GAMEPAD_BUTTONS / TOUCH_BUTTONS in contracts/input.ts).
   */
  keys: string[];
}
export const InputActions = defineRegistry<InputActionDef>('input-action');

/** Input sampled for exactly one simulation tick. Edges (pressed/released) appear in one tick only. */
export interface TickInput {
  held(action: string): boolean;
  pressed(action: string): boolean;
  released(action: string): boolean;
  /** Mouse movement in pixels accumulated since the previous tick (consumed once). */
  readonly lookX: number;
  readonly lookY: number;
  /** Absolute CSS-pixel position relative to the input surface; absent on older/headless adapters. */
  readonly pointer?: Readonly<{ x: number; y: number; inside: boolean }>;
  /** SDK 3: value of an `InputAxes` entry this tick (use `readAxis`, which handles adapters without it). */
  axis?(id: string): Readonly<{ x: number; y: number }>;
}
export interface InputService {
  readonly tick: TickInput;
}
export const Input = defineService<InputService>('sdk/input');

export interface InputBinding {
  action: string;
  keys: readonly string[];
}
export interface InputContextOptions {
  bindings: readonly InputBinding[];
  /** Higher priorities route first; equal priorities use creation order. Default 0. */
  priority?: number;
  /** Matching keys stop at this context by default. False also routes them to lower contexts and legacy Input. */
  consume?: boolean;
  /** Claim all keyboard/pointer input, including unmapped keys, from lower contexts. Default false. */
  exclusive?: boolean;
  enabled?: boolean;
}
export interface InputContext extends InputService {
  readonly enabled: boolean;
  /** Context changes cancel all held actions/edges. Previously held keys must be released before reuse. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}
export interface InputContextsService {
  /** Bindings are copied on creation. The owner scope disposes the context automatically. */
  create(ctx: Pick<SessionContext, 'scope'>, options: InputContextOptions): InputContext;
}
export const InputContexts = defineService<InputContextsService>('sdk/input-contexts');

export interface FlowResult {
  outcome: 'victory' | 'defeat';
  title: string;
  detail: string;
  stats: [label: string, value: string][];
}
/** Session-level game flow: objective text, mode status lines, transient messages, and the end of the run. */
export interface FlowService {
  readonly ended: boolean;
  readonly result: FlowResult | undefined;
  readonly objective: string;
  setObjective(text: string): void;
  /** Mode-published status lines for HUDs, e.g. ("score", "Score", "1200"). Insertion ordered. */
  setStatus(key: string, label: string, value: string): void;
  readonly status: ReadonlyMap<string, { label: string; value: string }>;
  /** Transient notice ("Door unlocked"). */
  notify(text: string): void;
  /** Ends the run once; later calls are ignored. The host pauses simulation and shows the result screen. */
  end(result: FlowResult): void;
  /** Bumps whenever objective/status/notice changed (cheap dirty check for HUDs). */
  readonly revision: number;
  readonly notice: { text: string; at: number };
}
export const Flow = defineService<FlowService>('sdk/flow');
export const FlowEnded = defineEvent<FlowResult>('sdk/flow-ended');

export interface SettingsService {
  /** Radians of yaw per pixel of mouse movement. */
  readonly lookSensitivity: number;
}
export const Settings = defineService<SettingsService>('sdk/settings');

export const Audio = defineService<AudioService>('sdk/audio');

/** DOM mounting for HUDs and panels. Browser only: use ctx.services.tryGet(Ui) if the plugin must also run headless. */
export interface UiService {
  /** Creates an owned root element in the given layer; it is removed when `ctx.scope` is disposed. */
  mount(ctx: SessionContext, layer: 'hud' | 'overlay', className?: string): HTMLElement;
  /** Injects a stylesheet owned by the plugin's session scope. */
  addStyles(ctx: SessionContext, css: string): void;
}
export const Ui = defineService<UiService>('sdk/ui');

// ---------------------------------------------------------------------------------------------------------------------
// Exclusive roles (the preset selects exactly one provider for each)
// ---------------------------------------------------------------------------------------------------------------------

export interface RoleInfo extends ActivatableProvider {
  name: string;
  description: string;
}
/** Turns Input into the player's Intent/Transform. */
export const ControllerRole = defineRole<RoleInfo>('sdk/controller');
/** Publishes the View service every frame. */
export const CameraRole = defineRole<RoleInfo>('sdk/camera');
/** Owns objectives, spawning policy and the end condition. */
export const ModeRole = defineRole<RoleInfo>('sdk/mode');
/** Player-facing HUD. */
export const HudRole = defineRole<RoleInfo>('sdk/hud');

/** Camera pose for rendering, interpolated per frame by the active camera provider. */
export interface ViewState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
  /** Entity the view belongs to (0 if free). */
  entity: EntityId;
}
export const View = defineService<ViewState>('sdk/view');

// ---------------------------------------------------------------------------------------------------------------------
// Theme (art + sound pack): gameplay refers to theme KEYS; the selected theme supplies the assets.
// ---------------------------------------------------------------------------------------------------------------------

export interface Painter {
  width: number;
  height: number;
  paint(ctx: CanvasRenderingContext2D): void;
}
export interface VisualAnim {
  frames: number[];
  fps: number;
  loop: boolean;
}
export interface VisualDef {
  texture: string;
  /** Frame size in pixels inside the texture strip. */
  frameW: number;
  frameH: number;
  /** World-space size of the billboard. */
  width: number;
  height: number;
  /** Rendered without lighting (projectiles, glows). */
  fullbright: boolean;
  additive: boolean;
  anims: Record<string, VisualAnim>;
}
export interface ThemeProvider {
  name: string;
  textures: Readonly<Record<string, Painter>>;
  sounds: Readonly<Record<string, SoundDef>>;
  visuals: Readonly<Record<string, VisualDef>>;
}
export const ThemeRole = defineRole<ThemeProvider>('sdk/theme');

// ---------------------------------------------------------------------------------------------------------------------
// Small shared math helpers (yaw convention in one place)
// ---------------------------------------------------------------------------------------------------------------------

/** Unit forward vector on XZ for a yaw (0 = -Z, positive = turn left). */
export const yawDirX = (yaw: number): number => -Math.sin(yaw);
export const yawDirZ = (yaw: number): number => -Math.cos(yaw);
/** Yaw that faces along (dx, dz). */
export const yawOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function makeTransform(x: number, z: number, yaw: number): Transform {
  return { x, z, yaw, prevX: x, prevZ: z, prevYaw: yaw };
}

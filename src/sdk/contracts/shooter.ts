/**
 * Shooter contracts: the shared vocabulary gameplay plugins use to cooperate without importing each other.
 * Everything here is either plain data (components, definitions, events) or an interface some plugin provides.
 * The runtime kernel knows none of these names.
 */
import type { EntityId, Json, Reporter, SessionContext, ActivatableProvider } from '../core.ts';
import { defineCommand, defineComponent, defineEvent, defineRegistry, defineRole, defineService } from '../core.ts';
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

export interface Enemy {
  def: string;
  state: 'idle' | 'chase' | 'windup' | 'pain' | 'dead';
  target: EntityId;
  stateUntil: number;
  nextAttackAt: number;
  /** Flat [x0, z0, x1, z1, ...] waypoints. */
  path: number[];
  nextPathAt: number;
  /** Free numeric scratch space for AI behaviours. */
  memory: Record<string, number>;
}
export const Enemy = defineComponent<Enemy>('sdk/enemy');

export interface Pickup {
  def: string;
}
export const Pickup = defineComponent<Pickup>('sdk/pickup');

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

export interface RayHit {
  /** Distance travelled along the (normalised) direction. */
  t: number;
  x: number;
  z: number;
  /** Surface normal at the hit, pointing back toward the ray origin side. */
  nx: number;
  nz: number;
  solidId: string;
}

export interface DoorState {
  readonly desc: DoorDesc;
  open: boolean;
  locked: boolean;
  /** 0 closed .. 1 open; animates for presentation. Collision uses `open` only. */
  openness: number;
}
export interface TriggerState {
  readonly desc: TriggerDesc;
  fired: boolean;
}

export interface WorldService {
  readonly desc: WorldDescription;
  /** Increments whenever blocking state changes (a door opens/closes). */
  readonly version: number;
  /** Moves a circle by (dx,dz) with wall sliding; writes the final position into `out`. Returns true if it touched something. */
  moveCircle(x: number, z: number, radius: number, dx: number, dz: number, out: { x: number; z: number }): boolean;
  /**
   * Nearest blocking hit of a ray (radius 0) or a swept circle (radius > 0) travelling up to maxDist along a unit
   * direction. Continuous: thin walls are never skipped regardless of speed. Returns null when nothing is hit.
   */
  raycast(x: number, z: number, dirX: number, dirZ: number, maxDist: number, radius?: number): RayHit | null;
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean;
  /** True when a circle at this position overlaps no blocking shape and lies inside the map. */
  isFree(x: number, z: number, radius: number): boolean;
  /** Grid path around walls and closed doors. Fills `out` with flat [x,z,...] waypoints (start excluded). */
  findPath(ax: number, az: number, bx: number, bz: number, out: number[]): boolean;
  doors(): readonly DoorState[];
  door(id: string): DoorState | undefined;
  /** Returns false if the door is unknown or (when closing) something stands in it. `force` ignores the lock. */
  setDoorOpen(id: string, open: boolean, force?: boolean): boolean;
  triggers(): readonly TriggerState[];
}
export const World = defineService<WorldService>('sdk/world');

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

export const DoorChanged = defineEvent<{ id: string; open: boolean; x: number; z: number }>('sdk/door-changed');
export const TriggerFired = defineEvent<{ id: string; kind: 'switch' | 'zone'; tags: string[]; by: EntityId; x: number; z: number }>('sdk/trigger-fired');
/** Use was pressed near a locked door or with nothing to use (HUD feedback). */
export const UseFailed = defineEvent<{ by: EntityId; reason: 'locked' | 'nothing' }>('sdk/use-failed');

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
// Combat
// ---------------------------------------------------------------------------------------------------------------------

export interface DamageRequest {
  target: EntityId;
  amount: number;
  /** Free-form damage kind: "bullet", "plasma", "melee", ... */
  kind: string;
  /** Entity responsible (0 if none). */
  source: EntityId;
  /** World position of the hit (for feedback). */
  x: number;
  z: number;
}
/** Request damage. Queued; resolved in the `damage` phase of the same tick (see CombatService.damage). */
export const DealDamage = defineCommand<DamageRequest>('sdk/deal-damage');

export const Damaged = defineEvent<{ target: EntityId; amount: number; kind: string; source: EntityId; x: number; z: number; hp: number; lethal: boolean }>('sdk/damaged');
export const Died = defineEvent<{ entity: EntityId; source: EntityId; kind: string; x: number; z: number }>('sdk/died');
export const AttackFired = defineEvent<{ shooter: EntityId; attackId: string; behavior: string; x: number; z: number; dirX: number; dirZ: number; sound: string }>('sdk/attack-fired');
/** Something struck a wall or an actor. `effect` is a presentation hint chosen by the attack behaviour. */
export const Impact = defineEvent<{ x: number; z: number; y: number; nx: number; nz: number; target: EntityId; effect: string; sound: string }>('sdk/impact');
export const WeaponSwitched = defineEvent<{ entity: EntityId; weapon: string }>('sdk/weapon-switched');
export const WeaponDry = defineEvent<{ entity: EntityId; weapon: string }>('sdk/weapon-dry');
export const PickupCollected = defineEvent<{ pickup: EntityId; def: string; by: EntityId; x: number; z: number; sound: string; label: string }>('sdk/pickup-collected');
export const EnemyAlerted = defineEvent<{ entity: EntityId; def: string; x: number; z: number }>('sdk/enemy-alerted');

export interface AttackShot {
  shooter: EntityId;
  team: string;
  /** Muzzle position and unit aim direction on the XZ plane. */
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** Weapon or enemy definition id that fired. */
  attackId: string;
  params: Params;
}
export type AttackFn = (shot: AttackShot) => void;
/**
 * Attack behaviour = code. Weapon/enemy definitions = data that select a behaviour by id and pass params.
 * `start` runs once per session in the registering plugin's context; create systems/components there.
 */
export interface AttackBehavior {
  description: string;
  /** Validate the params a definition passes. Report on `r`. */
  validateParams?(params: Params, r: Reporter): void;
  start(ctx: SessionContext): AttackFn;
}
export const AttackBehaviors = defineRegistry<AttackBehavior>('attack-behavior');

export interface AttackSpec {
  behavior: string;
  params: Params;
}

export interface WeaponDef {
  name: string;
  /** 1-based selection slot. */
  slot: number;
  attack: AttackSpec;
  /** Ammo type consumed ("" = infinite). */
  ammoType: string;
  ammoPerShot: number;
  /** Seconds between shots (simulation time). */
  cooldown: number;
  /** Hold-to-fire. */
  auto: boolean;
  /** Part of the default player loadout. */
  starter: boolean;
  /** Theme keys. */
  view: string;
  fireSound: string;
  /** Cosmetic recoil strength 0..1. */
  recoil: number;
  /** Muzzle flash colour (hex string). */
  flash: string;
}
export const Weapons = defineRegistry<WeaponDef>('weapon');

export interface AmmoDef {
  name: string;
  max: number;
  /** Rounds in the default player loadout. */
  start: number;
}
export const AmmoTypes = defineRegistry<AmmoDef>('ammo');

/** Additive damage modifiers run in ascending `order`, ties broken by id. Each receives the previous amount. */
export interface DamageModifier {
  description: string;
  order: number;
  start(ctx: SessionContext): (req: Readonly<DamageRequest>, amount: number) => number;
}
export const DamageModifiers = defineRegistry<DamageModifier>('damage-modifier');

export interface ActorHit {
  entity: EntityId;
  t: number;
  x: number;
  z: number;
}
export interface ScanHit {
  /** Distance to the first thing hit, or maxDist when nothing was hit. */
  t: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Actor struck (0 when a wall or nothing was hit). */
  entity: EntityId;
  hitWall: boolean;
}

export interface CombatService {
  /**
   * Queues damage. Resolution (phase `damage`, FIFO): skip stale/dead targets -> run DamageModifiers in order ->
   * drop if amount <= 0 -> subtract hp -> emit Damaged -> at hp <= 0 mark dead and emit Died exactly once.
   */
  damage(req: DamageRequest): void;
  heal(target: EntityId, amount: number): number;
  /** Nearest living collider (not on `ignoreTeam`, not `ignore`) hit by a swept circle; walls are NOT considered. */
  sweepActors(x: number, z: number, dirX: number, dirZ: number, maxDist: number, radius: number, ignore: EntityId, ignoreTeam: string): ActorHit | null;
  /** Nearest of wall or actor along a ray: hitscan stops at the first blocking obstacle. */
  hitscan(x: number, z: number, dirX: number, dirZ: number, maxDist: number, ignore: EntityId, ignoreTeam: string): ScanHit;
  /** Runs a registered attack behaviour for `shooter`. Emits AttackFired. */
  fireAttack(shot: AttackShot, behavior: string, sound: string): void;
  giveAmmo(entity: EntityId, ammoType: string, amount: number): number;
  giveWeapon(entity: EntityId, weaponId: string): boolean;
}
export const Combat = defineService<CombatService>('sdk/combat');

// ---------------------------------------------------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------------------------------------------------

/** Returns true if the pickup was consumed. */
export type PickupEffectFn = (target: EntityId, params: Params) => boolean;
export interface PickupEffect {
  description: string;
  validateParams?(params: Params, r: Reporter): void;
  start(ctx: SessionContext): PickupEffectFn;
}
export const PickupEffects = defineRegistry<PickupEffect>('pickup-effect');

export interface PickupDef {
  name: string;
  effect: string;
  params: Params;
  visual: string;
  sound: string;
  radius: number;
}
export const Pickups = defineRegistry<PickupDef>('pickup');

// ---------------------------------------------------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------------------------------------------------

export interface EnemyDef {
  name: string;
  health: number;
  speed: number;
  radius: number;
  sightRange: number;
  ai: string;
  aiParams: Params;
  attack: AttackSpec & { cooldown: number; range: number; windup: number; sound: string };
  visual: string;
  tint: string;
  scale: number;
  /** 0..1 chance to flinch when damaged. */
  painChance: number;
  score: number;
  sounds: { alert: string; hurt: string; die: string };
}
export const Enemies = defineRegistry<EnemyDef>('enemy');

/** Called every tick for a living, non-stunned enemy. Decide, move and attack through EnemyService. */
export type AiFn = (self: EntityId, enemy: Enemy, def: EnemyDef, dt: number) => void;
export interface AiBehavior {
  description: string;
  validateParams?(params: Params, r: Reporter): void;
  start(ctx: SessionContext): AiFn;
}
export const AiBehaviors = defineRegistry<AiBehavior>('ai-behavior');

/** Helpers for AI behaviours so a custom AI stays small. */
export interface EnemyService {
  spawn(defId: string, at: SpawnAt): EntityId;
  /** Living player entity nearest to the enemy (0 if none). */
  findTarget(self: EntityId): EntityId;
  canSee(self: EntityId, target: EntityId, maxRange: number): boolean;
  distanceTo(self: EntityId, target: EntityId): number;
  /** Follows a (cached, periodically refreshed) path toward the point with wall sliding; faces the travel direction. */
  moveToward(self: EntityId, x: number, z: number, speed: number, dt: number): void;
  /** Steps directly along a direction (no pathing), sliding on walls. */
  moveDir(self: EntityId, dirX: number, dirZ: number, speed: number, dt: number): void;
  faceTarget(self: EntityId, target: EntityId): void;
  /** Starts the definition's attack (windup, then fire toward the target) if off cooldown. Returns true if started. */
  beginAttack(self: EntityId, target: EntityId): boolean;
  /** Count of living enemies. */
  aliveCount(): number;
}
export const EnemyAi = defineService<EnemyService>('sdk/enemies');

// ---------------------------------------------------------------------------------------------------------------------
// Host-provided platform services (available in every session; fakes exist for headless tests)
// ---------------------------------------------------------------------------------------------------------------------

export interface InputActionDef {
  label: string;
  /** KeyboardEvent.code values, or "Mouse0".."Mouse2", "WheelUp", "WheelDown". */
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
}
export interface InputService {
  readonly tick: TickInput;
}
export const Input = defineService<InputService>('sdk/input');

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

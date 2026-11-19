/**
 * Shooter contracts: combat, weapons, ammo, enemies and AI, pickups, interactions, doors/triggers and the world
 * service. Shared actor/input/flow/theme vocabulary lives in the SDK (packages/sdk/src/contracts/game.ts).
 */
import type { EntityId, RegistryReader, Reporter, SessionContext } from '@bulkhead/sdk';
import { defineCommand, defineComponent, defineEvent, defineRegistry, defineService } from '@bulkhead/sdk';
import type { DoorDesc, Params, SpawnAt, Transform, TriggerDesc, WorldDescription } from '@bulkhead/sdk';

/** Per-actor magazine state. Inventory.ammo remains the shared reserve. */
export interface WeaponRuntime {
  loaded: Record<string, number>;
  reload: { weapon: string; completesAt: number } | null;
}
export const WeaponRuntime = defineComponent<WeaponRuntime>('sdk/weapon-runtime');

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

/** One eligible Use target. Providers determine reach, facing and visibility before returning it. */
export interface InteractionCandidate {
  /** Stable, non-empty identifier unique within this provider's result. */
  id: string;
  /** Lower values win; built-in switches use 0 and doors use 1. */
  priority: number;
  /** Finite, non-negative distance in metres. */
  distance: number;
  /** Called once for the winner. A denial still consumes Use; provide feedback here. */
  use(): void;
}
export type InteractionProvider = (by: EntityId, pose: Readonly<Transform>) => readonly InteractionCandidate[];
export interface InteractionService {
  /** Register a uniquely named provider for the lifetime of ctx.scope. Returns an early, idempotent disposer. */
  register(ctx: SessionContext, id: string, provider: InteractionProvider): () => void;
}
/**
 * Candidates sort by ascending priority, distance, provider id, then candidate id (code-unit order).
 * Equidistant built-in switches or doors retain their original map array order instead of sorting by id.
 */
export const Interactions = defineService<InteractionService>('sdk/interactions');

export const DoorChanged = defineEvent<{ id: string; open: boolean; x: number; z: number }>('sdk/door-changed');
export const TriggerFired = defineEvent<{ id: string; kind: 'switch' | 'zone'; tags: string[]; by: EntityId; x: number; z: number }>('sdk/trigger-fired');
/** Use was pressed near a locked door or with nothing to use (HUD feedback). */
export const UseFailed = defineEvent<{ by: EntityId; reason: 'locked' | 'nothing' }>('sdk/use-failed');

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
  /** Validate the params a definition passes (shape, ranges, and references via `registries`). Report on `r`. */
  validateParams?(params: Params, r: Reporter, registries: RegistryReader): void;
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
  /** Opt in to a detachable magazine; requires reloadTime and a finite ammo type. */
  magazineSize?: number;
  /** Reload duration in simulation seconds. */
  reloadTime?: number;
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
  /**
   * Adds an unowned weapon. Magazine weapons immediately chamber what the shared reserve can supply;
   * granting never duplicates reserve ammo. Returns false for a missing weapon, inventory or duplicate.
   */
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
  validateParams?(params: Params, r: Reporter, registries: RegistryReader): void;
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
  validateParams?(params: Params, r: Reporter, registries: RegistryReader): void;
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


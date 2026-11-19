/**
 * SDK 3 physics vocabulary, implemented by `std/physics-rapier` (Rapier 3D). Bodies are entities with Transform3D +
 * RigidBody + one PhysicsCollider; the physics step runs inside the fixed tick and writes the solved pose back to
 * Transform3D. Bodies must be root entities (no Transform3D.parent).
 */
import { defineComponent, defineEvent, defineService } from '../core.ts';
import type { EntityId } from '@bulkhead/kernel/ecs.ts';
import type { Vec3 } from './spatial.ts';

export type BodyType = 'dynamic' | 'fixed' | 'kinematic';
export interface RigidBody {
  type: BodyType;
  /** Initial linear velocity, m/s (dynamic bodies). */
  linvel?: Vec3;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  /** Continuous collision detection for fast movers. */
  ccd?: boolean;
  /** Prevent rotation (upright characters, crates that slide). */
  lockRotations?: boolean;
}
export const RigidBody = defineComponent<RigidBody>('sdk/rigid-body');

export type ColliderShape = 'box' | 'ball' | 'capsule' | 'cylinder';
export interface PhysicsCollider {
  shape: ColliderShape;
  /** box: full extents; ball: x = diameter; capsule/cylinder: x = diameter, y = total height. Default 1. */
  size?: Vec3;
  /** Offset from the body origin. */
  offset?: Vec3;
  friction?: number;
  restitution?: number;
  density?: number;
  /** Sensors detect overlaps (PhysicsCollision with sensor: true) but never push. */
  sensor?: boolean;
}
export const PhysicsCollider = defineComponent<PhysicsCollider>('sdk/physics-collider');

/**
 * Kinematic character controller. Requires RigidBody { type: 'kinematic' } and a PhysicsCollider (capsule is typical).
 * Spawn characters slightly above the ground: a shape that starts exactly in contact is treated as penetrating.
 */
export interface CharacterController {
  /** Skin gap kept from obstacles, metres (default 0.02). */
  offset?: number;
  /** Max slope the character walks up, radians (default 45°). */
  maxSlopeClimb?: number;
  /** Steps up ledges up to this height, metres (default off). */
  autostep?: { maxHeight: number; minWidth: number };
  /**
   * Snaps down to the ground within this distance, metres (default off). Helps on stairs and downhill, but with
   * Rapier 0.19 a snapping character pressed against a wall can sink one tick of gravity into the floor.
   */
  snapToGround?: number;
}
export const CharacterController = defineComponent<CharacterController>('sdk/character-controller');

/** Write the desired displacement for this tick (metres, already multiplied by dt); physics consumes and zeroes it. */
export interface CharacterMove { desired: Vec3 }
export const CharacterMove = defineComponent<CharacterMove>('sdk/character-move');

/** Written by physics after each step for character entities. */
export interface CharacterState { grounded: boolean; moved: Vec3 }
export const CharacterState = defineComponent<CharacterState>('sdk/character-state');

/** Contact or sensor overlap began (`started`) or ended between two entities. Emitted after the step. */
export interface PhysicsCollisionEvent { a: EntityId; b: EntityId; started: boolean; sensor: boolean }
export const PhysicsCollision = defineEvent<PhysicsCollisionEvent>('sdk/physics-collision');

export interface PhysicsRayHit { entity: EntityId; distance: number; point: Vec3; normal: Vec3 }
export interface PhysicsService {
  readonly engine: string;
  gravity: Vec3;
  /** First hit along a ray. `direction` need not be normalised. `exclude` skips one entity (e.g. the shooter). */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, opts?: { exclude?: EntityId; sensors?: boolean }): PhysicsRayHit | undefined;
  applyImpulse(e: EntityId, impulse: Vec3): void;
  setLinearVelocity(e: EntityId, v: Vec3): void;
  linearVelocity(e: EntityId): Vec3 | undefined;
  /** Moves a body immediately (and its PrevTransform), waking it. */
  teleport(e: EntityId, position: Vec3): void;
  /** Bodies and colliders currently simulated (diagnostics). */
  stats(): { bodies: number; colliders: number };
}
export const Physics = defineService<PhysicsService>('sdk/physics');

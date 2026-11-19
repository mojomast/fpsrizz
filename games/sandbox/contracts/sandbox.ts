/** Sandbox vocabulary: read-only state the presentation, HUD and tests observe. */
import { defineComponent, defineService } from '@bulkhead/sdk';
import type { EntityId } from '@bulkhead/sdk';

export interface SandboxState {
  readonly hero: EntityId;
  readonly crates: readonly EntityId[];
  readonly pad: EntityId;
  /** Times the hero entered the glowing pad (a physics sensor). */
  readonly padEntries: number;
  readonly onPad: boolean;
  /** The glTF level's "Goal" trigger (custom property sandbox/goal), once the level loaded. */
  readonly goal: EntityId | undefined;
  readonly goalEntries: number;
  /** Entities spawned from models/levels/sandbox-props.glb, by node name. */
  readonly props: ReadonlyMap<string, EntityId>;
}
export const Sandbox = defineService<SandboxState>('sandbox/state');

/** sandbox/navmesh: the follower that chases the hero on the navmesh (NavAgent + NavAgentState). */
export interface SandboxNavState { readonly follower: EntityId }
export const SandboxNav = defineService<SandboxNavState>('sandbox/nav');

/** Level-authored components (Blender custom properties on nodes of models/levels/sandbox-props.glb). */
export interface SandboxGlow { intensity: number }
/** A point light drawn by sandbox/presentation. */
export const SandboxGlow = defineComponent<SandboxGlow>('sandbox/glow');
/** Marks a sensor whose entry counts as reaching the goal. */
export const SandboxGoal = defineComponent<Record<string, never>>('sandbox/goal');

/** The authored level and the display model, both optimised by `npm run assets`. */
export const LEVEL_MODEL = 'models/levels/sandbox-props.glb';
export const DISPLAY_MODEL = 'models/weapons/assault_rifle.glb';

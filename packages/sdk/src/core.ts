/**
 * SDK core: the generic plugin-host surface (no shooter concepts here).
 * Plugins import everything from "packages/sdk/src/index.ts" - never from packages/kernel/src or packages/platform-web/src.
 */
import type { CommandToken, EventToken, ServiceToken } from '@bulkhead/kernel/bus.ts';
import type { ComponentToken } from '@bulkhead/kernel/ecs.ts';
import type { PluginModule, RoleToken } from '@bulkhead/kernel/host.ts';
import type { RegistryToken } from '@bulkhead/kernel/registry.ts';

export const SDK_VERSION = '3.0.0';
/**
 * Older SDK majors this build still implements. SDK 3 only added APIs (queries, Transform3D, render sync, physics,
 * assets, input axes, audio buses, snapshots), so manifests declaring `^2.0.0` load unchanged.
 */
export const SDK_COMPAT: readonly string[] = ['2.0.0'];

/**
 * Simulation phases, in execution order, every 60 Hz tick:
 *  input        - bookkeeping at tick start (previous-pose snapshot for interpolation)
 *  control      - player controller turns sampled input into Intent and moves the player
 *  ai           - enemy decisions and movement
 *  movement     - other kinematic movement (projectiles)
 *  combat       - weapons fire, attacks resolve into damage requests
 *  damage       - queued damage is modified, applied, and deaths are declared
 *  world        - doors, triggers, pickups
 *  rules        - game mode / objectives
 *  presentation - simulation-side presentation state (animation states); no rendering here
 * Inside a phase systems sort by `order` (default 0), then by id.
 */
export const PHASES = ['input', 'control', 'ai', 'movement', 'combat', 'damage', 'world', 'rules', 'presentation'] as const;
export type Phase = (typeof PHASES)[number];

export const defineComponent = <T>(id: string): ComponentToken<T> => ({ id });
export const defineEvent = <T>(id: string): EventToken<T> => ({ id });
export const defineCommand = <P, R = void>(id: string): CommandToken<P, R> => ({ id });
export const defineService = <T>(id: string): ServiceToken<T> => ({ id });
export const defineRegistry = <T>(kind: string): RegistryToken<T> => ({ kind });
export const defineRole = <T>(id: string): RoleToken<T> => ({ id });
/** Identity helper that type-checks a plugin module's default export. */
export const definePlugin = (m: PluginModule): PluginModule => m;

export type { CommandToken, EventToken, ServiceToken } from '@bulkhead/kernel/bus.ts';
export type { ComponentToken, EntityId, Query, QueryChanges, QuerySpec } from '@bulkhead/kernel/ecs.ts';
export type { ActivatableProvider, CatalogEntry, ContentKind, ContentLoadContext, EntityApi, PluginModule, RegisterContext, RegistryReader, RoleToken, SessionContext, ValidationContext } from '@bulkhead/kernel/host.ts';
export type { ConfigField, ContentEntry, GamePreset, PluginManifest } from '@bulkhead/kernel/manifest.ts';
export type { RegistryEntry, RegistryToken } from '@bulkhead/kernel/registry.ts';
export type { Rng } from '@bulkhead/kernel/rng.ts';
export type { FrameSystemDef, SystemDef } from '@bulkhead/kernel/scheduler.ts';
export type { Disposer } from '@bulkhead/kernel/scope.ts';
export { Scope, ScopeDisposedError } from '@bulkhead/kernel/scope.ts';
export type { Issue, Json } from '@bulkhead/kernel/validate.ts';
export { Reporter, isObject, opt, vArray, vBool, vId, vJson, vNumber, vObject, vOneOf, vString } from '@bulkhead/kernel/validate.ts';

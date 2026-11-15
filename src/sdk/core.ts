/**
 * SDK core: the generic plugin-host surface (no shooter concepts here).
 * Plugins import everything from "src/sdk/index.ts" - never from src/kernel or src/platform.
 */
import type { CommandToken, EventToken, ServiceToken } from '../kernel/bus.ts';
import type { ComponentToken } from '../kernel/ecs.ts';
import type { PluginModule, RoleToken } from '../kernel/host.ts';
import type { RegistryToken } from '../kernel/registry.ts';

export const SDK_VERSION = '1.0.0';

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

export type { CommandToken, EventToken, ServiceToken } from '../kernel/bus.ts';
export type { ComponentToken, EntityId } from '../kernel/ecs.ts';
export type { ActivatableProvider, CatalogEntry, ContentKind, ContentLoadContext, EntityApi, PluginModule, RegisterContext, RegistryReader, RoleToken, SessionContext, ValidationContext } from '../kernel/host.ts';
export type { ConfigField, ContentEntry, GamePreset, PluginManifest } from '../kernel/manifest.ts';
export type { RegistryEntry, RegistryToken } from '../kernel/registry.ts';
export type { Rng } from '../kernel/rng.ts';
export type { FrameSystemDef, SystemDef } from '../kernel/scheduler.ts';
export type { Disposer } from '../kernel/scope.ts';
export { Scope, ScopeDisposedError } from '../kernel/scope.ts';
export type { Issue, Json } from '../kernel/validate.ts';
export { Reporter, isObject, opt, vArray, vBool, vId, vJson, vNumber, vObject, vOneOf, vString } from '../kernel/validate.ts';

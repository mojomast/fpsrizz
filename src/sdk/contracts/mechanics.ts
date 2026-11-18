/** Genre-neutral mechanic contracts. Implementations live in replaceable plugins, not in the SDK or kernel. */
import { defineEvent, defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';

export interface MechanicResult { readonly ok: boolean; readonly reason: string }
export type ResourceAmounts = Readonly<Record<string, number>>;
export interface ResourceDefinition { readonly id: string; readonly label: string; readonly initial: number; readonly max: number }
export interface ResourceTransaction { readonly spend?: ResourceAmounts; readonly gain?: ResourceAmounts }
/**
 * Consumer/provider-owned numeric balances. Definitions and observation snapshots are detached/frozen;
 * they are not a restore protocol. See docs/reference/reusable-mechanics.md and docs/reference/mechanic-conformance.md.
 */
export interface ResourcePool {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definitions: readonly ResourceDefinition[];
  /** Unknown IDs read as zero; transactions still reject unknown IDs, even for a zero amount. */
  get(id: string): number;
  snapshot(): ResourceAmounts;
  /** Pure advisory check. A later transact rechecks against the then-current state. */
  preview(transaction: ResourceTransaction): MechanicResult;
  /**
   * Checks all debits against pre-gain balances, then all credits against maxima; no clamping.
   * Ordinary rejection changes no balance/revision and emits no commit. An accepted empty transaction
   * still increments revision and emits a committed snapshot. Paused/disposed mutations reject.
   * Throwing custom observers are outside arbitrary rollback guarantees.
   */
  transact(transaction: ResourceTransaction, reason?: string): MechanicResult;
  /** Idempotent; releases ownership and permits ID reuse. Retained old handles cannot mutate a replacement. */
  dispose(): void;
}
export interface ResourcePoolProvider {
  /** IDs are unique among this provider's live resource instances for one consumer context. */
  create(owner: SessionContext, id: string, definitions: readonly ResourceDefinition[]): ResourcePool;
}

export type MechanicTimeDomain = 'seconds' | 'turns';
export interface MechanicClock {
  readonly id: string;
  readonly active: boolean;
  readonly domain: MechanicTimeDomain;
  readonly now: number;
  /** Only the composing game's simulation advances this clock; turns require a positive whole number. */
  advance(amount: number): MechanicResult;
  dispose(): void;
}
export interface MechanicClockProvider { create(owner: SessionContext, id: string, domain: MechanicTimeDomain): MechanicClock }

export interface MechanicActionDefinition extends ResourceTransaction {
  readonly id: string;
  readonly label: string;
  /** Measured in the explicitly bound clock's domain. */
  readonly cooldown: number;
}
export interface MechanicActions {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definitions: readonly MechanicActionDefinition[];
  preview(id: string): MechanicResult;
  /** Spatial/target legality belongs to the caller; execute only after validating it, inside simulation. */
  execute(id: string): MechanicResult;
  remaining(id: string): number;
  dispose(): void;
}
export interface MechanicActionProvider {
  create(owner: SessionContext, id: string, resources: ResourcePool, clock: MechanicClock, definitions: readonly MechanicActionDefinition[]): MechanicActions;
}

export interface ObjectiveDefinition {
  readonly id: string;
  readonly label: string;
  readonly target: number;
  readonly requires?: readonly string[];
}
export interface ObjectiveProgress extends ObjectiveDefinition {
  readonly value: number;
  readonly complete: boolean;
  readonly unlocked: boolean;
}
export interface ObjectiveTrack {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly complete: boolean;
  snapshot(): readonly ObjectiveProgress[];
  /** Positive integral progress, capped at target. A receipt is consumed only by a successful record. */
  record(id: string, amount?: number, receipt?: string): MechanicResult;
  dispose(): void;
}
export interface ObjectiveProvider { create(owner: SessionContext, id: string, definitions: readonly ObjectiveDefinition[]): ObjectiveTrack }

export interface MechanicProviderInfo { readonly name: string; readonly description: string }
export interface MechanicFactory<T> { start(owner: SessionContext): T }
export const ResourcePoolProviders = defineRegistry<MechanicFactory<ResourcePoolProvider>>('mechanic-resource-provider');
export const MechanicClockProviders = defineRegistry<MechanicFactory<MechanicClockProvider>>('mechanic-clock-provider');
export const MechanicActionProviders = defineRegistry<MechanicFactory<MechanicActionProvider>>('mechanic-action-provider');
export const ObjectiveProviders = defineRegistry<MechanicFactory<ObjectiveProvider>>('mechanic-objective-provider');
export const ResourceMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-resources');
export const ClockMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-clock');
export const ActionMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-actions');
export const ObjectiveMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-objectives');

export const MechanicResourcesChanged = defineEvent<{ owner: string; instance: string; reason: string; revision: number; values: ResourceAmounts }>('mechanics/resources-changed');
export const MechanicActionCommitted = defineEvent<{ owner: string; instance: string; action: string; at: number; domain: MechanicTimeDomain }>('mechanics/action-committed');
export const MechanicObjectiveChanged = defineEvent<{ owner: string; instance: string; objective: string; value: number; complete: boolean }>('mechanics/objective-changed');

export interface MechanicKitDefinition {
  readonly name: string;
  readonly domain: MechanicTimeDomain;
  readonly resources: readonly ResourceDefinition[];
  readonly actions: readonly MechanicActionDefinition[];
  readonly objectives: readonly ObjectiveDefinition[];
}
export const MechanicKits = defineRegistry<MechanicKitDefinition>('mechanic-kit');
export interface MechanicKit {
  readonly definition: MechanicKitDefinition;
  readonly resources: ResourcePool;
  readonly clock: MechanicClock;
  readonly actions: MechanicActions;
  readonly objectives: ObjectiveTrack;
  dispose(): void;
}

/** Resolve a selected implementation lazily in its registering owner's context. No gameplay rules live here. */
export function resourceMechanic(ctx: SessionContext): ResourcePoolProvider {
  const selected = ctx.role(ResourceMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-resources in the preset');
  return ctx.instantiate(ResourcePoolProviders, selected.id, (factory, owner) => factory.start(owner));
}
export function clockMechanic(ctx: SessionContext): MechanicClockProvider {
  const selected = ctx.role(ClockMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-clock in the preset');
  return ctx.instantiate(MechanicClockProviders, selected.id, (factory, owner) => factory.start(owner));
}
export function actionMechanic(ctx: SessionContext): MechanicActionProvider {
  const selected = ctx.role(ActionMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-actions in the preset');
  return ctx.instantiate(MechanicActionProviders, selected.id, (factory, owner) => factory.start(owner));
}
export function objectiveMechanic(ctx: SessionContext): ObjectiveProvider {
  const selected = ctx.role(ObjectiveMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-objectives in the preset');
  return ctx.instantiate(ObjectiveProviders, selected.id, (factory, owner) => factory.start(owner));
}
/** Convenience composition only: callers may independently create any of the four mechanics instead. */
export function createMechanicKit(ctx: SessionContext, definitionId: string, instanceId: string): MechanicKit {
  const definition = ctx.registries.require(MechanicKits, definitionId);
  const owned: { dispose(): void }[] = [];
  try {
    const resources = resourceMechanic(ctx).create(ctx, instanceId, definition.resources); owned.push(resources);
    const clock = clockMechanic(ctx).create(ctx, instanceId, definition.domain); owned.push(clock);
    const actions = actionMechanic(ctx).create(ctx, instanceId, resources, clock, definition.actions); owned.push(actions);
    const objectives = objectiveMechanic(ctx).create(ctx, instanceId, definition.objectives); owned.push(objectives);
    return { definition, resources, clock, actions, objectives, dispose() { for (const handle of [...owned].reverse()) handle.dispose(); } };
  } catch (error) {
    for (const handle of [...owned].reverse()) handle.dispose();
    throw error;
  }
}

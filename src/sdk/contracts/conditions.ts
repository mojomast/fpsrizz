/** Timed named conditions; consumers own all gameplay consequences and clock advancement. */
import { defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';
import type { MechanicClock, MechanicFactory, MechanicProviderInfo, MechanicResult, MechanicTimeDomain } from './mechanics.ts';

export interface ConditionSnapshot { readonly target: string; readonly condition: string; readonly remaining: number }
export interface Conditions {
  readonly id: string;
  readonly active: boolean;
  readonly domain: MechanicTimeDomain;
  /** Apply or refresh one target/condition pair, replacing its remaining duration. */
  apply(target: string, condition: string, duration: number): MechanicResult;
  /** Remove a pair, including an expired pair. Unknown pairs are harmless. */
  remove(target: string, condition: string): MechanicResult;
  /** Live entries only, in insertion order. Expiry occurs exactly at the deadline. */
  snapshot(): readonly ConditionSnapshot[];
  has(target: string, condition: string): boolean;
  dispose(): void;
}
export interface ConditionProvider { create(owner: SessionContext, id: string, clock: MechanicClock): Conditions }
export const ConditionProviders = defineRegistry<MechanicFactory<ConditionProvider>>('mechanic-condition-provider');
export const ConditionMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-conditions');
export function conditionMechanic(ctx: SessionContext): ConditionProvider {
  const selected = ctx.role(ConditionMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-conditions in the preset');
  return ctx.instantiate(ConditionProviders, selected.id, (factory, owner) => factory.start(owner));
}

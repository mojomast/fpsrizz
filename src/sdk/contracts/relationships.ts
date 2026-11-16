import { defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';
import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from './mechanics.ts';

export interface RelationshipPair { readonly a: string; readonly b: string; readonly score: number }
export interface RelationshipDefinition {
  readonly min: number;
  readonly max: number;
  /** Explicit unordered pairs, in snapshot order; no implicit actors or pairs are created. */
  readonly pairs: readonly RelationshipPair[];
}
export interface MechanicRelationships {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: RelationshipDefinition;
  /** Unknown and self pairs return undefined; argument order does not matter. */
  get(a: string, b: string): number | undefined;
  /** Detached frozen snapshot, retaining authored pair order and canonical actor order. */
  snapshot(): readonly RelationshipPair[];
  /** Finite signed delta, clamped to the bounds. Accepted zero/clamped changes increment revision. */
  change(a: string, b: string, delta: number): MechanicResult;
  dispose(): void;
}
export interface RelationshipProvider {
  create(owner: SessionContext, id: string, definition: RelationshipDefinition): MechanicRelationships;
}
export const RelationshipProviders = defineRegistry<MechanicFactory<RelationshipProvider>>('mechanic-relationship-provider');
export const RelationshipMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-relationships');
export function relationshipMechanic(ctx: SessionContext): RelationshipProvider {
  const selected = ctx.role(RelationshipMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-relationships in the preset');
  return ctx.instantiate(RelationshipProviders, selected.id, (factory, owner) => factory.start(owner));
}

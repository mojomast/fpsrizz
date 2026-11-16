import { defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';
import type { MechanicFactory, MechanicProviderInfo } from './mechanics.ts';

/** Ordered from lowest to highest priority; the last tier whose conditions all match wins. */
export interface OutcomeRatingDefinition {
  readonly tiers: readonly { readonly id: string; readonly conditions: readonly {
    readonly metric: string; readonly operator: 'at-most' | 'at-least'; readonly value: number;
  }[] }[];
}
export interface OutcomeRating {
  readonly id: string;
  readonly active: boolean;
  readonly definition: OutcomeRatingDefinition;
  /** All referenced metrics must be finite. Returns the best matching tier, or undefined. Throws after disposal. */
  evaluate(metrics: Readonly<Record<string, number>>): string | undefined;
  dispose(): void;
}
export interface OutcomeRatingProvider {
  create(owner: SessionContext, id: string, definition: OutcomeRatingDefinition): OutcomeRating;
}
export const OutcomeRatingProviders = defineRegistry<MechanicFactory<OutcomeRatingProvider>>('mechanic-outcome-rating-provider');
export const OutcomeRatingRole = defineRole<MechanicProviderInfo>('sdk/mechanic-outcome-rating');
export function outcomeRatingMechanic(ctx: SessionContext): OutcomeRatingProvider {
  const selected = ctx.role(OutcomeRatingRole);
  if (!selected) throw new Error('Select sdk/mechanic-outcome-rating in the preset');
  return ctx.instantiate(OutcomeRatingProviders, selected.id, (factory, owner) => factory.start(owner));
}

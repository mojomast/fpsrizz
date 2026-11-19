import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from './mechanics.ts';
import { defineEvent, defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';

/** Immutable XP curve. The first level requires `baseXp`; each later level adds `growth`. */
export interface ProgressionDefinition {
  readonly startLevel: number;
  readonly baseXp: number;
  readonly growth: number;
  /** Optional inclusive cap. Defaults to 1000. */
  readonly maxLevel?: number;
}
export interface ProgressionGrant extends MechanicResult {
  /** Number of levels completed by this accepted grant. */
  readonly levels: number;
}
/**
 * Owned XP/level ledger. It owns thresholds, level counts and pending level rewards, not the rewards themselves.
 * Gameplay decides what a level grants and when a pending reward is consumed.
 */
export interface MechanicProgression {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: ProgressionDefinition;
  readonly level: number;
  /** XP earned within the current level. */
  readonly xp: number;
  /** XP required to finish the current level; equal to `xp` at the cap. */
  readonly xpToNext: number;
  /** Lifetime accepted XP, including overflow consumed by level-ups. */
  readonly totalXp: number;
  /** Completed levels whose game reward has not been consumed yet. */
  readonly pending: number;
  /** Positive safe-integer XP. Paused/disposed ledgers reject without changing state. */
  grant(amount: number): ProgressionGrant;
  /** Marks one pending level reward as resolved. Rejects when no reward is pending. */
  consumeLevel(): MechanicResult;
  dispose(): void;
}
export interface ProgressionProvider {
  create(owner: SessionContext, id: string, definition: ProgressionDefinition): MechanicProgression;
}
export const ProgressionProviders = defineRegistry<MechanicFactory<ProgressionProvider>>('mechanic-progression-provider');
export const ProgressionMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-progression');

export const MechanicProgressionChanged = defineEvent<{
  owner: string;
  instance: string;
  reason: string;
  revision: number;
  level: number;
  xp: number;
  xpToNext: number;
  totalXp: number;
  pending: number;
}>('mechanics/progression-changed');

/** Resolve the selected implementation lazily in its registering owner's context. */
export function progressionMechanic(ctx: SessionContext): ProgressionProvider {
  const selected = ctx.role(ProgressionMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-progression in the preset');
  return ctx.instantiate(ProgressionProviders, selected.id, (factory, owner) => factory.start(owner));
}

/** Finite ordered progression; crossing, wave-clear and victory policy belongs to the consumer. */
import { defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';
import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from './mechanics.ts';

export interface SequenceDefinition {
  /** Nonempty ordered list of unique, nonblank keys of at most 128 characters. */
  readonly steps: readonly string[];
  /** Positive safe integer; steps.length * rounds must also be a safe integer. */
  readonly rounds: number;
}
export interface MechanicSequence {
  readonly id: string;
  readonly active: boolean;
  /** Detached and frozen, including the steps array. */
  readonly definition: SequenceDefinition;
  /** Exactly one revision per accepted step. Rejection changes no observations. */
  readonly revision: number;
  /** One-based current round, retained at definition.rounds after completion. */
  readonly round: number;
  /** Next step index; equals definition.steps.length only after final completion. */
  readonly index: number;
  readonly complete: boolean;
  /**
   * Accept only the expected key. Final steps roll into the next round atomically, or complete.
   * Paused, disposed, completed and wrong-step calls reject. No event, callback or implicit time.
   * Keys are not receipts: a key becomes valid again on its next round.
   */
  advance(step: string): MechanicResult;
  /** Idempotent; releases the live ID. Old handles cannot mutate a replacement. */
  dispose(): void;
}
export interface SequenceProvider {
  /** Invalid definitions/IDs and disposed scopes throw before acquiring ownership. */
  create(owner: SessionContext, id: string, definition: SequenceDefinition): MechanicSequence;
}
export const SequenceProviders = defineRegistry<MechanicFactory<SequenceProvider>>('mechanic-sequence-provider');
export const SequenceMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-sequence');

/** Resolve the selected factory in its registering owner's context; no progression algorithm lives here. */
export function sequenceMechanic(ctx: SessionContext): SequenceProvider {
  const selected = ctx.role(SequenceMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-sequence in the preset');
  return ctx.instantiate(SequenceProviders, selected.id, (factory, owner) => factory.start(owner));
}

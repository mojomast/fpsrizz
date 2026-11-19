import { defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';
import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from './mechanics.ts';

/** Consumer-owned topics and their positive number of ordered reveal levels. */
export interface HintTopic { readonly id: string; readonly levels: number }
export interface HintLedger {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  /** Zero until requested; unknown topics also return zero. */
  level(topic: string): number;
  /** Reveal exactly one level. Unknown, exhausted, paused and disposed requests reject. */
  reveal(topic: string): MechanicResult;
  /** Reset a known topic to zero, including when already zero. */
  reset(topic: string): MechanicResult;
  dispose(): void;
}
export interface HintProvider { create(owner: SessionContext, id: string, topics: readonly HintTopic[]): HintLedger }
export const HintProviders = defineRegistry<MechanicFactory<HintProvider>>('mechanic-hint-provider');
export const HintMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-hints');
export function hintMechanic(ctx: SessionContext): HintProvider {
  const selected = ctx.role(HintMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-hints in the preset');
  return ctx.instantiate(HintProviders, selected.id, (factory, owner) => factory.start(owner));
}

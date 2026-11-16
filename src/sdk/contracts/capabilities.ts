/** Reusable unlocked-capability ledger for traversal, combat skills, licenses or any named permission. */
import { defineEvent, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';

export type CapabilityKind = 'movement' | 'combat' | 'utility';

export interface CapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: CapabilityKind;
  /** 1 means a simple unlock; larger values permit consumer-defined ranks. */
  readonly maxRank?: number;
}

export interface CapabilityState {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: CapabilityKind;
  readonly rank: number;
  readonly unlocked: boolean;
}

export interface CapabilityResult {
  readonly ok: boolean;
  readonly changed: boolean;
  readonly reason: string;
}

export interface CapabilitySet {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definitions: readonly CapabilityDefinition[];
  has(id: string): boolean;
  rank(id: string): number;
  /** Unlock at a rank, or increase to that rank. Never lowers an existing rank. */
  unlock(id: string, rank?: number): CapabilityResult;
  snapshot(): readonly CapabilityState[];
  dispose(): void;
}

export interface CapabilityProvider {
  readonly name: string;
  readonly description: string;
  create(owner: SessionContext, id: string, definitions: readonly CapabilityDefinition[]): CapabilitySet;
}

export const CapabilityRole = defineRole<CapabilityProvider>('sdk/capabilities');
export const CapabilityUnlocked = defineEvent<{ readonly owner: string; readonly instance: string; readonly capability: string; readonly rank: number; readonly revision: number }>('sdk/capability-unlocked');

export function capabilityMechanic(ctx: SessionContext): CapabilityProvider {
  const selected = ctx.role(CapabilityRole);
  if (!selected) throw new Error('Select sdk/capabilities in the preset');
  return selected.provider;
}

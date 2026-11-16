import { defineService } from '../core.ts';

export type CinderRelicId = 'power' | 'vitality' | 'shell' | 'siphon' | 'pulse' | 'bounty';
export interface CinderRelic {
  readonly id: CinderRelicId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
}
/** An owned or offered fantasy weapon. Names and slot identity come from the shooter weapon registry. */
export interface CinderWeapon {
  readonly id: string;
  readonly slot: number;
  readonly name: string;
  readonly description: string;
  /** Detached mechanical summary for draft cards, e.g. "SEMI · 8 ROUNDS · 34 DAMAGE". */
  readonly stats: string;
  readonly icon: string;
}
export interface CinderRelicOffer extends CinderRelic {
  readonly kind: 'relic';
}
export interface CinderWeaponOffer extends CinderWeapon {
  readonly kind: 'weapon';
}
export type CinderOffer = CinderRelicOffer | CinderWeaponOffer;
export type CinderCommand = { readonly type: 'choose'; readonly index: number; readonly offer: number }
  | { readonly type: 'pulse' };
/** Detached current-goal observation for a compass or automated acceptance driver. */
export interface CinderTarget {
  readonly kind: 'warden' | 'exit' | 'keeper';
  readonly name: string;
  readonly x: number;
  readonly z: number;
}
export interface CinderState {
  readonly phase: 'playing' | 'victory' | 'defeat';
  readonly depth: number;
  readonly depths: number;
  readonly depthTitle: string;
  readonly level: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly embers: number;
  readonly cooldown: number;
  readonly kills: number;
  readonly remaining: number;
  /** Epoch for the current in-level boon offer. */
  readonly offer: number;
  readonly offers: readonly CinderOffer[];
  /** Owned weapons in slot order, including the two starters and every armory claim. */
  readonly arsenal: readonly CinderWeapon[];
  readonly boons: readonly (CinderRelic & { readonly stacks: number })[];
  readonly target: CinderTarget | null;
  readonly boss: Readonly<{ name: string; health: number; max: number; role: 'warden' | 'keeper' }> | null;
  /** True after the current depth's warden falls; the descent is then usable. */
  readonly portal: boolean;
  readonly legacy: number;
  readonly rank: number;
  readonly run: number;
  readonly seed: string;
  readonly profile: string;
  readonly message: string;
  readonly revision: number;
}
/** Cinder Vault's shooter-family orchestration. Boon choices and pulse input are bounded semantic commands. */
export const Cinder = defineService<{
  state(): CinderState;
  enqueue(command: CinderCommand): boolean;
}>('cinder/run');

import { defineRegistry, defineService } from '../core.ts';
import type { MechanicActionDefinition } from './mechanics.ts';

export interface EmberPoint { readonly x: number; readonly z: number }
export interface EmberWave { readonly count: number; readonly health: number; readonly speed: number; readonly interval: number }
export interface EmberConfig {
  readonly name: string;
  readonly kit: string;
  readonly pads: readonly EmberPoint[];
  readonly lane: readonly EmberPoint[];
  readonly waves: readonly EmberWave[];
  readonly range: number;
  readonly damage: number;
  readonly fireInterval: number;
  readonly reward: number;
  readonly leakDamage: number;
}
export const EmberConfigs = defineRegistry<EmberConfig>('ember-defense');
export type EmberCommand = { type: 'build'; pad: number } | { type: 'launch' | 'repair' | 'pulse' | 'replay' };
export interface EmberEnemy {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly progress: number;
}
/** Provider-defined transaction and cooldown readiness; spatial legality is still checked by the game. */
export interface EmberActionView {
  readonly definition: MechanicActionDefinition;
  readonly remaining: number;
  readonly available: boolean;
  readonly reason: string;
}
export interface EmberState {
  readonly revision: number;
  readonly status: 'build' | 'wave' | 'won' | 'lost';
  readonly wave: number;
  readonly scrap: number;
  readonly integrity: number;
  readonly towers: readonly number[];
  readonly enemies: readonly EmberEnemy[];
  readonly actions: readonly EmberActionView[];
  readonly message: string;
}
export interface EmberService {
  readonly config: EmberConfig;
  readonly revision: number;
  state(): EmberState;
  enqueue(command: EmberCommand): boolean;
}
export const Ember = defineService<EmberService>('ember/bastion');

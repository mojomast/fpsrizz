import { defineRegistry, defineService } from '@bulkhead/sdk';
import type { MechanicActionDefinition, ResourceAmounts } from '@bulkhead/sdk';

export interface VerdantStation {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
}
export interface VerdantWorld {
  readonly name: string;
  readonly kit: string;
  readonly days: number;
  readonly stations: readonly VerdantStation[];
}
export const VerdantWorlds = defineRegistry<VerdantWorld>('verdant-world');
export type VerdantCommand =
  | { type: 'act'; action: 'water' | 'biomass' | 'convert' | 'restore' | 'wait'; station?: string }
  | { type: 'restart' };
export interface VerdantState {
  readonly turn: number;
  readonly days: number;
  readonly status: 'playing' | 'won' | 'lost';
  readonly resources: ResourceAmounts;
  readonly restored: readonly string[];
  readonly cooldowns: Readonly<Record<string, number>>;
  readonly forecast: string;
  readonly message: string;
  readonly revision: number;
}
export interface VerdantService {
  readonly world: VerdantWorld;
  readonly actionDefinitions: readonly MechanicActionDefinition[];
  readonly revision: number;
  state(): VerdantState;
  enqueue(command: VerdantCommand): boolean;
}
export const Verdant = defineService<VerdantService>('verdant/relay');

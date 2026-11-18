/** Authored chamber geometry for The Silt Archive. */
export interface SiltChamberTemplate {
  readonly name: string;
  /** Nine rows of nine cells: # wall, . dry floor, ~ flood, ^ vent, D door. */
  readonly rows: readonly string[];
}

import { defineRegistry, defineService } from '../../../src/sdk/index.ts';
import type { ConditionSnapshot } from '../../../src/sdk/index.ts';

export interface SiltDistrictDefinition { readonly name: string; readonly chambers: readonly SiltChamberTemplate[] }
export interface SiltArchiveDefinition { readonly name: string; readonly districts: readonly SiltDistrictDefinition[] }
export const SiltArchives = defineRegistry<SiltArchiveDefinition>('silt-archive');
export type SiltCommand =
  | { readonly type: 'move'; readonly dx: number; readonly dy: number }
  | { readonly type: 'attack'; readonly enemy: string; readonly style?: 'strike' | 'heavy' | 'arc' }
  | { readonly type: 'wait' | 'interact' | 'extract' | 'descend' | 'restart' | 'brace' }
  | { readonly type: 'use'; readonly item: 'bandage' | 'air' }
  | { readonly type: 'equip' | 'drop'; readonly item: string }
  | { readonly type: 'unequip'; readonly slot: 'tool' | 'suit' }
  | { readonly type: 'craft'; readonly recipe: string }
  | { readonly type: 'upgrade'; readonly upgrade: 'health' | 'air' | 'damage' };
export type SiltEnemyKind = 'rush' | 'spitter' | 'armored' | 'drainer' | 'warden' | 'bellkeeper' | 'heart';
export interface SiltEnemy {
  readonly id: string; readonly x: number; readonly y: number; readonly health: number; readonly intent: string; readonly target: { readonly x: number; readonly y: number };
  readonly kind: SiltEnemyKind; readonly maxHealth: number; readonly phase: 'approach' | 'windup' | 'recovery';
  /** Cells struck on the next valid action, in deterministic order. */
  readonly threat: readonly { readonly x: number; readonly y: number }[];
}
export interface SiltState {
  readonly status: 'playing' | 'victory' | 'extracted' | 'dead'; readonly message: string;
  readonly conditions: readonly ConditionSnapshot[];
  readonly district: number; readonly districtName: string; readonly turn: number; readonly water: number;
  readonly room: string; readonly purpose: string; readonly x: number; readonly y: number; readonly rows: readonly string[];
  readonly rooms: readonly { readonly id: string; readonly x: number; readonly y: number; readonly purpose: string; readonly neighbors: readonly string[]; readonly visited: boolean; readonly revealed: boolean }[];
  readonly enemies: readonly SiltEnemy[]; readonly health: number; readonly maxHealth: number; readonly air: number; readonly maxAir: number; readonly charge: number;
  readonly fragments: number; readonly register: boolean; readonly bandages: number; readonly airSupplies: number; readonly damage: number; readonly pendingUpgrades: number; readonly discoveries: number;
  readonly inventory: { readonly capacity: number; readonly slots: readonly { readonly item: string; readonly count: number }[]; readonly equipment: Readonly<Record<string, string>> };
  readonly recipes: readonly { readonly id: string; readonly name: string; readonly inputs: readonly { readonly item: string; readonly count: number }[]; readonly output: { readonly item: string; readonly count: number }; readonly available: boolean; readonly reason: string }[];
  readonly workbench: boolean;
  readonly progression: { readonly level: number; readonly xp: number; readonly xpToNext: number; readonly totalXp: number };
}
export interface SiltService { state(): SiltState; enqueue(command: SiltCommand): boolean }
export const Silt = defineService<SiltService>('silt/archive');

import { defineEvent, defineRegistry, defineService } from '../../../src/sdk/index.ts';

export interface TacticsUnit {
  id: string;
  name: string;
  team: 'squad' | 'enemy';
  x: number;
  y: number;
  hp: number;
  ap: number;
}
export interface TacticsMission {
  name: string;
  rows: string[];
  units: TacticsUnit[];
}
export const TacticsMissions = defineRegistry<TacticsMission>('board-mission');
export type TacticsCommand =
  | { id: string; type: 'move'; unit: string; x: number; y: number }
  | { id: string; type: 'attack'; unit: string; target: string }
  | { id: string; type: 'end-turn' };
export interface TacticsForecast {
  legal: boolean;
  damage: number;
  cover: boolean;
  reason: string;
}
export interface TacticsState {
  mission: TacticsMission;
  units: readonly Readonly<TacticsUnit>[];
  turn: number;
  outcome: 'playing' | 'victory' | 'defeat';
  revision: number;
  message: string;
}
export interface TacticsService {
  readonly state: Readonly<TacticsState>;
  enqueue(command: TacticsCommand): boolean;
  reachable(unit: string): readonly { x: number; y: number; cost: number }[];
  forecast(unit: string, target: string): TacticsForecast;
}
export const Tactics = defineService<TacticsService>('board/tactics');
/** A committed outcome, emitted only after the rules have applied it. */
export const TacticsResolved = defineEvent<{
  cue: 'tactics-move' | 'tactics-attack' | 'tactics-victory';
}>('board/resolved');

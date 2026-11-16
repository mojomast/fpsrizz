import { defineEvent, defineRegistry, defineService } from '../core.ts';

export interface PuzzleCell { readonly x: number; readonly y: number }
export type PuzzleDirection = 'north' | 'east' | 'south' | 'west';
export interface PuzzleChamber {
  readonly name: string;
  readonly hint: string;
  readonly par: number;
  /** Static terrain: # wall, . timber floor, O pressure plate, E exit. */
  readonly rows: readonly string[];
  readonly start: PuzzleCell;
  readonly rocks: readonly PuzzleCell[];
  readonly golems: readonly PuzzleCell[];
}
export interface PuzzleCampaign {
  readonly name: string;
  readonly chambers: readonly PuzzleChamber[];
}
export interface PuzzleBoard {
  player: PuzzleCell;
  rocks: PuzzleCell[];
  golems: PuzzleCell[];
  turns: number;
  pushes: number;
  status: 'playing' | 'caught' | 'cleared';
}
export interface PuzzleSnapshot extends PuzzleBoard {
  chamber: number;
  totalTurns: number;
  revision: number;
  canUndo: boolean;
  message: string;
}
export type PuzzleCommand =
  | { type: 'move'; direction: PuzzleDirection }
  | { type: 'wait' | 'undo' | 'restart' | 'next' | 'replay' };
export interface PushPuzzleService {
  readonly campaign: PuzzleCampaign;
  readonly revision: number;
  /** Returns detached state. Commands commit one per simulation tick, never while paused. */
  state(): PuzzleSnapshot;
  enqueue(command: PuzzleCommand): boolean;
}
export const PuzzleCampaigns = defineRegistry<PuzzleCampaign>('push-puzzle');
export const PushPuzzle = defineService<PushPuzzleService>('puzzle/push');
export const PuzzleResolved = defineEvent<{ cue: 'puzzle-step' | 'puzzle-push' | 'puzzle-gate' | 'puzzle-caught' | 'puzzle-clear' | 'puzzle-undo' }>('puzzle/resolved');

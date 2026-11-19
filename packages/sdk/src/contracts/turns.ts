import { defineService } from '../core.ts';

export type TurnControlPhase = 'class-select' | 'player' | 'enemy' | 'ended';
/**
 * Optional mode-owned switch for discrete actor turns. When installed, autonomous enemy AI must not run;
 * the mode executes enemy actions and exposes the current phase to presentation.
 */
export interface TurnControlService {
  readonly active: true;
  readonly phase: TurnControlPhase;
  readonly round: number;
  readonly ap: number;
  readonly maxAp: number;
}
export const TurnControl = defineService<TurnControlService>('sdk/turn-control');

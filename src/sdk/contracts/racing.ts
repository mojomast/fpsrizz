import { defineRegistry, defineService } from '../core.ts';

export interface RacePoint {
  readonly x: number;
  readonly z: number;
}
export interface RaceGate extends RacePoint {
  readonly dx: number;
  readonly dz: number;
  readonly width: number;
}
export interface RaceTrack {
  readonly name: string;
  readonly points: readonly RacePoint[];
  readonly width: number;
  readonly start: RacePoint & { readonly yaw: number };
  readonly gates: readonly RaceGate[];
  readonly laps: number;
  readonly timeLimit: number;
}
export const RaceTracks = defineRegistry<RaceTrack>('vehicle/track');
export interface RaceState {
  readonly track: RaceTrack;
  readonly x: number;
  readonly z: number;
  readonly prevX: number;
  readonly prevZ: number;
  readonly yaw: number;
  readonly vx: number;
  readonly vz: number;
  readonly speed: number;
  readonly drifting: boolean;
  readonly offTrack: boolean;
  readonly elapsed: number;
  readonly lap: number;
  readonly nextGate: number;
  readonly status: 'racing' | 'won' | 'lost';
  readonly revision: number;
}
/** Read-only view; the driving system is the sole motion and progression authority. */
export const Race = defineService<RaceState>('vehicle/race');

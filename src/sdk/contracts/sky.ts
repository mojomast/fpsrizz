import { defineRegistry, defineService } from '../core.ts';
import type { MechanicKitDefinition } from './mechanics.ts';

export interface SkyPoint { readonly x: number; readonly z: number }
export interface SkyDelivery { readonly id: string; readonly pickup: SkyPoint; readonly beacon: SkyPoint }
export interface SkyRoute { readonly name: string; readonly deliveries: readonly SkyDelivery[] }
export const SkyRoutes = defineRegistry<SkyRoute>('sky-route');

export type SkyCommand = { type: 'move'; x: number; z: number } | { type: 'collect' | 'deliver' | 'boost' | 'repair' | 'restart' };
export interface SkySnapshot {
  x: number; z: number; status: 'playing' | 'won' | 'lost'; cargo: number | null;
  collected: readonly boolean[]; delivered: readonly boolean[]; energy: number; hull: number;
  time: number; boostRemaining: number; repairRemaining: number; message: string; revision: number;
}
export interface SkyService { readonly route: SkyRoute; readonly kit: MechanicKitDefinition; state(): SkySnapshot; enqueue(command: SkyCommand): boolean }
export const Sky = defineService<SkyService>('sky/salvage');

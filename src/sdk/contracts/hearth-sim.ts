import { defineRegistry, defineService } from '../core.ts';

/** Authored household data. Times are minutes after midnight. */
export interface HearthResidentDefinition { readonly id: string; readonly name: string; readonly occupation: string; readonly shiftStart: number; readonly description: string }
export interface HearthObjectDefinition { readonly id: string; readonly name: string; readonly category: 'sleep' | 'cooking' | 'hygiene' | 'seating' | 'work' | 'decor'; readonly cost: number; readonly description: string }
export interface HearthHouseholdDefinition { readonly name: string; readonly intro: string; readonly residents: readonly HearthResidentDefinition[]; readonly visitors: readonly string[]; readonly objects: readonly HearthObjectDefinition[] }
export const HearthHouseholds = defineRegistry<HearthHouseholdDefinition>('hearth-household');

export type HearthActivity = 'sleep' | 'eat' | 'wash' | 'chat' | 'reconcile' | 'work' | 'leisure' | 'wait' | 'greet' | 'host' | 'pay-debt';
export type HearthRoom = 'bedroom' | 'kitchen' | 'living room' | 'bathroom';
export type HearthFinish = 'oak' | 'tile' | 'sage' | 'terracotta';
export interface HearthTile { readonly x: number; readonly y: number; readonly room: HearthRoom; readonly finish: HearthFinish; readonly original: boolean }
export interface HearthPlacement { readonly object: string; readonly x: number; readonly y: number; readonly rotation: 0 | 1 | 2 | 3 }
export type HearthBuildCommand = { readonly type: 'build-floor'; readonly x: number; readonly y: number; readonly room: HearthRoom } | { readonly type: 'zone-floor'; readonly x: number; readonly y: number; readonly room: HearthRoom } | { readonly type: 'remove-floor'; readonly x: number; readonly y: number } | { readonly type: 'finish-floor'; readonly x: number; readonly y: number; readonly finish: HearthFinish } | { readonly type: 'place-furniture'; readonly object: string; readonly x: number; readonly y: number; readonly rotation: 0 | 1 | 2 | 3 };
export type HearthCommand = HearthBuildCommand | { readonly type: 'select'; readonly resident: string } | { readonly type: 'pause'; readonly paused: boolean } | { readonly type: 'restart' } | { readonly type: 'autonomy'; readonly resident: string; readonly enabled: boolean } | { readonly type: 'buy' | 'sell'; readonly object: string } | { readonly type: 'act'; readonly action: HearthActivity; readonly target?: string };
export interface HearthResidentState { readonly id: string; readonly name: string; readonly occupation: string; readonly shiftStart: number; readonly needs: Readonly<Record<'energy' | 'nourishment' | 'comfort' | 'connection', number>>; readonly room: string; readonly activity: string; readonly autonomy: boolean; readonly shifts: number; readonly careerProgress: number; readonly rank: number }
export interface HearthRelationship { readonly a: string; readonly b: string; readonly score: number }
export interface HearthState { readonly revision: number; readonly turn: number; readonly day: number; readonly minute: number; readonly paused: boolean; readonly selected: string; readonly money: number; readonly debt: number; readonly residents: readonly HearthResidentState[]; readonly relationships: readonly HearthRelationship[]; readonly furniture: readonly string[]; readonly house: { readonly width: number; readonly height: number; readonly tiles: readonly HearthTile[]; readonly placements: readonly HearthPlacement[] }; readonly projects: readonly { readonly id: string; readonly value: number; readonly target: number; readonly complete: boolean }[]; readonly visitors: readonly string[]; readonly gathering: 'unplanned' | 'hosted'; readonly tier: number; readonly events: readonly string[]; readonly message: string }
export interface HearthService { readonly household: HearthHouseholdDefinition; state(): HearthState; enqueue(command: unknown): boolean }
export const Hearth = defineService<HearthService>('common/hearth');

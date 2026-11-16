/** Reusable explorable room graph/map state. Geometry, transitions and rewards remain consumer-owned. */
import { defineEvent, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';

export interface RoomMapRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface RoomMapNode {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly map: RoomMapRect;
}
export interface RoomMapLink { readonly from: string; readonly to: string }
export interface RoomMapDefinition {
  readonly id: string;
  readonly name: string;
  readonly start: string;
  readonly rooms: readonly RoomMapNode[];
  readonly links: readonly RoomMapLink[];
}
export interface RoomMapState {
  readonly current: string;
  readonly visited: readonly string[];
  readonly revealed: readonly string[];
}
export interface RoomMapResult { readonly ok: boolean; readonly changed: boolean; readonly reason: string }
export interface RoomMapHandle {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: RoomMapDefinition;
  state(): RoomMapState;
  enter(room: string): RoomMapResult;
  reveal(room: string): RoomMapResult;
  neighbors(room: string): readonly string[];
  dispose(): void;
}
export interface RoomMapProvider {
  readonly name: string;
  readonly description: string;
  create(owner: SessionContext, id: string, definition: RoomMapDefinition): RoomMapHandle;
}

export const RoomMapRole = defineRole<RoomMapProvider>('sdk/room-map');
export const RoomMapChanged = defineEvent<{ readonly owner: string; readonly instance: string; readonly current: string; readonly visited: readonly string[]; readonly revealed: readonly string[]; readonly revision: number }>('sdk/room-map-changed');

export function roomMapMechanic(ctx: SessionContext): RoomMapProvider {
  const selected = ctx.role(RoomMapRole);
  if (!selected) throw new Error('Select sdk/room-map in the preset');
  return selected.provider;
}

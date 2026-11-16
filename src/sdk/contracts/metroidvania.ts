/** Hollowmere family contract: side-scrolling exploration, combat, abilities, inventory and world-map observation. */
import { defineRegistry, defineService } from '../core.ts';
import type { CapabilityState } from './capabilities.ts';
import type { RoomMapLink, RoomMapRect, RoomMapState } from './room-map.ts';

export interface MetroPoint { readonly x: number; readonly y: number }
export interface MetroRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export interface MetroRegion {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly background: string;
}

export interface MetroDoor {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly to: string;
  readonly entry: MetroPoint;
  readonly requires?: string;
  readonly requiresItems?: readonly string[];
  readonly message?: string;
}

export interface MetroPickupSpawn {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'ability' | 'item' | 'health' | 'focus' | 'ember' | 'lore';
  /** Ability id or item id, depending on kind. */
  readonly key?: string;
  readonly amount?: number;
  readonly label: string;
  readonly icon: string;
  readonly text?: string;
}

export interface MetroEnemySpawn {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly patrol?: number;
  readonly elite?: boolean;
}

export interface MetroCheckpoint {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface MetroNpcSpawn {
  readonly id: string;
  readonly name: string;
  readonly role: 'smith' | 'scholar';
  readonly title: string;
  readonly line: string;
  readonly portrait: string;
  readonly x: number;
  readonly y: number;
}

export interface MetroProp {
  readonly kind: 'arch' | 'root' | 'torch' | 'banner' | 'rune' | 'statue' | 'crystal';
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
}

export interface MetroRoom {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly map: RoomMapRect;
  readonly tileset: 'moss' | 'root' | 'archive' | 'keep' | 'throne';
  /** # solid, = one-way platform, ^ hazard, . empty. Character coordinates, one unit per tile. */
  readonly rows: readonly string[];
  readonly doors: readonly MetroDoor[];
  readonly pickups: readonly MetroPickupSpawn[];
  readonly enemies: readonly MetroEnemySpawn[];
  readonly checkpoints: readonly MetroCheckpoint[];
  readonly npcs: readonly MetroNpcSpawn[];
  readonly props: readonly MetroProp[];
}

export interface MetroAbility {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: 'movement' | 'combat' | 'utility';
  readonly icon: string;
  readonly control: string;
}

export interface MetroEnemyType {
  readonly id: string;
  readonly name: string;
  readonly kind: 'walker' | 'charger' | 'flyer' | 'boss';
  readonly health: number;
  readonly damage: number;
  readonly speed: number;
  readonly w: number;
  readonly h: number;
  readonly sprite: 'grunt' | 'spitter' | 'spider' | 'skeleton' | 'ghost' | 'golem' | 'bat';
  readonly tint?: string;
  readonly scale?: number;
  readonly attackRange: number;
  readonly projectile?: boolean;
  readonly boss?: boolean;
}

export interface MetroWorld {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly intro: string;
  readonly startRoom: string;
  readonly regions: readonly MetroRegion[];
  readonly rooms: readonly MetroRoom[];
  readonly abilities: readonly MetroAbility[];
  readonly enemies: readonly MetroEnemyType[];
  readonly victory: Readonly<{ title: string; text: string }>;
}

export interface MetroPlayerView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: 1 | -1;
  readonly grounded: boolean;
  readonly wallSliding: boolean;
  readonly dashing: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly focus: number;
  readonly maxFocus: number;
  readonly invulnerable: number;
  readonly attack: Readonly<{ kind: 'none' | 'side' | 'up' | 'down'; combo: number; progress: number }>;
}

export interface MetroEnemyView {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly kind: MetroEnemyType['kind'];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly facing: 1 | -1;
  readonly state: 'idle' | 'patrol' | 'chase' | 'windup' | 'attack' | 'hurt' | 'dead';
  /** 0..1 telegraph progress while winding up; 0 otherwise. */
  readonly windup: number;
  readonly elite: boolean;
  readonly boss: boolean;
}

export interface MetroProjectileView { readonly id: string; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly kind: 'bolt' | 'enemy'; readonly life: number }
export interface MetroEffectView { readonly id: string; readonly x: number; readonly y: number; readonly kind: 'slash' | 'spark' | 'dust' | 'damage' | 'heal' | 'sigil'; readonly age: number; readonly life: number; readonly text?: string; readonly color?: string }
export interface MetroPickupView { readonly id: string; readonly x: number; readonly y: number; readonly kind: MetroPickupSpawn['kind']; readonly label: string; readonly icon: string; readonly available: boolean }
export interface MetroCheckpointView extends MetroCheckpoint { readonly activated: boolean }
export interface MetroBossView { readonly name: string; readonly health: number; readonly max: number; readonly phase: number }
export interface MetroInventoryView { readonly id: string; readonly name: string; readonly description: string; readonly icon: string; readonly rarity: string; readonly count: number; readonly usable: boolean }
export interface MetroDialogueOption { readonly id: string; readonly label: string; readonly hint?: string; readonly disabled?: boolean }
export interface MetroDialogue {
  readonly npcId: string;
  readonly name: string;
  readonly title: string;
  readonly portrait: string;
  readonly text: string;
  readonly options: readonly MetroDialogueOption[];
}
export interface MetroMapRoom extends RoomMapRect { readonly id: string; readonly name: string; readonly region: string; readonly regionName: string; readonly visited: boolean; readonly revealed: boolean; readonly current: boolean }
export interface MetroMapView {
  readonly rooms: readonly MetroMapRoom[];
  readonly links: readonly RoomMapLink[];
  readonly state: RoomMapState;
}
export interface MetroStats {
  readonly roomsVisited: number;
  readonly roomsKnown: number;
  readonly kills: number;
  readonly deaths: number;
  readonly playTime: number;
  readonly completion: number;
  readonly swordLevel: number;
  readonly embers: number;
  readonly sigils: number;
  readonly sigilIds: readonly string[];
}

export type MetroStatus = 'playing' | 'paused' | 'dying' | 'victory';

export interface MetroState {
  readonly status: MetroStatus;
  readonly revision: number;
  readonly roomId: string;
  readonly roomName: string;
  readonly regionName: string;
  readonly regionColor: string;
  readonly message: string;
  readonly player: MetroPlayerView;
  readonly enemies: readonly MetroEnemyView[];
  readonly projectiles: readonly MetroProjectileView[];
  readonly effects: readonly MetroEffectView[];
  readonly pickups: readonly MetroPickupView[];
  readonly checkpoints: readonly MetroCheckpointView[];
  readonly npcs: readonly MetroNpcSpawn[];
  readonly abilities: readonly CapabilityState[];
  readonly inventory: readonly MetroInventoryView[];
  readonly map: MetroMapView;
  readonly dialogue: MetroDialogue | null;
  readonly boss: MetroBossView | null;
  readonly stats: MetroStats;
}

export type MetroCommand =
  | { readonly type: 'set-paused'; readonly paused: boolean }
  | { readonly type: 'restart' }
  | { readonly type: 'use-item'; readonly index: number }
  | { readonly type: 'dialogue-choice'; readonly index: number }
  | { readonly type: 'dialogue-close' };

export const MetroidvaniaWorlds = defineRegistry<MetroWorld>('metroidvania-world');

export const Metroidvania = defineService<{
  readonly world: MetroWorld;
  state(): MetroState;
  enqueue(command: MetroCommand): boolean;
}>('hollowmere/run');

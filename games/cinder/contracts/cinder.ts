import { defineService } from '../../../src/sdk/index.ts';

export type CinderRelicId = 'power' | 'vitality' | 'shell' | 'siphon' | 'pulse' | 'bounty' | 'execution' | 'emberheart' | 'shardfinder' | 'warpath';
export interface CinderRelic {
  readonly id: CinderRelicId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
}
/** An owned or offered fantasy weapon. Names and slot identity come from the shooter weapon registry. */
export interface CinderWeapon {
  readonly id: string;
  readonly slot: number;
  readonly name: string;
  readonly description: string;
  readonly stats: string;
  readonly icon: string;
}
export interface CinderRelicOffer extends CinderRelic {
  readonly kind: 'relic';
}
export interface CinderWeaponOffer extends CinderWeapon {
  readonly kind: 'weapon';
}
export type CinderOffer = CinderRelicOffer | CinderWeaponOffer;
export type CinderInventoryFilter = 'all' | 'gear' | 'items';
export interface CinderRecipeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly { id: string; name: string; icon: string; count: number; have: number }[];
  readonly output: { id: string; name: string; icon: string; count: number };
  readonly emberCost: number;
  readonly canCraft: boolean;
  readonly reason: string;
}
export interface CinderMapMarker {
  readonly kind: 'enemy' | 'boss' | 'npc' | 'exit' | 'loot';
  readonly x: number;
  readonly z: number;
  readonly intent?: 'attack' | 'advance';
}
export interface CinderMapView {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cell: number;
  readonly walkable: string;
  readonly explored: string;
  readonly reachable: string;
  readonly player: { readonly x: number; readonly z: number };
  readonly markers: readonly CinderMapMarker[];
}
export interface CinderDialogueOption {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}
export interface CinderDialogueView {
  readonly npcId: string;
  readonly name: string;
  readonly title: string;
  readonly portrait: string;
  readonly text: string;
  readonly options: readonly CinderDialogueOption[];
}
export interface CinderItemView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  readonly slot?: string;
  readonly count: number;
  readonly source: 'bag' | 'equipment';
  readonly equipmentSlot?: string;
}
export type CinderThreatId = 'pilgrim' | 'delver' | 'ashbound';
export interface CinderThreatView {
  readonly id: CinderThreatId;
  readonly name: string;
  readonly description: string;
  readonly enemyDamage: number;
  readonly enemyHealth: number;
  readonly eliteChance: number;
  readonly healing: number;
  readonly lootBonus: number;
  readonly legacyBonus: number;
}
export interface CinderHover {
  readonly kind: 'move' | 'attack' | 'blocked';
  readonly label: string;
  readonly cost: number;
  readonly detail: string;
}
export interface CinderClassView {
  readonly id: string;
  readonly name: string;
  readonly epithet: string;
  readonly description: string;
  readonly maxHealth: number;
  readonly ap: number;
  readonly extraWeapon?: string;
  readonly masteryRank: number;
  readonly masteryXp: number;
  readonly masteryNext: number | null;
}
export type CinderCommand =
  | { readonly type: 'choose'; readonly index: number; readonly offer: number }
  | { readonly type: 'pulse' }
  | { readonly type: 'choose-class'; readonly classId: string }
  | { readonly type: 'end-turn' }
  | { readonly type: 'toggle-inventory' }
  | { readonly type: 'inventory-move'; readonly delta: -1 | 1 }
  | { readonly type: 'inventory-confirm' }
  | { readonly type: 'inventory-filter' }
  | { readonly type: 'inventory-drop' }
  | { readonly type: 'toggle-crafting' }
  | { readonly type: 'crafting-move'; readonly delta: -1 | 1 }
  | { readonly type: 'crafting-confirm' }
  | { readonly type: 'craft'; readonly recipe: string }
  | { readonly type: 'toggle-grid' }
  | { readonly type: 'dialogue-choice'; readonly index: number }
  | { readonly type: 'dialogue-close' }
  | { readonly type: 'iso-click'; readonly x: number; readonly z: number }
  | { readonly type: 'choose-threat'; readonly threatId: string }
  | { readonly type: 'toggle-help' };
/** Detached current-goal observation for a compass or automated acceptance driver. */
export interface CinderTarget {
  readonly kind: 'warden' | 'exit' | 'keeper';
  readonly name: string;
  readonly x: number;
  readonly z: number;
}
export interface CinderState {
  readonly phase: 'class-select' | 'player' | 'enemy' | 'victory' | 'defeat';
  readonly depth: number;
  readonly depths: number;
  readonly depthTitle: string;
  readonly round: number;
  readonly ap: number;
  readonly maxAp: number;
  readonly intents: Readonly<{ attacks: number; advances: number; engaged: number; elites: number }>;
  readonly level: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly embers: number;
  readonly cooldown: number;
  readonly kills: number;
  readonly remaining: number;
  readonly offer: number;
  readonly offers: readonly CinderOffer[];
  readonly arsenal: readonly CinderWeapon[];
  readonly boons: readonly (CinderRelic & { readonly stacks: number })[];
  readonly classId: string | null;
  readonly className: string | null;
  readonly masteryRank: number;
  readonly masteryXp: number;
  readonly masteryNext: number | null;
  readonly classes: readonly CinderClassView[];
  readonly threatId: CinderThreatId;
  readonly threatName: string;
  readonly threats: readonly CinderThreatView[];
  readonly highestThreat: CinderThreatId | null;
  readonly hover: CinderHover | null;
  readonly helpOpen: boolean;
  readonly inventory: readonly CinderItemView[];
  readonly inventoryCapacity: number;
  readonly overlay: 'none' | 'inventory' | 'crafting' | 'grid' | 'dialogue' | 'help';
  readonly inventoryOpen: boolean;
  readonly inventoryFilter: CinderInventoryFilter;
  readonly inventoryCursor: number;
  readonly craftingOpen: boolean;
  readonly craftingCursor: number;
  readonly recipes: readonly CinderRecipeView[];
  readonly gridOpen: boolean;
  readonly map: CinderMapView | null;
  readonly nearbyNpc: Readonly<{ id: string; name: string }> | null;
  readonly dialogue: CinderDialogueView | null;
  readonly target: CinderTarget | null;
  readonly boss: Readonly<{ name: string; health: number; max: number; role: 'warden' | 'keeper'; enraged: boolean }> | null;
  readonly portal: boolean;
  readonly legacy: number;
  readonly rank: number;
  readonly run: number;
  readonly seed: string;
  readonly profile: string;
  readonly message: string;
  readonly revision: number;
}
/** Cinder Vault's shooter-family orchestration. All commands are owned queue ingress; acceptance is not success. */
export const Cinder = defineService<{
  state(): CinderState;
  enqueue(command: CinderCommand): boolean;
}>('cinder/run');

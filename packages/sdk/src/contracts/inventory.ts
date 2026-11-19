import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from './mechanics.ts';
import { defineEvent, defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';
export interface ItemDefinition {
  readonly name: string;
  readonly description: string;
  /** Presentation key or relative image path; inventory does not interpret it. */
  readonly icon: string;
  readonly stackMax: number;
  /** Optional equipment slot name, e.g. "armor" or "charm". */
  readonly slot?: string;
  readonly rarity: ItemRarity;
}
export const Items = defineRegistry<ItemDefinition>('item');

export interface InventoryDefinition {
  /** Number of distinct item stacks carried in the bag. */
  readonly capacity: number;
  readonly equipmentSlots: readonly string[];
}
export interface InventorySlot {
  readonly item: string;
  readonly count: number;
}
export interface InventoryHandle {
  readonly id: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: InventoryDefinition;
  slots(): readonly InventorySlot[];
  equipment(): Readonly<Record<string, string>>;
  count(item: string): number;
  /** Adds the entire count or rejects atomically. */
  add(item: string, count: number): MechanicResult;
  /** Removes the entire count or rejects atomically. */
  remove(item: string, count: number): MechanicResult;
  /** Moves one item from the bag to its declared equipment slot, swapping any occupied item back to the bag. */
  equip(item: string): MechanicResult;
  unequip(slot: string): MechanicResult;
  dispose(): void;
}
export interface InventoryProvider {
  create(owner: SessionContext, id: string, definition: InventoryDefinition): InventoryHandle;
}
export const InventoryProviders = defineRegistry<MechanicFactory<InventoryProvider>>('mechanic-inventory-provider');
export const InventoryMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-inventory');
export const MechanicInventoryChanged = defineEvent<{
  owner: string;
  instance: string;
  reason: string;
  revision: number;
  slots: readonly InventorySlot[];
  equipment: Readonly<Record<string, string>>;
}>('mechanics/inventory-changed');

export function inventoryMechanic(ctx: SessionContext): InventoryProvider {
  const selected = ctx.role(InventoryMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-inventory in the preset');
  return ctx.instantiate(InventoryProviders, selected.id, (factory, owner) => factory.start(owner));
}

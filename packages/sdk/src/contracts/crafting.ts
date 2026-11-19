import { defineRegistry, defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';
import type { InventoryHandle } from './inventory.ts';
import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from './mechanics.ts';

export interface CraftingIngredient {
  readonly item: string;
  readonly count: number;
}
export interface CraftingRecipe {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly CraftingIngredient[];
  readonly output: CraftingIngredient;
}
/** Known item-to-item recipes; effects, currency costs, discovery and UI remain consumer policy. */
export const CraftingRecipes = defineRegistry<CraftingRecipe>('crafting-recipe');
export interface CraftingMissing extends CraftingIngredient {
  readonly have: number;
}
export interface CraftingPreview extends MechanicResult {
  readonly missing: readonly CraftingMissing[];
}
export interface CraftingProvider {
  /** Pure advisory check; a later craft rechecks. */
  preview(inventory: InventoryHandle, recipe: string): CraftingPreview;
  /** Consumes the whole recipe and adds its output, restoring the inputs if the output cannot fit. */
  craft(inventory: InventoryHandle, recipe: string): MechanicResult;
}
export const CraftingProviders = defineRegistry<MechanicFactory<CraftingProvider>>('mechanic-crafting-provider');
export const CraftingMechanicRole = defineRole<MechanicProviderInfo>('sdk/mechanic-crafting');

export function craftingMechanic(ctx: SessionContext): CraftingProvider {
  const selected = ctx.role(CraftingMechanicRole);
  if (!selected) throw new Error('Select sdk/mechanic-crafting in the preset');
  return ctx.instantiate(CraftingProviders, selected.id, (factory, owner) => factory.start(owner));
}

# Known item recipes

`mechanics/crafting` registers `crafting-recipe` content, `CraftingRecipes`, `CraftingProviders` and `CraftingMechanicRole` (`sdk/mechanic-crafting`). Enable it with an inventory provider and select `"sdk/mechanic-crafting": "mechanics/crafting"`; see the complete [Cinder preset](../../content/presets/cinder-vault.json).

Resolve `craftingMechanic(ctx)` and pass an inventory handle and recipe ID to `preview` or `craft`. Preview is advisory; craft rechecks inputs, consumes them and adds the output, restoring inputs if output cannot fit. Recipe input and output IDs refer to registered items. The factory is scoped to its provider; the consumer owns the inventory handle. See the [SDK](../../sdk/contracts/crafting.ts), [content example](../cinder-content/content.json) and [crafting guide](../../../docs/crafting.md).

Recipes are known definitions, not a discovery system. Currency, skills, stations, chance, effects and UI are consumer policy. Tests: [crafting](../../../tests/mechanics-crafting.test.ts) and [Cinder](../../../tests/cinder-vault.test.ts).

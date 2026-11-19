# Known item recipes and crafting

`mechanics/crafting` owns deterministic item-to-item recipe execution over the selected `mechanics/inventory` handle. It
registers the generic `crafting-recipe` content kind and exposes `CraftingProviders`, `CraftingMechanicRole`,
`craftingMechanic(ctx)` and `CraftingRecipes`.

## Composition

```json
{
  "plugins": ["mechanics/inventory", "mechanics/crafting"],
  "roles": {
    "sdk/mechanic-inventory": "mechanics/inventory",
    "sdk/mechanic-crafting": "mechanics/crafting"
  }
}
```

Consumers create or resolve their inventory handle and resolve the selected provider:

```ts
const bag = inventoryMechanic(ctx).create(ctx, 'run/bag', { capacity: 12, equipmentSlots: ['armor'] });
const crafting = craftingMechanic(ctx);
const preview = crafting.preview(bag, 'my-game/forge-plate');
if (preview.ok) crafting.craft(bag, 'my-game/forge-plate');
```

## Recipe content

A `crafting-recipe` entry has `name`, `description`, `inputs` (1–6 item/count pairs) and one `output` item/count pair.
Input items cannot repeat; the output item must differ from every input. IDs use normal content IDs. All item IDs must
exist in the selected inventory plugin's `Items` registry; that cross-reference is validated after all plugins load.

```json
{
  "kind": "crafting-recipe",
  "id": "my-game/forge-plate",
  "data": {
    "name": "Forge Plate",
    "description": "Turn a shard and a plate into heavy armor.",
    "inputs": [{ "item": "my-game/plate", "count": 1 }, { "item": "my-game/shard", "count": 2 }],
    "output": { "item": "my-game/heavy-plate", "count": 1 }
  }
}
```

## Runtime contract

| Member | Meaning |
|---|---|
| `preview(inventory, recipe)` | Pure advisory check returning `{ ok, reason, missing }`; does not mutate |
| `craft(inventory, recipe)` | Rechecks, consumes every input, adds the output; restores inputs if output placement fails |

The provider does not apply currency costs, recipe discovery, skill checks, station proximity, effects, UI or persistence.
Cinder uses a consumer-owned run-ember cost table, known recipes and the Smith/pack UI; the provider only performs the
inventory transform. A successful craft emits no provider event; consumers observe inventory revision/events or update
their own state.

## Ownership and limits

The provider is selected through an exclusive role and is instantiated once per consumer context. It keeps no mutable
session state in module scope. The selected inventory handle remains the owner of item counts and capacity. Crafting has
no transaction spanning multiple inventories, no partial output, no weighted/random recipes and no rollback guarantee if
a consumer-installed inventory provider violates its own atomic add/remove contract.

## Evidence

`tests/mechanics-crafting.test.ts` covers success, missing ingredients, unknown recipes, pause rejection and restoring
inputs when the output cannot fit. `games/cinder/tests/cinder-vault.test.ts` covers the Cinder forge panel, known recipe list and NPC
route. `tests/cinder-demo/run.mjs` captures the forge overlay in the production build.

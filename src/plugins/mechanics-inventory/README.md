# Stack inventory

`mechanics/inventory` registers the `item` content kind, `Items`, `InventoryProviders` and `InventoryMechanicRole` (`sdk/mechanic-inventory`). Enable the plugin and select `"sdk/mechanic-inventory": "mechanics/inventory"`; [Cinder](../../content/presets/cinder-vault.json) and [Hollowmere](../../content/presets/hollowmere-ascent.json) use it.

Resolve `inventoryMechanic(ctx)` and create an owned inventory with stack capacity and equipment slot names. `add` and `remove` are all-or-nothing; `equip` and `unequip` move items between bag and slots, including swaps. Inspect `slots`, `equipment`, `count` and revision; changes emit `MechanicInventoryChanged`. Definitions specify names, icons, stack limits, rarity and optional equipment slot. See [SDK](../../sdk/contracts/inventory.ts), [content example](../cinder-content/content.json) and [inventory guide](../../../docs/inventory.md).

Capacity counts bag stacks, while equipped items live outside the bag. Handles are disposed explicitly or with their provider/consumer scope; paused or disposed handles reject mutation. Effects, stats, loot, UI and persistence belong to the game; there is no weight, grid, durability or cross-inventory transaction. Tests: [inventory](../../../tests/mechanics-inventory.test.ts), [Cinder](../../../tests/cinder-vault.test.ts), [Hollowmere](../../../tests/hollowmere.test.ts).

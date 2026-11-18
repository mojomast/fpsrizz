# Stack inventory and equipment

`mechanics/inventory` owns bounded item stacks and optional equipment-slot assignments. It registers the generic `item`
content kind and does not interpret item effects, stats, rarity or loot.

## Composition

```json
{
  "plugins": ["mechanics/inventory"],
  "roles": { "sdk/mechanic-inventory": "mechanics/inventory" }
}
```

Consumers declare the role in `requiresRoles`/`roleDependencies`, then create an owned handle:

```ts
const bag = inventoryMechanic(ctx).create(ctx, 'run/bag', {
  capacity: 12,
  equipmentSlots: ['armor', 'charm'],
});
bag.add('my-game/potion', 2);
bag.equip('my-game/armor');
```

## Item content

An `item` content entry has `name`, `description`, `icon`, optional `stackMax` (default 1, max 999), optional `slot`
(lowercase equipment slot) and optional `rarity` (`common`, `uncommon`, `rare`, `epic`; default common). IDs use normal
namespaced content IDs. The inventory provider never reads `icon`, rarity or descriptions; they are for the game's UI.

## Handle contract

| Member | Meaning |
|---|---|
| `slots()` | Detached bag stacks in stable order |
| `equipment()` | Detached slot-to-item map; empty slots contain `''` |
| `count(item)` | Total carried count for that item |
| `add(item, count)` | Adds the entire positive safe-integer count or rejects atomically |
| `remove(item, count)` | Removes the entire count or rejects atomically |
| `equip(item)` | Moves one carried item into its declared slot, swapping the old item back to the bag |
| `unequip(slot)` | Moves the equipped item back to the bag |
| `dispose()` | Idempotent release of provider/consumer ownership |

Capacity counts **distinct stacks**, not total quantity. Filling existing stacks does not consume capacity. A new stack is
needed when item stacks reach `stackMax`; if the bag is full, the whole add rejects. Equip/unequip are atomic and fail when
the swap cannot fit. Mutations reject disposed handles and when optional `SessionControl.playing` is false. Successful
mutations increment `revision` and emit a detached `MechanicInventoryChanged` snapshot.

## Ownership and limits

The provider uses `createOwnedInstances`; IDs are 1..128 characters and unique among live inventories in the same consumer
context. Different consumers may use the same ID. Either consumer or provider scope releases the handle. Definitions are
copied/frozen. Restart creates fresh state.

Not provided: weights, grid bag shapes, sockets, durability, item bindings, transactional trades, loot rolls, effects,
stat application, persistence, filtering or UI. Those remain game-owned. Cinder uses two equipment slots (`armor`,
`charm`), applies gear effects locally, rolls item drops from its own weighted table, adds All/Gear/Items filtering, free
drop-by-one (Cinder binds it to Delete), a forge panel and NPC services.

## Evidence

`tests/mechanics-inventory.test.ts` covers stack filling/capacity rejection, atomic remove, unknown items, pause, equipment
swaps and full-bag rejection, early/provider disposal and restart. `games/cinder/tests/cinder-vault.test.ts` covers the Cinder bag,
consumable action cost, gear drops/equipment and persistent class mastery.

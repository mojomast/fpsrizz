# Cinder Vault classes, loot and mastery

The run opens on a class-choice screen. Choose a vault threat with **7/8/9** (Pilgrim, Delver or Ashbound), then one of
three classes with **1/2/3**. All three classes are available immediately; class mastery, legacy embers and the best
cleared threat are the persistent progression.

| Class | Health | Actions | Opening extra | Identity |
|---|---:|---:|---|---|
| **Ash Warden** | 130 | 3 | — | 10% damage reduction; two Ember Draughts; knight avatar |
| **Emberwright** | 90 | 3 | Ashbell | +35% pulse damage; Ember Flask; mage avatar |
| **Vaultrunner** | 85 | 4 | Mothspindle | +10% weapon damage; Ember Flask; rogue avatar |

All classes also carry Thornwake and Cinderkey. The class table shows base health; the class-choice cards and actual
starting health include legacy rank and class-mastery bonuses.

## Class mastery

Each class stores a persistent mastery XP total in `cinder/vault.v1.mastery.<class>`. Ending any run grants
`2 × kills + 8 × depth + 20 × victory` mastery XP. Thresholds are **20 / 50 / 90 / 140 / 200**:

| Rank | Bonus |
|---|---|
| 1 | +5 maximum health |
| 2 | +1 starting Ember Draught |
| 3 | +5% class weapon damage |
| 4 | +5 maximum health |
| 5 | +5% class armor |

Mastery is applied at class selection, capped, and displayed in the class cards. It does not make the run free: the
strongest bonuses are modest and all enemies still act with telegraphed turns. Legacy embers still grant +5 starting
health per 8, capped at 25. The class-choice screen and result stats expose current rank, XP and next threshold.

## Action-point turns

- A player turn begins with 3 actions (Vaultrunner 4). Moving one cardinal tile, a light weapon attack, reload, pulse,
  using an item, or equipping/unequipping gear costs 1 action. Far Oracle and Ashbell attacks cost 2. Mothspindle and
  Briarward spend one action on 3-round and 2-round bursts respectively.
- Aiming and weapon switching are free. End Turn (Enter) or exhausting actions starts the enemy phase.
- Engaged enemies show their next intent. Attackers are tinted red; the HUD reports the number of attacks, advances and
  living elites. Each enemy gets one action: a line-of-sight attack or a one-tile advance. Ash Hounds and Swift elites get
  two actions, Ember Acolytes may mend the most wounded ally within 8m, and the final Keeper gets two. Wardens/Keeper gain
  another action when enraged below half health.
- If no enemy is engaged, the next player turn starts immediately, so exploring an empty corridor does not produce a
  fake enemy-phase pause.
- Enemy attacks resolve after End Turn; they are not applied during the player's planning phase. There is no real-time
  autonomous AI in Cinder because the mode owns `TurnControl`.

## Loot and pack

The pack holds 12 distinct stacks and has `armor` and `charm` equipment slots. Gear and consumables are content items.
Each depth grants one guaranteed Ember Shard and one weighted cache item. Ashbound adds a shard and cache per threat loot
point. An Ash Warden drops a shard and guaranteed equipment plus a weighted cache; the final Keeper also drops a draught.
Regular enemies have a 32% shard chance and an independent 18% gear/consumable chance. Items:

| Item | Type | Effect |
|---|---|---|
| Ember Draught | Consumable, common | Restore 35 health |
| Ember Flask | Consumable, uncommon | 45 damage to visible foes within 6m |
| Ember Tonic | Consumable, rare | Restore 20 health and gain 1 action; costs 1 action |
| Shard Bomb | Consumable, uncommon | 35 damage to visible foes within 4m |
| Iron Band | Armor, common | 5% incoming damage reduction |
| Ashplate | Armor, uncommon | 8% incoming damage reduction |
| Warden Plate | Armor, epic | 12% incoming damage reduction |
| Hunter's Charm | Charm, uncommon | +8% weapon damage and 1 health per kill |
| Oracle Lens | Charm, rare | +15% weapon damage |
| Obsidian Edge | Charm, rare | +12% weapon damage |
| Gilded Chain | Charm, rare | +2 embers per kill |
| Ember Shard | Crafting ingredient, uncommon | Consumed by the nine [forge recipes](crafting.md) |

`I` opens the pack. Up/Down selects; Enter uses/equips/unequips; TAB filters All/Gear/Items; DEL drops one carried item;
C opens the forge. Consumables and gear changes cost one action; dropping is free. The inventory is a reusable
`mechanics/inventory` stack provider; Cinder owns filters, effects, loot weights and presentation. Known recipes combine
Ember Shards and existing loot with run embers; see [crafting](crafting.md).

## NPCs and map tools

Each depth places one optional Assetrizz NPC near the start: **Orla, Ember Smith** on depths 1 and 3 (forge, one-time
mend, lore) and **Vey, Lantern Cartographer** on depth 2 (paid wing reveal, warden lore). From depth two, **The Ash Oracle**
can also appear in a loot room with a 20-health blood pact for a random boon or a 25-ember sealed item. Press `E` near them. `M` opens
the tactical grid; the compact automap is always visible on desktop. `O` toggles the reusable orthographic isometric view; `Z`/`X` rotate the camera and WASD follows the camera azimuth. Cinder uses a free pointer: click a
reachable floor tile to spend path AP, or click a visible enemy to aim and attack with the current weapon. The same turn/aim
rules apply, with a floor marker showing the player's facing and the class-specific knight/mage/rogue body shown through
`presentation/player-avatar`. In first person the body is removed and the weapon sprite uses a smaller
bottom-center rig. The Cartographer reveal spends 10 run embers and
marks explored floor, but enemies still show only while in line of sight.

## Persistence keys

- `cinder/vault.v1.embers`, `cinder/vault.v1.runs`: legacy balance and attempt count.
- `cinder/vault.v1.threat`: best cleared threat rank (0 Pilgrim, 1 Delver, 2 Ashbound).
- `cinder/vault.v1.mastery.warden`, `.emberwright`, `.vaultrunner`: mastery XP.
- No in-progress run save/restore.

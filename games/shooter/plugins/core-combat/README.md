# Combat (`core/combat`)

Provides shooter health and damage, weapons and ammunition, projectile and pickup simulation. It registers `core/hitscan`, `core/projectile`, and `core/melee` attacks plus `core/heal`, `core/give-ammo`, and `core/give-weapon` pickup effects.

## Use

Enable the declared dependency `core/world`, then supply weapon, ammo and pickup definitions through a content pack. The [default preset](../../presets/default.json) combines combat with [reference content](../core-content/content.json), enemies, player, and a mode. There is no role selection or manifest configuration for this plugin.

Registration defines the content and behavior registries; activation publishes `Combat` and installs session-owned systems. Combat simulation is headless and does not itself provide visuals, sound, or a game mode. See [content format](../../../../docs/reference/content-format.md), [reuse metadata](reuse.json), and [combat tests](../../../../tests/game-combat.test.ts); run `npm test`.

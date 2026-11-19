# Cinder Vault game (`cinder/game`)

A three-depth, turn-based dungeon roguelite with classes, threat tiers, action-point combat, loot and equipment, NPCs, forge, exploration, bosses, boons, and persistent mastery. It registers `cinder/vault` mode, `cinder/turn-controller`, `cinder/experience`, a manual enemy behavior, and NPC prefab.

## Composition

The manifest depends on `core/world`, `core/combat`, `core/player`, `core/enemies`, `dungeon/generator`, and `mechanics/kits`. It requires progression, inventory, and crafting roles, and declares activation-time role dependencies on resource, clock, action, objective, progression, inventory, and crafting providers. Enable the content pack and all selected providers explicitly: the [Cinder preset](../../presets/cinder-vault.json) is the working reference. It also selects a camera, HUD, and theme. No plugin config is declared.

When its mode is selected, session-owned systems publish `Cinder` and `TurnControl`, process commands, and manage the run. Profile, settings, and view modes are optional integrations; simulation can run headlessly. This mode implements Cinder policy over shared mechanics, not a general-purpose roguelite engine. See the [Cinder guide](../../README.md), [classes](../../docs/classes.md), [shared mechanics](../../../../docs/reference/reusable-mechanics.md), and [Cinder tests](../../tests/cinder-vault.test.ts); run `npm test`.

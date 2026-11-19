# Cinder Vault content (`cinder/content`)

Data for the seeded three-depth dungeon, its six-weapon armory, seven enemy archetypes, twelve gear/consumable/Ember Shard items, nine forge recipes, threat caches, and turn-domain kit. The [content file](content.json) is the source of individual IDs and values.

## Use

The manifest requires `core/world`, `core/combat`, `core/enemies`, `dungeon/generator`, `mechanics/kits`, `mechanics/inventory`, and `mechanics/crafting`. The [Cinder preset](../../presets/cinder-vault.json) adds `cinder/game`, the remaining mechanic providers, presentation, and role selections, with `options.map` set to `cinder/vault`. This data pack has no configuration or roles of its own.

Definitions are staged through their registered content kinds; the pack has no activation code, DOM, or renderer and can be used in headless validation. Its content is tailored to Cinder's rules and dependencies, not a stand-alone game. See the [Cinder guide](../../README.md), [content format](../../../../docs/reference/content-format.md), and [Cinder tests](../../tests/cinder-vault.test.ts). Run `npm test` or `npm run validate-game -- --bundled`.

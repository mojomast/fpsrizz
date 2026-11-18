# Seeded dungeon rooms

`dungeon/generator` registers the `dungeon/generator` map format in `MapFormats` and the inert `dungeon/marker` prefab in `Prefabs`. Enable it alongside its required `core/world`; [Cinder Vault](../../../games/cinder/presets/cinder-vault.json) and its [content](../../../games/cinder/plugins/cinder-content/content.json) demonstrate a generated map recipe.

The validated recipe produces a deterministic shooter-family `WorldDescription` from its seed: rooms, corridors, lights, room markers and descent pads in a bounded grid. Up to three isolated wings share one map; a consuming mode supplies encounters, navigation policy and descent behavior. It does not perform runtime map swaps or generate per-run encounter composition. Registration is plugin-owned; the generated description is consumed by the world loader.

See [recipe format and limits](../../../docs/reference/dungeon-generator.md), [implementation](index.ts), [generator tests](../../../tests/dungeon-generator.test.ts) and [Cinder tests](../../../games/cinder/tests/cinder-vault.test.ts).

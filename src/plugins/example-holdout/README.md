# Holdout

`example/holdout` is a mode for defending an exit zone against spawned enemies. Time in the zone accumulates toward victory; player death causes defeat.

## Use

Enable `core/world`, `core/enemies`, this plugin, and the selected player prefab's provider; set `roles["sdk/mode"] = "example/holdout"`. The [holdout preset](../../content/presets/holdout.json) uses `core/arena`. A compatible map needs an exit-tagged zone and an enemy-tagged spawn with a registered enemy prefab.

`config["example/holdout"]` accepts `playerPrefab` (default `core/player`), `holdSeconds` (60), `spawnInterval` (3), and `maxAlive` (12). Times are in seconds; ranges are in [manifest.json](manifest.json).

The selected role spawns the player and installs session-scoped rules and death handling. Progress is accumulated while inside the zone rather than requiring one uninterrupted stay; this mode uses the first matching exit.

## Verify

Run `node --test tests/holdout.test.ts` from the repository root.

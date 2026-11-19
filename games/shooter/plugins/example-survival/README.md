# Survival

`example/survival` provides escalating enemy waves. Score kills, clear the final wave and survive; death ends the run. It prefers distant, hidden spawn locations and replenishes missing pickups between waves.

## Use

Enable `core/world`, `core/enemies`, this plugin, and the player prefab's provider; select `roles["sdk/mode"] = "example/survival"`. The [survival preset](../../presets/survival.json) is a complete composition. The map needs at least one enemy-tagged spawn with a registered enemy prefab.

`config["example/survival"]` supports `playerPrefab` (`core/player`), `waves` (5), `baseCount` (3), `growth` (2), `minSpawnDistance` (8), `intermission` (4 seconds), `spawnInterval` (0.35 seconds), and `maxAlive` (24). See [manifest.json](manifest.json) for ranges.

The mode registers and validates during staging. Selecting it spawns the player and installs session-owned wave and death logic. Spawn preferences have fallbacks, so out-of-sight or minimum-distance placement is not guaranteed.

## Verify

Run `node --test tests/ext-survival.test.ts` from the repository root.

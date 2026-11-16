# Arena score attack

`example/arena` provides the `example/arena` mode: earn enemy scores until the kill or time limit, while avoiding death. It prefers distant, hidden enemy spawn points and respawns pickups. If the optional profile service is available, it stores the best score under `example/arena.best-score`.

## Use

Enable `core/world`, `core/enemies`, `core/player`, and this plugin, and select `roles["sdk/mode"] = "example/arena"`. The complete [arena-score preset](../../content/presets/arena-score.json) uses `core/arena` and the dash controller. The map needs an enemy-tagged spawn with a registered enemy prefab; validation also checks the player prefab.

Configure `config["example/arena"]`: `playerPrefab` (default `core/player`), `killLimit` (30), `timeLimit` (180 seconds), `spawnInterval` (1 second), `maxAlive` (8), `minSpawnDistance` (8), and `pickupRespawn` (20 seconds). Ranges are in [manifest.json](manifest.json).

The mode registers during staging; selecting it spawns the player and installs session-owned event listeners and rules. Spawning falls back to usable points if preferred points are unavailable.

## Verify

Run `node --test tests/arena-mode.test.ts` from the repository root.

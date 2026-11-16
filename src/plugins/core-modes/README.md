# Objective Mode (`core/modes`)

Provides `core/objective` for `sdk/mode`. It spawns the configured player prefab and map spawns, tracks hostiles, unlocks the exit after all objective-tagged switches fire, and ends the run on player death or reaching the exit. With no objective switches, the exit is immediately unlocked.

## Use

Depends on `core/world`. Select `"sdk/mode": "core/objective"` and a map with an exit-tagged zone, as in the [default preset](../../content/presets/default.json). `config.core/modes.playerPrefab` defaults to `core/player`; enable its provider or configure another registered prefab. Validation reports missing prefabs and exit zones for this selected mode.

The role activates after plugin registration and owns its event listeners and spawned session state. It uses gameplay and flow services, not a DOM or renderer, so it can run headlessly. It is an objective-specific mode rather than a general level progression system. See [content format](../../../CONTENT_FORMAT.md), [plugin lifecycle](../../../PLUGINS.md), and [game session tests](../../../tests/game-session.test.ts); run `npm test`.

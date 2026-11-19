# Extraction Prototype

`example/extraction` provides a timed, single-session loot run and the `example/loot` pickup effect. Reach an exit before the deadline to extract the carried total; death or timeout loses it.

## Use

Enable `core/world`, `core/combat`, `core/player`, and this plugin; select `roles["sdk/mode"] = "example/extraction"`. The complete [extraction preset](../../presets/extraction.json) pairs it with [Salvage Run](../example-extraction-map/content.json). Set `config["example/extraction"].duration` to change the 120-second default (1–3600 seconds).

The selected map must include an exit-tagged zone and a pickup using `example/loot`; its `amount` is an integer from 1 to 10000. For example, `example/salvage-cache` awards 10. Zero loot can be extracted: collection is not a victory prerequisite.

The effect and mode register during staging. Selecting the mode creates the player and map spawns, then owns the deadline, loot state and rules for that session. Loot is not persistent inventory.

## Verify

Run `node --test games/shooter/tests/extraction.test.ts games/shooter/tests/extraction-map.test.ts` from the repository root.

# sky/content

`sky/content` 1.0.0 is an SDK 2 data-only pack depending on `sky/game` and `mechanics/kits` ^1.0.0. It provides no roles or systems: those dependencies load the `sky-route` and `mechanic-kit` kinds, respectively, and the game exposes `Sky`.

## Included content

- `sky/cloudline` is a route with three deliveries: amber (-6,-4) → (-6,5), mint (0,-5) → (0,5), and rose (6,-4) → (6,5), in X/Z coordinates.
- `sky/flight-kit` uses seconds. Energy and hull start at 100/100; cargo starts at 0/1. Collect gains one cargo, deliver spends one, boost spends 20 energy with a 4-second cooldown, and repair spends 15 energy to gain 20 hull with an 8-second cooldown. The `deliveries` objective targets three.

The bundled [`sky-salvage.json`](../../presets/sky-salvage.json) selects those IDs via `options.route` and `options.mechanicKit`. It enables this pack, `sky/game`, `sky/presentation`, `theme/board`, `mechanics/kits`, and the resources, clock, actions and objectives providers. It selects `sky/salvage` for `sdk/experience`, `theme/board` for `sdk/theme` and the corresponding `mechanics/*` implementations for the four `sdk/mechanic-*` roles. The pack has no configuration; enable dependencies and select providers explicitly.

## Validation and limits

Routes require 1–8 uniquely identified deliveries, bounded X/Z positions and minimum spacing between pickups and between beacons; unknown fields are rejected. Sky requires a seconds kit with energy, hull and single-slot cargo, the four named actions, and exactly one unlocked `deliveries` objective matching the route count. Collect/deliver must gain/spend one cargo; boost and repair have additional energy and cooldown requirements. Shared kit validation also checks resource references, numeric bounds and objective dependencies. Spatial legality, hazards and flight behavior belong to `sky/game`, not the pack.

Run `npm run validate-game -- --bundled`, `node --test games/sky/tests/sky-salvage.test.ts tests/reusable-games.test.ts`, and `npm run check` for full checks. See the [Sky guide](../../README.md), [mechanics guide](../../../../docs/reference/reusable-mechanics.md), [SDK contract](../../contracts/sky.ts), and [`sky/game`](../sky-game/).

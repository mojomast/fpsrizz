# sky/game

Headless courier-drone authority. It registers `sky-route`, provides `Sky`, and composes role-selected resource, clock, action and objective providers through `mechanics/kits`. The game owns flight, spatial legality, hazards and delivery policy; the shared providers own transactions, cooldowns, time and objective progress. See the [SDK contract](../../contracts/sky.ts) and [`sky/presentation`](../sky-presentation/README.md).

[`portfolio/sky-resource`](../../presets/portfolio-sky-resource.json) selects `sky/salvage` for `sdk/experience`, the four `mechanics/*` implementations for their corresponding `sdk/mechanic-*` roles, and `theme/board` for `sdk/theme`. Its options select `portfolio/crosswind-kit` and `portfolio/crosswind`. Both the providers and `mechanics/kits` must be enabled explicitly.

WASD/arrows fly, E collects or delivers, Space boosts, F repairs and R restarts. `Sky.state()` provides a snapshot; `enqueue()` accepts movement and action commands, with a maximum of 32 pending and one processed per fixed tick. Ingress rejects pause/disposal. Restart recreates the owned kit and borrowed-clock deadlines. Render, UI and audio are not required.

Routes contain bounded pickup/beacon coordinates and unique delivery IDs; kits use seconds, required resources/actions and a matching deliveries objective. Full validation, controls and reference values are in the [Sky guide](../../README.md); see [portfolio resource games](../../../../docs/games/portfolio-resource-games.md) for Crosswind's differences. Verify with `node --test tests/portfolio-resource-games.test.ts` and `npm run check`.

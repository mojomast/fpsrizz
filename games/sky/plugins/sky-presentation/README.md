# sky/presentation

3D floating-island scene, drone controls and HUD for [`sky/game`](../sky-game/README.md). It reads `Sky` snapshots and enqueues commands; flight and delivery legality remain in the game. Render and UI are optional, and presentation resources, input and systems are owned by the plugin context. Input is gated while paused.

The complete [`portfolio/sky-resource` preset](../../presets/portfolio-sky-resource.json) selects `sky/salvage` for `sdk/experience`, the four shared mechanics roles, and `theme/board` for `sdk/theme`; its options choose a route and seconds-domain kit. Use WASD/arrows or held direction buttons to fly, E to collect/deliver, Space to boost, F to repair and R to restart. HUD buttons provide alternatives.

See the [Sky guide](../../README.md) for the route and kit formats and [portfolio resource games](../../../../docs/games/portfolio-resource-games.md) for the Crosswind scenario. Verify with `node --test tests/portfolio-resource-games.test.ts`, `npm run build && npm run smoke`, and `node tests/portfolio-demo/run.mjs`.

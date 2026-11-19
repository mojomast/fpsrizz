# verdant/presentation

3D archipelago and management interface for [`verdant/game`](../verdant-game/README.md). It reads `Verdant` snapshots and action definitions and enqueues commands; the authority validates and commits turns. Render and UI are optional services. Scene resources, listeners and frame systems are context-owned, and commands are gated while paused.

[`portfolio/verdant-resource`](../../presets/portfolio-verdant-resource.json) selects `verdant/relay` for `sdk/experience`, the resource, clock, action and objective providers through their `sdk/mechanic-*` roles, and `theme/board` for `sdk/theme`. Its `options.world` selects Last Rain. Click a 3D station or its button, then collect, convert, restore or wait; restart begins a fresh season. The selection ring and visible restoration are presentation, not authority.

The [Verdant guide](../../README.md) describes the world/kit format, action order and reference rules; [portfolio resource games](../../../../docs/games/portfolio-resource-games.md) covers Last Rain. Verify with `node --test tests/portfolio-resource-games.test.ts`, `npm run build && npm run smoke`, and `node tests/portfolio-demo/run.mjs`.

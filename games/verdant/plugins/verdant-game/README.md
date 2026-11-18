# verdant/game

Headless turn-based colony restoration authority. It registers `verdant-world`, provides `Verdant`, and uses `mechanics/kits` with role-selected resource, clock, action and objective providers. The game owns target legality, weather, season boundaries and win/loss order; providers own resource transactions, cooldowns, time and objective receipts. The [SDK contract](../../contracts/verdant.ts) is consumed by [`verdant/presentation`](../verdant-presentation/README.md).

[`portfolio/verdant-resource`](../../presets/portfolio-verdant-resource.json) selects `verdant/relay` for `sdk/experience`, the four `mechanics/*` implementations for their respective `sdk/mechanic-*` roles, and `theme/board` for `sdk/theme`; `options.world` selects `portfolio/last-rain`. Enable `mechanics/kits` and each selected provider explicitly.

Select a station and collect water, harvest biomass, generate charge, restore or wait. Only accepted actions advance the turn: validate and execute, record a restoration, advance the clock, then check victory, weather and season in that order. `Verdant.state()` returns a detached snapshot; `enqueue()` takes action or restart commands and rejects paused input. Restart recreates the owned kit and clock deadlines; simulation works without render or UI.

World content names a turns-domain kit, a day limit and exactly three stations; required kit resources, actions and objective are documented in the [Verdant guide](../../README.md). See [portfolio resource games](../../../../docs/games/portfolio-resource-games.md) for Last Rain's shorter season. Verify with `node --test tests/portfolio-resource-games.test.ts` and `npm run check`.

# board/tactics

Deterministic turn-based squad authority. It registers `board-mission` content and exposes `Tactics` for state, forecasts and queued commands; [`board/presentation`](../board-presentation/README.md) consumes that interface. See the [SDK contract](../../contracts/tactics.ts) and [tactics guide](../../README.md).

[`portfolio/breach-tactics`](../../presets/portfolio-breach-tactics.json) selects `board/tactics` as `sdk/experience`, `mechanics/navigation` as `sdk/mechanic-navigation`, and `theme/board` as `sdk/theme`; `options.mission` selects `portfolio/glasshouse-breach`. It enables an optional outcome-rating provider. The mission contains rectangular terrain rows (`.`, `#`, `C`) and uniquely identified squad/enemy units. The game owns occupancy, AP, attack legality and enemy policy; navigation supplies ordered shortest-path queries. Invalid actions do not spend AP.

Select units and cells by pointer or arrows/Enter; M selects move, A attack, E ends the turn. Commands resolve on control ticks: up to 128 pending and 4,096 distinct request IDs per session, with IDs accepted at most once. Paused ingress is rejected. These missions use elimination; see [portfolio tactics](../../docs/portfolio-tactics.md) for scenario details.

Rules are headless and session-owned; consumers should use SDK services rather than import this plugin. Verify with `node --test games/tactics/tests/turn-tactics.test.ts games/tactics/tests/portfolio-tactics.test.ts` and `npm run check`.

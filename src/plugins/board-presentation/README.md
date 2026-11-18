# board/presentation

Orthographic tactical board, command interface, forecasts and outcome cues. This plugin depends on [`board/tactics`](../board-tactics/README.md), consumes `Tactics` and `TacticsResolved`, and obtains art and sounds through theme keys. The authority, not the UI, validates actions and spends AP. Render, UI and audio services are optional; keep created resources and listeners scoped to the plugin context.

Use [`portfolio/breach-tactics`](../../content/presets/portfolio-breach-tactics.json) as a complete composition: `sdk/experience` is `board/tactics`, `sdk/mechanic-navigation` is `mechanics/navigation`, and `sdk/theme` is `theme/board`; `options.mission` chooses the mission. Click or use arrows/Enter to select, M for move, A for attack, and E to end turn. Commands are gated while paused and resolve on a simulation tick.

The [tactics guide](../../../docs/games/turn-tactics.md) documents mission format, controls and accessible browser selectors; [portfolio tactics](../../../docs/games/portfolio-tactics.md) describes the authored missions. Verify with `node --test tests/turn-tactics.test.ts tests/portfolio-tactics.test.ts`, `npm run build && npm run smoke`, and `node tests/portfolio-demo/run.mjs`.

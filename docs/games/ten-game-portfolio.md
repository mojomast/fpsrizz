# Ten-game portfolio

These are ten separately selectable, authored small games built as plugin compositions. They deliberately reuse six
existing game-family authorities and their presentation rather than claiming ten new engines. Their authored scenarios,
victory routes and family limitations are documented below. Select them from the launcher or use the linked preset IDs.

| Game | Preset ID | Player's challenge | Guide |
|---|---|---|---|
| The Counterweight Atelier | `portfolio/atelier-puzzle` | Solve four multi-stone plate-and-gate chambers without pursuit. | [Puzzles](portfolio-puzzles.md) |
| The Watchman's Run | `portfolio/watch-puzzle` | Open gates and escape four chambers under golem pursuit. | [Puzzles](portfolio-puzzles.md) |
| Salt Flats — Endurance Loop | `portfolio/salt-racing` | Drive three timed laps on a wide circuit, crossing gates in order. | [Racing](../../games/racing/docs/portfolio-racing.md) |
| Copper Switchback — Canyon Sprint | `portfolio/copper-racing` | Drive one timed lap of a narrower, asymmetric circuit. | [Racing](../../games/racing/docs/portfolio-racing.md) |
| Glasshouse Breach | `portfolio/breach-tactics` | Lead three agents through a defended central bottleneck. | [Tactics](../../games/tactics/docs/portfolio-tactics.md) |
| Salt Flats Crossfire | `portfolio/crossfire-tactics` | Command two surrounded scouts against four raiders. | [Tactics](../../games/tactics/docs/portfolio-tactics.md) |
| The Quiet Index | `portfolio/quiet-index` | Reconstruct a concealed register and choose how to disclose it. | [Adventures](portfolio-adventures.md) |
| The Night Orchard | `portfolio/night-orchard` | Save a seedship cutting and choose which specialist to wake. | [Adventures](portfolio-adventures.md) |
| Crosswind Dispatch | `portfolio/sky-resource` | Deliver four matched emergency instruments while conserving energy. | [Resource games](portfolio-resource-games.md) |
| Last Rain Conservatory | `portfolio/verdant-resource` | Restore three stations by budgeting resources over a twelve-day season. | [Resource games](portfolio-resource-games.md) |

For local development append `?preset=<preset-id>` to the app URL. The paired games share their respective family rules,
interfaces and art; in particular, the racing games are time trials rather than opponent races, the tactical missions
use elimination, and the adventures reuse the story theme's observatory imagery. The games are fresh authored scenarios,
not claims of distinct technology or assets for every title.

## Two additional card games

The same build also includes **Ash & Ink** (`portfolio-cards/ash`), a glyph-seal and ink-management duel, and
**Cloud Cartographer** (`portfolio-cards/cloud`), an island-survey and storm-management game. These small deterministic
games use independent rule plugins and a shared `portfolio-cards/piles` provider for ordered draw, hand and discard
zones. See [the card games guide](portfolio-cards.md) for rules, complete routes and the provider's limits.

## Modular composition

The racing games use `mechanics/sequence` for ordered gates and laps; tactics and the puzzle games use
`mechanics/navigation` for deterministic graph queries. Crosswind and Last Rain both select the existing
`mechanics/resources`, `mechanics/actions`, `mechanics/clock` and `mechanics/objectives` providers, with different
real-time and turn-based game rules. The newly built `mechanics/outcome-rating` provider classifies completed outcomes:
racing supplies time and tactics supplies turns and survivors. It is selected in both racing and both tactical presets;
the game retains its own victory, scoring thresholds and presentation policy. See
[shared outcome ratings](../reference/portfolio-shared-mechanics.md), [reuse discovery](../guide/reuse.md), the
[build plan](../archive/ten-game-build-plan.md), and [research](../archive/research/ten-game-portfolio-2026-11-16.md).

The puzzle and card presets also select `mechanics/hints` and `portfolio/assist`, which offer contextual, progressively
revealed hints without taking actions for the player. See [portfolio assistance](portfolio-assist.md).

## Verification

`games/racing/tests/portfolio-racing.test.ts`, `games/tactics/tests/portfolio-tactics.test.ts`, `tests/portfolio-adventures.test.ts`,
`tests/portfolio-puzzles.test.ts` and `tests/portfolio-resource-games.test.ts` exercise actual winning routes for all
ten games through their authoritative services. `tests/outcome-rating.test.ts` covers the shared rating contract and
real racing and tactics consumers. `tests/portfolio-demo/run.mjs` launches selected bundled presets in a browser;
`tests/portfolio-cards.test.ts` tests both additional card games and their shared piles. The browser harness checks a
player action in each portfolio preset; this evidence must be distinguished from full subjective playtesting.

On the initial portfolio build, `npm run check` passed **791/791 tests**; bundled validation staged **37 presets**; the browser
runner activated and exercised an action in all **12** new presets; and `npm run smoke` passed **37/37 checks**. The
browser runner exercises the input/presentation connection, while the complete winning routes are headless tests. These
checks do not establish subjective balance, game feel or a full human playthrough.

After the enrichment pass, `npm run check` passed **798/798 tests** and bundled validation staged all **37 presets**.
The additional [portfolio QoL browser runner](../../tests/portfolio-qol-demo/run.mjs) exercises desktop and narrow layouts,
representative player actions, pause/resume and restart; its checks are not full human playthroughs.
On the integrated build it passed **24/24** preset-and-viewport cases, and browser smoke passed **37/37** checks.

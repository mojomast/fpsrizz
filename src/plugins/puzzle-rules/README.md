# puzzle/rules

Headless authority for Stonewake-style push puzzles: boulders, plates, exits, reversible turns and pursuing golems. It registers `push-puzzle` campaigns, publishes `PushPuzzle` and emits `PuzzleResolved`; the [SDK contract](../../sdk/contracts/puzzle.ts) is the interface for consumers such as [`puzzle/presentation`](../puzzle-presentation/README.md).

[`portfolio/atelier-puzzle`](../../content/presets/portfolio-atelier-puzzle.json) selects `puzzle/stonewake` as `sdk/experience`, `mechanics/navigation` as `sdk/mechanic-navigation`, `theme/board` as `sdk/theme`, and `portfolio/counterweight-atelier` as `options.campaign`. The rules construct legal pursuit graphs; the navigation provider supplies ordered path queries. The atelier campaign has no pursuit; the companion Watchman's Run does.

WASD/arrows step or push, Space waits, Z undoes, R resets the chamber, Q/E orbit. Only accepted turns advance play; undo retains 256 turns. Campaign progress is session-only. Command ingress is bounded to 32 and resolves one command per control tick; it rejects paused input. State snapshots are copies and definitions are frozen.

The [Stonewake guide](../../../docs/stonewake.md) documents the `push-puzzle` row symbols, validation bounds, examples and limitations: connectivity validation does not prove a puzzle solvable. See also [portfolio puzzles](../../../docs/portfolio-puzzles.md). Verify with `node --test tests/stonewake.test.ts tests/portfolio-puzzles.test.ts` and `npm run check`.

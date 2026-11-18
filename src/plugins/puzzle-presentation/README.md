# puzzle/presentation

Lit 3D diorama, orthographic orbit camera, floor picking, HUD and sound for [`puzzle/rules`](../puzzle-rules/README.md). It consumes `PushPuzzle` and `PuzzleResolved`; the rules own turn legality and progression. Scene resources, camera, listeners and UI are context-owned; render, UI and audio services are optional. Commands are gated while paused.

Use [`portfolio/atelier-puzzle`](../../content/presets/portfolio-atelier-puzzle.json): select `puzzle/stonewake` for `sdk/experience`, `mechanics/navigation` for `sdk/mechanic-navigation`, and `theme/board` for `sdk/theme`; `options.campaign` selects the authored pack. WASD/arrows step, Space waits, Z undoes, R retries and Q/E orbit. Adjacent floor clicks and HUD buttons provide alternatives. The camera does not spend a turn.

See the [Stonewake guide](../../../docs/games/stonewake.md) for content format, controls, scene asset provenance and limitations, and [portfolio puzzles](../../../docs/games/portfolio-puzzles.md) for the two campaigns. Verify with `node --test tests/stonewake.test.ts tests/portfolio-puzzles.test.ts`, `npm run build && npm run smoke`, and `node tests/stonewake-demo/run.mjs`.

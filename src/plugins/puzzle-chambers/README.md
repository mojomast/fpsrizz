# puzzle/chambers

`puzzle/chambers` 1.0.0 is an SDK 2 data-only pack depending on `puzzle/rules` ^1.0.0. The rules plugin registers `push-puzzle` and provides the `PushPuzzle` SDK service. This pack provides no role, systems or plugin configuration.

## Campaign and composition

`puzzle/sleeping-ruins` contains three Stonewake chambers: **The First Weight** (par 10), **The Waking Watch** (par 12) and **The Twin Seal** (par 24). They introduce boulder-weighted plates, pursuing golems, and a two-plate puzzle. Par is a target, not a deadline. The exact maps and hints are in `content.json`.

The bundled [`stonewake.json`](../../content/presets/stonewake.json) enables `puzzle/rules`, `puzzle/presentation`, `puzzle/chambers`, `theme/board` and `mechanics/navigation`; selects `puzzle/stonewake` as `sdk/experience`, `theme/board` as `sdk/theme` and `mechanics/navigation` as `sdk/mechanic-navigation`; and sets `options.campaign` to `puzzle/sleeping-ruins`. Enable dependencies and select roles explicitly.

## Authoring and verification

Use an entry with `kind: "push-puzzle"`, a unique ID, and `data` containing a name and 1–16 chambers with name, hint, par and rows. Maps are rectangular, 5–16 cells per side, surrounded by walls. Symbols are `#` wall, `.` floor, `P` player, `E` exit, `O` plate, `B` boulder and `G` golem. Each map needs one player and exit, 1–8 plates, at least as many boulders as plates (maximum 12), and at most four golems. The loader rejects unknown symbols and fields and checks static connectivity, but does **not** prove push solvability. Playtest each map.

Run `npm run validate-game -- --bundled` and `node --test tests/stonewake.test.ts`; `npm run check` covers the project. The [Stonewake guide](../../../docs/games/stonewake.md) has full authoring limits, controls and tested solutions; see also the [SDK contract](../../sdk/contracts/puzzle.ts) and [`puzzle/rules`](../puzzle-rules/).

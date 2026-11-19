# board/mission

`board/mission` 1.0.0 is an SDK 2 data-only pack depending on `board/tactics` ^1.0.0. It registers no roles or systems itself: `board/tactics` loads its `board-mission` content and publishes the `Tactics` SDK service.

## Content and composition

`board/signal-break` is an 8-by-7 board with walls (`#`), cover (`C`) and floor (`.`). Raven and Rook are squad units with 6 HP and 2 AP each; Guard and Sentry are enemies with 4 HP and 2 AP each. Coordinates in `content.json` are zero-based column and row.

The bundled [`turn-tactics.json`](../../presets/turn-tactics.json) enables `board/tactics`, `board/mission`, `board/presentation`, `theme/board`, and `mechanics/navigation`; it selects `board/tactics` for `sdk/experience`, `theme/board` for `sdk/theme`, `mechanics/navigation` for `sdk/mechanic-navigation`, and `board/signal-break` in `options.mission`. The content pack itself has no configuration. Enable dependencies and select roles explicitly.

## Authoring and verification

Each entry uses `kind: "board-mission"`, a unique ID, and `data` with `name`, rectangular `rows`, and `units`. The loader accepts 2–20 rows, at most 20 characters per row, and 2–24 units. Each unit has a unique ID, name, `team` (`squad` or `enemy`), integer `x`/`y`, HP 1–20 and AP 1–2. Units must occupy distinct traversable cells, and both teams must be represented. Validation does not guarantee tactical balance or a winning route.

Run `npm run validate-game -- --bundled` to stage bundled presets and `node --test games/tactics/tests/turn-tactics.test.ts` for headless rules, mission validation and the shipped completion route; `npm run check` runs the complete project checks. See the [tactics guide](../../README.md), [SDK contract](../../contracts/tactics.ts), and [`board/tactics`](../board-tactics).

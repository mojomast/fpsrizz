# The Counterweight Atelier

`portfolio/atelier-puzzle` is a data-only pack depending on `puzzle/rules`. Its `push-puzzle` campaign **`portfolio/counterweight-atelier`** contains four multi-stone chambers: The Elbow, The Crossbench, The Three Weights and The Split Workshop. It declares no roles or plugin config.

## Composition and format

Use [`portfolio-atelier-puzzle.json`](../../presets/portfolio-atelier-puzzle.json): enable navigation, puzzle rules and presentation, this pack and the board theme; select `puzzle/stonewake`, `mechanics/navigation` and `theme/board` for their corresponding roles; set `options.campaign` to `portfolio/counterweight-atelier`.

[`content.json`](content.json) supplies a campaign name and `chambers`, each with `name`, `hint`, `par` and rectangular `rows`. Here is a fresh **chamber fragment**:

```json
{ "name": "First Weight", "hint": "Push toward the seal.", "par": 20, "rows": ["#######", "#....E#", "#..O..#", "#..B..#", "#..P..#", "#######"] }
```

`#` is wall, `.` floor, `P` player, `B` stone, `O` seal and `E` exit. Check full validation and mechanics in [Stonewake](../../docs/stonewake.md) and the [portfolio puzzle guide](../../docs/portfolio-puzzles.md).

## Exercise and limits

Run `node --test games/puzzles/tests/portfolio-puzzles.test.ts` and `npm run validate-game -- --bundled`; push every stone onto a seal, then reach the exit. This pack owns no live state or random process: puzzle rules own deterministic movement, navigation and session lifetime. It does not implement a new puzzle engine.

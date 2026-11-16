# The Watchman's Run

`portfolio/watch-puzzle` provides the `push-puzzle` campaign **`portfolio/watchmans-run`** for its dependency `puzzle/rules`. Its four chambers add one or two pursuing watchers to stone-and-seal puzzles. No roles or config are declared by the pack.

## Composition and format

Start with [`portfolio-watch-puzzle.json`](../../content/presets/portfolio-watch-puzzle.json): enable navigation, puzzle rules and presentation, this pack and the board theme; select the `puzzle/stonewake`, `mechanics/navigation` and `theme/board` providers and set `options.campaign` to `portfolio/watchmans-run`.

The campaign's [`content.json`](content.json) defines named chambers with hints, par values and rectangular grid rows. This fresh **chamber fragment** illustrates the same vocabulary:

```json
{ "name": "Long Hall", "hint": "Keep moving after the push.", "par": 30, "rows": ["#########", "#......E#", "#..B.O..#", "#.P.....#", "#.....G.#", "#########"] }
```

`#`, `.`, `P`, `B`, `O`, `E` and `G` denote wall, floor, player, stone, seal, exit and watcher. See [Stonewake](../../../docs/stonewake.md) and the [portfolio puzzle guide](../../../docs/portfolio-puzzles.md) for full rules and constraints.

## Exercise and limits

Run `node --test tests/portfolio-puzzles.test.ts` and `npm run validate-game -- --bundled`; open the exit and avoid the watchers. The pack contains no simulation or independent AI: the puzzle runtime owns deterministic state, watcher behavior and cleanup.

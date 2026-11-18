# Salt Flats Crossfire

`portfolio/crossfire-tactics` contributes `board-mission` **`portfolio/salt-flats-crossfire`**, a two-scout defense against four surrounding raiders. The data pack depends on `board/tactics` and declares no roles or plugin configuration.

## Compose and extend

Use [`portfolio-crossfire-tactics.json`](../../content/presets/portfolio-crossfire-tactics.json): enable the pack, board rules and presentation, board theme, navigation and outcome ratings. Select `sdk/experience: board/tactics` and `options.mission: portfolio/salt-flats-crossfire`, along with the preset's theme and mechanic roles.

[`content.json`](content.json) defines a mission name, rectangular rows and uniquely identified units with team, grid coordinates, HP and AP. For example, this **unit fragment** adds a squad member at a vacant traversable cell:

```json
{ "id": "mesa", "name": "Mesa", "team": "squad", "x": 1, "y": 0, "hp": 8, "ap": 2 }
```

Use distinct legal positions. `.` is open, `#` blocks and `C` provides cover. Consult [turn tactics](../../../docs/games/turn-tactics.md) and the [portfolio tactics guide](../../../docs/games/portfolio-tactics.md) for rules and constraints.

## Exercise and limits

Run `node --test tests/portfolio-tactics.test.ts` and `npm run validate-game -- --bundled`; use cover and defeat the raiders. The tactics runtime owns deterministic turns, combat, navigation and session state; the pack adds no rules or rating provider.

# Glasshouse Breach

`portfolio/breach-tactics` supplies the `board-mission` **`portfolio/glasshouse-breach`**, a three-agent assault on a divided conservatory. It is a data-only SDK 2 pack depending on `board/tactics`; it declares no roles or plugin configuration.

## Compose and extend

[`portfolio-breach-tactics.json`](../../content/presets/portfolio-breach-tactics.json) enables the pack, tactics and presentation, board theme, navigation and outcome ratings. It selects `sdk/experience: board/tactics` and sets `options.mission` to `portfolio/glasshouse-breach`; the preset also selects the theme and both mechanic roles.

[`content.json`](content.json) contains `name`, rectangular `rows` and `units` with unique IDs, names, teams, coordinates, HP and AP. For example, this **unit fragment** adds a squad member at a vacant traversable cell:

```json
{ "id": "reed", "name": "Reed", "team": "squad", "x": 0, "y": 0, "hp": 8, "ap": 2 }
```

Place units on distinct legal cells; `.` is open, `#` blocks and `C` provides cover. See [turn tactics](../../../docs/games/turn-tactics.md) and the [portfolio tactics guide](../../../docs/games/portfolio-tactics.md) for validation and gameplay.

## Exercise and limits

Run `node --test tests/portfolio-tactics.test.ts` and `npm run validate-game -- --bundled`. Play through the central opening and defeat the opposing units. The runtime owns deterministic turns, navigation, combat and session state; this pack defines a mission, not new rules or a rating provider.

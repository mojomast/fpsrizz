# Portfolio racing tracks

`portfolio/racing` is a content-only pack depending on `vehicle/racing`. It declares no roles or config and supplies two `vehicle-track` IDs:

| ID | Course | Laps / limit |
| --- | --- | --- |
| `portfolio/salt-flats` | Wide endurance loop | 3 / 150 seconds |
| `portfolio/copper-switchback` | Narrow canyon sprint | 1 / 90 seconds |

## Compose and author

[`portfolio-salt-racing.json`](../../content/presets/portfolio-salt-racing.json) and [`portfolio-copper-racing.json`](../../content/presets/portfolio-copper-racing.json) enable the pack, racing and presentation, arcade theme, sequence and outcome ratings. Select `vehicle/arcade-race` as `sdk/experience`, and set `options.track` to one of the IDs above; the presets select the required theme and mechanic roles as well.

[`content.json`](content.json) specifies `name`, `width`, `laps`, `timeLimit`, `start` (`x`, `z`, `yaw`), centerline `points`, and ordered directional `gates`. For example, this **gate fragment** crosses a 10-unit-wide course in the positive X direction:

```json
{ "x": 4, "z": 2, "dx": 1, "dz": 0, "width": 10 }
```

Gate order and direction matter. See the [track format](../../../docs/games/overhead-racing.md) and [portfolio racing guide](../../../docs/games/portfolio-racing.md) before authoring a complete course.

## Exercise and limits

Run `node --test tests/portfolio-racing.test.ts` and `npm run validate-game -- --bundled`. Drive through gates in order and finish before the limit. The pack provides geometry and thresholds only; the racing runtime owns deterministic simulation, timing, progression, rating integration and session lifetime.

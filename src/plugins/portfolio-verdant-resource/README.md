# Last Rain Conservatory

`portfolio/verdant-resource` is a data-only pack depending on `verdant/game` and `mechanics/kits`. It supplies `mechanic-kit` **`portfolio/last-rain-kit`** and `verdant-world` **`portfolio/last-rain`**, a 12-day world with three stations. The world references the kit directly. The pack declares no roles or plugin configuration.

## Composition and content

[`portfolio-verdant-resource.json`](../../content/presets/portfolio-verdant-resource.json) enables the pack, Verdant runtime and presentation, kit support, board theme and resource, clock, action and objective providers. It selects `sdk/experience: verdant/relay`, the four mechanic roles and `sdk/theme: theme/board`, with `options.world: portfolio/last-rain`.

[`content.json`](content.json) defines a `turns` kit with bounded water, biomass and charge; actions with cooldowns and spend/gain maps; and a three-relay objective. The world specifies its kit, day limit and stations with IDs, names and X/Z positions. A fresh **station fragment** is:

```json
{ "id": "nursery", "name": "Nursery", "x": 3, "z": -2 }
```

Keep kit resource/action IDs compatible with Verdant and the objective target consistent with the world. See [Verdant Relay](../../../games/verdant/README.md), [reusable mechanics](../../../docs/reference/reusable-mechanics.md), and the [portfolio resource guide](../../../docs/games/portfolio-resource-games.md).

## Exercise and limits

Run `node --test tests/portfolio-resource-games.test.ts` and `npm run validate-game -- --bundled`; gather, convert and restore the stations within the day limit. The selected providers and game runtime own deterministic turn state, legality, clocks and cleanup; this pack only supplies data.

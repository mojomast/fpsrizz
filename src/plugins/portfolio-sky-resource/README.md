# Crosswind Dispatch

`portfolio/sky-resource` is a data-only pack depending on `sky/game` and `mechanics/kits`. It contributes `mechanic-kit` **`portfolio/crosswind-kit`** and `sky-route` **`portfolio/crosswind`**, with four pickup-to-beacon deliveries. It declares no roles or plugin configuration.

## Composition and content

The complete [`portfolio-sky-resource.json`](../../content/presets/portfolio-sky-resource.json) enables the pack, Sky runtime and presentation, kit support, board theme, and resources, clock, actions and objectives providers. It selects the corresponding mechanic roles, `sdk/experience: sky/salvage`, and `sdk/theme: theme/board`; `options.mechanicKit` and `options.route` select the two IDs above.

The kit in [`content.json`](content.json) uses the `seconds` domain, bounded energy/hull/cargo resources, action cooldowns and spend/gain maps, and a four-delivery objective. The route contains named deliveries with `pickup` and `beacon` X/Z coordinates. A fresh **delivery fragment** looks like:

```json
{ "id": "sample", "pickup": { "x": -4, "z": -3 }, "beacon": { "x": 4, "z": 3 } }
```

Kit action/resource IDs must match what Sky expects. See [Sky Salvage](../../../games/sky/README.md), [reusable mechanics](../../../docs/reference/reusable-mechanics.md), and the [portfolio resource guide](../../../docs/games/portfolio-resource-games.md).

## Exercise and limits

Run `node --test tests/portfolio-resource-games.test.ts` and `npm run validate-game -- --bundled`; collect and deliver all four packages while managing energy and hull. Data carries no mutable state or randomness; the selected providers and Sky runtime own simulation, action legality, timing and cleanup. This pack does not implement those mechanics.

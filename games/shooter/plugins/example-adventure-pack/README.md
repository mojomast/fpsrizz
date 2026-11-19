# Abandoned Places

`example/adventure-pack` is a data-only shooter content pack containing the objective maps `example/silent-observatory` and `example/blackout-ward`. The latter includes a timed ward pickup and a darker survival encounter.

## Use

Enable `core/world`, `core/content`, and `example/ward` alongside the other plugins in either [Observatory](../../presets/observatory.json) or [Blackout](../../presets/blackout.json). Select one of the map IDs in `options.map`; both presets select `core/objective` as their mode. See [content.json](content.json) for switches, exits, spawns and lighting.

The pack registers content during staging and has no activation system or configuration. Maps still need a compatible mode, player and presentation providers; this is shooter grid content, not the independent narrative-adventure family.

## Verify

Run `node --test games/shooter/tests/adventure-pack.test.ts` from the repository root. See the [content format](../../../../docs/reference/content-format.md).

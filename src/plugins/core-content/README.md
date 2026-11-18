# Bulkhead Station content (`core/content`)

This data-only pack supplies the reference arena, two weapons, two enemies, three pickups, and two ammunition types. Its definitions are interpreted by the content kinds and behaviors registered by the enabled gameplay plugins.

## Use

Enable `core/world`, `core/combat`, and `core/enemies` alongside this pack, as required by its manifest. The [default preset](../../content/presets/default.json) selects `core/arena` through `options.map` and adds player, objective mode, HUD, presentation, and theme plugins. Inspect [content.json](content.json) for the actual IDs and values; this pack has no plugin configuration or role provider.

The pack contains no activation code or rendering and can be staged for headless games. It supplies data rather than a complete playable composition. See [content format](../../../docs/reference/content-format.md), [reference-game specification](../../../docs/reference/spec.md), and [content tests](../../../tests/game-content.test.ts). Run `npm test` or validate bundled presets with `npm run validate-game -- --bundled`.

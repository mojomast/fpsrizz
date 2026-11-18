# Salvage Run

`example/extraction-map` is a data-only pack for the extraction prototype. It defines `example/salvage-run`, `example/salvage-cache` (+10) and `example/salvage-data` (+25), with scattered pickups and an exit zone.

## Use

Enable `core/world`, `core/combat`, and `example/extraction` with this pack. The complete [extraction preset](../../content/presets/extraction.json) selects `example/salvage-run` in `options.map` and `example/extraction` as `sdk/mode`. The pickup definitions use that plugin's `example/loot` effect; inspect [content.json](content.json) to adapt their placement.

The pack registers content at staging and has no session system, role or configuration. It supplies a route, not standalone extraction rules or persistent loot.

## Verify

Run `node --test tests/extraction-map.test.ts tests/extraction.test.ts` from the repository root. See [content formats](../../../docs/reference/content-format.md).

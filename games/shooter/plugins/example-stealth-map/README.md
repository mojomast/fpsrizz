# Silent Relay

`example/stealth-map` is a data-only infiltration map, `example/silent-relay`. It places three stealth guards, an objective switch and an extraction zone with a covered southern approach.

## Use

Enable `core/world` and `example/stealth` with this pack. The [stealth preset](../../presets/stealth.json) selects this map and `core/objective`; see [content.json](content.json) for guard positions and their range, angle and delay parameters.

Content registers at staging; this pack has no role, configuration or activation system. Guard detection comes from [example/stealth](../example-stealth/README.md), while objectives and victory come from the selected mode.

## Verify

Run `node --test tests/stealth-map.test.ts tests/stealth.test.ts` from the repository root. See [content formats](../../../../docs/reference/content-format.md).

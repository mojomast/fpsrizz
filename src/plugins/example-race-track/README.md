# Foundry Circuit

`example/race-track` is a data-only shooter-grid racing course, `example/foundry-circuit`. Its sealed loop has five numbered checkpoint zones and a finish zone.

## Use

Enable `core/world` and this pack, then choose `options.map = "example/foundry-circuit"`. The complete [racing preset](../../content/presets/racing.json) selects the `example/racing` controller and mode plus the shared sequence provider. The [map definition](content.json) uses `race/checkpoint/1` through `race/checkpoint/5` and `race/finish` tags.

Content registers at staging; the pack has no mode, role, configuration or runtime system. A compatible racing mode interprets the tags; this map is distinct from the independent overhead-racing track format.

## Verify

Run `node --test tests/race-track.test.ts tests/racing.test.ts` from the repository root. See [content formats](../../../CONTENT_FORMAT.md).

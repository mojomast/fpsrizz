# Relay Station

`example/tactical-pack` is a data-only shooter pack with the `example/relay-station` objective map, `example/relay-carbine`, its ammunition and pickup. The carbine has a six-round magazine and a one-second reload.

## Use

Enable `core/world`, `core/combat`, `core/enemies`, and `core/content` with the pack. The [tactical preset](../../content/presets/tactical.json) selects `example/relay-station` and `core/objective`. Its override switch opens the relay gate; see [content.json](content.json) for the weapon, ammunition, enemy and exit definitions.

Content registers at staging; this pack has no activation system, role or configuration. It reuses core shooter behaviors and theme keys and is not a turn-tactics mission.

## Verify

Run `node --test tests/tactical-pack.test.ts tests/tactical-magazine.test.ts` from the repository root. See [content formats](../../../docs/reference/content-format.md).

# Grid World (`core/world`)

Builds authoritative world descriptions from the `core/grid` map format and supplies collision, ray and sweep queries, line of sight, navigation, doors, switches, zones, and interaction arbitration. Other plugins register interaction candidates through the owned `Interactions` service.

## Composition

The plugin requires a selected `sdk/mode` and has no declared plugin dependencies or configuration. Select a registered map with `options.map`; the [default preset](../../content/presets/default.json) uses `core/arena` from `core/content`. Map validation checks references and placement. See [content format](../../../docs/reference/content-format.md) for map authoring and [reuse metadata](reuse.json) for the world query boundary.

Registration defines the map format and content handling; session activation publishes `World` and installs interaction systems. No UI or rendering service is needed, so world logic runs headlessly. This is a planar grid-authored shooter world, not a generic physics engine. Coverage includes [collision](../../../tests/game-collision.test.ts), [interactions](../../../tests/game-interactions.test.ts), and [navigation consumers](../../../tests/navigation-consumers.test.ts); run `npm test`.

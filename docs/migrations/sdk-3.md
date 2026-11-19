# Migrating to SDK 3

SDK 3 only adds APIs, so SDK 2 plugins keep working: `SDK_COMPAT` accepts manifests declaring `^2.0.0`.

To adopt SDK 3:

1. Set `"sdk": "^3.0.0"` in `manifest.json` once you use any SDK 3 API.
2. Replace hand-rolled entity scans with `host.query(...)` and call `markChanged` after in-place mutations.
3. Use `Transform3D` + `Renderable` with `std/render-sync` instead of moving three.js objects from systems.
4. Register snapshot hooks for state kept outside components, so replay and hot reload restore it.

References: [spatial](../reference/spatial.md), [queries](../reference/queries.md),
[snapshots](../reference/snapshots.md), [physics](../reference/physics.md), [input](../reference/input.md).

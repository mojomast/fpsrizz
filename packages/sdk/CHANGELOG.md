# @bulkhead/sdk

Entries from here on are written by Changesets (`npm run version-packages`). Earlier history, written by hand:

## 3.0.0

SDK 3 (roadmap P1). Additive: manifests declaring `^2.0.0` still load (`SDK_COMPAT = ['2.0.0']`).
Migration notes: [docs/migrations/sdk-3.md](../../docs/migrations/sdk-3.md).

- Cached ECS queries with added/removed/changed tracking (`host.query`, `markChanged`).
- `Transform3D`, `PrevTransform`, `Renderable`; `std/transform` and `std/render-sync` with interpolation.
- Physics (`std/physics-rapier`), assets/preloads and glTF, input v2 (axes, gamepads, touch, rebinding),
  audio samples/buses/3D sound.
- Run snapshots and input replay (`snapshot`/`restore`, per-plugin save hooks); seeded RNG stream position.

## 2.0.0

SDK 2: the generic plugin host (manifests, roles, registries, services, events, phases) with the shooter contracts
in the SDK, and the native rendering namespace.

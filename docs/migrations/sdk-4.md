# Migrating to SDK 4 (pending, not released)

The pending changeset `.changeset/p3-polish.md` makes the next SDK release a major (4.0.0) because the
shooter-only contracts left the SDK in P0.2.

## What changed

- `@bulkhead/sdk` keeps the shared game vocabulary (`contracts/game.ts`): `Transform`, `Collider`, `Health`,
  `Intent`, `Player`, `Inventory`, world descriptions, maps, prefabs, input/flow/settings/audio/UI services, roles.
- Shooter-only contracts moved to the shooter family, `games/shooter/contracts/shooter.ts`: `WeaponRuntime`,
  `Enemy`, `Pickup`, `World`/`WorldService`, `RayHit`, doors and triggers, `Interactions`, `Combat`, `Weapons`,
  `AmmoTypes`, `DamageModifiers`, `Pickups`, `Enemies`, `AiBehaviors` and their events.
- Imports use package names: `from '@bulkhead/sdk'` instead of relative paths into `src/sdk`.

## How to migrate a plugin

1. Replace relative SDK imports with `'@bulkhead/sdk'` (or `'@bulkhead/sdk/contracts/game.ts'`).
2. If you use a shooter contract, import it from the shooter family and declare it: a family outside
   `games/shooter` adds `"uses": ["shooter"]` to its `games/<family>/family.json` (the boundary lint enforces this).
3. Keep `"sdk": "^3.0.0"` until 4.0.0 is cut; at release time `SDK_COMPAT` is expected to keep accepting `3.0.0`
   manifests, since the runtime services are unchanged; only the import locations moved.

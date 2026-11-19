# Navmesh navigation: `std/navigation-recast` (P3.5)

For free-form 3D levels (walls at any angle, ramps, decks, glTF or P2.4 scenes) use `std/navigation-recast`, which
builds a [Recast](https://github.com/recastnavigation/recastnavigation) navmesh through
[recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) and queries it with Detour. Tile grids and
authored graphs keep [`mechanics/navigation`](navigation.md) (deterministic BFS/A*); the two do not depend on each
other.

## Compose it

```json
{ "plugins": ["std/transform", "std/physics-rapier", "std/navigation-recast", "game/rules"] }
```

`std/physics-rapier` is not required; the navmesh only reads `Transform3D` + `PhysicsCollider` components. The
working example is the [Navmesh Sandbox](../../games/sandbox/presets/navmesh-sandbox.json) (`?preset=sandbox/navmesh`):
a red follower chases the hero round the walls, crates and the glTF ramp, its path shown as yellow breadcrumbs.

## What feeds the navmesh

On the first tick (so every plugin, including async glTF level loads in `activate`, has spawned) the plugin calls
`build()` with no arguments, which collects `navGeometryFromColliders(world, ids)`:

- entities with `Transform3D` + `PhysicsCollider`, using their world pose (rotation and scale included);
- skipped: sensors, and bodies whose `RigidBody.type` is not `fixed` (crates and characters do not carve holes);
- boxes as 12 triangles; balls, capsules and cylinders as their bounding box.

Call `nav.build(geometry)` with your own `{ positions, indices }` (e.g. a level mesh) or `nav.build()` again after the
level changes. Every build emits `NavMeshBuilt` with `{ triangles, navTriangles, bounds, buildMs, source }`.

## Contract ([navmesh.ts](../../packages/sdk/src/contracts/navmesh.ts))

```ts
const nav = ctx.services.get(NavMesh);
nav.findPath(from, to);        // Vec3[] corners (start..end) or undefined if unreachable / off-mesh
nav.closestPoint(p, extents?); // nearest walkable point
nav.debugTriangles();          // navmesh polygons as world-space triangles
ctx.world.add(e, NavAgent, { target, speed: 3, arriveDistance: 0.2, repathDistance: 0.5 });
ctx.world.get(e, NavAgentState); // { status: 'idle' | 'moving' | 'arrived' | 'unreachable', path, pathTarget }
```

Agents move in the `ai` phase: with a `CharacterMove` (physics character) the plugin writes the horizontal
displacement and leaves `y` to your gravity; otherwise it moves `Transform3D` directly, snapping to the navmesh
height. Partial Detour paths (to the closest reachable polygon) are reported as unreachable rather than followed.

## Config

| Key | Default | Meaning |
| --- | --- | --- |
| `autoBuild` | `true` | Build from colliders on the first tick. |
| `cellSize` | `0.2` | Voxel size (m); cell height is half of it. |
| `agentRadius` / `agentHeight` | `0.4` / `1.8` | Clearance from walls / under ceilings. |
| `maxClimb` | `0.4` | Highest step (m). |
| `maxSlope` | `45` | Steepest walkable slope (degrees). |
| `debugDraw` | `true` | With debug drawing on (`?debugdraw` or Inspect), draw the navmesh in blue and paths in yellow. |

## Cost and limits

- The WASM is embedded in recast-navigation's compat build and loaded lazily with the plugin chunk
  (budget: `@recast-navigation/wasm` 1200 KiB in `scripts/bundle-budget.mjs`). Presets without the plugin pay nothing.
- One solo navmesh, rebuilt whole; a ~50 m level builds in tens of milliseconds. Tiled/dynamic obstacles
  (TileCache) and crowd avoidance (DetourCrowd) are available in the library but not wrapped yet.
- Recast is deterministic for the same input, and agent state lives in components, so snapshots and replays work;
  the navmesh itself is derived and rebuilt on load.

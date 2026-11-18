# Spatial: Transform3D, interpolation and render sync (SDK 3)

SDK 3 adds a generic 3D pose that any family can use, so platformers, flight and third-person games no longer need
the shooter's planar `Transform` (x, z, yaw) or a hand-rolled presentation.

| Piece | Where | What it does |
|---|---|---|
| `Transform3D` | `src/sdk/contracts/spatial.ts` | Local pose: `position`, unit-quaternion `rotation`, `scale`, optional `parent` entity |
| `PrevTransform` | same | The pose at the start of the current tick; written by `std/transform` |
| `Renderable` | same | What to draw: `shape` (box, sphere, cylinder, capsule, plane) + `size` + `color`, a glTF `model` URL, or a `prefab` id; `instanced`, `visible` |
| math | same | `vec3`, `quatFromEuler` (YXZ, like the shooter's yaw), `quatMultiply`, `rotateVec3`, `slerp`, `interpolatePose`, `composePose`, `worldPose`, `snapTransform`, `transform3d()` |
| `std/transform` | `src/plugins/std-transform` | First system of every tick (`input` phase, order -1000): `PrevTransform := Transform3D` |
| `std/render-sync` | `src/plugins/std-render-sync` | Frame system: creates/rebuilds/disposes scene objects from `Renderable` and poses them with the scheduler's `alpha` |
| `RenderablePrefabs`, `Models` | `src/sdk/render.ts` | Render-side prefab factories, and the glTF model service (`std/assets`) |
| `shooter/transform3d` | `games/shooter/plugins/shooter-transform3d` | Mirrors the shooter's planar `Transform` into `Transform3D` (compat bridge) |

```ts
// Simulation plugin: no Three.js needed.
const crate = ctx.world.create();
ctx.world.add(crate, Transform3D, transform3d({ position: { x: 0, y: 2, z: -4 }, yaw: Math.PI / 4 }));
ctx.world.add(crate, Renderable, { shape: 'box', size: { x: 1, y: 1, z: 1 }, color: 0xc08040 });
```

Add `std/transform` and `std/render-sync` to the preset. The render sync follows Fix Your Timestep: simulation runs
at 60 Hz, and each rendered frame shows `interpolate(PrevTransform, Transform3D, alpha)`, resolving the `parent` chain
link by link. Rebuild rules: a `Renderable` replacement (or `markChanged`) whose fields differ rebuilds the visual;
transform-only changes never do. Materials are `MeshStandardMaterial`, so the scene needs lights (add them from your
presentation plugin). Without a `Render` service (headless tests, validators) render sync does nothing.

Rules:

- Move entities in `control` .. `rules`, never in `input` (that is where the previous pose is captured).
- After a teleport, call `snapTransform(ctx.world, e)` so the next frame does not sweep across the map.
- `worldPose(ctx.world, e)` gives the current world pose for simulation code; cycles in `parent` are ignored.
- SDK 2 games keep working unchanged (`SDK_COMPAT`); the shooter keeps its planar `Transform` and can expose
  `Transform3D` through the bridge.

## Spatial index and instancing (P1.8)

**`SpatialHash<K>`** (`src/sdk/contracts/spatial-index.ts`, exported from the SDK) is a uniform grid on the XZ plane
with an optional Y range per box: `set(key, box)` (insert or move), `delete`, `query(box)`, `near(x, z, radius)`,
`candidates(box)` (cell-level superset for callers with their own exact test) and `segment(x, z, dirX, dirZ,
maxDist, pad)` (ray / swept-circle broad phase that walks only the cells the ray crosses). Results always come back
in insertion order, so swapping an array loop for the hash keeps the same visiting order and the same results.

- The shooter's `core-world` `CollisionWorld` switches to the hash for maps with at least `GRID_THRESHOLD` (128)
  boxes; smaller maps keep the brute-force loop. `isFree` and `raycast` return exactly what brute force returns
  (tests fuzz both against each other); on a 2000-box map queries are several times faster.
- 3D games with `std/physics-rapier` use Rapier's own broad phase (`Physics.raycast`); use `SpatialHash` for
  gameplay proximity queries (nearest enemy, pickups in range) instead of scanning every entity.

**Instancing:** `Renderable.instanced: true` on a shape renderable (not `model` / `prefab`) makes `std/render-sync`
draw it through one shared `InstancedMesh` per shape + size + colour. Instances are posed with the same alpha
interpolation; `visible: false` gives the instance zero scale; batches grow by doubling and swap-remove on delete.
Instanced batches are not frustum-culled per instance. The physics sandbox draws its 150+ pebbles in two draws.

# Physics sandbox (SDK 3 reference)

The smallest complete SDK 3 game: everything on screen is an entity with `Transform3D` + `Renderable`, simulated by
`std/physics-rapier` and drawn by `std/render-sync`. Walk with WASD, jump with Space, shove the crate stack and step on
the pad (a sensor; it lights up and counts entries). Preset: `sandbox/physics` (`?preset=sandbox/physics`).

| Plugin | Role |
|---|---|
| `sandbox/game` | Spawns ground, walls, crates, the sensor pad and the character; maps input to `CharacterMove`; spawns the glTF corner and a display model |
| `sandbox/presentation` | Lights (plus a point light per `sandbox/glow` entity), sky and a follow camera (no meshes of its own) |
| `sandbox/navmesh` | Only in `sandbox/navmesh`: a red follower (`NavAgent`) that chases the hero on a navmesh built by `std/navigation-recast` from the level colliders, with yellow breadcrumbs along its path |

The back-left corner (ramp, barrel stack, lamp, invisible goal trigger) is `models/levels/sandbox-props.glb`, spawned
with `spawnGltfScene`: its node custom properties (`body`, `collider`, `sandbox/glow`, `sandbox/goal`...) become
components, exactly as a Blender export would. The rifle on the pedestal is a `Renderable.model`. Both are optimised
by `npm run assets`; see [assets](../../docs/reference/assets.md).

**Navmesh Sandbox** (`?preset=sandbox/navmesh`, add `&debugdraw` to see the navmesh) is the same scene plus
`std/navigation-recast` and `sandbox/navmesh`; see [navmesh](../../docs/reference/navmesh.md).

Copy this folder to start a 3D prototype: rename the family, keep the preset's `std/*` plugins, then replace the
spawn code. See [spatial](../../docs/reference/spatial.md), [physics](../../docs/reference/physics.md) and
[assets](../../docs/reference/assets.md).

# Physics sandbox (SDK 3 reference)

The smallest complete SDK 3 game: everything on screen is an entity with `Transform3D` + `Renderable`, simulated by
`std/physics-rapier` and drawn by `std/render-sync`. Walk with WASD, jump with Space, shove the crate stack and step on
the pad (a sensor; it lights up and counts entries). Preset: `sandbox/physics` (`?preset=sandbox/physics`).

| Plugin | Role |
|---|---|
| `sandbox/game` | Spawns ground, walls, crates, the sensor pad and the character; maps input to `CharacterMove` |
| `sandbox/presentation` | Lights, sky and a follow camera (no meshes of its own) |

Copy this folder to start a 3D prototype: rename the family, keep the preset's `std/*` plugins, then replace the
spawn code. See [spatial](../../docs/reference/spatial.md) and [physics](../../docs/reference/physics.md).

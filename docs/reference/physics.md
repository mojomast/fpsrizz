# Physics: `std/physics-rapier` (SDK 3)

Rapier 3D (`@dimforge/rapier3d-compat` 0.19, WASM embedded in a lazy chunk that only physics presets download),
stepped inside the 60 Hz fixed tick. Contract: `src/sdk/contracts/physics.ts`. The shooter's grid AABB collision in
`core/world` stays as the lightweight option; this plugin is for prototypes that want real bodies.

| Component / API | Meaning |
|---|---|
| `RigidBody { type: 'dynamic' \| 'fixed' \| 'kinematic', linvel?, linearDamping?, angularDamping?, gravityScale?, ccd?, lockRotations? }` | Body; requires `Transform3D` (root entity, no `parent`) and a `PhysicsCollider` |
| `PhysicsCollider { shape: 'box' \| 'ball' \| 'capsule' \| 'cylinder', size?, offset?, friction?, restitution?, density?, sensor? }` | One collider per body; sizes are full extents like `Renderable` |
| `CharacterController { offset?, maxSlopeClimb?, autostep?, snapToGround? }` + `CharacterMove { desired }` → `CharacterState { grounded, moved }` | Kinematic character: write the tick's displacement into `CharacterMove.desired` (in `control`), read `grounded` next tick |
| `PhysicsCollision { a, b, started, sensor }` event | Contacts and sensor (trigger) overlaps, emitted after each step |
| `Physics` service | `raycast(origin, dir, maxDistance, { exclude?, sensors? })`, `applyImpulse`, `setLinearVelocity`, `linearVelocity`, `teleport`, `gravity`, `stats()` |

Tick order: `std/transform` captures the previous pose (`input`), gameplay writes intents (`control`..), physics runs
at `movement` order 1000: build/rebuild/remove bodies from the query, move kinematic bodies (characters through the
controller, others to their `Transform3D`), `world.step()`, write dynamic and character poses back to `Transform3D`,
then emit collision events. `fixed` bodies follow `Transform3D` only when you call `ctx.world.markChanged(e,
Transform3D)`; move dynamic bodies through the service (`teleport`, impulses), not by writing `Transform3D`.

Determinism: the standard build is locally deterministic (same inputs and binary → bit-identical results, covered by
`tests/physics-rapier.test.ts`). Cross-platform lockstep would need `@dimforge/rapier3d-deterministic-compat`.

Known quirks (Rapier 0.19): a character spawned exactly touching the ground counts as penetrating, so spawn it a few
centimetres above; `snapToGround` can sink a character pressed against a wall, so it is off by default.

Example: [games/sandbox](../../games/sandbox/README.md) (preset `sandbox/physics`).

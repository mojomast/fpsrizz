# First-Person Player (`core/player`)

Registers the `core/player` prefab, input actions, `core/fps-controller`, and `core/fp-camera`. The controller moves in the horizontal plane with wall sliding and mouse yaw; the camera uses a fixed eye height and interpolated view. Jumping and vertical aim are outside this provider.

## Composition and configuration

- Depends on `core/world`; requires selected `sdk/controller` and `sdk/camera` roles. Those roles can be supplied by other plugins.
- The [default preset](../../presets/default.json) selects both providers from this plugin and uses the prefab through `core/objective`.
- Configuration under `core/player`: `maxHealth` (default 100, 1–1000), `moveSpeed` (5.4, 1–20), and `fov` (74 degrees, 50–110). The prefab must be spawned by a mode or another consumer.

Registration defines the prefab and roles; selected roles activate per session and own their systems. Simulation works headlessly; rendering the published view requires presentation services. See [plugin lifecycle](../../../../docs/guide/plugins.md) and [architecture](../../../../docs/reference/architecture.md). Coverage includes [game session](../../../../tests/game-session.test.ts) and [collision](../../../../tests/game-collision.test.ts) tests; run `npm test` from the repository root.

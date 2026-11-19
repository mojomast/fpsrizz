# Shooter Presentation (`core/presentation`)

Draws the grid world, doors, switches, billboard actors, effects, and first-person weapons, and connects gameplay sound hooks. It registers the default actor renderer and consumes the selected theme and camera; `ViewModes` can hide ceilings, fog, and first-person weapon models for an overhead view.

## Composition

Depends on `core/world` and requires `sdk/theme` and `sdk/camera`. The [default preset](../../presets/default.json) pairs it with `theme/industrial` and `core/fp-camera`; the [Cinder preset](../../../cinder/presets/cinder-vault.json) uses camera modes and a different theme. There is no manifest configuration.

Activation returns when the render service is absent, so headless simulation does not draw or install audio hooks. Render resources and frame systems are owned by the session. This plugin presents gameplay state rather than implementing combat or world rules. See [architecture](../../../../docs/reference/architecture.md), [camera modes](../../../../docs/reference/camera-modes.md), and the [presentation browser demo](../../../../tests/presentation-demo). Run `npm run build && npm run smoke` for browser acceptance.

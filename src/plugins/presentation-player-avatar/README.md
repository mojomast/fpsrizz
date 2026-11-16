# Overhead player avatar (`presentation/player-avatar`)

Adds a `Visual` to a player with `PlayerAvatar` and `Transform` while `ViewModes.mode` is `isometric`. It chooses idle, walk, or attack state from movement and weapon timing, and removes its own visual when leaving overhead view or on cleanup.

## Use and limits

The manifest declares no dependencies, roles, or config. Pair it with a game that supplies `PlayerAvatar`, a view-mode provider, and a presenter/theme that can resolve the avatar's visual key. The [Cinder preset](../../content/presets/cinder-vault.json) combines it with `presentation/camera-modes`, `core/presentation`, and the Cinder theme. It leaves an existing player `Visual` owned by another presenter alone; it does not itself draw or create a camera.

The session-owned presentation-phase system operates on components and does not require a renderer, so it is safe in headless sessions. See [camera modes](../../../docs/camera-modes.md), the [Cinder guide](../../../docs/cinder-vault.md), and [Cinder tests](../../../tests/cinder-vault.test.ts). Run `npm test`; for presentation changes also run `npm run build && npm run smoke`.

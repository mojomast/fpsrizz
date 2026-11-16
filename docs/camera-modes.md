# First-person and isometric camera modes

`presentation/camera-modes` is a reusable shooter-family `CameraRole` provider. It publishes the normal `View` service,
keeps the same simulation/controller, and adds an orthographic **isometric** follow camera that can be toggled with the
configured key (`O` by default).

## Composition

```json
{
  "plugins": ["core/player", "core/presentation", "presentation/camera-modes", "presentation/player-avatar"],
  "roles": { "sdk/camera": "presentation/camera-modes" }
}
```

The plugin replaces `core/fp-camera`; it does not replace the controller, player prefab or presentation plugin. It reads
the player `Transform`/`Health`, publishes `View`, and selects either the platform world camera or its own
`OrthographicCamera` through `Render.setWorldCamera`. The world-camera selection replaces the same context's previous
lease, so toggling projections does not leak camera leases. `core-presentation` restores the previous camera when the
camera provider's scope ends.

## `ViewModes` service

```ts
interface ViewModesService {
  readonly mode: 'first-person' | 'isometric';
  readonly modes: readonly ViewMode[];
  readonly yaw: number;
  rotate(delta: number): void;
  set(mode: ViewMode): boolean;
  toggle(): ViewMode;
  pickGround(screenX: number, screenY: number): { x: number; z: number } | null;
}
```

The service is optional. Consumers use `tryGet(ViewModes)` and must retain first-person behavior when it is absent. A
successful mode change emits `ViewModeChanged`. `presentation/camera-modes` registers toggle (`O`), rotate-left (`Z`) and
rotate-right (`X`) input actions from config. `rotate` changes the isometric azimuth; `pickGround` projects a CSS-pixel
position through the active orthographic camera onto the ground plane. Cinder uses `pickGround` for isometric click-to-move
and click-to-attack.

## Presentation behavior

- First person is the same interpolated eye-height view used by `core/fp-camera` (without bobbing).
- Isometric uses a fixed azimuth (default 45°), a configured height/ horizontal distance, and an orthographic frustum
  controlled by `halfHeight`. It follows the player with a short smoothing; a large teleport snaps the follow target.
- A flat gold ring/arrow marker is drawn under the player in isometric mode so its aim yaw remains readable. Add the
  optional `presentation/player-avatar` plugin and a `PlayerAvatar` component to show a class/theme body sprite over that
  marker. The avatar plugin attaches a `Visual` only while `ViewModes.mode === 'isometric'` and removes it in first person,
  so no body appears inside the first-person camera. Cinder uses Assetrizz knight/mage/rogue strips per class.
- The first-person weapon rig uses a smaller bottom-center pivot (see [weapon presentation](weapon-rig.md)); overhead mode
  hides it entirely.
- `core-presentation` consumes `ViewModes`: in isometric mode it hides first-person-only weapon view models, hides
  ceiling quads, and disables distance fog so the overhead scene stays legible. It also adds wall-top caps to the world
  mesh, which are back-face culled from the first-person camera but close the wall silhouette from above.
- The HUD is responsible only for mode-specific chrome. Cinder hides its crosshair and shows an `O · ISOMETRIC` badge.
- Mouse yaw still controls the player's aim, not the camera azimuth. `Z`/`X` rotate the isometric camera in fixed steps;
  Cinder's isometric WASD basis uses the camera yaw (first-person movement remains player-facing). This avoids a second
  controller while keeping movement screen-uniform after rotation. Cinder uses a free pointer so
  the same cursor can click reachable floor or an enemy; the selected action spends the actual AP path/attack cost.

## Config

| Key | Default | Meaning |
|---|---:|---|
| `toggleKey` | `KeyO` | Input action key |
| `fov` | 74 | Published first-person field of view |
| `halfHeight` | 10 | Orthographic half-height in metres |
| `cameraHeight` | 11 | Camera height above the player |
| `cameraDistance` | 13 | Horizontal offset from the player |
| `isometricYaw` | `0.785398` | Initial isometric azimuth in radians |
| `rotateStep` | `0.392699` | Camera rotation per `Z`/`X` press |
| `rotateLeftKey` | `Z` | Rotate-left input key |
| `rotateRightKey` | `X` | Rotate-right input key |

`PlayerAvatar` carries `{ visual, scale, y }`. The avatar plugin is independent of this camera provider and only requires
an optional `ViewModes` service. A game may use another overhead camera provider as long as it exposes the same contract.

## Reuse boundaries

This is an orthographic **3D projection of the existing shooter world**, not a separate sprite engine. Actors remain
billboard `Visual`s and the map remains the collision/world mesh. It is suitable for shooter-family games that want a
tactical/isometric presentation over the same simulation. It does not provide pan, zoom, cutaway shaders or a second 2D renderer; `pickGround` is a single ground-plane raycast,
not full scene picking, and the optional avatar presenter supplies the player body sprite. Games with a different camera vocabulary should keep their family presentation.

## Evidence

`tests/render-three.test.ts` checks same-context camera replacement and out-of-order lease cleanup. `tests/cinder-vault.test.ts`
toggles through the public `ViewModes` service while confirming gameplay continues, checks the supported mode list,
attaches/removes the class avatar Visual and rejects an unknown mode. `tests/cinder-demo/run.mjs` captures the production isometric view, verifies the HUD dataset and
crosshair state, and returns to first person. The visual check also exercises hidden ceilings, the player floor marker and
the hidden first-person viewmodel.

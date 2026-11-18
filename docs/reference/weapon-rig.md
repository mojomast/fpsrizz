# First-person weapon presentation

The shooter uses authored 2D weapon sprites in the cleared-depth-buffer `view` layer, not skinned 3D viewmodels. The
current rig is intentionally a **bottom-center** viewmodel rather than a center-screen floating weapon.

## Rig behavior

- `core-presentation/weaponview` reads the selected weapon painter and computes its topmost opaque point for muzzle-flash
  placement.
- The weapon is parented under a `weapon-bottom-pivot` group at `(0, -HALF_H + 0.004, -1)` in view space.
- The sprite's bottom edge sits at the lower screen edge and its topmost muzzle point is horizontally centered. The body
  grows upward from the bottom center instead of occupying the middle of the screen.
- Scale is `0.28` view units (previously `0.44`), reducing the sprite footprint by about 36%.
- Idle sway, recoil and melee swings rotate around the bottom pivot. Weapon swap lowers the whole body out of view.
- Muzzle flash is emitted at the topmost muzzle point and sized down. Flash light remains in world space.
- The first-person weapon is hidden by `ViewModes` when an overhead/isometric camera mode is active.

## Boundaries

This is a bottom-center sprite rig, not a 3D sight/optic alignment. The source art is an isometric weapon study rather than
a first-person sight picture. There is no ADS zoom, separate sight attachment, physical weapon sway driven by a skeleton,
or 3D model rigging. The shot itself still comes from the shooter camera center; no gameplay spread/accuracy semantics
changed.

## Evidence

`tests/cinder-demo/run.mjs` captures the production first-person view after the rig change. The isometric screenshot
verifies the weapon is hidden in overhead mode. `games/cinder/tests/cinder-vault.test.ts` retains the AP/fire behavior tests; the rig is
presentation-only.

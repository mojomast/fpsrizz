# Weapon asset sets

The `generic/`, `fantasy/` and `scifi/` directories contain original low-poly weapon sets, editable Blender sources,
individual model exports, first-person transparent renders and generation scripts. See each set's own notes for the
specific weapons, generation command and export details.

## Authoring and integration

- Blender authoring convention: Z up, +Y toward the muzzle or blade tip, with the grip/root near the origin; glTF
  export uses the Blender exporter's Y-up conversion. Check an export in your target tool before setting attachment
  offsets; the model files do not themselves provide animations or hands.
- Design and check silhouettes from the player's view, and prioritize readable forms at final screen size. Weapon
  viewmodels benefit from consistent framing and an unobstructed aiming corridor. Useful references include the
  [Valve viewmodel guide](https://developer.valvesoftware.com/wiki/Viewmodel) and
  [Blender glTF export documentation](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html).
- Bulkhead currently displays a **single square weapon sprite**, not an imported GLB or animated weapon sheet. Its
  theme supplies a synchronous painter for each `WeaponDef.view` key; PNGs and GLBs do not become playable merely by
  placing them here. The Assetrizz preset uses the generic pistol and launcher renders as an example.
- The weapon sprite is bottom anchored and uses a hard alpha cutoff. The existing muzzle flash position is inferred
  from the uppermost opaque pixel row, so inspect the result in-game: sights, decorative points or blade tips can
  cause an incorrect flash location. Recoil and switching are currently procedural, not authored animation.
- The provided contact sheets are review images. Check individual transparent PNGs against light and dark in-game
  backgrounds, at the intended size and aspect ratio, before shipping. A proper frame animation or GLB loader would
  require additional engine and presentation work.

## Fast agent workflow

1. Record the intended theme key, gameplay role, source and license, grip orientation, image dimensions, desired
   framing and muzzle position. Start from a set's `build.py` and README. Use Blender 4.3.2 when reproducing these
   assets, and keep the editable `.blend` and script along with exports.
2. Generate in an isolated copy or output directory where possible: the current set scripts overwrite their output
   folders. Run Blender in background with `--factory-startup --python-exit-code 1` to surface script failures.
   Explicitly set camera, image size, transparency, export selection and settings. Avoid relying on interactive UI state.
3. Render a transparent square first-person PNG and a contact sheet; inspect them at game size on light and dark
   backgrounds. Verify that the silhouette is recognizable, the crosshair area stays useful and the muzzle flash
   location makes sense. Automated image checks cannot establish visual quality.
4. Run `python3 scripts/verify-weapon-assets.py` (requires Pillow) to check all delivered source files, GLB headers,
   meshes, image dimensions, transparency and visible bounds. Pass `generic`, `fantasy` or `scifi` to check one set.
   This is a fast delivery check, not a full glTF validator or visual approval. Each set also documents a clean Blender
   re-import check. For independent validation, use the [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator).
5. Integrate explicitly: generate painters from PNGs, map keys used by `WeaponDef.view` and select that theme in a
   preset. For example, to regenerate the two Assetrizz-theme weapon painters:

   ```sh
   python3 scripts/weapon-painters.py --force --output src/plugins/theme-assetrizz/weapons.ts \
     --sprite weapon-pistol=assets/weapons/generic/pistol.png \
     --sprite weapon-launcher=assets/weapons/generic/rocket_launcher.png
   python3 tests/weapon-painters.test.py
   ```

   The Cinder Vault theme uses all six fantasy renders:

   ```sh
   python3 scripts/weapon-painters.py --force --output src/plugins/theme-assetrizz/cinder-weapons.ts \
     --sprite cinder-thornwake=assets/weapons/fantasy/01_thornwake.png \
     --sprite cinder-cinderkey=assets/weapons/fantasy/02_cinderkey.png \
     --sprite cinder-mothspindle=assets/weapons/fantasy/03_mothspindle.png \
     --sprite cinder-briarward=assets/weapons/fantasy/04_briarward.png \
     --sprite cinder-faroracle=assets/weapons/fantasy/05_faroracle.png \
     --sprite cinder-ashbell=assets/weapons/fantasy/06_ashbell.png
   python3 scripts/import-weapon-previews.py
   ```

   The generator preserves image dimensions and visible RGBA, compressing transparent runs. A raw 512×512 RGBA sprite
   takes about 1 MiB before encoding, so measure bundle size before scaling to whole arsenals. `import-weapon-previews.py`
   verifies the source hashes in `scripts/weapon-previews.json`, crops alpha bounds with padding, and writes 192px
   card thumbnails plus `public/weapons/provenance.json`; `--check` verifies both without modifying them. Preview the
   packaged build and exercise switching, fire, flash, reload and restart; run `npm run check`, `npm run build` and
   browser smoke.

For future automation, standardize a per-asset manifest (theme key, sources and hashes, author/license, Blender
version, root, axis convention, output paths, triangle budget and muzzle coordinates), support clean `--out` builds,
and expand the PNG-to-painter bridge as needed. Compare image pixels with a documented tolerance
when renderer or hardware differences are possible, rather than claiming cross-machine byte-identical renders. The
[Blender CLI reference](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) describes
background execution and Python exit codes.

# Gloamforge arsenal

Six original low-poly fantasy weapons in a shared language of midnight iron, aged brass, oxblood wood and glowing witchglass. The parts remain individually editable in `gloamforge_arsenal.blend`.

| File stem | Name | Gameplay role |
|---|---|---|
| `01_thornwake` | Thornwake | Knife |
| `02_cinderkey` | Cinderkey | Pistol |
| `03_mothspindle` | Mothspindle | SMG |
| `04_briarward` | Briarward | Assault |
| `05_faroracle` | Far Oracle | Sniper |
| `06_ashbell` | Ashbell | Rocket |

Each stem has a self-contained `.glb` and a 512×512 transparent `.png`. `contact_sheet.png` is a labelled overview; `stats.json` and `verification.json` contain counts and automated checks.

## Conventions

- Blender is Z-up, +Y is the direction of the barrel or blade tip, +X is screen right in the centered preview, and one Blender unit is one meter. Each exported weapon has a named grip root at `(0,0,0)`, suitable for attaching and rotating the complete asset. Individual parts retain their own origins for editing.
- GLB export uses Blender's Y-up conversion: Blender +Y becomes glTF -Z, and Blender +Z becomes glTF +Y. The weapon therefore points along glTF -Z. Engines can position the root relative to their view camera; the preview camera is not exported.
- The renders use a centered, elevated rear perspective and transparent backgrounds. Topmost-alpha muzzle inference is an approximation: silhouette, camera angle, optic and antialiasing can affect the inferred point. Check the final PNG against the consuming engine; a dedicated muzzle anchor is preferable where supported.
- Flat-shaded primitive and custom polygon parts, untextured Principled materials, no rigs, hands, animations, UV textures, or game-specific integration. Some overlapping internal faces are intentionally retained for editability; triangle counts are not a watertight or optimized-mesh guarantee.

## Rebuild and validate

From the repository root, with Blender 4.3 on `PATH` and Python 3 with Pillow:

```sh
blender -b -t 6 --python assets/weapons/fantasy/build.py
python3 assets/weapons/fantasy/finish.py
blender -b --python assets/weapons/fantasy/verify_blender.py
```

`build.py` procedurally constructs the scene, renders, exports GLBs and saves the blend file. `finish.py` makes the contact sheet and checks image bounds, GLB container/mesh/material presence and exported triangle counts. `verify_blender.py` round-trips each GLB through Blender's importer and checks its root, mesh count, triangles and bounds. These checks do not replace testing the assets in the target renderer. Rerunning overwrites generated outputs.

## Research

- [Valve Developer Community: Viewmodel](https://developer.valvesoftware.com/wiki/Viewmodel) — build and frame for the intended first-person viewpoint, often with a separate FOV.
- [Michał Kubas: Low-poly first-person weapon modeling](http://piratportfolio.com/fpp_eng/?cat=9) — prioritize silhouette and distribute geometry according to visual importance.
- [Bevy: First-person view model](https://bevy.org/examples/camera/first-person-view-model) — separate viewmodel and world projections.
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) and [Blender glTF manual](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) — meter units and exporter Y-up conversion.

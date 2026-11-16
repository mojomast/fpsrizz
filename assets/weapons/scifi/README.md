# Eidolon Foundry — first-person sci-fi set

Six original low-poly weapon designs, using bone ceramic, blue graphite, ink rubber, cyan ion light and amber accents. Models are made from editable separate pieces and flat-shaded shapes; the materials are procedural flat PBR colors, with no image textures.

| Role | Name | File stem | Triangles |
|---|---|---|---:|
| Knife | Vigil phase knife | `01_vigil_knife` | 400 |
| Pistol | Spark arc pistol | `02_spark_pistol` | 616 |
| SMG | Flicker pulse SMG | `03_flicker_smg` | 748 |
| Assault | Lattice coil assault | `04_lattice_assault` | 812 |
| Sniper | Parallax rail sniper | `05_parallax_sniper` | 884 |
| Rocket | Cairn void rocket | `06_cairn_rocket` | 808 |

Each stem has an individual `.glb` and 512×512 transparent `.png`. `contact-sheet.png` shows all six; `eidolon_foundry.blend` contains the source. The six collections overlap at the grip origin: hide all but the desired collection in the Outliner when editing. Lights and preview camera are outside the weapon collections. No hands are included.

## Coordinate and import conventions

- Units are meters. In Blender: **Z up, +Y forward** toward the muzzle or blade tip, X across the weapon. Each weapon has a named empty root at `(0, 0, 0)` near the grip, and separate mesh objects parented to it. The knife's origin is in its handle.
- GLBs use Blender's **Y-up** glTF export conversion: Blender +Z becomes glTF +Y; Blender +Y becomes glTF -Z. Importers that restore Blender axes will show the original +Y-forward arrangement. Attach by the root, and account for your engine's axis conversion. The project does not include game integration, grip sockets, a rig, or animations.
- PNGs use a centered perspective view looking forward and down. Muzzle collars (knife: blade tip) are the highest visible opaque features in these renders; `preview.py` checks the first >=128-alpha row against the projected bounding box of that feature. Anti-aliased edge pixels may have lower alpha. The topmost pixel is on the collar outline rather than the center of the muzzle, so exact muzzle placement should use a defined offset or socket where available.
- Models contain intersecting parts and solid stylized muzzle caps; they are intended as viewmodels, not watertight manufacturing meshes. Optics are simple opaque colored lenses, and no ADS view, reload motion, UV texture atlas, or LODs are supplied. Adjust framing and scale in the target renderer; no in-game fit is claimed.

## Reproduce and verify

Using Blender 4.3.2 on `PATH` and Python 3 with Pillow, from the repository root:

```sh
blender -b --factory-startup --threads 6 --python assets/weapons/scifi/build.py
python3 assets/weapons/scifi/preview.py
blender -b --factory-startup --python assets/weapons/scifi/verify_glb.py
```

The build recreates the blend, renders, GLBs and `manifest.json`. `preview.py` builds the contact sheet, checks PNG size/alpha and margins, checks topmost opaque pixels against the projected feature bounding box, and validates GLB headers and mesh counts; it writes `verification.json`. `verify_glb.py` imports every GLB back into Blender and asserts root position, mesh counts and triangle counts, writing `roundtrip.json`. Those checks do not replace inspecting the assets in the target engine.

## Research informing the designs

- [FPP gun modeling](https://piratportfolio.com/fpp_eng/): readable first-person silhouettes and shared visual language across a set.
- [Weapon art and presentation](https://80.lv/articles/weapon-art-tips-for-design-texturing-and-presentation): visible plane changes and restrained silhouette accents for a first-person view.
- [Low-poly look](https://www.gamedeveloper.com/design/how-to-make-low-poly-look-good): prioritize silhouette and allocate geometry according to size and importance.
- [First-person viewmodel FOV](https://sahildhanju.com/posts/render-first-person-fov/): viewmodel framing can be tuned independently of world FOV; attachments require matching transforms.
- [Epic animation workflow discussion](https://forums.unrealengine.com/t/workflow-questions-for-first-person-viewmodel-animation/61323): use a consistent root/attachment point for interchangeable weapons.

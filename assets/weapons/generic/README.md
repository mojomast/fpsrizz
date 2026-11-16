# Generic viewmodel set

Six original low-poly, stylized assets: knife, pistol, SMG, assault rifle, sniper rifle and rocket launcher. Their shared blue-black metal, rubber, machined edges and vermilion details form a cohesive industrial set. The shapes are original rather than replicas of specific weapons.

## Files

- `generic_weapons.blend`: editable source, with separate named mesh parts parented to one `<weapon>_GRIP_ROOT` empty per weapon. All six overlap at the shared origin; hide the unwanted root hierarchies to edit one in isolation. Studio lights and the last render camera are included.
- `<weapon>.glb`: individual binary glTF, with its root and mesh hierarchy and simple PBR materials. No external textures required.
- `<weapon>.png`: transparent 512 × 512 RGBA first-person render, centered and framed independently.
- `contact_sheet.png`: labeled sprite preview on a checkerboard.
- `build.py`, `contact_sheet.py`, `verify.py`: source generation, preview assembly, and verification. `counts.txt` records triangle counts and source-space bounds.

## Coordinates and integration

Blender uses meters, Z up and +Y along the blade or barrel toward the target. Each weapon's grip root is at (0, 0, 0); geometry extends in both directions around that approximate grip point. In the Y-up GLB export, Blender coordinates (x, y, z) map to glTF (x, z, -y), so up is +Y and the weapon points along **-Z**. Importer conventions may apply additional transforms. Place and rotate the root for your camera; each sprite has its own framing and is not a physically scaled image of its neighbors.

The sprites use a perspective camera looking from behind and slightly above and to one side. The tip of the knife and the muzzle/front shroud of each firearm are the highest projected mesh features in the corresponding generated views. `verify.py` checks this geometrically; a consumer's alpha threshold or image processing can still change the inferred pixel location. There are no hands, rigs, animations, UV textures, or explicit muzzle sockets. Separate mesh parts are provided as a starting point for animation, but are not rigged or mechanically simulated.

## Rebuild and verify

With Blender 4.3.2 and Python 3 with Pillow installed, from the project root:

```sh
BLENDER=blender # or the full path to your Blender executable
"$BLENDER" -b -t 4 --python assets/weapons/generic/build.py
python3 assets/weapons/generic/contact_sheet.py
"$BLENDER" -b -t 4 --python assets/weapons/generic/verify.py
```

Generation overwrites the outputs. Blender may create a `.blend1` backup when overwriting an existing blend. Rendering uses Cycles CPU, 32 samples and denoising; minor pixel differences between Blender versions or hardware are possible. The contact sheet script checks that all sprites are 512 square with nonempty, unclipped alpha bounds. Verification checks highest projected mesh features, then reimports each GLB and checks grip root, hierarchy and triangulated mesh counts. It does not test a specific engine's renderer.

| Asset | Triangles | Mesh objects |
| --- | ---: | ---: |
| Knife | 230 | 11 |
| Pistol | 764 | 27 |
| SMG | 904 | 28 |
| Assault rifle | 1,000 | 36 |
| Sniper rifle | 996 | 30 |
| Rocket launcher | 700 | 20 |

## References

- [Gun modeling for FPP games](http://piratportfolio.com/fpp_eng): prioritize the visible first-person silhouette and spend geometry where it affects the shape.
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): glTF coordinate system and meter units.
- [Blender glTF documentation](https://docs.blender.org/manual/en/2.80/addons/io_scene_gltf2.html): Y-up export and material support. The generator uses Blender 4.3.2.

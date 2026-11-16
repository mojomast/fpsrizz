#!/usr/bin/env python3
"""Validate the weapon-set delivery artifacts without modifying them. Requires Pillow."""
import json
from pathlib import Path
import struct
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'weapons'
SETS = {
    'generic': ('generic_weapons.blend', ['knife', 'pistol', 'smg', 'assault_rifle', 'sniper_rifle', 'rocket_launcher']),
    'fantasy': ('gloamforge_arsenal.blend', ['01_thornwake', '02_cinderkey', '03_mothspindle', '04_briarward', '05_faroracle', '06_ashbell']),
    'scifi': ('eidolon_foundry.blend', ['01_vigil_knife', '02_spark_pistol', '03_flicker_smg', '04_lattice_assault', '05_parallax_sniper', '06_cairn_rocket']),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_glb(path):
    data = path.read_bytes()
    require(len(data) >= 20, f'{path}: truncated GLB')
    magic, version, length = struct.unpack_from('<4sII', data)
    require(magic == b'glTF' and version == 2 and length == len(data), f'{path}: invalid GLB header')
    chunk_length, chunk_type = struct.unpack_from('<II', data, 12)
    require(chunk_type == 0x4E4F534A and 20 + chunk_length <= len(data), f'{path}: invalid JSON chunk')
    gltf = json.loads(data[20:20 + chunk_length])
    require(bool(gltf.get('meshes')) and bool(gltf.get('nodes')), f'{path}: no meshes or nodes')


def validate_png(path):
    with Image.open(path) as image:
        require(image.format == 'PNG' and image.mode == 'RGBA' and image.size == (512, 512),
                f'{path}: expected 512x512 RGBA PNG')
        alpha = image.getchannel('A')
        require(alpha.getextrema()[0] == 0, f'{path}: expected transparent pixels')
        # Match the engine's muzzle discovery threshold, which is strictly greater than 128.
        bounds = alpha.point(lambda value: 255 if value > 128 else 0).getbbox()
        require(bounds is not None, f'{path}: no visible pixels above alpha 128')
        require(bounds[0] > 0 and bounds[1] > 0 and bounds[2] < 512 and bounds[3] < 512,
                f'{path}: opaque content touches image edge')
        return bounds


def main(args):
    if len(args) > 1 or (args and args[0] not in SETS):
        raise ValueError('usage: python3 scripts/verify-weapon-assets.py [generic|fantasy|scifi]')
    for name in args or SETS:
        blend, stems = SETS[name]
        directory = ROOT / name
        require((directory / blend).is_file(), f'{name}: missing Blender source')
        for stem in stems:
            validate_glb(directory / f'{stem}.glb')
            bounds = validate_png(directory / f'{stem}.png')
            print(f'OK {name}/{stem}: GLB and RGBA sprite, opaque bounds {bounds}')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except (OSError, ValueError, json.JSONDecodeError, struct.error) as exc:
        print(f'Weapon verification failed: {exc}', file=sys.stderr)
        sys.exit(1)

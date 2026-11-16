"""Create a labeled contact sheet and inspect the transparent renders and GLBs.

Run with system Python and Pillow: python3 assets/weapons/scifi/preview.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
import struct

root = Path(__file__).resolve().parent
items = json.loads((root / 'manifest.json').read_text())
sheet = Image.new('RGB', (1440, 1050), '#101a24')
draw = ImageDraw.Draw(sheet)
try:
    title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 27)
    label = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 19)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except OSError:
    title = label = small = ImageFont.load_default()
draw.text((32, 23), 'EIDOLON FOUNDRY  /  SIX TOOLS FOR THE VOID', font=title, fill='#e1ede4')
draw.text((33, 60), 'FIRST-PERSON COLLECTION    •    GRIP-ORIGIN ASSETS    •    LOW POLY', font=small, fill='#78d6d3')
results=[]
for index, item in enumerate(items):
    x = 24 + (index % 3) * 472
    y = 92 + (index // 3) * 472
    draw.rounded_rectangle((x, y, x+448, y+450), 8, fill='#1b2b36', outline='#36525c', width=2)
    image=Image.open(root / (item['slug']+'.png')).convert('RGBA')
    assert image.size == (512,512)
    alpha=image.getchannel('A')
    bounds=alpha.getbbox()
    assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < 512 and bounds[3] < 512, (item['slug'],bounds)
    assert alpha.getextrema() == (0,255)
    top=next(y0 for y0 in range(512) if any(alpha.getpixel((x0,y0)) >= 128 for x0 in range(512)))
    topxs=[x0 for x0 in range(512) if alpha.getpixel((x0,top)) >= 128]
    feature=item['tip_or_muzzle_projected_bounds_px']
    assert feature[0]-3 <= sum(topxs)/len(topxs) <= feature[2]+3 and feature[1]-3 <= top <= feature[3]+3, (item['slug'], top, feature)
    preview=image.resize((390,390), Image.Resampling.LANCZOS)
    sheet.paste(preview,(x+29,y+20),preview)
    draw.text((x+22,y+407),item['name'],font=label,fill='#e4efe7')
    draw.text((x+22,y+432),f"{item['triangles']} TRIANGLES",font=small,fill='#79bfc1')
    blob=(root / (item['slug']+'.glb')).read_bytes()
    magic, version, total = struct.unpack_from('<4sII',blob)
    assert magic == b'glTF' and version == 2 and total == len(blob)
    length, typ=struct.unpack_from('<I4s',blob,12)
    assert typ == b'JSON'
    gltf=json.loads(blob[20:20+length])
    assert len(gltf.get('meshes',[])) == item['mesh_objects']
    assert gltf.get('materials') and gltf.get('scenes')
    results.append({'slug':item['slug'], 'alpha_bbox':bounds, 'first_opaque_pixel': [round(sum(topxs)/len(topxs),1),top], 'feature_projected_bbox':feature, 'glb_meshes':len(gltf['meshes']), 'glb_bytes':len(blob)})
sheet.save(root / 'contact-sheet.png')
(root / 'verification.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))

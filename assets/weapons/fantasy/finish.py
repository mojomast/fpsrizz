"""Create contact sheet and perform portable checks: python3 finish.py (Pillow required)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, struct

out=Path(__file__).resolve().parent
stats=json.loads((out/'stats.json').read_text())
sheet=Image.new('RGB',(1500,1120),(14,21,27)); draw=ImageDraw.Draw(sheet)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
try:
    titlefont=ImageFont.truetype(bold_path,27); textfont=ImageFont.truetype(font_path,18)
except OSError:
    titlefont=ImageFont.load_default(); textfont=titlefont
draw.text((32,20),'GLOAMFORGE  /  SIX RELICS',font=titlefont,fill=(231,220,188))
draw.text((34,57),'LOW-POLY FANTASY ARSENAL  ·  FIRST-PERSON STUDIES',font=textfont,fill=(100,177,165))
report={}
for i,(slug,info) in enumerate(stats.items()):
    image=Image.open(out/(slug+'.png')).convert('RGBA')
    assert image.size==(512,512)
    alpha=image.getchannel('A'); bounds=alpha.getbbox(); assert bounds and bounds[0]>0 and bounds[1]>0 and bounds[2]<512 and bounds[3]<512
    raw=(out/(slug+'.glb')).read_bytes()
    magic,version,length=struct.unpack_from('<4sII',raw); assert magic==b'glTF' and version==2 and length==len(raw)
    chunk_len,chunk_type=struct.unpack_from('<I4s',raw,12); assert chunk_type==b'JSON'
    gltf=json.loads(raw[20:20+chunk_len])
    assert gltf.get('meshes') and gltf.get('materials')
    tri=0
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            assert prim.get('mode',4)==4
            tri+=gltf['accessors'][prim['indices']]['count']//3
    assert tri==info['triangles'], (slug,tri,info['triangles'])
    report[slug]={'triangles':tri,'alpha_bounds':bounds,'glb_bytes':len(raw),'meshes':len(gltf['meshes'])}
    x=25+(i%3)*492; y=100+(i//3)*500
    draw.rounded_rectangle((x,y,x+465,y+475),radius=12,fill=(27,38,44),outline=(61,79,80),width=2)
    image.thumbnail((405,405),Image.Resampling.LANCZOS)
    sheet.paste(image,(x+30,y+8),image)
    draw.text((x+22,y+408),info['title'].upper(),font=titlefont,fill=(239,222,178))
    draw.text((x+22,y+446),info['role'].upper()+'   /   '+str(tri)+' TRIS',font=textfont,fill=(107,193,178))
sheet.save(out/'contact_sheet.png')
(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

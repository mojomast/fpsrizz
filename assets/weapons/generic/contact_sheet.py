"""Create a labeled checkerboard contact sheet and report sprite alpha bounds.

Run with Python 3 and Pillow after build.py.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
NAMES = ('knife', 'pistol', 'smg', 'assault_rifle', 'sniper_rifle', 'rocket_launcher')
tile, label, gap = 360, 34, 16
sheet = Image.new('RGB', (gap + 3*(tile+gap), gap + 2*(tile+label+gap)), '#111c23')
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
except OSError:
    font = ImageFont.load_default()
for i, name in enumerate(NAMES):
    image = Image.open(HERE / (name + '.png')).convert('RGBA')
    assert image.size == (512, 512), name
    alpha = image.getchannel('A')
    bbox = alpha.point(lambda x: 255 if x >= 16 else 0).getbbox()
    assert bbox and bbox[0] > 0 and bbox[1] > 0 and bbox[2] < 512 and bbox[3] < 512, (name, bbox)
    print(name, 'alpha>=16 bounds:', bbox)
    x, y = gap + (i % 3)*(tile+gap), gap + (i // 3)*(tile+label+gap)
    for yy in range(0,tile,24):
        for xx in range(0,tile,24):
            color = '#26343b' if ((xx//24)+(yy//24))%2 else '#202c33'
            draw.rectangle((x+xx,y+yy,x+xx+23,y+yy+23), fill=color)
    image.thumbnail((tile,tile), Image.Resampling.LANCZOS)
    sheet.paste(image,(x,y),image)
    draw.text((x+8,y+tile+7),name.replace('_',' ').upper(),font=font,fill='#e8ded0')
sheet.save(HERE / 'contact_sheet.png', optimize=True)

"""Run with python3 tests/assetrizz-enemies.test.py (requires Pillow)."""
import base64
from pathlib import Path
import re
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


class EnemyStripsTest(unittest.TestCase):
    def test_strips_match_painters_and_preserve_hurt_alpha(self):
        generated = (ROOT / 'src/plugins/theme-assetrizz/generated.ts').read_text()
        for key in ('enemy-grunt', 'enemy-spitter'):
            with self.subTest(key=key):
                image = Image.open(ROOT / 'public/assetrizz' / (key + '.png')).convert('RGBA')
                self.assertEqual(image.size, (256, 64))
                match = re.search(r"'" + key + r"': painter\(256, '([^']+)'\)", generated)
                self.assertIsNotNone(match)
                self.assertEqual(base64.b64decode(match.group(1)), image.tobytes())
                frames = [image.crop((i * 64, 0, (i + 1) * 64, 64)) for i in range(4)]
                self.assertEqual(len({frame.tobytes() for frame in frames}), 4)
                self.assertEqual(frames[2].getchannel('A').tobytes(), frames[3].getchannel('A').tobytes())
                self.assertEqual(frames[0].getpixel((0, 0))[3], 0)
                self.assertGreater(frames[0].getchannel('A').getextrema()[1], 0)


if __name__ == '__main__':
    unittest.main()

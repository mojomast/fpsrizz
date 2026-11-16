import base64
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'scripts/weapon-painters.py'


class WeaponPaintersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.output = self.dir / 'weapons.ts'

    def run_cli(self, *args):
        return subprocess.run(['python3', str(SCRIPT), '--output', str(self.output), *map(str, args)],
                              capture_output=True, text=True)

    def test_real_render_runs_synchronously_and_preserves_pixels(self):
        source = ROOT / 'assets/weapons/generic/pistol.png'
        result = self.run_cli('--sprite', f'weapon-pistol={source}')
        self.assertEqual(result.returncode, 0, result.stderr)
        generated = self.output.read_text()
        # Execute the emitted painter itself; only erase its TypeScript annotations.
        js = generated.replace("import type { Painter } from '../src/sdk/index.ts';", '')
        js = '\n'.join(line for line in js.splitlines() if not line.startswith('import type '))
        js = js.replace('width: number, height: number, encoded: string): Painter', 'width, height, encoded)')
        js = js.replace('export const weaponTextures: Record<string, Painter>', 'const weaponTextures')
        js += '''\nclass ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } }
let image;
weaponTextures['weapon-pistol'].paint({putImageData(value, x, y) { if (x || y) throw Error('offset'); image = value; }});
console.log(JSON.stringify({width: image.width, height: image.height, pixels: Buffer.from(image.data).toString('base64')}));
'''
        runner = self.dir / 'run.cjs'
        runner.write_text(js)
        run = subprocess.run(['node', str(runner)], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        actual = json.loads(run.stdout)
        with Image.open(source) as image:
            self.assertEqual((actual['width'], actual['height']), image.size)
            self.assertEqual(image.size, (512, 512))
            expected = bytearray(image.convert('RGBA').tobytes())
        for i in range(0, len(expected), 4):
            if expected[i + 3] == 0:
                expected[i:i + 3] = b'\0\0\0'
        self.assertEqual(base64.b64decode(actual['pixels']), expected)
        self.assertLess(len(generated), len(expected) * 4 // 3)

    def test_validation_is_all_or_nothing_and_output_requires_force(self):
        png = self.dir / 'valid.png'
        Image.new('RGBA', (3, 2), (10, 20, 30, 128)).save(png)
        bad = self.dir / 'bad.png'
        bad.write_bytes(b'not a PNG')
        self.output.write_text('sentinel')
        failure = self.run_cli('--force', '--sprite', f'weapon-good={png}', '--sprite', f'weapon-bad={bad}')
        self.assertNotEqual(failure.returncode, 0)
        self.assertEqual(self.output.read_text(), 'sentinel')
        self.assertNotEqual(self.run_cli('--sprite', f'weapon-good={png}').returncode, 0)
        self.assertEqual(self.output.read_text(), 'sentinel')
        self.assertEqual(self.run_cli('--force', '--sprite', f'weapon-good={png}').returncode, 0)

    def test_duplicates_and_non_png_are_rejected_without_creation(self):
        png = self.dir / 'valid.png'
        Image.new('RGBA', (1, 1)).save(png)
        duplicate = self.run_cli('--sprite', f'weapon-x={png}', '--sprite', f'weapon-x={png}')
        self.assertNotEqual(duplicate.returncode, 0)
        self.assertFalse(self.output.exists())
        non_png = self.dir / 'fake.png'
        Image.new('RGB', (1, 1)).save(non_png, format='JPEG')
        self.assertNotEqual(self.run_cli('--sprite', f'weapon-x={non_png}').returncode, 0)
        self.assertFalse(self.output.exists())

    def test_order_independent_and_transparent_runs_cross_limit(self):
        png = self.dir / 'blank.png'
        Image.new('RGBA', (512, 512)).save(png)
        args = ['--sprite', f'weapon-z={png}', '--sprite', f'weapon-a={png}']
        self.assertEqual(self.run_cli(*args).returncode, 0)
        first = self.output.read_bytes()
        self.assertLess(len(first), 2000)
        self.assertEqual(self.run_cli('--force', '--sprite', f'weapon-a={png}', '--sprite', f'weapon-z={png}').returncode, 0)
        self.assertEqual(self.output.read_bytes(), first)


if __name__ == '__main__':
    unittest.main()

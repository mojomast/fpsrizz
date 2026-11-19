import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
// @ts-expect-error plain ESM script without declarations
import { createZip, listZip } from '../scripts/zip-lite.mjs';
// @ts-expect-error plain ESM script without declarations
import { checkItch, withDefaultQuery } from '../scripts/export-itch.mjs';

test('zip-lite: round-trips names, sizes and deflated data', () => {
  const big = new TextEncoder().encode('bulkhead '.repeat(500));
  const zip: Uint8Array = createZip([{ name: 'index.html', data: new TextEncoder().encode('<html></html>') }, { name: 'assets/a.js', data: big }]);
  const list = listZip(zip) as { name: string; size: number; method: number }[];
  assert.deepEqual(list.map((e) => [e.name, e.size]), [['index.html', 13], ['assets/a.js', big.length]]);
  assert.equal(list[1]!.method, 8, 'compressible data is deflated');
  // Local header of the 2nd entry: data follows the 30-byte header and the name.
  const buf = Buffer.from(zip);
  const second = buf.indexOf(Buffer.from('assets/a.js')) + 'assets/a.js'.length;
  const csize = buf.readUInt32LE(second - 'assets/a.js'.length - 30 + 18);
  assert.equal(inflateRawSync(buf.subarray(second, second + csize)).toString(), 'bulkhead '.repeat(500));
  assert.throws(() => createZip([{ name: '../evil', data: new Uint8Array() }]), /bad zip path/);
});

test('export:itch: itch.io checks and preset boot', () => {
  const files = [{ name: 'index.html', size: 10 }, { name: 'assets/main.js', size: 10 }];
  assert.deepEqual(checkItch(files, '<script type="module" src="./assets/main.js"></script>'), []);
  assert.match(checkItch(files, '<script src="/assets/main.js"></script>').join(), /root-relative/);
  assert.match(checkItch([{ name: 'a.html', size: 1 }], '').join(), /index\.html/);
  assert.match(checkItch(Array.from({ length: 1001 }, (_, i) => ({ name: i ? `f${i}` : 'index.html', size: 1 })), '').join(), /1000/);
  const html = withDefaultQuery('<script type="module" src="./a.js"></script>', 'preset=sandbox/physics');
  assert.match(html, /history\.replaceState\(null,'','\?preset=sandbox\/physics'/);
  assert.ok(html.indexOf('replaceState') < html.indexOf('type="module"'), 'query is set before the app boots');
});

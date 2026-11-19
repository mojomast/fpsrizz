import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain ESM script without declarations
import { GALLERY_FILE, renderGallery } from '../scripts/gallery-lib.mjs';

const index = JSON.parse(readFileSync('docs/reuse-index.json', 'utf8') as string);
const html = readFileSync(GALLERY_FILE, 'utf8') as string;
const data = (page: string) => JSON.parse(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/.exec(page)![1]!.replaceAll('\\u003c', '<'));

test('the gallery is generated from the reuse index (npm run index-reuse keeps it fresh)', () => {
  assert.equal(html, renderGallery(index), 'public/gallery/index.html is stale: run npm run index-reuse');
  const d = data(html);
  assert.equal(d.digest, index.sourceDigest);
  assert.equal(d.entries.length, index.entries.length);
  assert.equal(d.presets.length, index.presets.length);
});

test('plugin cards carry live preset links only for built-in presets', () => {
  const d = data(html);
  const presetIds = new Set(d.presets.map((p: { id: string }) => p.id));
  const nav = d.entries.find((e: { id: string }) => e.id === 'std/navigation-recast');
  assert.ok(nav, 'std/navigation-recast is listed');
  assert.deepEqual(nav.presets, ['sandbox/navmesh']);
  for (const e of d.entries) for (const p of e.presets ?? []) assert.ok(presetIds.has(p), `${e.id} -> ${p}`);
  assert.match(html, /href="\.\.\/\?preset=' \+ encodeURIComponent\(id\)/, 'Play links open the app one level up');
});

test('embedded data cannot close the script element', () => {
  const page = renderGallery({ ...index, entries: [{ id: 'x/y', type: 'plugin', name: '</script><b>', summary: '<i>' }] });
  assert.equal(page.match(/<\/script>/g)!.length, 2, 'only the two real closing tags');
  assert.equal(data(page).entries[0].name, '</script><b>');
});

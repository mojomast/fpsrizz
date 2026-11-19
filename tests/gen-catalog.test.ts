import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// @ts-ignore -- plain .mjs tooling module without types
import { discoverPlugins, renderCatalog } from '../scripts/gen-catalog.mjs';
import { catalog } from '../src/app/catalog.ts';

test('the generated catalog lists every plugin folder with a manifest exactly once', () => {
  const folders = (readdirSync('packages/std/plugins') as string[]).filter((d: string) => existsSync(`packages/std/plugins/${d}/manifest.json`));
  const found = discoverPlugins() as { id: string; dir: string; code: boolean }[];
  assert.equal(found.filter((p) => p.dir.startsWith('packages/std/plugins/')).length, folders.length);
  assert.equal(catalog.length, found.length);
  assert.equal(new Set(catalog.map((e) => (e.manifest as { id: string }).id)).size, catalog.length);
  for (const entry of catalog) assert.ok('load' in entry || 'content' in entry, (entry.manifest as { id: string }).id);
});

test('the committed catalog.generated.ts is fresh', () => {
  const r = spawnSync('node', ['scripts/gen-catalog.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('rendered catalog source is valid for unusual folder names', () => {
  const text = renderCatalog([
    { id: '9space/2...--foo_', dir: 'packages/std/plugins/9space-2...--foo_', code: true },
    { id: 'x/pack', dir: 'games/demo/plugins/x-pack', code: false },
  ]) as string;
  assert.match(text, /import\('\.\.\/\.\.\/packages\/std\/plugins\/9space-2\.\.\.--foo_\/index\.ts'\)/);
  assert.match(text, /'\.\.\/\.\.\/games\/demo\/plugins\/x-pack\/content\.json'/);
  const stripped = text.replace(/^import type .*$/m, '').replace(/: CatalogEntry\[\]/, '');
  const r = spawnSync('node', ['--check', '--input-type=module'], { input: stripped, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

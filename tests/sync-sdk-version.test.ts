import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error plain ESM script without declarations
import { CORE, PKG, readSdkVersion, withSdkVersion } from '../scripts/sync-sdk-version.mjs';
import { SDK_VERSION } from '@bulkhead/sdk';

test('SDK_VERSION equals the @bulkhead/sdk package version, and the fixed @bulkhead/* group shares it', () => {
  const version = JSON.parse(readFileSync(PKG, 'utf8')).version;
  assert.equal(SDK_VERSION, version);
  assert.equal(readSdkVersion(readFileSync(CORE, 'utf8')), version);
  const config = JSON.parse(readFileSync(new URL('../.changeset/config.json', import.meta.url).pathname, 'utf8'));
  for (const name of config.fixed[0] as string[]) {
    const pkg = JSON.parse(readFileSync(new URL(`../packages/${name.split('/')[1]}/package.json`, import.meta.url).pathname, 'utf8'));
    assert.equal(pkg.version, version, name);
    for (const [dep, range] of Object.entries((pkg.dependencies ?? {}) as Record<string, string>)) if (dep.startsWith('@bulkhead/')) assert.equal(range, version, `${name} -> ${dep}`);
  }
});

test('withSdkVersion rewrites the declaration and reports major changes', () => {
  const src = "x\nexport const SDK_VERSION = '3.0.0';\ny";
  assert.deepEqual(withSdkVersion(src, '3.1.0'), { src: "x\nexport const SDK_VERSION = '3.1.0';\ny", prev: '3.0.0', majorChanged: false });
  assert.equal(withSdkVersion(src, '4.0.0').majorChanged, true);
  assert.throws(() => readSdkVersion('nothing'), /not found/);
});

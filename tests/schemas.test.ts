import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseManifest, parsePreset } from '@bulkhead/kernel/manifest.ts';
import { Reporter } from '@bulkhead/kernel/validate.ts';
import type { Issue } from '@bulkhead/kernel/validate.ts';

const ajv = new (Ajv2020 as unknown as new (o: object) => { compile(s: unknown): ((d: unknown) => boolean) & { errors?: unknown } })({ allErrors: true, strictTuples: false, allowUnionTypes: true });
const schema = (name: string) => ajv.compile(JSON.parse(readFileSync(`schemas/${name}.schema.json`, 'utf8') as string));
const kernel = (parse: (raw: unknown, r: Reporter) => unknown, raw: unknown): boolean => { const issues: Issue[] = []; return parse(raw, new Reporter(issues, 'test')) !== undefined && issues.length === 0; };

test('schemas and the kernel validators agree on committed presets and on broken variants', () => {
  const preset = schema('preset');
  const files = readdirSync('games').flatMap((d) => {
    try { return readdirSync(`games/${d}/presets`).map((f) => `games/${d}/presets/${f}`); } catch { return []; }
  });
  assert.ok(files.length > 30);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(f, 'utf8') as string);
    assert.equal(preset(raw), true, f);
    assert.equal(kernel(parsePreset, raw), true, f);
    for (const broken of [{ ...raw, id: 'NoSlash' }, { ...raw, schema: 2 }, { ...raw, seed: -1 }, { ...raw, plugins: 'core/world' }]) {
      assert.equal(preset(broken), false, `${f}: schema should reject ${JSON.stringify(broken).slice(0, 60)}`);
      assert.equal(kernel(parsePreset, broken), false, `${f}: kernel should reject`);
    }
  }
});

test('schemas and the kernel validators agree on plugin manifests', () => {
  const manifest = schema('plugin-manifest');
  const raw = JSON.parse(readFileSync('packages/std/plugins/std-physics-rapier/manifest.json', 'utf8') as string);
  assert.equal(manifest(raw), true);
  assert.equal(kernel(parseManifest, raw), true);
  for (const broken of [{ ...raw, kind: 'plugin' }, { ...raw, version: '1.0' }, { ...raw, preload: ['../secret.glb'] }, { ...raw, config: { x: { type: 'number', label: 'X' } } }]) {
    assert.equal(manifest(broken), false, JSON.stringify(broken).slice(0, 80));
    assert.equal(kernel(parseManifest, broken), false);
  }
});

test('scene and prefab schemas accept the documented format and reject typos the std/scene loaders also reject', () => {
  const scene = schema('scene'), prefab = schema('prefab');
  const ok = { nodes: [{ prefab: 'game/crate', name: 'crate-1', transform: { position: [1, 0, 2], rotation: [0, 90, 0], scale: 2 }, overrides: { renderable: { color: '#ff0000' }, 'game/tag': null }, children: [{ name: 'lid' }] }] };
  assert.equal(scene(ok), true);
  assert.equal(scene({ nodes: [{ prefab: 'game/crate', transfrom: {} }] }), false);
  assert.equal(scene({ nodes: [{ transform: { position: [1, 2] } }] }), false);
  assert.equal(prefab({ extends: 'game/block', components: { body: { type: 'dynamic' }, 'game/tag': { hp: 3 } } }), true);
  assert.equal(prefab({ components: { colour: {} } }), false);
});

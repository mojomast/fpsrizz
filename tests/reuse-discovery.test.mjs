import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalog } from '../src/app/catalog.ts';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION } from '@bulkhead/sdk';
import { buildReuseIndex, dependencyClosure, indexFiles, renderIndex, searchReuse, validateMetadata } from '../scripts/reuse-lib.mjs';

const index = await buildReuseIndex();
const byId = id => index.entries.find(entry => entry.id === id);
const symbols = new Set(index.entries.filter(entry => entry.type === 'contract').map(entry => entry.name));

test('discovery covers the compiled catalog and real default registrations with precise reuse scope', () => {
  assert.deepEqual(index.entries.filter(entry => entry.type === 'plugin' && entry.builtIn).map(entry => entry.id).sort(), catalog.map(entry => entry.manifest.id).sort());
  assert.ok(byId('mechanics/actions').registrations.some(entry => entry.kind === 'role:sdk/mechanic-actions' && entry.id === 'mechanics/actions'));
  assert.ok(byId('core/combat').registrations.some(entry => entry.id === 'core/hitscan'));
  assert.ok(byId('core/combat').contentKinds.some(entry => entry.kind === 'weapon'));
  assert.equal(byId('mechanics/resources').scope, 'cross-genre');
  assert.equal(byId('story/adventure').scope, 'family');
  assert.match(byId('story/adventure').limitations.join(' '), /not a general inventory/);
  assert.equal(byId('sdk/Render').importFrom, 'packages/sdk/src/render.ts');
  assert.equal(byId('sdk/ResourcePoolProviders').token, 'mechanic-resource-provider');
  assert.ok(byId('sdk/ResourcePoolProviders').implementations.includes('mechanics/resources'));
  assert.ok(byId('mechanics/actions').recipes.includes('recipe/resource-actions'));
  assert.ok(byId('mechanics/actions').presets.some(preset => preset.id === 'verdant/relay'));
});

test('intent search prioritizes reusable implementations and surfaces family alternatives honestly', () => {
  const query = searchReuse(index, 'I need stamina costs and cooldowns');
  assert.ok(query.slice(0, 3).some(entry => entry.id === 'mechanics/actions'));
  assert.equal(query[0].id, 'recipe/resource-actions');
  assert.ok(query.find(entry => entry.id === 'mechanics/actions').matched.includes('stamina'));
  assert.equal(searchReuse(index, 'atomic currency balance', { type: 'plugin' })[0].id, 'mechanics/resources');
  assert.equal(searchReuse(index, 'keyed door', { type: 'plugin' })[0].id, 'example/keys');
  assert.equal(searchReuse(index, 'prerequisite quest', { type: 'plugin' })[0].id, 'mechanics/objectives');
  assert.equal(searchReuse(index, 'profile storage', { type: 'recipe' })[0].id, 'recipe/profile-storage');
  const queues = searchReuse(index, 'bounded fifo command queue', { scope: 'cross-genre' });
  assert.equal(queues[0].id, 'recipe/bounded-command-queue');
  assert.ok(queues[0].entryPoints.includes('createCommandQueue'));
  assert.match(queues[0].limitations.join(' '), /acceptance is not gameplay success/);
  const deadlines = searchReuse(index, 'temporary effect deadline', { scope: 'cross-genre' });
  assert.equal(deadlines[0].id, 'recipe/explicit-deadlines');
  assert.ok(deadlines[0].entryPoints.includes('createDeadline'));
  assert.match(deadlines[0].limitations.join(' '), /neither advances nor owns/);
  const navigation = searchReuse(index, 'graph shortest path', { type: 'plugin' });
  assert.equal(navigation[0].id, 'mechanics/navigation');
  assert.ok(navigation[0].entryPoints.includes('NavigationRole'));
  const sequence = searchReuse(index, 'ordered steps rounds', { type: 'recipe' });
  assert.equal(sequence[0].id, 'recipe/ordered-rounds');
  assert.equal(sequence[0].roles['sdk/mechanic-sequence'], 'mechanics/sequence');
  assert.ok(searchReuse(index, 'inventory').some(entry => entry.id === 'story/adventure' && entry.scope === 'family'));
  assert.ok(searchReuse(index, 'cooldown', { scope: 'cross-genre' }).every(entry => entry.scope === 'cross-genre'));
  assert.deepEqual(searchReuse(index, 'zzzznotacapabilityzzzz'), []);
});

test('concrete enable closure does not silently choose role implementations', () => {
  const manifests = new Map(catalog.map(entry => [entry.manifest.id, entry.manifest]));
  const closure = dependencyClosure('ember/game', manifests);
  assert.ok(closure.includes('mechanics/kits'));
  assert.ok(!closure.includes('mechanics/actions'));
  assert.ok(byId('ember/game').roleDependencies.includes('sdk/mechanic-actions'));
  assert.ok(byId('example/keys').enable.includes('core/world'));
  assert.throws(() => dependencyClosure('missing/example', manifests), /missing dependency/);
});

test('recipe role/provider fragments stage with the real host', async () => {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  assert.deepEqual(host.setCatalog(catalog), []);
  for (const recipe of index.entries.filter(entry => entry.type === 'recipe')) {
    const staged = await host.stage({ schema: 1, id: recipe.id, name: recipe.name, plugins: recipe.plugins, roles: recipe.roles, options: {}, seed: 1 });
    host.discard(staged);
    assert.equal(host.session, undefined, 'discovery/composition never starts a session');
  }
});

test('metadata rejects stale references, unknown fields and unsupported reuse claims', () => {
  const data = JSON.parse(readFileSync('packages/std/plugins/mechanics-actions/reuse.json', 'utf8'));
  assert.equal(validateMetadata(data, 'fixture', symbols), data);
  assert.throws(() => validateMetadata({ ...data, entryPoints: ['MadeUpApi'] }, 'fixture', symbols), /unknown public SDK value/);
  assert.throws(() => validateMetadata({ ...data, tests: ['tests/missing.test.ts'] }, 'fixture', symbols), /missing file/);
  assert.throws(() => validateMetadata({ ...data, docs: ['../outside.md'] }, 'fixture', symbols), /repository-relative/);
  assert.throws(() => validateMetadata({ ...data, scope: 'universal' }, 'fixture', symbols), /scope/);
  assert.throws(() => validateMetadata({ ...data, tests: [] }, 'fixture', symbols), /cross-genre claims/);
  assert.throws(() => validateMetadata({ ...data, keywords: ['cost', 'cost'] }, 'fixture', symbols), /unique/);
  assert.throws(() => validateMetadata({ ...data, surprise: true }, 'fixture', symbols), /unknown property/);
});

test('checked-in agent references exactly match deterministic live inventory', async () => {
  assert.deepEqual(await buildReuseIndex(), index);
  assert.equal(readFileSync(indexFiles.json, 'utf8'), JSON.stringify(index, null, 2) + '\n');
  assert.equal(readFileSync(indexFiles.markdown, 'utf8'), renderIndex(index));
});

test('CLI emits parseable JSON, supports exact API inspection and rejects malformed options', () => {
  const run = (...args) => spawnSync(process.execPath, ['scripts/find-reuse.mjs', ...args], { encoding: 'utf8' });
  const result = run('stamina', 'cooldown', '--json', '--limit', '2');
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 1); assert.equal(parsed.results.length, 2);
  assert.equal(parsed.results[1].id, 'mechanics/actions');
  const exact = run('--show', 'Render', '--json');
  assert.equal(exact.status, 0, exact.stderr);
  assert.equal(JSON.parse(exact.stdout).results[0].source, byId('sdk/Render').source);
  for (const args of [['--limit'], ['--limit', '0', 'cost'], ['--wat'], ['--show', 'missing/plugin'], ['--list', 'cost'], ['--type', 'unknown', 'cost']]) {
    const bad = run(...args); assert.notEqual(bad.status, 0, args.join(' ')); assert.match(bad.stderr, /Usage:/);
  }
});

test('scaffolding shows real reusable candidates and creates metadata without modifying the repository', () => {
  const directory = mkdtempSync(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'reuse-scaffold-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    cpSync('scripts/new-plugin.mjs', join(directory, 'scripts/new-plugin.mjs'));
    cpSync('templates', join(directory, 'templates'), { recursive: true });
    // Use the real repository discovery implementation, while keeping all scaffold writes in this fixture.
    writeFileSync(join(directory, 'scripts/reuse-lib.mjs'), `export { buildReuseIndex, searchReuse } from ${JSON.stringify(pathToFileURL(resolve('scripts/reuse-lib.mjs')).href)};`);
    const result = spawnSync(process.execPath, [join(directory, 'scripts/new-plugin.mjs'), 'test/stamina', 'Stamina cooldown'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /mechanics\/actions \[cross-genre\]/);
    const metadata = JSON.parse(readFileSync(join(directory, 'packages/std/plugins/test-stamina/reuse.json'), 'utf8'));
    assert.equal(metadata.scope, 'unreviewed');
    assert.equal(metadata.summary, 'Stamina cooldown');
    assert.equal(validateMetadata(metadata, 'scaffold', symbols), metadata);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGraph, dependentsOf } from '@bulkhead/kernel/resolver.ts';
import { codePlugin, fullManifest, hostFailure, manifestMap, newHost, presetOf, PluginHost, PHASES, SDK_COMPAT, SDK_VERSION } from './helpers/host.ts';

const A = 'test/a';
const B = 'test/b';
const C = 'test/c';
const D = 'test/d';
const Z = 'test/z';

const resolve = (list: ReturnType<typeof fullManifest>[], requested: string[]) => resolveGraph(manifestMap(list), requested, SDK_VERSION);
const messages = (r: { issues: { message: string }[] }): string => r.issues.map((i) => i.message).join('\n');

// ---- missing dependencies ---------------------------------------------------------------------------------------------

test('resolver: dependency that is not installed gets an "install" style message', () => {
  const r = resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } })], [A]);
  assert.equal(r.issues.length, 1);
  const m = r.issues[0]!;
  assert.equal(m.source, A);
  assert.equal(m.path, `dependencies.${B}`);
  assert.match(m.message, /"test\/a" requires "test\/b"/);
  assert.match(m.message, /not installed/);
  assert.ok(!/not enabled/.test(m.message), 'must not claim the plugin is merely disabled');
});

test('resolver: dependency installed but not enabled gets an "enable it" message', () => {
  const r = resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } }), fullManifest(B)], [A]);
  assert.equal(r.issues.length, 1);
  const msg = r.issues[0]!.message;
  assert.match(msg, /"test\/b"/);
  assert.match(msg, /installed but not enabled/);
  assert.match(msg, /Enable "test\/b"/);
  assert.ok(!/not installed/.test(msg));
});

test('resolver: the two missing-dependency messages are different', () => {
  const notInstalled = messages(resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } })], [A]));
  const disabled = messages(resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } }), fullManifest(B)], [A]));
  assert.notEqual(notInstalled, disabled);
});

test('resolver: a requested plugin that is not installed is reported with the installed list', () => {
  const r = resolve([fullManifest(A)], [A, 'test/ghost']);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0]!.message, /"test\/ghost" is requested but not installed/);
  assert.match(r.issues[0]!.message, /test\/a/);
});

test('resolver: missing dependency through host.stage fails at stage "graph" and leaves host idle', async () => {
  const host = newHost([codePlugin(A, {}, { dependencies: { [B]: '^1.0.0' } }), codePlugin(B)]);
  const e = await hostFailure(host.stage(presetOf('test/p', [A])));
  assert.equal(e.stage, 'graph');
  assert.match(e.message, /"test\/a"/);
  assert.match(e.message, /"test\/b"/);
  assert.match(e.message, /installed but not enabled/);
  assert.equal(host.session, undefined);
  assert.equal(host.active, undefined);
});

// ---- versions ---------------------------------------------------------------------------------------------------------

test('resolver: incompatible dependency version names both plugins, range and installed version', () => {
  const r = resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } }), fullManifest(B, { version: '2.1.0' })], [A, B]);
  assert.equal(r.issues.length, 1);
  const msg = r.issues[0]!.message;
  assert.match(msg, /"test\/a"/);
  assert.match(msg, /"test\/b"/);
  assert.match(msg, /\^1\.0\.0/);
  assert.match(msg, /2\.1\.0/);
});

test('resolver: compatible dependency version passes (range edge: 1.9.9 satisfies ^1.0.0)', () => {
  const r = resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } }), fullManifest(B, { version: '1.9.9' })], [A, B]);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.order, [B, A]);
});

test('resolver: incompatible SDK range is reported against the host SDK version', () => {
  const r = resolve([fullManifest(A, { sdk: '^4.0.0' })], [A]);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0]!.path, 'sdk');
  assert.match(r.issues[0]!.message, /"test\/a" needs SDK \^4\.0\.0/);
  assert.ok(r.issues[0]!.message.includes(SDK_VERSION));
});

test('resolver: SDK 2 plugins load on SDK 3 through the compat list, and only through it', () => {
  assert.equal(SDK_VERSION, '3.0.0');
  assert.deepEqual(SDK_COMPAT, ['2.0.0']);
  assert.deepEqual(resolveGraph(manifestMap([fullManifest(A, { sdk: '^2.0.0' })]), [A], SDK_VERSION, SDK_COMPAT).issues, []);
  assert.deepEqual(resolveGraph(manifestMap([fullManifest(A, { sdk: '^3.0.0' })]), [A], SDK_VERSION, SDK_COMPAT).issues, []);
  const strict = resolve([fullManifest(A, { sdk: '^2.0.0' })], [A]);
  assert.equal(strict.issues.length, 1, 'without sdkCompat an SDK 2 manifest is rejected');
  const withCompat = resolveGraph(manifestMap([fullManifest(A, { sdk: '^4.0.0' })]), [A], SDK_VERSION, SDK_COMPAT);
  assert.match(withCompat.issues[0]!.message, /provides SDK 3\.0\.0, 2\.0\.0/);
});

test('resolver: SDK 1 plugins are incompatible with SDK 3 and its compat versions', () => {
  const r = resolveGraph(manifestMap([fullManifest(A, { sdk: '^1.0.0' })]), [A], SDK_VERSION, SDK_COMPAT);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0]!.path, 'sdk');
  assert.match(r.issues[0]!.message, /"test\/a" needs SDK \^1\.0\.0/);
  assert.ok(r.issues[0]!.message.includes(SDK_VERSION));
});

test('resolver: incompatible SDK through host.stage fails at "graph"', async () => {
  const host = newHost([codePlugin(A, {}, { sdk: '>=4.0.0' })]);
  const e = await hostFailure(host.stage(presetOf('test/p', [A])));
  assert.equal(e.stage, 'graph');
  assert.match(e.message, /"test\/a"/);
  assert.match(e.message, /SDK/);
});

// ---- cycles -----------------------------------------------------------------------------------------------------------

test('resolver: dependency cycle lists exactly the members of the cycle', () => {
  const r = resolve(
    [
      fullManifest(A, { dependencies: { [B]: '^1.0.0' } }), // depends on the cycle but is not part of it
      fullManifest(B, { dependencies: { [C]: '^1.0.0' } }),
      fullManifest(C, { dependencies: { [D]: '^1.0.0' } }),
      fullManifest(D, { dependencies: { [B]: '^1.0.0' } }),
    ],
    [A, B, C, D],
  );
  assert.equal(r.issues.length, 1);
  const msg = r.issues[0]!.message;
  assert.match(msg, /Dependency cycle/);
  for (const id of [B, C, D]) assert.ok(msg.includes(id), `cycle message should name ${id}: ${msg}`);
  const chain = /Dependency cycle: ([^.]*)\./.exec(msg);
  assert.ok(chain, msg);
  const members = chain[1]!.split(' -> ');
  assert.equal(members[0], members[members.length - 1], 'the chain closes on itself');
  assert.deepEqual([...new Set(members)].sort(), [B, C, D]);
  assert.ok(!members.includes(A), 'a plugin that merely depends on the cycle is not a member');
});

test('resolver: two-plugin cycle through host.stage fails at "graph" naming both', async () => {
  const host = newHost([codePlugin(A, {}, { dependencies: { [B]: '^1.0.0' } }), codePlugin(B, {}, { dependencies: { [A]: '^1.0.0' } })]);
  const e = await hostFailure(host.stage(presetOf('test/p', [A, B])));
  assert.equal(e.stage, 'graph');
  assert.match(e.message, /cycle/i);
  assert.ok(e.message.includes(A) && e.message.includes(B));
});

test('resolver: a cycle made only of an optional edge also counts as a cycle', () => {
  const r = resolve([fullManifest(A, { dependencies: { [B]: '^1.0.0' } }), fullManifest(B, { optionalDependencies: { [A]: '^1.0.0' } })], [A, B]);
  assert.match(messages(r), /Dependency cycle/);
});

// ---- duplicate ids in the catalog -------------------------------------------------------------------------------------

test('catalog: duplicate plugin id is reported by setCatalog and the duplicate entry is excluded', () => {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  const first = codePlugin(A, {}, { version: '1.0.0' });
  const second = codePlugin(A, {}, { version: '2.0.0' });
  const issues = host.setCatalog([first, second, codePlugin(B)]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /Duplicate plugin id "test\/a"/);
  assert.equal(issues[0]!.source, A);
  const installed = host.installed();
  assert.equal(installed.get(A)?.version, '1.0.0', 'the first definition stays');
  assert.deepEqual([...installed.keys()].sort(), [A, B]);
  assert.equal(host.catalogEntry(A), first);
  const broken = host.catalogStatus().filter((s) => s.issues.length > 0);
  assert.equal(broken.length, 1);
  assert.equal(broken[0]!.active, false);
});

// ---- conflicts --------------------------------------------------------------------------------------------------------

test('resolver: conflicts are reported when both plugins are enabled, naming both', () => {
  const r = resolve([fullManifest(A, { conflicts: [B] }), fullManifest(B)], [A, B]);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0]!.source, A);
  assert.match(r.issues[0]!.message, /"test\/a" conflicts with "test\/b"/);
});

test('resolver: a conflict with a plugin that is installed but not enabled is fine', () => {
  const r = resolve([fullManifest(A, { conflicts: [B] }), fullManifest(B)], [A]);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.order, [A]);
});

test('resolver: conflict declared only on the other side is still detected', () => {
  const r = resolve([fullManifest(A), fullManifest(B, { conflicts: [A] })], [A, B]);
  assert.match(messages(r), /"test\/b" conflicts with "test\/a"/);
});

// ---- optional dependencies --------------------------------------------------------------------------------------------

test('resolver: absent optional dependency is ok', () => {
  const r = resolve([fullManifest(A, { optionalDependencies: { [B]: '^1.0.0' } })], [A]);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.order, [A]);
});

test('resolver: optional dependency installed but not enabled is still ok', () => {
  const r = resolve([fullManifest(A, { optionalDependencies: { [B]: '^1.0.0' } }), fullManifest(B)], [A]);
  assert.deepEqual(r.issues, []);
});

test('resolver: optional dependency present with the wrong version is an error', () => {
  const r = resolve([fullManifest(A, { optionalDependencies: { [B]: '^1.0.0' } }), fullManifest(B, { version: '3.0.0' })], [A, B]);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0]!.path, `optionalDependencies.${B}`);
  assert.match(r.issues[0]!.message, /"test\/a"/);
  assert.match(r.issues[0]!.message, /"test\/b"/);
  assert.match(r.issues[0]!.message, /3\.0\.0/);
});

test('resolver: optional dependency present creates an ordering edge (overrides the lexicographic tie-break)', () => {
  const r = resolve([fullManifest(A, { optionalDependencies: { [Z]: '^1.0.0' } }), fullManifest(Z)], [A, Z]);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.order, [Z, A]);
  // without the edge, lexicographic order would be a before z
  assert.deepEqual(resolve([fullManifest(A), fullManifest(Z)], [A, Z]).order, [A, Z]);
});

// ---- stability --------------------------------------------------------------------------------------------------------

test('resolver: independent plugins come out lexicographically sorted', () => {
  const list = [fullManifest(D), fullManifest(B), fullManifest(C), fullManifest(A)];
  assert.deepEqual(resolve(list, [D, B, C, A]).order, [A, B, C, D]);
});

test('resolver: dependencies first, ties between ready plugins broken lexicographically', () => {
  // a needs z; b is independent. Ready set is {b, z} -> b, z, then a.
  const list = [fullManifest(A, { dependencies: { [Z]: '^1.0.0' } }), fullManifest(B), fullManifest(Z)];
  const r = resolve(list, [A, B, Z]);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.order, [B, Z, A]);
  assert.ok(r.order.indexOf(Z) < r.order.indexOf(A));
});

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

test('resolver: order is identical across repeated calls and every permutation of the request order', () => {
  const list = [fullManifest(A, { dependencies: { [Z]: '^1.0.0' } }), fullManifest(B), fullManifest(C, { dependencies: { [A]: '^1.0.0' } }), fullManifest(D), fullManifest(Z)];
  const ids = [A, B, C, D, Z];
  const expected = resolve(list, ids).order;
  assert.deepEqual(expected, [B, D, Z, A, C]);
  for (let i = 0; i < 5; i++) assert.deepEqual(resolve(list, ids).order, expected);
  for (const perm of permutations(ids)) assert.deepEqual(resolve(list, perm).order, expected, `request order ${perm.join(',')}`);
  // catalog insertion order must not matter either
  assert.deepEqual(resolve([...list].reverse(), ids).order, expected);
});

test('resolver: a requested plugin listed twice is reported (pure resolver)', () => {
  const r = resolve([fullManifest(A)], [A, A]);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0]!.message, /"test\/a" is listed more than once/);
  assert.deepEqual(r.order, [A], 'the plugin is still ordered once');
});

test('resolver: a plugin listed twice in a preset is rejected at stage "preset" through the host', async () => {
  const host = newHost([codePlugin(A)]);
  const e = await hostFailure(host.stage(presetOf('test/p', [A, A])));
  assert.ok(e.stage === 'preset' || e.stage === 'graph', `unexpected stage ${e.stage}`);
  assert.match(e.message, /test\/a/);
  assert.match(e.message, /twice|more than once/);
  assert.equal(host.session, undefined);
});

// ---- dependentsOf -----------------------------------------------------------------------------------------------------

test('dependentsOf: returns transitive active dependents, sorted, excluding inactive and optional-only ones', () => {
  const list = [
    fullManifest(A),
    fullManifest(B, { dependencies: { [A]: '^1.0.0' } }),
    fullManifest(C, { dependencies: { [B]: '^1.0.0' } }),
    fullManifest(D, { dependencies: { [A]: '^1.0.0' } }),
    fullManifest('test/e', { optionalDependencies: { [A]: '^1.0.0' } }),
    fullManifest('test/f', { dependencies: { [A]: '^1.0.0' } }), // installed, not active
    fullManifest('test/g'),
  ];
  const installed = manifestMap(list);
  const active = ['test/g', C, B, A, D, 'test/e'];
  assert.deepEqual(dependentsOf(installed, active, A), [B, C, D]);
  assert.deepEqual(dependentsOf(installed, active, B), [C]);
  assert.deepEqual(dependentsOf(installed, active, C), []);
  assert.deepEqual(dependentsOf(installed, active, 'test/g'), []);
  assert.ok(!dependentsOf(installed, active, A).includes(A), 'a plugin is not its own dependent');
});

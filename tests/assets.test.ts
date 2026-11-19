import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry, SessionContext } from '@bulkhead/kernel/host.ts';
import { parseManifest } from '@bulkhead/kernel/manifest.ts';
import { Reporter } from '@bulkhead/kernel/validate.ts';
import { createAssetService, preloadManifestAssets } from '@bulkhead/platform-web/assets.ts';
import {
  Assets, GltfExtras, PHASES, PhysicsCollider, Renderable, RigidBody, SDK_COMPAT, SDK_VERSION, Transform3D,
  decomposeMatrix, gltfNodes, parseGltf, spawnGltfScene, worldPose,
} from '@bulkhead/sdk';
import type { AssetService, SpawnedGltfScene } from '@bulkhead/sdk';
import { Models, THREE } from '@bulkhead/sdk/render.ts';
import { codePlugin, presetOf } from './helpers/host.ts';

const LEVEL = 'models/levels/sandbox-props.glb';
const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../${dir}/index.ts`) });

function hostWith(assets: AssetService, entries: CatalogEntry[]): PluginHost {
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES,
    beforeActivate: preloadManifestAssets(assets),
    installHostServices(session, scope) { session.services.provide(Assets, assets, 'host', scope); },
  });
  const issues = host.setCatalog(entries);
  assert.deepEqual(issues, []);
  return host;
}
const file = (p: string): Uint8Array => new Uint8Array((readFileSync as unknown as (path: string) => Uint8Array)(p));
const near = (a: number, b: number, eps = 0.01): boolean => Math.abs(a - b) <= eps;

test('manifest "preload" accepts relative asset paths and rejects schemes, absolute paths and ".."', () => {
  const base = { schema: 1, id: 'a/b', name: 'x', version: '1.0.0', kind: 'code', sdk: '^3.0.0' };
  const ok = new Reporter([], 't');
  assert.deepEqual(parseManifest({ ...base, preload: ['models/a.glb', 'sounds/b.ogg'] }, ok)?.preload, ['models/a.glb', 'sounds/b.ogg']);
  assert.equal(parseManifest(base, new Reporter([], 't'))?.preload, undefined);
  for (const bad of [['/abs.glb'], ['../up.glb'], ['https://x/y.glb'], [3], 'models/a.glb']) {
    const r = new Reporter([], 't');
    assert.equal(parseManifest({ ...base, preload: bad }, r), undefined, JSON.stringify(bad));
    assert.ok(r.issues.some((i) => i.path.startsWith('preload')), JSON.stringify(r.issues));
  }
});

test('asset service caches by path, shares between plugins and releases with the last owner scope', async () => {
  const calls: string[] = [];
  const assets = createAssetService({ load: async (p) => { calls.push(p); return new TextEncoder().encode(`{"p":"${p}"}`); } });
  const got: unknown[] = [];
  const host = hostWith(assets, [
    codePlugin('t/a', { async activate(ctx) { got.push(await assets.json(ctx, 'data/x.json')); } }, { sdk: '^3.0.0' }),
    codePlugin('t/b', { async activate(ctx) { got.push(await assets.json(ctx, 'data/x.json')); await assets.text(ctx, 'data/y.json'); } }, { sdk: '^3.0.0', dependencies: { 't/a': '^1.0.0' } }),
  ]);
  await host.apply(presetOf('t/p', ['t/a', 't/b']));
  assert.deepEqual(calls, ['data/x.json', 'data/y.json']);
  assert.equal(got[0], got[1], 'same parsed object');
  assert.deepEqual(assets.report().find((r) => r.path === 'data/x.json')?.owners.sort(), ['t/a', 't/b']);
  assert.equal(assets.progress.loaded, 2);
  assert.ok(assets.peek('data/y.json'));
  host.stop();
  assert.deepEqual(assets.report(), []);
  assert.equal(assets.peek('data/x.json'), undefined);
  await assert.rejects(() => assets.bytes({ scope: undefined } as unknown as SessionContext, '../secret'), /relative/);
});

test('a failed load is reported and retried on the next request', async () => {
  let fail = true;
  const assets = createAssetService({ load: async () => { if (fail) throw new Error('offline'); return new Uint8Array([1]); } });
  let ctxRef: SessionContext | undefined;
  const host = hostWith(assets, [codePlugin('t/a', { activate(ctx) { ctxRef = ctx; } }, { sdk: '^3.0.0' })]);
  await host.apply(presetOf('t/p', ['t/a']));
  await assert.rejects(() => assets.bytes(ctxRef!, 'a.bin'), /offline/);
  assert.equal(assets.progress.failed, 1);
  fail = false;
  assert.deepEqual([...(await assets.bytes(ctxRef!, 'a.bin'))], [1]);
  assert.equal(assets.progress.failed, 0);
  host.stop();
});

test('manifest preloads finish before activate, so peek() is synchronous there; a missing file fails activation', async () => {
  const assets = createAssetService();
  let size = -1;
  const host = hostWith(assets, [codePlugin('t/a', { activate() { size = assets.peek(LEVEL)?.byteLength ?? -1; } }, { sdk: '^3.0.0', preload: [LEVEL] })]);
  await host.apply(presetOf('t/p', ['t/a']));
  assert.ok(size > 1000, `preloaded ${size} bytes`);
  host.stop();
  const broken = hostWith(createAssetService(), [codePlugin('t/b', {}, { sdk: '^3.0.0', preload: ['models/missing.glb'] })]);
  await assert.rejects(() => broken.apply(presetOf('t/p', ['t/b'])), /preload failed for t\/b/);
});

test('parseGltf reads GLB and glTF JSON; gltfNodes keeps the hierarchy and dequantises bounds', () => {
  const src = parseGltf(file('assets/levels/sandbox-props.glb'));
  const opt = parseGltf(file(`public/${LEVEL}`));
  assert.ok(opt.json.extensionsUsed?.includes('EXT_meshopt_compression'));
  const names = (d: typeof src): string[] => gltfNodes(d).map((n) => n.name);
  assert.deepEqual(names(opt), names(src));
  const ramp = (d: typeof src) => gltfNodes(d).find((n) => n.name === 'Ramp')!;
  const ext = (d: typeof src) => { const r = ramp(d); return [0, 1, 2].map((i) => (['x', 'y', 'z'] as const).map((k) => (r.bounds!.max[k] - r.bounds!.min[k]) * r.pose.scale[k])[i]!); };
  ext(src).forEach((v, i) => assert.ok(near(v, ext(opt)[i]!), `ramp extent ${i}: ${v} vs ${ext(opt)[i]}`));
  const bulb = gltfNodes(src).find((n) => n.name === 'Lamp.Bulb')!;
  assert.equal(gltfNodes(src).find((n) => n.index === bulb.parent)?.name, 'Lamp');
  assert.ok(!gltfNodes(opt).some((n) => /^node\d+$/.test(n.name)), 'mesh carriers are folded into their parent');
  const json = parseGltf(new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, nodes: [{ name: 'A' }] })));
  assert.deepEqual(gltfNodes(json).map((n) => n.name), ['A']);
  assert.throws(() => parseGltf(new TextEncoder().encode('{"x":1}')), /not a glTF/);
});

test('decomposeMatrix recovers translation, rotation and scale', () => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 0.2)), new THREE.Vector3(2, 0.5, 3));
  const p = decomposeMatrix(m.elements);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 0.2));
  assert.ok(near(p.position.x, 1) && near(p.position.y, 2) && near(p.position.z, 3));
  assert.ok(near(p.scale.x, 2) && near(p.scale.y, 0.5) && near(p.scale.z, 3));
  assert.ok(near(Math.abs(p.rotation.x * q.x + p.rotation.y * q.y + p.rotation.z * q.z + p.rotation.w * q.w), 1, 1e-6));
});

test('spawnGltfScene maps node custom properties (Blender extras) to transforms, renderables, physics and components', async () => {
  const assets = createAssetService();
  let spawned: SpawnedGltfScene | undefined;
  const seen: string[] = [];
  const host = hostWith(assets, [codePlugin('t/level', {
    register(ctx) { ctx.register(GltfExtras, 'sandbox/glow', { description: 'test mapper', apply: (_c, e, v) => { seen.push(`${e}:${JSON.stringify(v)}`); } }); },
    async activate(ctx) { spawned = await spawnGltfScene(ctx, LEVEL); },
  }, { sdk: '^3.0.0' })]);
  const session = await host.apply(presetOf('t/p', ['t/level']));
  const s = spawned!;
  const w = session.entities;
  const e = (n: string): number => s.byName.get(n)!;
  // Ramp: fixed body + box collider sized from the (dequantised) mesh, root entity in world space.
  assert.equal(w.get(e('Ramp'), RigidBody)?.type, 'fixed');
  const rc = w.get(e('Ramp'), PhysicsCollider)!;
  assert.equal(rc.shape, 'box');
  assert.ok(near(rc.size!.x, 4) && near(rc.size!.y, 0.4) && near(rc.size!.z, 6), JSON.stringify(rc.size));
  assert.equal(rc.friction, 0.9);
  assert.equal(w.get(e('Ramp'), Transform3D)?.parent, undefined);
  assert.match(w.get(e('Ramp'), Renderable)!.model!, /^models\/levels\/sandbox-props\.glb#\d+$/);
  // Barrels: dynamic cylinders.
  for (const b of ['Barrel.001', 'Barrel.002', 'Barrel.003']) {
    assert.equal(w.get(e(b), RigidBody)?.type, 'dynamic');
    const c = w.get(e(b), PhysicsCollider)!;
    assert.ok(c.shape === 'cylinder' && near(c.size!.x, 0.8) && near(c.size!.y, 1.2) && c.density === 0.4, JSON.stringify(c));
  }
  // Collider without body -> fixed root body; its child stays parented and keeps its world position.
  assert.equal(w.get(e('Lamp'), RigidBody)?.type, 'fixed');
  assert.ok(near(w.get(e('Lamp'), PhysicsCollider)!.size!.y, 3));
  assert.equal(w.get(e('Lamp.Bulb'), Transform3D)?.parent, e('Lamp'));
  const bulb = worldPose(w, e('Lamp.Bulb'))!;
  assert.ok(near(bulb.position.x, -11) && near(bulb.position.y, 3.2) && near(bulb.position.z, -11), JSON.stringify(bulb.position));
  // Registered mapper handles its key; "namespace/name" keys and the `components` map become components.
  assert.deepEqual(seen, [`${e('Lamp.Bulb')}:{"intensity":2}`]);
  const goal = e('Goal');
  assert.equal(w.get(goal, PhysicsCollider)?.sensor, true);
  assert.equal(w.has(goal, Renderable), false, 'renderable: false');
  assert.deepEqual(w.get(goal, { id: 'sandbox/goal' }), {});
  assert.deepEqual(w.get(e('Spawn'), { id: 'sandbox/spawn-point' }), { facing: 0 });
  assert.deepEqual(s.unknownExtras, []);
  host.stop();
});

test('std/assets Models: whole scenes and single glTF nodes (Meshopt-compressed) instance headlessly', async () => {
  const assets = createAssetService();
  let ctxRef: SessionContext | undefined;
  const host = hostWith(assets, [real('packages/std/plugins/std-assets'), codePlugin('t/use', { activate(ctx) { ctxRef = ctx; } }, { sdk: '^3.0.0', dependencies: { 'std/assets': '^1.0.0' } })]);
  const session = await host.apply(presetOf('t/p', ['std/assets', 't/use']));
  const models = session.services.get(Models);
  const rifle = await models.instance(ctxRef!, 'models/weapons/assault_rifle.glb');
  let meshes = 0, tris = 0;
  rifle.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; tris += (m.geometry.index?.count ?? 0) / 3; } });
  assert.ok(meshes > 0 && tris > 100, `${meshes} meshes, ${tris} triangles`);
  const doc = parseGltf(assets.peek(LEVEL) ?? file(`public/${LEVEL}`));
  const lamp = gltfNodes(doc).find((n) => n.name === 'Lamp')!;
  const one = await models.instance(ctxRef!, `${LEVEL}#${lamp.index}`);
  const names: string[] = [];
  one.traverse((o) => names.push(o.name));
  assert.ok(!names.includes('Lamp.Bulb'), `child nodes are not cloned (${names.join(', ')})`);
  let hasMesh = false;
  one.traverse((o) => { if ((o as THREE.Mesh).isMesh) hasMesh = true; });
  assert.ok(hasMesh, 'the lamp post mesh (moved to an anonymous carrier node by quantisation) is kept');
  assert.equal(one.position.length(), 0, 'the instance is unposed; render sync poses it');
  await assert.rejects(() => models.instance(ctxRef!, `${LEVEL}#999`), /no node "999"/);
  host.stop();
});

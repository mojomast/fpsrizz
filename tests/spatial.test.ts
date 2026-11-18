import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../src/platform/render/mini3/index.ts';
import { PluginHost } from '../src/kernel/host.ts';
import type { CatalogEntry, SessionContext } from '../src/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION, PrevTransform, Renderable, Transform3D, composePose, interpolatePose, quatFromEuler, rotateVec3, slerp, snapTransform, transform3d, worldPose } from '../src/sdk/index.ts';
import type { Pose, Quat, Vec3 } from '../src/sdk/index.ts';
import { Models, Render, RenderablePrefabs } from '../src/sdk/render.ts';
import type { RenderService } from '../src/sdk/render.ts';
import { codePlugin, presetOf } from './helpers/host.ts';

const close = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const closeV = (a: Vec3, b: Vec3, eps = 1e-9): void => { close(a.x, b.x, eps); close(a.y, b.y, eps); close(a.z, b.z, eps); };
const closeQ = (a: Quat, b: Quat, eps = 1e-9): void => {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  close(a.x, sign * b.x, eps); close(a.y, sign * b.y, eps); close(a.z, sign * b.z, eps); close(a.w, sign * b.w, eps);
};
const real = (dir: string): CatalogEntry => ({
  manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8") as string),
  load: () => import(`../${dir}/index.ts`),
});

test('quatFromEuler matches Three.js YXZ Euler order', () => {
  for (const [yaw, pitch, roll] of [[0.3, -0.2, 0.1], [Math.PI, 0.5, 0], [-1.2, 1.1, -2]] as const) {
    const ours = quatFromEuler(yaw, pitch, roll);
    const three = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    closeQ(ours, { x: three.x, y: three.y, z: three.z, w: three.w });
    const v = rotateVec3(ours, { x: 1, y: 2, z: 3 }), tv = new THREE.Vector3(1, 2, 3).applyQuaternion(three);
    closeV(v, { x: tv.x, y: tv.y, z: tv.z });
  }
});

test('composePose matches Three.js matrix composition; slerp hits its endpoints', () => {
  const parent: Pose = { position: { x: 1, y: 2, z: 3 }, rotation: quatFromEuler(0.7, 0.2), scale: { x: 2, y: 2, z: 2 } };
  const child: Pose = { position: { x: 0, y: 1, z: -1 }, rotation: quatFromEuler(-0.3), scale: { x: 1, y: 1, z: 1 } };
  const m = (p: Pose) => new THREE.Matrix4().compose(new THREE.Vector3(p.position.x, p.position.y, p.position.z), new THREE.Quaternion(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w), new THREE.Vector3(p.scale.x, p.scale.y, p.scale.z));
  const world = m(parent).multiply(m(child));
  const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3();
  world.decompose(pos, rot, scl);
  const ours = composePose(parent, child);
  closeV(ours.position, { x: pos.x, y: pos.y, z: pos.z }, 1e-6);
  closeQ(ours.rotation, { x: rot.x, y: rot.y, z: rot.z, w: rot.w }, 1e-6);
  const a = quatFromEuler(0), b = quatFromEuler(2);
  closeQ(slerp(a, b, 0), a); closeQ(slerp(a, b, 1), b); closeQ(slerp(a, b, 0.5), quatFromEuler(1));
  const mid = interpolatePose(transform3d(), transform3d({ position: { x: 10 } }), 0.25);
  close(mid.position.x, 2.5);
});

test('worldPose resolves parents (ignoring cycles) and interpolates each link with alpha', () => {
  const store = new Map<string, unknown>();
  const world = { get: (e: number, t: { id: string }) => store.get(`${e}:${t.id}`) as never };
  const set = (e: number, t: { id: string }, v: unknown): void => void store.set(`${e}:${t.id}`, v);
  set(1, Transform3D, transform3d({ position: { x: 10 } }));
  set(1, PrevTransform, transform3d({ position: { x: 0 } }));
  set(2, Transform3D, transform3d({ position: { y: 1 }, parent: 1 }));
  closeV(worldPose(world, 2)!.position, { x: 10, y: 1, z: 0 });
  closeV(worldPose(world, 2, 0.5)!.position, { x: 5, y: 1, z: 0 });
  set(1, Transform3D, transform3d({ position: { x: 10 }, parent: 2 })); // cycle 1 <-> 2
  assert.ok(worldPose(world, 2));
  assert.equal(worldPose(world, 99), undefined);
});

test('std/transform keeps PrevTransform one tick behind Transform3D; snapTransform skips interpolation', async () => {
  let ent = 0;
  const mover = codePlugin('test/mover', {
    activate(ctx) {
      ent = ctx.world.create();
      ctx.world.add(ent, Transform3D, transform3d());
      ctx.systems.add({ id: 'test/move', phase: 'movement', update: () => { ctx.world.get(ent, Transform3D)!.position.x += 1; } });
    },
  }, { sdk: '^3.0.0' });
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([real('src/plugins/std-transform'), mover]);
  const session = await host.apply(presetOf('test/p', ['std/transform', 'test/mover']));
  session.scheduler.runTick();
  session.scheduler.runTick();
  assert.equal(session.entities.get(ent, Transform3D)!.position.x, 2);
  assert.equal(session.entities.get(ent, PrevTransform)!.position.x, 1);
  session.entities.get(ent, Transform3D)!.position.x = 50;
  snapTransform(session.entities, ent);
  assert.equal(session.entities.get(ent, PrevTransform)!.position.x, 50);
  host.stop();
});

function fakeRender(): { service: RenderService; scene: THREE.Group } {
  const scene = new THREE.Group();
  const cache = new Map<string, unknown>();
  const service = {
    createRoot: (ctx: SessionContext) => { const g = new THREE.Group(); scene.add(g); ctx.scope.add(() => g.removeFromParent(), 'root'); return g; },
    shared: (_ctx: SessionContext, key: string, create: () => unknown) => { if (!cache.has(key)) cache.set(key, create()); return cache.get(key); },
    own: (_ctx: SessionContext, r: unknown) => r,
  } as unknown as RenderService;
  return { service, scene };
}

test('std/render-sync draws shapes, prefabs and models, interpolates with alpha and cleans up', async () => {
  const { service, scene } = fakeRender();
  let a = 0, b = 0, c = 0, d = 0, disposed = 0;
  let resolveModel: (o: THREE.Object3D) => void = () => {};
  const game = codePlugin('test/scene', {
    register(ctx) {
      ctx.register(RenderablePrefabs, 'test/marker', { description: 'marker', create: () => ({ object: new THREE.Object3D(), dispose: () => void disposed++ }) });
    },
    activate(ctx) {
      ctx.services.provide(Models, { instance: () => new Promise((r) => { resolveModel = r; }) });
      a = ctx.world.create(); ctx.world.add(a, Transform3D, transform3d()); ctx.world.add(a, Renderable, { shape: 'sphere', color: 0xff0000 });
      b = ctx.world.create(); ctx.world.add(b, Transform3D, transform3d({ position: { y: 2 }, parent: a })); ctx.world.add(b, Renderable, { prefab: 'test/marker' });
      c = ctx.world.create(); ctx.world.add(c, Transform3D, transform3d()); ctx.world.add(c, Renderable, { model: 'models/crate.glb' });
      d = ctx.world.create(); ctx.world.add(d, Transform3D, transform3d()); ctx.world.add(d, Renderable, { prefab: 'test/missing' });
      ctx.systems.add({ id: 'test/move', phase: 'movement', update: () => { ctx.world.get(a, Transform3D)!.position.x += 4; } });
    },
  }, { sdk: '^3.0.0' });
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) { session.services.provide(Render, service, 'host', scope); } });
  host.setCatalog([real('src/plugins/std-transform'), real('src/plugins/std-render-sync'), game]);
  const session = await host.apply(presetOf('test/p', ['std/transform', 'std/render-sync', 'test/scene']));
  session.scheduler.runTick();            // prev x 0 -> x 4
  session.scheduler.runFrame(0.5, 0);
  const root = scene.children[0]!;
  assert.equal(root.children.length, 4);
  const sphereOf = (): THREE.Object3D => root.children.find((o) => (o as THREE.Mesh).geometry instanceof THREE.SphereGeometry)!;
  const sphere = sphereOf();
  assert.equal(sphere.position.x, 2, 'interpolated halfway between ticks');
  session.scheduler.runFrame(1, 0);
  assert.equal(sphere.position.x, 4);
  const marker = root.children.find((o) => !(o instanceof THREE.Mesh) && !(o instanceof THREE.Group))!;
  assert.deepEqual([marker.position.x, marker.position.y], [4, 2], 'child posed through its parent');
  // Model: placeholder now, the loaded object once the service resolves.
  const modelGroup = root.children.find((o) => o instanceof THREE.Group)!;
  assert.equal(modelGroup.children.length, 1);
  const loaded = new THREE.Object3D(); loaded.name = 'crate';
  resolveModel(loaded); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(modelGroup.children.map((o) => o.name), ['crate']);
  // Transform-only change keeps the object; a Renderable change rebuilds it; removal drops it.
  session.entities.markChanged(a, Transform3D); session.scheduler.runFrame(1, 0);
  assert.equal(sphereOf(), sphere);
  session.entities.add(a, Renderable, { shape: 'sphere', color: 0x00ff00 }); session.scheduler.runFrame(1, 0);
  assert.notEqual(sphereOf(), sphere);
  assert.equal(sphere.parent, null);
  session.entities.add(a, Renderable, { shape: 'sphere', visible: false }); session.scheduler.runFrame(1, 0);
  assert.equal(sphereOf().visible, false);
  session.entities.destroy(d); session.entities.flush(); session.scheduler.runFrame(1, 0);
  assert.equal(root.children.length, 3);
  host.stop();
  assert.equal(root.parent, null, 'root detached with the plugin scope');
  assert.equal(disposed, 1, 'prefab dispose ran');
  void b; void c;
});

test('shooter/transform3d mirrors the planar Transform into Transform3D and PrevTransform', async () => {
  const { Transform } = await import('../src/sdk/index.ts');
  let e = 0;
  const planar = codePlugin('test/planar', {
    activate(ctx) {
      e = ctx.world.create();
      ctx.world.add(e, Transform, { x: 1, z: 2, yaw: 0.5, prevX: 1, prevZ: 2, prevYaw: 0.5 });
      ctx.systems.add({ id: 'test/walk', phase: 'movement', update: () => { const t = ctx.world.get(e, Transform)!; t.prevX = t.x; t.x += 1; } });
    },
  });
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([real('games/shooter/plugins/shooter-transform3d'), planar]);
  const session = await host.apply(presetOf('test/p', ['shooter/transform3d', 'test/planar']));
  session.scheduler.runTick();
  const t = session.entities.get(e, Transform3D)!, prev = session.entities.get(e, PrevTransform)!;
  assert.deepEqual([t.position.x, t.position.z, prev.position.x], [2, 2, 1]);
  closeQ(t.rotation, quatFromEuler(0.5));
  host.stop();
});

test('std/render-sync also draws entities created by plugins that activated before it', async () => {
  const { service, scene } = fakeRender();
  const early = codePlugin('a-test/early', { activate(ctx) { const e = ctx.world.create(); ctx.world.add(e, Transform3D, transform3d()); ctx.world.add(e, Renderable, { shape: 'box' }); } }, { sdk: '^3.0.0' });
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) { session.services.provide(Render, service, 'host', scope); } });
  host.setCatalog([early, real('src/plugins/std-transform'), real('src/plugins/std-render-sync')]);
  const session = await host.apply(presetOf('test/p', ['a-test/early', 'std/transform', 'std/render-sync']));
  assert.equal(session.order[0], 'a-test/early', 'the entity owner activates first');
  session.scheduler.runFrame(0, 0);
  assert.equal(scene.children[0]!.children.length, 1);
  host.stop();
});

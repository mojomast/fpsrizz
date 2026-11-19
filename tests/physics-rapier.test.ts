import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry, SessionContext } from '@bulkhead/kernel/host.ts';
import { CharacterController, CharacterMove, CharacterState, PHASES, Physics, PhysicsCollider, PhysicsCollision, RigidBody, SDK_COMPAT, SDK_VERSION, Transform3D, transform3d } from '@bulkhead/sdk';
import type { PhysicsCollisionEvent } from '@bulkhead/sdk';
import { codePlugin, presetOf } from './helpers/host.ts';

const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../${dir}/index.ts`) });

async function scene(setup: (ctx: SessionContext) => void) {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([real('packages/std/plugins/std-transform'), real('packages/std/plugins/std-physics-rapier'), codePlugin('test/scene', { activate: setup }, { sdk: '^3.0.0' })]);
  const session = await host.apply(presetOf('test/p', ['std/transform', 'std/physics-rapier', 'test/scene']));
  return { host, session, ticks: (n: number) => { for (let i = 0; i < n; i++) session.scheduler.runTick(); } };
}
const ground = (ctx: SessionContext): number => {
  const g = ctx.world.create();
  ctx.world.add(g, Transform3D, transform3d({ position: { y: -0.5 } }));
  ctx.world.add(g, RigidBody, { type: 'fixed' });
  ctx.world.add(g, PhysicsCollider, { shape: 'box', size: { x: 40, y: 1, z: 40 } });
  return g;
};

test('a dynamic box falls under gravity and comes to rest on fixed ground', async () => {
  let box = 0;
  const { host, session, ticks } = await scene((ctx) => {
    ground(ctx);
    box = ctx.world.create();
    ctx.world.add(box, Transform3D, transform3d({ position: { y: 5 } }));
    ctx.world.add(box, RigidBody, { type: 'dynamic' });
    ctx.world.add(box, PhysicsCollider, { shape: 'box' });
  });
  ticks(30);
  const mid = session.entities.get(box, Transform3D)!.position.y;
  assert.ok(mid < 5 && mid > 0.5, `falling (${mid})`);
  ticks(240);
  const y = session.entities.get(box, Transform3D)!.position.y;
  assert.ok(Math.abs(y - 0.5) < 0.02, `resting on the ground at y≈0.5 (${y})`);
  assert.deepEqual(session.services.get(Physics).stats(), { bodies: 2, colliders: 2 });
  host.stop();
});

test('identical runs are bit-identical (locally deterministic)', async () => {
  const run = async () => {
    const ids: number[] = [];
    const { host, session, ticks } = await scene((ctx) => {
      ground(ctx);
      for (let i = 0; i < 6; i++) {
        const e = ctx.world.create(); ids.push(e);
        ctx.world.add(e, Transform3D, transform3d({ position: { x: (i % 3) * 0.4, y: 1 + i * 1.1, z: (i % 2) * 0.3 }, yaw: i }));
        ctx.world.add(e, RigidBody, { type: 'dynamic' });
        ctx.world.add(e, PhysicsCollider, { shape: i % 2 ? 'ball' : 'box', restitution: 0.3 });
      }
    });
    ticks(180);
    const out = JSON.stringify(ids.map((e) => session.entities.get(e, Transform3D)));
    host.stop();
    return out;
  };
  assert.equal(await run(), await run());
});

test('character controller walks, stays grounded, is blocked by walls and fires sensor events', async () => {
  let hero = 0, wall = 0, zone = 0;
  const events: PhysicsCollisionEvent[] = [];
  const { host, session, ticks } = await scene((ctx) => {
    ground(ctx);
    hero = ctx.world.create();
    ctx.world.add(hero, Transform3D, transform3d({ position: { y: 1.0 } })); // spawn just above the ground, never in contact
    ctx.world.add(hero, RigidBody, { type: 'kinematic' });
    ctx.world.add(hero, PhysicsCollider, { shape: 'capsule', size: { x: 0.6, y: 1.8, z: 0.6 } });
    ctx.world.add(hero, CharacterController, {});
    ctx.world.add(hero, CharacterMove, { desired: { x: 0, y: 0, z: 0 } });
    wall = ctx.world.create();
    ctx.world.add(wall, Transform3D, transform3d({ position: { x: 5, y: 1 } }));
    ctx.world.add(wall, RigidBody, { type: 'fixed' });
    ctx.world.add(wall, PhysicsCollider, { shape: 'box', size: { x: 1, y: 2, z: 4 } });
    zone = ctx.world.create();
    ctx.world.add(zone, Transform3D, transform3d({ position: { x: 2, y: 1 } }));
    ctx.world.add(zone, RigidBody, { type: 'fixed' });
    ctx.world.add(zone, PhysicsCollider, { shape: 'box', size: { x: 1, y: 2, z: 2 }, sensor: true });
    ctx.events.on(PhysicsCollision, (e) => void events.push(e));
    ctx.systems.add({ id: 'test/walk', phase: 'control', update: () => {
      const m = ctx.world.get(hero, CharacterMove)!; m.desired = { x: 4 / 60, y: -9.81 / 60, z: 0 };
    } });
  });
  ticks(150); // 10 m of intent over 2.5 s
  const t = session.entities.get(hero, Transform3D)!;
  assert.ok(t.position.x > 4 && t.position.x < 4.3, `stopped by the wall face at x≈4.2 (${t.position.x})`);
  assert.ok(Math.abs(t.position.y - 0.92) < 0.03, `resting on the ground at 0.9 + skin offset (${t.position.y})`);
  assert.equal(session.entities.get(hero, CharacterState)!.grounded, true);
  const sensorHits = events.filter((e) => e.sensor && [e.a, e.b].includes(zone) && [e.a, e.b].includes(hero));
  assert.deepEqual(sensorHits.map((e) => e.started), [true, false], 'entered and left the trigger');
  void wall;
  host.stop();
});

test('raycast, impulses, teleport and removal', async () => {
  let box = 0;
  const { host, session, ticks } = await scene((ctx) => {
    ground(ctx);
    box = ctx.world.create();
    ctx.world.add(box, Transform3D, transform3d({ position: { x: 0, y: 0.5, z: -5 } }));
    ctx.world.add(box, RigidBody, { type: 'dynamic', gravityScale: 0 });
    ctx.world.add(box, PhysicsCollider, { shape: 'box' });
  });
  const physics = session.services.get(Physics);
  const hit = physics.raycast({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: -2 }, 20)!;
  assert.equal(hit.entity, box);
  assert.ok(Math.abs(hit.distance - 4.5) < 1e-4);
  assert.ok(Math.abs(hit.normal.z - 1) < 1e-4);
  assert.equal(physics.raycast({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, 20), undefined);
  physics.applyImpulse(box, { x: 0, y: 0, z: -1 });
  ticks(1);
  assert.ok(physics.linearVelocity(box)!.z < 0);
  physics.teleport(box, { x: 10, y: 3, z: 0 });
  ticks(1);
  assert.ok(Math.abs(session.entities.get(box, Transform3D)!.position.x - 10) < 0.1);
  session.entities.destroy(box); session.entities.flush();
  ticks(1);
  assert.equal(physics.stats().bodies, 1);
  host.stop();
});

test('bodies created by plugins that activated before physics are simulated', async () => {
  let box = 0;
  const early = codePlugin('a-test/early', { activate(ctx) { box = ctx.world.create(); ctx.world.add(box, Transform3D, transform3d({ position: { y: 3 } })); ctx.world.add(box, RigidBody, { type: 'dynamic' }); ctx.world.add(box, PhysicsCollider, { shape: 'ball' }); } }, { sdk: '^3.0.0' });
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([early, real('packages/std/plugins/std-transform'), real('packages/std/plugins/std-physics-rapier')]);
  const session = await host.apply(presetOf('test/p', ['a-test/early', 'std/transform', 'std/physics-rapier']));
  for (let i = 0; i < 30; i++) session.scheduler.runTick();
  assert.ok(session.entities.get(box, Transform3D)!.position.y < 2.5);
  host.stop();
});

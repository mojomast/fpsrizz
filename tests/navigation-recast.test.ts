import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry, SessionContext } from '@bulkhead/kernel/host.ts';
import { NavAgent, NavAgentState, NavMesh, NavMeshBuilt, PHASES, PhysicsCollider, RigidBody, SDK_COMPAT, SDK_VERSION, Transform3D, appendBox, navGeometryFromColliders, quatFromEuler, transform3d } from '@bulkhead/sdk';
import type { NavGeometry, NavMeshInfo, Vec3 } from '@bulkhead/sdk';
import { codePlugin, presetOf } from './helpers/host.ts';

const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../${dir}/index.ts`) });

async function scene(setup: (ctx: SessionContext) => void, config: Record<string, unknown> = {}) {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  assert.deepEqual(host.setCatalog([real('packages/std/plugins/std-transform'), real('packages/std/plugins/std-navigation-recast'), codePlugin('test/scene', { activate: setup }, { sdk: '^3.0.0' })]), []);
  const session = await host.apply(presetOf('test/p', ['std/transform', 'std/navigation-recast', 'test/scene'], { config: { 'std/navigation-recast': config } }));
  return { host, session, nav: session.services.get(NavMesh), ticks: (n: number) => { for (let i = 0; i < n; i++) session.scheduler.runTick(); } };
}
const box = (ctx: SessionContext, position: Partial<Vec3>, size: Vec3, opts: { yaw?: number; pitch?: number; type?: 'fixed' | 'dynamic'; sensor?: boolean } = {}): number => {
  const e = ctx.world.create();
  ctx.world.add(e, Transform3D, transform3d({ position, rotation: quatFromEuler(opts.yaw ?? 0, opts.pitch ?? 0) }));
  if (opts.type) ctx.world.add(e, RigidBody, { type: opts.type });
  ctx.world.add(e, PhysicsCollider, { shape: 'box', size, ...(opts.sensor ? { sensor: true } : {}) });
  return e;
};
/** A 20x20 floor split by a wall along x = 0 with a gap at z ∈ [6, 10] (go around), plus a raised deck reached by a ramp. */
const level = (ctx: SessionContext): void => {
  box(ctx, { y: -0.5 }, { x: 20, y: 1, z: 20 }, { type: 'fixed' });
  box(ctx, { x: 0, y: 1, z: -2 }, { x: 0.5, y: 2, z: 16 }, { type: 'fixed' });
  box(ctx, { x: 4, y: 0.5, z: -3 }, { x: 1, y: 1, z: 1 }, { type: 'dynamic' }); // a crate: left out of the navmesh
  box(ctx, { x: -4, y: 0.5, z: 3 }, { x: 2, y: 1, z: 2 }, { sensor: true }); // a trigger: left out too
};
const len = (p: Vec3[]): number => p.slice(1).reduce((s, v, i) => s + Math.hypot(v.x - p[i]!.x, v.z - p[i]!.z), 0);

test('navGeometryFromColliders: posed boxes become 12 triangles each; sensors and dynamic bodies are skipped', async () => {
  const g: NavGeometry = { positions: [], indices: [] };
  appendBox(g, { position: { x: 1, y: 0, z: 0 }, rotation: quatFromEuler(Math.PI / 2), scale: { x: 1, y: 1, z: 1 } }, { x: 4, y: 2, z: 2 });
  assert.equal(g.indices.length, 36);
  const xs = g.positions.filter((_, i) => i % 3 === 0), zs = g.positions.filter((_, i) => i % 3 === 2);
  assert.ok(Math.abs(Math.max(...xs) - 2) < 1e-9 && Math.abs(Math.max(...zs) - 2) < 1e-9, 'a 90° yaw swaps the 4 m side onto z');
  const { host, session } = await scene(level, { autoBuild: false });
  const ids = session.entities.query({ with: [Transform3D, PhysicsCollider] }).ids();
  assert.equal(navGeometryFromColliders(session.entities, ids).indices.length, 2 * 36, 'floor + wall only');
  host.stop();
});

test('std/navigation-recast builds from colliders on the first tick and paths around walls', async () => {
  const built: NavMeshInfo[] = [];
  const { host, nav, ticks } = await scene((ctx) => { level(ctx); ctx.events.on(NavMeshBuilt, (i) => built.push(i)); });
  assert.equal(nav.info(), undefined, 'nothing built before the first tick');
  ticks(1);
  assert.equal(built.length, 1);
  const info = nav.info()!;
  assert.equal(info.source, 'colliders');
  assert.equal(info.triangles, 24);
  assert.ok(info.navTriangles > 4, `navmesh has polygons (${info.navTriangles})`);
  const path = nav.findPath({ x: -5, y: 0, z: -6 }, { x: 5, y: 0, z: -6 })!;
  assert.ok(path, 'reachable through the gap');
  assert.ok(path.length >= 3, `goes around the wall (${path.length} corners)`);
  assert.ok(path.some((p) => p.z > 5.5), 'via the gap at z ≥ 6');
  assert.ok(len(path) > 20, `longer than the straight 10 m (${len(path).toFixed(1)} m)`);
  assert.ok(nav.findPath({ x: -5, y: 0, z: -6 }, { x: 5, y: 0, z: 30 }) === undefined, 'off-mesh target is unreachable');
  const c = nav.closestPoint({ x: 0, y: 1, z: -2 })!;
  assert.ok(Math.abs(c.x) > 0.6, `closest point is pushed off the wall by the agent radius (${c.x.toFixed(2)})`);
  assert.ok(nav.debugTriangles().length === info.navTriangles);
  host.stop();
});

test('a ramp (non-grid, rotated collider) connects the floor to a raised deck', async () => {
  const deckY = 1.5;
  let ramp = 0;
  const { host, session, nav, ticks } = await scene((ctx) => {
    box(ctx, { y: -0.5 }, { x: 20, y: 1, z: 20 }, { type: 'fixed' });
    box(ctx, { x: 6, y: deckY - 0.25, z: 0 }, { x: 6, y: 0.5, z: 6 }, { type: 'fixed' }); // deck top at y = 1.5
    const run = 4, angle = Math.atan2(deckY, run);
    box(ctx, { x: 3 - run / 2 + 0.01, y: deckY / 2 - 0.2, z: 0 }, { x: Math.hypot(run, deckY) + 0.2, y: 0.4, z: 2 }, { type: 'fixed' });
    // Tilt the ramp around z: a quaternion for roll.
    ramp = Math.max(...ctx.world.query({ with: [PhysicsCollider] }).ids());
    ctx.world.get(ramp, Transform3D)!.rotation = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
  });
  ticks(1);
  const path = nav.findPath({ x: -6, y: 0, z: 0 }, { x: 7, y: deckY, z: 1 })!;
  assert.ok(path, 'deck reachable');
  assert.ok(Math.abs(path.at(-1)!.y - deckY) < 0.3, `ends on the deck (${path.at(-1)!.y.toFixed(2)})`);
  session.entities.remove(ramp, PhysicsCollider);
  nav.build();
  assert.equal(nav.findPath({ x: -6, y: 0, z: 0 }, { x: 7, y: deckY, z: 1 }), undefined, 'without the ramp the 1.5 m deck is out of reach');
  host.stop();
});

test('NavAgent walks its entity to the target, reports status, and stops when the target is cleared', async () => {
  let agent = 0;
  const { host, session, ticks } = await scene((ctx) => {
    level(ctx);
    agent = ctx.world.create();
    ctx.world.add(agent, Transform3D, transform3d({ position: { x: -5, y: 0, z: -6 } }));
    ctx.world.add(agent, NavAgent, { target: { x: 5, y: 0, z: -6 }, speed: 6 });
  });
  ticks(2);
  assert.equal(session.entities.get(agent, NavAgentState)!.status, 'moving');
  ticks(60 * 8);
  const st = session.entities.get(agent, NavAgentState)!;
  const p = session.entities.get(agent, Transform3D)!.position;
  assert.equal(st.status, 'arrived');
  assert.ok(Math.hypot(p.x - 5, p.z + 6) < 0.25, `at the target (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  session.entities.get(agent, NavAgent)!.target = { x: 5, y: 0, z: 40 };
  ticks(2);
  assert.equal(session.entities.get(agent, NavAgentState)!.status, 'unreachable');
  delete session.entities.get(agent, NavAgent)!.target;
  ticks(1);
  assert.equal(session.entities.get(agent, NavAgentState)!.status, 'idle');
  host.stop();
});

test('build() accepts explicit triangles and replaces the navmesh deterministically', async () => {
  const { host, nav, ticks } = await scene(() => {}, { autoBuild: false });
  ticks(3);
  assert.equal(nav.info(), undefined, 'autoBuild: false waits for build()');
  const g: NavGeometry = { positions: [-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10], indices: [0, 2, 1, 0, 3, 2] };
  const a = nav.build(g);
  const pa = nav.findPath({ x: -8, y: 0, z: -8 }, { x: 8, y: 0, z: 8 });
  const b = nav.build(g);
  assert.equal(a.source, 'geometry');
  assert.equal(a.navTriangles, b.navTriangles);
  assert.deepEqual(nav.findPath({ x: -8, y: 0, z: -8 }, { x: 8, y: 0, z: 8 }), pa);
  assert.throws(() => nav.build({ positions: [], indices: [] }), /navmesh build failed/);
  host.stop();
});

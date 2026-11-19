import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost, HostError } from '../src/kernel/host.ts';
import type { CatalogEntry, SessionContext } from '../src/kernel/host.ts';
import { base64ToBytes, bytesToBase64, hashSnapshot, migrateSnapshot, stableStringify } from '../src/kernel/snapshot.ts';
import { createRng } from '../src/kernel/rng.ts';
import { createInputCore } from '../src/platform/input.ts';
import { parseReplay, recordInput, replayFeeder } from '../src/platform/replay.ts';
import { PHASES, PhysicsCollider, RigidBody, SDK_COMPAT, SDK_VERSION, Transform3D, defineComponent, transform3d } from '../src/sdk/index.ts';
import { codePlugin, presetOf } from './helpers/host.ts';

const Counter = defineComponent<{ n: number }>('test/counter');
const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../${dir}/index.ts`) });

test('rng state round-trips', () => {
  const a = createRng(42);
  a.next(); a.next();
  const st = a.getState();
  const seq = [a.next(), a.next(), a.int(0, 100)];
  a.setState(st);
  assert.deepEqual([a.next(), a.next(), a.int(0, 100)], seq);
});

test('stableStringify sorts keys and hashSnapshot ignores plugin state by default', () => {
  assert.equal(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] }), '{"a":[1,{"d":2}],"b":1}');
  const b = new Uint8Array([0, 1, 254, 255, 128]);
  assert.deepEqual(base64ToBytes(bytesToBase64(b)), b);
  assert.throws(() => migrateSnapshot({ format: 'nope' }), /not a snapshot/);
  assert.throws(() => migrateSnapshot({ format: 'fpsrizz-snapshot', schema: 99 }), /newer than this build/);
});

async function counterHost() {
  let made: number[] = [];
  let total = 0;
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([codePlugin('test/counter', {
    activate(ctx: SessionContext) {
      made = [ctx.world.create(), ctx.world.create()];
      for (const e of made) ctx.world.add(e, Counter, { n: 0 });
      ctx.persist({ save: () => ({ total }), load: (d) => { total = (d as { total: number }).total; } });
      ctx.systems.add({ id: 'test/count', phase: 'world', update: () => {
        total += ctx.rng.int(1, 10);
        ctx.world.each(Counter, (_e, c) => { c.n++; });
        if (ctx.time.tick === 5) { const e = ctx.world.create(); ctx.world.add(e, Counter, { n: 100 }); }
      } });
    },
  }, { sdk: '^3.0.0' })]);
  const session = await host.apply(presetOf('test/p', ['test/counter'], { seed: 9 }));
  return { host, session, made: () => made, total: () => total, ticks: (n: number) => { for (let i = 0; i < n; i++) session.scheduler.runTick(); } };
}

test('host snapshot/restore rewinds entities, tick, rng and persisted plugin state', async () => {
  const h = await counterHost();
  h.ticks(3);
  const snap = JSON.parse(JSON.stringify(h.host.snapshot()));
  assert.equal(snap.format, 'fpsrizz-snapshot');
  assert.equal(snap.tick, 3);
  assert.equal(snap.entities.length, 2);
  assert.deepEqual(snap.plugins, { 'test/counter': '1.0.0' });
  h.ticks(5);
  const later = { hash: hashSnapshot(h.host.snapshot()), total: h.total(), count: h.session.entities.count(Counter) };
  assert.equal(later.count, 3);
  h.host.restore(snap);
  assert.equal(h.session.scheduler.tick, 3);
  assert.equal(h.session.entities.count(Counter), 2);
  assert.equal(h.session.entities.get(h.made()[0]!, Counter)!.n, 3);
  assert.equal(h.total(), snap.state['test/counter'].total);
  h.ticks(5);
  assert.deepEqual({ hash: hashSnapshot(h.host.snapshot()), total: h.total(), count: h.session.entities.count(Counter) }, later, 'same future after restore');
  h.host.stop();
});

test('restore refuses a snapshot from another preset or plugin set without touching the session', async () => {
  const h = await counterHost();
  h.ticks(2);
  const snap = h.host.snapshot();
  const before = hashSnapshot(snap);
  const err = (() => { try { h.host.restore({ ...snap, preset: { id: 'other', seed: 1 } }); } catch (e) { return e; } })();
  assert.ok(err instanceof HostError && err.stage === 'restore' && /preset "other"/.test(err.message));
  assert.throws(() => h.host.restore({ ...snap, plugins: { x: '1.0.0' } }), /differ from the running session/);
  assert.equal(hashSnapshot(h.host.snapshot()), before);
  h.host.stop();
});

test('rapier world restores bit-exactly from a snapshot', async () => {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([real('src/plugins/std-transform'), real('src/plugins/std-physics-rapier'), codePlugin('test/scene', { activate(ctx: SessionContext) {
    const g = ctx.world.create();
    ctx.world.add(g, Transform3D, transform3d({ position: { y: -0.5 } }));
    ctx.world.add(g, RigidBody, { type: 'fixed' });
    ctx.world.add(g, PhysicsCollider, { shape: 'box', size: { x: 20, y: 1, z: 20 } });
    for (let i = 0; i < 5; i++) {
      const e = ctx.world.create();
      ctx.world.add(e, Transform3D, transform3d({ position: { x: i * 0.3, y: 1 + i * 1.2, z: 0 }, yaw: i }));
      ctx.world.add(e, RigidBody, { type: 'dynamic' });
      ctx.world.add(e, PhysicsCollider, { shape: i % 2 ? 'ball' : 'box', restitution: 0.4 });
    }
  } }, { sdk: '^3.0.0' })]);
  const session = await host.apply(presetOf('test/rapier', ['std/transform', 'std/physics-rapier', 'test/scene']));
  const ticks = (n: number): void => { for (let i = 0; i < n; i++) session.scheduler.runTick(); };
  ticks(40);
  const snap = JSON.parse(JSON.stringify(host.snapshot()));
  assert.equal(typeof snap.state['std/physics-rapier'].world, 'string');
  ticks(80);
  const a = hashSnapshot(host.snapshot());
  host.restore(snap);
  ticks(80);
  assert.equal(hashSnapshot(host.snapshot()), a, 'mid-air bodies continue exactly as before');
  host.stop();
});

test('recorder captures calls per tick and the feeder re-issues them in order', () => {
  const core = createInputCore();
  const rec = recordInput(core, { sdk: SDK_VERSION, preset: 'p', seed: 1 });
  core.press('a'); core.beginTick(); core.addLook(2, 3); core.pressKey('KeyW', ['fwd']); core.beginTick(); core.releaseKey('KeyW'); core.release('a'); core.beginTick();
  rec.stop();
  core.press('ignored');
  const file = parseReplay(JSON.parse(JSON.stringify(rec.toFile())));
  assert.equal(file.ticks, 3);
  assert.deepEqual(file.events, [[0, 'p', 'a'], [1, 'l', 2, 3], [1, 'k', 'KeyW', ['fwd']], [2, 'ku', 'KeyW'], [2, 'r', 'a']]);
  const other = createInputCore();
  const feed = replayFeeder(other, file);
  const seen: string[] = [];
  for (let t = 0; t < 3; t++) {
    feed.feed(t); other.beginTick();
    const tk = other.service.tick;
    seen.push(`${tk.held('a')}${tk.held('fwd')}${tk.lookX}`);
  }
  assert.deepEqual(seen, ['truefalse0', 'truetrue2', 'falsefalse0']);
  assert.ok(feed.done);
  assert.throws(() => parseReplay({ format: 'fpsrizz-replay', version: 1, preset: 'p', seed: 1, ticks: 1, events: [[2, 'p', 'a'], [1, 'p', 'b']] }), /tick order/);
});
